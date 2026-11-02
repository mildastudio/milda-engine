import type { PropDef } from '../contract/types'
import type { ContextGroup } from './document'

// ─── A prop typed by a context group selects that context (proposals 0001, 0051) ───
// Setting `variant` on a Button re-points every token that aliases by `Variant`, for that
// instance's subtree only. The web tier realizes it as a `data-variant` attribute the theme sheet
// keys on; a renderer that resolves tokens itself (the Studio canvas, the Mac kernel) realizes it
// by layering these selections over the ambient ones. One answer to "which context did this prop
// pick", so the two realizations cannot disagree about it.
//
// A value is matched against the context's id, its name, and its name with case and separators
// folded away - because the IR stores the author's name (`Soft`) while a target's public API
// spells it its own way (`soft`, `high-contrast`), and a value may arrive in either.

const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** The context of `group` a prop value names, or undefined when it names none. */
export function contextOfValue(group: ContextGroup, value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const exact = group.contexts.find((c) => c.id === value || c.name === value)
  if (exact) return exact.id
  const folded = fold(value)
  return group.contexts.find((c) => fold(c.name) === folded)?.id
}

/**
 * Group id -> context id, for every context-typed prop in `props` whose value in `values` - or,
 * unset, whose declared default - names a context. A prop with neither selects nothing, so the
 * ambient selection stands. That is the generated component's rule too: the attribute falls back
 * to the default, and a prop with no default writes no attribute and shadows nothing (0051 §5).
 */
export function contextSelectionsFromProps(
  props: readonly PropDef[],
  values: Readonly<Record<string, unknown>>,
  groups: readonly ContextGroup[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of props) {
    if (p.type.kind !== 'context') continue
    const groupId = p.type.group
    const group = groups.find((g) => g.id === groupId)
    if (!group) continue
    const ctx = contextOfValue(group, values[p.name] ?? p.default)
    if (ctx) out[group.id] = ctx
  }
  return out
}
