import type { AncestorStateCondition, PropCondition, StateName } from './types'
import type { PropValue } from '../contract/types'
import { resolveBindingValue, type ItemScope } from './binding'

// ─── Unified predicate conditions (proposal 0032) ────────────────────────────
// One structured condition model behind styling, content, and presence — replacing the
// flat, equality-AND `PropCondition`. A predicate is a tree of boolean groups (`all`/
// `any`/`not`) over comparison leaves (`cmp`) that test a referenced value (a prop, a UI
// state, or a foundations context) against an operator. `PropCondition` becomes the
// degenerate "AND of equalities" case (see `predicateFromLegacy`), so migration is lossless.

export type PredicateRef =
  // A contract prop, or a dotted repeat-item path (`item.active`) resolved via item scope.
  | { kind: 'prop'; path: string }
  // A UI state (boolean). Only prop-reachable states are OFFERED by the editor / emittable
  // by the generator, but the IR itself is source-agnostic.
  | { kind: 'state'; state: StateName }
  // A foundations context group id (e.g. `ColorScheme`) — its active context id is the value.
  | { kind: 'context'; group: string }
  // An ancestor node's UI state ("when {nodeId} is {state}", proposal 0025). Styling-only:
  // realized by the CSS target as a descendant selector; has no runtime JS boolean, so the
  // React generator never emits it as a presence/content guard.
  | { kind: 'ancestor'; nodeId: string; state: StateName }

export type CompareOp =
  | 'eq' // =
  | 'ne' // ≠
  | 'lt' // <
  | 'lte' // ≤
  | 'gt' // >
  | 'gte' // ≥
  | 'contains' // string/array membership
  | 'set' // truthy (no `value`)
  | 'unset' // falsy (no `value`)

export type Predicate =
  | { kind: 'all'; items: Predicate[] } // AND — empty ⇒ true (the "always" identity)
  | { kind: 'any'; items: Predicate[] } // OR — empty ⇒ false
  | { kind: 'not'; item: Predicate }
  | { kind: 'cmp'; ref: PredicateRef; op: CompareOp; value?: PropValue }

export interface PredicateContext {
  props: PropCondition
  states: ReadonlySet<StateName>
  // groupId → active contextId. Absent contexts read as undefined (a `context` leaf then
  // only matches `unset`), the safe default in surfaces that don't track context.
  contexts?: Record<string, string>
  itemScopes?: ItemScope[]
  // Live UI states of an ancestor node (by id) — backs `ancestor` leaves. Absent in
  // contexts that don't track it (thumbnails, static resolution); an ancestor leaf then
  // reads as not-held, the safe default.
  ancestorStates?: (nodeId: string) => ReadonlySet<StateName> | undefined
}

function refValue(ref: PredicateRef, ctx: PredicateContext): unknown {
  if (ref.kind === 'prop') return resolveBindingValue(ref.path, ctx.props, ctx.itemScopes ?? [])
  if (ref.kind === 'state') return ctx.states.has(ref.state)
  if (ref.kind === 'ancestor') return ctx.ancestorStates?.(ref.nodeId)?.has(ref.state) ?? false
  return ctx.contexts?.[ref.group]
}

function compare(left: unknown, op: CompareOp, value: PropValue | undefined): boolean {
  switch (op) {
    case 'set':
      return Boolean(left)
    case 'unset':
      return !left
    case 'eq':
      return left === value
    case 'ne':
      return left !== value
    // Relational ops lean on JS coercion, which orders numbers and strings sensibly; a
    // nullish left never satisfies them (NaN/undefined comparisons are false).
    case 'lt':
      return (left as never) < (value as never)
    case 'lte':
      return (left as never) <= (value as never)
    case 'gt':
      return (left as never) > (value as never)
    case 'gte':
      return (left as never) >= (value as never)
    case 'contains':
      if (typeof left === 'string') return left.includes(String(value))
      if (Array.isArray(left)) return left.includes(value)
      return false
  }
}

// Evaluate a predicate. Absent predicate ⇒ true (unconditional). An empty `all` is true;
// an empty `any` is false — so a freshly-added, still-empty group reads as "no constraint".
export function evalPredicate(p: Predicate | undefined, ctx: PredicateContext): boolean {
  if (!p) return true
  switch (p.kind) {
    case 'all':
      return p.items.every((i) => evalPredicate(i, ctx))
    case 'any':
      return p.items.length === 0 ? false : p.items.some((i) => evalPredicate(i, ctx))
    case 'not':
      return !evalPredicate(p.item, ctx)
    case 'cmp':
      return compare(refValue(p.ref, ctx), p.op, p.value)
  }
}

// True when a predicate imposes no constraint (absent, or an empty `all`). Used to GC a
// condition back to "always" when the editor clears its last leaf.
export function isUnconditional(p: Predicate | undefined): boolean {
  return !p || (p.kind === 'all' && p.items.length === 0)
}

// Upgrade the legacy equality-AND shape (a `PropCondition` map + optional state list) to a
// predicate: an `all` of `eq` prop compares and `set` state compares. Returns undefined
// when there is no constraint, so callers can store `undefined` (= always). Lossless — the
// evaluator on the result matches the old `whenHolds`/`ruleMatches` semantics exactly.
export function predicateFromLegacy(
  when?: PropCondition,
  states?: readonly StateName[],
  ancestorStates?: readonly AncestorStateCondition[],
): Predicate | undefined {
  const items: Predicate[] = []
  for (const [path, value] of Object.entries(when ?? {})) {
    items.push({ kind: 'cmp', ref: { kind: 'prop', path }, op: 'eq', value })
  }
  for (const state of states ?? []) {
    items.push({ kind: 'cmp', ref: { kind: 'state', state }, op: 'set' })
  }
  for (const a of ancestorStates ?? []) {
    items.push({ kind: 'cmp', ref: { kind: 'ancestor', nodeId: a.nodeId, state: a.state }, op: 'set' })
  }
  return items.length ? { kind: 'all', items } : undefined
}

// The CSS-representable decomposition of a predicate (proposal 0032 §4.2), or null when the
// predicate can't be a static selector. A predicate is representable iff it's an `all` (or a
// single leaf / empty) of EQUALITY prop compares and `set` state / ancestor leaves — exactly
// the old StateRule shape (`props` + `states` + `ancestorStates`). Anything richer (or, not,
// operators other than eq/set, prop `set`/context) returns null, so the CSS target can fall
// back to a JS-computed `data-cond` boolean instead of a selector.
export function representablePredicate(
  p: Predicate | undefined,
): { props: PropCondition; states: StateName[]; ancestorStates: AncestorStateCondition[] } | null {
  const props: PropCondition = {}
  const states: StateName[] = []
  const ancestorStates: AncestorStateCondition[] = []
  const leaves = !p ? [] : p.kind === 'all' ? p.items : p.kind === 'cmp' ? [p] : null
  if (leaves === null) return null
  for (const leaf of leaves) {
    if (leaf.kind !== 'cmp') return null
    const { ref, op } = leaf
    if (ref.kind === 'prop' && op === 'eq' && leaf.value !== undefined) props[ref.path] = leaf.value
    else if (ref.kind === 'state' && op === 'set') states.push(ref.state)
    else if (ref.kind === 'ancestor' && op === 'set') ancestorStates.push({ nodeId: ref.nodeId, state: ref.state })
    else return null
  }
  return { props, states, ancestorStates }
}

const PREDICATE_KINDS = new Set(['all', 'any', 'not', 'cmp'])

// Read a stored condition that may be EITHER a new `Predicate` (has a `kind` tag) OR a
// legacy `PropCondition` map (equality-AND), upgrading the latter. Undefined/null ⇒
// undefined (unconditional). Lets migrated fields (`ContentRule.when`, later `StateRule`)
// keep reading old documents losslessly without a rewrite pass.
export function coercePredicate(value: unknown): Predicate | undefined {
  if (value == null) return undefined
  if (typeof value === 'object' && PREDICATE_KINDS.has((value as { kind?: string }).kind ?? '')) {
    return value as Predicate
  }
  return predicateFromLegacy(value as PropCondition)
}
