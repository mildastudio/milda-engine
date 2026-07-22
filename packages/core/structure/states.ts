import type { FreeBehaviorKind } from '../behavior/free'
import type { AncestorStateCondition, ComponentNode, NodeKind, PropCondition, StateName, StateRule } from './types'
import { type ItemScope } from './binding'
import { evalPredicate, representablePredicate } from './predicate'

// A StateRule whose rich `when` (0032) can't become a static CSS selector (OR/NOT/operators/
// context) — the CSS target realizes it as a `[data-cond-<id>]` attribute the React generator
// sets from the computed predicate boolean. Representable `when`s (and legacy props/states
// rules) stay pure selectors, so existing output is unchanged.
export function ruleNeedsDataCond(rule: StateRule): boolean {
  return !!rule.when && representablePredicate(rule.when) === null
}

// The `data-cond-<id>` attribute name for such a rule (id sanitized to attribute-safe chars).
export function dataCondAttr(rule: StateRule): string {
  return `data-cond-${rule.id.replace(/[^a-z0-9]/gi, '')}`
}

export const ALL_STATE_NAMES: StateName[] = [
  'hovered',
  'pressed',
  'focused',
  'focus-visible',
  'active',
  'selected',
  'checked',
  'indeterminate',
  'expanded',
  'open',
  'disabled',
  'readonly',
  'loading',
  'error',
  'success',
  'first',
  'last',
  'odd',
  'even',
  'today',
  'outside-month',
  'range-start',
  'range-end',
  'in-range',
  'highlighted',
]

export const KIND_STATES: Record<NodeKind, StateName[]> = {
  container: ['hovered', 'pressed'],
  item: ['hovered', 'pressed', 'selected', 'active', 'disabled'],
  text: [],
  control: ['hovered', 'pressed', 'active', 'disabled', 'loading'],
  input: ['hovered', 'pressed', 'disabled', 'readonly', 'error', 'success'],
  output: ['loading', 'error', 'success'],
  icon: [],
  content: [],
  fragment: [],
  foreign: [],
  instance: [],
  table: ['hovered'],
  row: ['hovered', 'selected', 'active', 'first', 'last', 'odd', 'even'],
  cell: ['hovered', 'selected'],
}

const FOCUS_GRANTING_BEHAVIORS = new Set<FreeBehaviorKind>([
  'rovingTabindex',
  'cursorNavigation',
  'focusTrap',
])

export function isFocusable(node: ComponentNode, nodes: Record<string, ComponentNode>): boolean {
  if (node.kind === 'control' || node.kind === 'input') return true
  for (const owner of Object.values(nodes)) {
    for (const b of owner.behaviors ?? []) {
      if (!FOCUS_GRANTING_BEHAVIORS.has(b.kind)) continue
      const targets =
        b.kind === 'focusTrap'
          ? [b.initialFocusNodeId]
          : b.kind === 'rovingTabindex' || b.kind === 'cursorNavigation'
            ? [b.itemNodeId, b.targetNodeId]
            : []
      if (targets.includes(node.id)) return true
    }
  }
  return false
}

// Looks up the live UI states of an ancestor node (by id) — supplied by the editor's
// render so a rule's `ancestorStates` can be evaluated against the specific ancestor.
// Absent in contexts that don't track it (thumbnails, static resolution): anchored
// conditions then simply don't match, which is the safe default.
export type AncestorStateLookup = (nodeId: string) => ReadonlySet<StateName> | undefined

export function ruleMatches(
  rule: StateRule,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
  ancestorStates?: AncestorStateLookup,
  contexts?: Record<string, string>,
): boolean {
  // A rich `when` predicate (0032) supersedes the representable fields when present.
  if (rule.when) return evalPredicate(rule.when, { props: activeProps, states: activeStates, ancestorStates, contexts })
  for (const [k, v] of Object.entries(rule.props)) {
    if (activeProps[k] !== v) return false
  }
  for (const s of rule.states) {
    if (!activeStates.has(s)) return false
  }
  for (const cond of rule.ancestorStates ?? []) {
    if (!ancestorStates?.(cond.nodeId)?.has(cond.state)) return false
  }
  return true
}

// Evaluate a node's conditional PRESENCE (0031, predicate-based in 0032). Returns true
// when the node should render. Absent presence ⇒ always present. Delegates to the shared
// predicate evaluator so props, states, context, operators and AND/OR/NOT all resolve
// consistently with the rest of the system.
export function nodeIsPresent(
  node: ComponentNode,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
  itemScopes: ItemScope[] = [],
  contexts?: Record<string, string>,
): boolean {
  return evalPredicate(node.presence, { props: activeProps, states: activeStates, itemScopes, contexts })
}

export function resolveNodeFacets(
  node: ComponentNode,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
  ancestorStates?: AncestorStateLookup,
  contexts?: Record<string, string>,
): Record<string, string> {
  let facets = { ...(node.facets ?? {}) }
  for (const rule of node.states ?? []) {
    if (ruleMatches(rule, activeProps, activeStates, ancestorStates, contexts)) facets = { ...facets, ...(rule.facets ?? {}) }
  }
  return facets
}

export function resolveNodeLayout(
  node: ComponentNode,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
  ancestorStates?: AncestorStateLookup,
  contexts?: Record<string, string>,
): Record<string, string> {
  let layout = { ...(node.layout ?? {}) }
  for (const rule of node.states ?? []) {
    if (ruleMatches(rule, activeProps, activeStates, ancestorStates, contexts)) layout = { ...layout, ...(rule.layout ?? {}) }
  }
  return layout
}

// Canonicalize a tree's rules: a self state that an ANCESTOR controls (see `ancestorControlsState`)
// is moved into that rule's `ancestorStates`, keyed on the controlling ancestor. So a ToggleButton
// icon authored with a self `onSelected` becomes "when the root is selected" in the IR — the form the
// Style tab shows under the ancestor group and the generator emits as `.root[data-selected] .icon`.
// Idempotent (an already-anchored state has left `states`, so nothing re-moves); self-owned,
// per-item, and uncontrolled states are untouched. Returns a new nodes map; inputs are not mutated.
export function anchorControlledChildStates(
  nodes: Record<string, ComponentNode>,
): Record<string, ComponentNode> {
  const parent = new Map<string, string>()
  for (const n of Object.values(nodes)) for (const c of n.childrenIds ?? []) parent.set(c, n.id)
  const controllingAncestor = (nodeId: string, state: StateName): string | undefined => {
    let cur = parent.get(nodeId)
    while (cur) {
      if (nodes[cur]?.stateBindings?.some((b) => b.state === state)) return cur
      cur = parent.get(cur)
    }
    return undefined
  }
  const out: Record<string, ComponentNode> = {}
  for (const [id, node] of Object.entries(nodes)) {
    const rules = node.states
    if (!rules?.length) {
      out[id] = node
      continue
    }
    let nodeChanged = false
    const nextRules = rules.map((rule) => {
      if (!rule.states.length) return rule
      const selfStates: StateName[] = []
      const anchors: AncestorStateCondition[] = [...(rule.ancestorStates ?? [])]
      let ruleChanged = false
      for (const s of rule.states) {
        const owner = controllingAncestor(id, s)
        if (owner) {
          anchors.push({ nodeId: owner, state: s })
          ruleChanged = true
        } else {
          selfStates.push(s)
        }
      }
      if (!ruleChanged) return rule
      nodeChanged = true
      return { ...rule, states: selfStates, ancestorStates: anchors }
    })
    out[id] = nodeChanged ? { ...node, states: nextRules } : node
  }
  return out
}
