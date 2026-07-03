import type { FreeBehaviorKind } from '../behavior/free'
import type { ComponentNode, NodeKind, PropCondition, StateName, StateRule } from './types'

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

export function ruleMatches(
  rule: StateRule,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
): boolean {
  for (const [k, v] of Object.entries(rule.props)) {
    if (activeProps[k] !== v) return false
  }
  for (const s of rule.states) {
    if (!activeStates.has(s)) return false
  }
  return true
}

export function resolveNodeFacets(
  node: ComponentNode,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
): Record<string, string> {
  let facets = { ...(node.facets ?? {}) }
  for (const rule of node.states ?? []) {
    if (ruleMatches(rule, activeProps, activeStates)) facets = { ...facets, ...(rule.facets ?? {}) }
  }
  return facets
}

export function resolveNodeLayout(
  node: ComponentNode,
  activeProps: PropCondition,
  activeStates: ReadonlySet<StateName>,
): Record<string, string> {
  let layout = { ...(node.layout ?? {}) }
  for (const rule of node.states ?? []) {
    if (ruleMatches(rule, activeProps, activeStates)) layout = { ...layout, ...(rule.layout ?? {}) }
  }
  return layout
}
