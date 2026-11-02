import {
  baseCaseOf,
  ROLE_LABELS,
  type DocumentFoundations,
  type RoleKey,
  type Token,
} from './document'
import { collectEdges, danglingEdges, findCycles, tokensById, type EdgeVia } from './references'
import { contrastAgainst } from './color'
import { resolveToken, tokenWithRole } from '../facets/resolver'

// ─── Foundations lints (proposal 0042 §6) ─────────────────────────────────────
// Standing questions about the token set, counted where you work rather than on an audit page
// you have to remember to visit.
//
// Every one of these is a rule about which SILENCE is the failure mode - and every one is also
// one bad rule away from being noise nobody reads. Each therefore refuses to judge what it
// cannot see, and that restraint is the design, not a limitation:
//
//   - `bypassed` only fires when the skipped layer actually holds a decision for that target.
//     A grey skipping a Brand layer is correct; the naive "spans more than one layer" version
//     flagged every neutral in the system.
//   - `lowContrast` only checks tokens that CLAIM a foreground role, against the token that
//     claims the surface role. Guessing either from a name breaks on the first rename.

export interface LintFinding {
  token: Token
  layerId: string
  layerName: string
  detail: string
}

// DELIBERATELY ABSENT: an "unused token" lint. It needs the token→component index that does
// not exist yet (§7), and every approximation over the document alone is noise. Measured, twice:
// flagging any unreferenced token outside the top layer marks 143 of the seeded system's 143
// primitives, because a colour ramp is deliberately complete - you ship eleven steps so there is
// something to pick from later. Narrowing it to tokens that are themselves references (a "dead
// intermediary") flags the whole semantic layer instead, since ITS consumers are components.
// A lint nobody can read is worse than a missing one.

export interface FoundationsLints {
  /** References a layer below, skipping one that already decides that same value. */
  bypassed: LintFinding[]
  /** Claims a foreground role and fails WCAG AA against the surface role. */
  lowContrast: LintFinding[]
  /** Points at a token that no longer exists. */
  dangling: LintFinding[]
  /** Part of a reference cycle, so it resolves to nothing. */
  cyclic: LintFinding[]
}

/**
 * Which surface each foreground role actually sits on.
 *
 * `onAccent` is the reason this is a map rather than a list: it lives on the ACCENT, and
 * comparing it to the page surface produced a meaningless 1.00:1 (white on white) that read as
 * a defect. A contrast lint that reports a pairing nobody renders is worse than none.
 */
const FOREGROUND_AGAINST: Partial<Record<RoleKey, RoleKey>> = {
  textPrimary: 'surface',
  textSecondary: 'surface',
  textSubtle: 'surface',
  onAccent: 'accent',
}

/** The layer each token lives in, plus that layer's index in reference order. */
function layerIndex(foundations: DocumentFoundations) {
  const ordered = [...foundations.layers].sort((a, b) => a.order - b.order)
  const ofToken = new Map<string, { id: string; name: string; index: number }>()
  ordered.forEach((layer, index) => {
    for (const token of layer.tokens)
      ofToken.set(token.id, { id: layer.id, name: layer.name, index })
  })
  return { ordered, ofToken, top: ordered.length - 1 }
}

/**
 * The token in a layer between `fromIndex` and the target that already references the same
 * target - i.e. the decision this reference skips over.
 */
function skippedDecision(
  foundations: DocumentFoundations,
  fromIndex: number,
  toIndex: number,
  toId: string,
  index: ReturnType<typeof layerIndex>,
): Token | undefined {
  if (fromIndex - toIndex < 2) return undefined
  for (const edge of collectEdges(foundations)) {
    if (edge.to !== toId) continue
    const mid = index.ofToken.get(edge.from)
    if (!mid || mid.index <= toIndex || mid.index >= fromIndex) continue
    const token = tokensById(foundations).get(edge.from)
    if (token) return token
  }
  return undefined
}

function viaLabel(via: EdgeVia): string {
  return via.via === 'context' ? `in one case` : 'everywhere'
}

export function foundationsLints(
  foundations: DocumentFoundations,
  contextSelections?: Record<string, string>,
): FoundationsLints {
  const index = layerIndex(foundations)
  const byId = tokensById(foundations)
  const edges = collectEdges(foundations)

  const at = (token: Token, detail: string): LintFinding => {
    const layer = index.ofToken.get(token.id)
    return { token, layerId: layer?.id ?? '', layerName: layer?.name ?? '', detail }
  }

  const bypassed: LintFinding[] = []
  for (const edge of edges) {
    const from = index.ofToken.get(edge.from)
    const to = index.ofToken.get(edge.to)
    if (!from || !to) continue
    const skipped = skippedDecision(foundations, from.index, to.index, edge.to, index)
    const token = byId.get(edge.from)
    if (skipped && token) {
      bypassed.push(
        at(
          token,
          `points ${viaLabel(edge.via)} at ${edge.to}, skipping ${skipped.name} which already decides it`,
        ),
      )
    }
  }

  const lowContrast: LintFinding[] = []
  const selections =
    contextSelections ??
    Object.fromEntries(
      foundations.contextGroups.map((g) => [g.id, baseCaseOf(g) ?? '']).filter(([, c]) => c),
    )
  const ctx = { contextSelections: selections }
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) {
      const againstRole = token.role ? FOREGROUND_AGAINST[token.role] : undefined
      if (!againstRole) continue
      // No token claims the background this one sits on, so there is nothing to compare it
      // against. Silence beats guessing which token was meant.
      const against = tokenWithRole(foundations, againstRole)
      if (!against) continue
      const fg = resolveToken(token.id, foundations, ctx, 'color')
      const bg = resolveToken(against.id, foundations, ctx, 'color')
      // Composited: a foreground role may legitimately be translucent, and the ratio that
      // matters is the one it actually renders at on this background.
      const ratio = fg && bg ? contrastAgainst(fg, bg) : null
      if (ratio == null || ratio >= 4.5) continue
      lowContrast.push(
        at(
          token,
          `${ROLE_LABELS[token.role!]} is ${ratio.toFixed(2)}:1 on ${against.name}, below AA`,
        ),
      )
    }
  }

  const dangling: LintFinding[] = []
  for (const edge of danglingEdges(foundations)) {
    const token = byId.get(edge.from)
    if (token) dangling.push(at(token, `points at ${edge.to}, which no longer exists`))
  }

  const cyclic: LintFinding[] = findCycles(foundations)
    .map((id) => byId.get(id))
    .filter((t): t is Token => !!t)
    .map((t) => at(t, 'part of a reference cycle, so it resolves to nothing'))

  return { bypassed, lowContrast, dangling, cyclic }
}
