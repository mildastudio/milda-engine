// ─── The token reference graph: reverse index, cycles, dangling refs ─────────
// `resolveToken` walks references FORWARD (id → value) and that was the only
// direction the codebase could travel. Nothing could answer the opposite question,
// "what depends on this token?", which is what the flow view renders and what makes
// deletion safe to reason about.
//
// The important subtlety: a reference is NOT only on a token's top-level slot. It can
// hide in any per-context slot, in any gradient stop, and in any of a text style's
// four sub-slots. So the walk recurses through `Slot` instead of peeking at
// `token.value.slot`, and every edge records where it came from - a broken edge is
// useless to a designer if we can't say which context or which gradient stop it is in.

import type { DocumentFoundations, Slot, Token, TokenValue } from './document'

export type EdgeVia =
  | { via: 'slot' }
  | { via: 'context'; contextId: string }
  | { via: 'gradientStop'; index: number }
  | { via: 'textStyle'; field: 'family' | 'size' | 'weight' | 'lineHeight' | 'letterSpacing' }
  | { via: 'computeBase' }
  | { via: 'computeMix'; index: number }

export interface TokenEdge {
  /** The token that holds the reference. */
  from: string
  /** The token being referenced. May not exist - see `danglingEdges`. */
  to: string
  /** Where inside `from` the reference sits. */
  via: EdgeVia
}

const TEXT_STYLE_FIELDS = ['size', 'weight', 'lineHeight', 'letterSpacing'] as const

// Every reference reachable from one slot. `via` describes the slot itself; nested
// slots (gradient stops, text-style fields) override it with their own, more specific
// location, because that is the level a designer needs to see.
function slotEdges(from: string, slot: Slot, via: EdgeVia, out: TokenEdge[]): void {
  if ('ref' in slot) {
    out.push({ from, to: slot.ref, via })
    return
  }
  if ('gradient' in slot) {
    slot.gradient.stops.forEach((stop, index) => {
      slotEdges(from, stop.color, { via: 'gradientStop', index }, out)
    })
    return
  }
  if ('textStyle' in slot) {
    // The family is an edge too when it is a REF (a bare id names the font library, which is
    // not a token and cannot take part in a cycle). Missing it would let a fontFamily token and
    // a text style close a loop that nothing checked.
    const family = slot.textStyle.family
    if (family && typeof family !== 'string') {
      out.push({ from, to: family.ref, via: { via: 'textStyle', field: 'family' } })
    }
    for (const field of TEXT_STYLE_FIELDS) {
      slotEdges(from, slot.textStyle[field], { via: 'textStyle', field }, out)
    }
    return
  }
  // A computed value depends on its base AND on whatever any mix step pulls in, so both
  // are real graph edges - the cycle guard and the flow view have to see them.
  if ('compute' in slot) {
    slotEdges(from, slot.compute.base, { via: 'computeBase' }, out)
    slot.compute.ops.forEach((op, index) => {
      if (op.op === 'mix') slotEdges(from, op.with, { via: 'computeMix', index }, out)
    })
  }
  // { raw }, { color }, { dimension }, { font } and { easing } hold no references: a font slot
  // names a font-library entry, not a token.
}

function valueEdges(from: string, value: TokenValue, out: TokenEdge[]): void {
  slotEdges(from, value.base, { via: 'slot' }, out)
  // An exception's slot is a real edge too, and it is the one the naive walk misses: a
  // token can reference something ONLY in dark mode, and a cycle through that reference is
  // just as fatal as one through the base.
  for (const exception of value.exceptions ?? []) {
    slotEdges(from, exception.slot, { via: 'context', contextId: exception.context }, out)
  }
}

/** Every reference edge in the document, in layer then token order. */
export function collectEdges(foundations: DocumentFoundations): TokenEdge[] {
  const out: TokenEdge[] = []
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) valueEdges(token.id, token.value, out)
  }
  return out
}

export type ReferenceIndex = Map<string, TokenEdge[]>

/** tokenId → edges pointing AT it ("who depends on this"). */
export function buildReverseIndex(foundations: DocumentFoundations): ReferenceIndex {
  const index: ReferenceIndex = new Map()
  for (const edge of collectEdges(foundations)) {
    const list = index.get(edge.to)
    if (list) list.push(edge)
    else index.set(edge.to, [edge])
  }
  return index
}

/** tokenId → edges leaving it ("what this depends on"). */
export function buildForwardIndex(foundations: DocumentFoundations): ReferenceIndex {
  const index: ReferenceIndex = new Map()
  for (const edge of collectEdges(foundations)) {
    const list = index.get(edge.from)
    if (list) list.push(edge)
    else index.set(edge.from, [edge])
  }
  return index
}

function allTokenIds(foundations: DocumentFoundations): Set<string> {
  const ids = new Set<string>()
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) ids.add(token.id)
  }
  return ids
}

/**
 * Edges whose target no longer exists. Deleting a token only filters it out of its
 * layer, so references to it survive and resolve to `undefined` - these are already
 * possible today and both new views need to render them as broken rather than absent.
 */
export function danglingEdges(foundations: DocumentFoundations): TokenEdge[] {
  const ids = allTokenIds(foundations)
  return collectEdges(foundations).filter((e) => !ids.has(e.to))
}

/**
 * The reference order after moving one layer to a new index (proposal 0042 §4).
 *
 * Reordering the chain is a legitimate restructuring, but the chain order IS the reference
 * rule - a token may only point at a strictly lower layer - so a move can invalidate
 * references that were fine a moment ago. This computes the new index for every layer so a
 * caller can say what would break BEFORE it happens.
 */
export function reorderedLayerIndex(
  foundations: DocumentFoundations,
  layerId: string,
  toIndex: number,
): Map<string, number> {
  const ordered = [...foundations.layers].sort((a, b) => a.order - b.order)
  const from = ordered.findIndex((l) => l.id === layerId)
  const out = new Map<string, number>()
  if (from < 0) {
    ordered.forEach((l, i) => out.set(l.id, i))
    return out
  }
  const moved = ordered.slice()
  const [layer] = moved.splice(from, 1)
  moved.splice(Math.max(0, Math.min(moved.length, toIndex)), 0, layer)
  moved.forEach((l, i) => out.set(l.id, i))
  return out
}

/**
 * The references that a layer reorder would break, each with the tokens either side.
 *
 * "Break" means the target would no longer be in a strictly lower layer, so the reference
 * stops resolving. Nothing in the model forbids that - a broken reference is already
 * possible (delete a token and its dependents keep pointing at it) and both the flow view
 * and the resolver handle it - so the reorder is allowed. What must not happen is breaking
 * them SILENTLY, which is what this exists for.
 */
export function refsBrokenByReorder(
  foundations: DocumentFoundations,
  layerId: string,
  toIndex: number,
): { from: Token; to: Token; via: EdgeVia }[] {
  const next = reorderedLayerIndex(foundations, layerId, toIndex)
  const now = new Map(
    [...foundations.layers].sort((a, b) => a.order - b.order).map((l, i) => [l.id, i] as const),
  )
  const layerOf = new Map<string, string>()
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) layerOf.set(token.id, layer.id)
  }
  const byId = tokensById(foundations)

  const out: { from: Token; to: Token; via: EdgeVia }[] = []
  for (const edge of collectEdges(foundations)) {
    const fromLayer = layerOf.get(edge.from)
    const toLayer = layerOf.get(edge.to)
    // A dangling edge is already broken; a reorder cannot make it worse.
    if (!fromLayer || !toLayer) continue
    // Only what this move BREAKS. A reference that is already invalid - an imported document
    // or an older client can hold one - would otherwise be reported as collateral of a move
    // that had nothing to do with it, and the warning would cry wolf.
    const validNow = now.get(toLayer)! < now.get(fromLayer)!
    const validNext = next.get(toLayer)! < next.get(fromLayer)!
    if (!validNow || validNext) continue
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from && to) out.push({ from, to, via: edge.via })
  }
  return out
}

/**
 * The tokens whose resolved value can FLIP if the aspect order changes (proposal 0042 §2.1).
 *
 * The order of `contextGroups` is the precedence rule: when several exceptions match at once,
 * the first aspect wins. So reordering aspects is not cosmetic - it silently changes what some
 * tokens resolve to. Only a token carrying exceptions in two or more aspects can be affected,
 * and only if the relative order of two of ITS aspects actually changes; a reorder elsewhere in
 * the list leaves it alone.
 *
 * Reported statically, without a selection, because the author is deciding about the whole
 * system rather than about the one context pair they happen to be previewing.
 */
export function tokensAffectedByAspectOrder(
  foundations: DocumentFoundations,
  groupId: string,
  toIndex: number,
): { token: Token; aspects: string[] }[] {
  const now = foundations.contextGroups.map((g) => g.id)
  const from = now.indexOf(groupId)
  if (from < 0) return []
  const next = now.slice()
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved)

  const rank = (order: string[], id: string) => order.indexOf(id)
  const out: { token: Token; aspects: string[] }[] = []
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) {
      const mine = [...new Set((token.value.exceptions ?? []).map((e) => e.group))]
      if (mine.length < 2) continue
      // Does any PAIR of this token's own aspects swap places?
      const flipped = mine.some((a) =>
        mine.some((b) => a !== b && rank(now, a) < rank(now, b) && rank(next, a) > rank(next, b)),
      )
      if (flipped) out.push({ token, aspects: mine })
    }
  }
  return out
}

/** Depth-first reachability over forward edges. */
function reaches(index: ReferenceIndex, start: string, target: string): boolean {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === target) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of index.get(id) ?? []) stack.push(edge.to)
  }
  return false
}

/**
 * Would pointing `from` at `to` create a cycle?
 *
 * Today the acyclic invariant is enforced only by a UI filter in the reference picker
 * (it offers strictly lower-order layers). Nothing checks on write, so an imported
 * document - or any surface that isn't that picker, such as drag-to-rewire in the flow
 * view - can create a cycle whose only symptom is `resolveToken` bailing out to
 * `undefined`. This puts the invariant in the model where every writer shares it.
 */
export function wouldCycle(foundations: DocumentFoundations, from: string, to: string): boolean {
  if (from === to) return true
  return reaches(buildForwardIndex(foundations), to, from)
}

/**
 * Cycles already present in a document - for validating an import rather than a single
 * edit. Returns one representative id per cycle found.
 */
export function findCycles(foundations: DocumentFoundations): string[] {
  const index = buildForwardIndex(foundations)
  const state = new Map<string, 'visiting' | 'done'>()
  const cycles: string[] = []

  const visit = (id: string): void => {
    const current = state.get(id)
    if (current === 'done') return
    if (current === 'visiting') {
      cycles.push(id)
      return
    }
    state.set(id, 'visiting')
    for (const edge of index.get(id) ?? []) visit(edge.to)
    state.set(id, 'done')
  }

  for (const id of allTokenIds(foundations)) visit(id)
  return cycles
}

/** Convenience for the views: the tokens that reference `tokenId`, deduplicated. */
export function dependentsOf(index: ReferenceIndex, tokenId: string): string[] {
  const seen = new Set<string>()
  for (const edge of index.get(tokenId) ?? []) seen.add(edge.from)
  return [...seen]
}

/** Human-readable location of an edge, for broken-reference diagnostics. */
export function describeVia(via: EdgeVia): string {
  switch (via.via) {
    case 'slot':
      return 'value'
    case 'context':
      return `context "${via.contextId}"`
    case 'gradientStop':
      return `gradient stop ${via.index + 1}`
    case 'textStyle':
      return `text style ${via.field}`
    case 'computeBase':
      return 'computed base'
    case 'computeMix':
      return `computed mix step ${via.index + 1}`
  }
}

/** All tokens, flattened, for callers that need a lookup alongside the index. */
export function tokensById(foundations: DocumentFoundations): Map<string, Token> {
  const map = new Map<string, Token>()
  for (const layer of foundations.layers) {
    for (const token of layer.tokens) map.set(token.id, token)
  }
  return map
}
