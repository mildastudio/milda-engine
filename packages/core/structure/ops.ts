import type {
  ComponentNode,
  ComponentStructure,
  NodeContent,
  NodeKind,
  NodeRepeat,
  NodeSlot,
  NodeA11y,
  NodeStateBinding,
  NodeTag,
  NodeValueBinding,
  AtomRef,
  CellSpec,
  ComponentInstance,
  ControlRealization,
  GroupRealization,
  EventEmission,
  ForeignContent,
  MediaType,
  MediaSource,
  NodeMotion,
  NodeCalendar,
  NodeTimePicker,
  AlertSeverity,
  AccordionMode,
  NodeTabs,
  NodeSlider,
  NodeRating,
  NodeColorPicker,
  NodeOverlay,
  StateRule,
  ValueSpec,
  ContentValue,
} from './types'
import type { NodeBehavior } from '../behavior/free'
import { isUnconditional, type Predicate } from './predicate'
import {
  customToggleVariant,
  checkboxGlyphChild,
  CHECKBOX_INDICATOR_PART,
  CHECKBOX_GLYPH_PART,
  SWITCH_TRACK_PART,
  SWITCH_THUMB_PART,
} from '../behavior/lowerControl'
import { controlVariantStyle, applyGroupVariant, seedStructure } from './seed'

export function defaultTagForKind(kind: NodeKind): NodeTag {
  switch (kind) {
    case 'container':
      return 'div'
    case 'item':
      return 'li'
    case 'text':
      return 'span'
    case 'control':
      return 'button'
    case 'input':
      return 'input'
    case 'output':
      return 'span'
    case 'icon':
      return 'svg'
    case 'content':
      return 'img'

    case 'fragment':
      return 'div'
    case 'foreign':
      return 'div'
    case 'table':
      return 'table'
    case 'row':
      return 'tr'
    case 'cell':
      return 'td'

    case 'instance':
      return 'div'
  }
}

function clone(structure: ComponentStructure): ComponentStructure {
  return { rootId: structure.rootId, nodes: { ...structure.nodes } }
}

function insertBefore(childrenIds: string[], id: string, beforeId: string | null): string[] {
  const next = childrenIds.filter((c) => c !== id)
  if (beforeId === null) return [...next, id]
  const idx = next.indexOf(beforeId)
  if (idx === -1) return [...next, id]
  return [...next.slice(0, idx), id, ...next.slice(idx)]
}

export function addNode(
  structure: ComponentStructure,
  node: ComponentNode,
  parentId: string,
  beforeNodeId: string | null,
): ComponentStructure {
  const parent = structure.nodes[parentId]
  if (!parent) return structure
  const next = clone(structure)
  next.nodes[node.id] = { ...node, parentId, childrenIds: node.childrenIds ?? [] }
  next.nodes[parentId] = {
    ...parent,
    childrenIds: insertBefore(parent.childrenIds, node.id, beforeNodeId),
  }
  return next
}

export function removeNode(structure: ComponentStructure, nodeId: string): ComponentStructure {
  if (nodeId === structure.rootId) return structure
  const target = structure.nodes[nodeId]
  if (!target) return structure

  const doomed: string[] = []
  const walk = (id: string) => {
    doomed.push(id)
    structure.nodes[id]?.childrenIds.forEach(walk)
  }
  walk(nodeId)

  const hadIndicator = !!indicatorPartNode(structure)

  const next = clone(structure)
  doomed.forEach((id) => delete next.nodes[id])
  if (target.parentId) {
    const parent = next.nodes[target.parentId]
    if (parent) {
      next.nodes[target.parentId] = {
        ...parent,
        childrenIds: parent.childrenIds.filter((c) => c !== nodeId),
      }
    }
  }

  if (hadIndicator && !indicatorPartNode(next)) {
    const label = labelPartNode(next)
    if (label && next.nodes[label.id]?.presentation === 'accessibleName') {
      const { presentation: _drop, ...rest } = next.nodes[label.id]
      next.nodes[label.id] = rest
    }
  }
  return next
}

export function renameNode(
  structure: ComponentStructure,
  nodeId: string,
  name: string,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  next.nodes[nodeId] = { ...node, name }
  return next
}

export function setFacet(
  structure: ComponentStructure,
  nodeId: string,
  facet: string,
  value: string,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  next.nodes[nodeId] = { ...node, facets: { ...(node.facets ?? {}), [facet]: value } }
  return next
}

export function clearFacet(
  structure: ComponentStructure,
  nodeId: string,
  facet: string,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node?.facets || !(facet in node.facets)) return structure
  const next = clone(structure)
  const { [facet]: _removed, ...rest } = node.facets
  next.nodes[nodeId] = { ...node, facets: rest }
  return next
}

export function insertSubtree(
  structure: ComponentStructure,
  nodes: Record<string, ComponentNode>,
  subtreeRootId: string,
  parentId: string,
  beforeNodeId: string | null,
): ComponentStructure {
  const parent = structure.nodes[parentId]
  if (!parent || !nodes[subtreeRootId]) return structure
  const next = clone(structure)
  for (const id of Object.keys(nodes)) next.nodes[id] = nodes[id]
  next.nodes[subtreeRootId] = { ...next.nodes[subtreeRootId], parentId }
  next.nodes[parentId] = {
    ...next.nodes[parentId],
    childrenIds: insertBefore(next.nodes[parentId].childrenIds, subtreeRootId, beforeNodeId),
  }
  return next
}

export function setLayout(
  structure: ComponentStructure,
  nodeId: string,
  key: string,
  value: string,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  next.nodes[nodeId] = { ...node, layout: { ...(node.layout ?? {}), [key]: value } }
  return next
}

export function clearLayout(
  structure: ComponentStructure,
  nodeId: string,
  key: string,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node?.layout || !(key in node.layout)) return structure
  const next = clone(structure)
  const { [key]: _removed, ...rest } = node.layout
  next.nodes[nodeId] = { ...node, layout: rest }
  return next
}

export function setContent(
  structure: ComponentStructure,
  nodeId: string,
  content: NodeContent | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (content === null) {
    const { content: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, content }
  }
  return next
}

export function setValueBinding(
  structure: ComponentStructure,
  nodeId: string,
  binding: NodeValueBinding | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (binding === null) {
    const { valueBinding: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, valueBinding: binding }
  }
  return next
}

export function setValue(
  structure: ComponentStructure,
  nodeId: string,
  value: ValueSpec | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (value === null) {
    const { value: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, value }
  }
  return next
}

export function setMedia(
  structure: ComponentStructure,
  nodeId: string,
  media: MediaType | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (media === null) {
    const { media: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, media }
  }
  return next
}

export function setMediaSource(
  structure: ComponentStructure,
  nodeId: string,
  mediaSource: MediaSource | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (mediaSource === null) {
    const { mediaSource: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, mediaSource }
  }
  return next
}

export function setMediaAlt(
  structure: ComponentStructure,
  nodeId: string,
  mediaAlt: ContentValue | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (mediaAlt === null) {
    const { mediaAlt: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, mediaAlt }
  }
  return next
}

export function setDestination(
  structure: ComponentStructure,
  nodeId: string,
  destination: ContentValue | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (destination === null) {
    const { destination: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, destination }
  }
  return next
}

export function setComposes(
  structure: ComponentStructure,
  nodeId: string,
  composes: AtomRef[],
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (composes.length === 0) {
    const { composes: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, composes }
  }
  return next
}

export function setCell(
  structure: ComponentStructure,
  nodeId: string,
  cell: CellSpec | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (cell === null || (!cell.header && !cell.scope)) {
    const { cell: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, cell }
  }
  return next
}

export function setForeign(
  structure: ComponentStructure,
  nodeId: string,
  foreign: ForeignContent | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (foreign === null) {
    const { foreign: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, foreign }
  }
  return next
}

export function setInstance(
  structure: ComponentStructure,
  nodeId: string,
  instance: ComponentInstance | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (instance === null) {
    const { instance: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, instance }
  }
  return next
}

export function setA11y(
  structure: ComponentStructure,
  nodeId: string,
  a11y: NodeA11y | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (a11y === null || (!a11y.name && !a11y.labelledBy)) {
    const { a11y: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, a11y }
  }
  return next
}

export function setControlRealization(
  structure: ComponentStructure,
  nodeId: string,
  control: ControlRealization | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure

  const nextVariant = control?.as ?? 'checkbox'
  let base = structure
  if (nextVariant !== 'checkbox') {
    const glyph = checkboxGlyphChild(node, structure.nodes)
    if (glyph) base = removeNode(structure, glyph.id)
  }

  const next = clone(base)
  const target = next.nodes[nodeId]
  if (!target) return structure

  const variantPaint = controlVariantStyle(nextVariant)
  if (control === null || control.as === 'checkbox') {
    const { control: _removed, ...rest } = target
    next.nodes[nodeId] = { ...rest, ...variantPaint }
  } else {
    next.nodes[nodeId] = { ...target, control, ...variantPaint }
  }
  return next
}

export function setGroupRealization(
  structure: ComponentStructure,
  rootId: string,
  group: GroupRealization | null,
): ComponentStructure {
  const root = structure.nodes[rootId]
  if (!root) return structure
  const variant = group?.as ?? 'radio'
  const next = clone(structure)

  const { group: _prev, ...rootRest } = next.nodes[rootId]
  next.nodes[rootId] = group && group.as !== 'radio' ? { ...rootRest, group } : rootRest
  applyGroupVariant(next, rootId, variant)
  return next
}

export type ToggleButtonForm = 'text' | 'iconText' | 'icon'

function partLeaf(node: ComponentNode | undefined): string | undefined {
  return node?.part?.split('.').pop()
}

function findInSubtree(
  structure: ComponentStructure,
  pred: (n: ComponentNode) => boolean,
): ComponentNode | undefined {
  const seen = new Set<string>()
  const walk = (id: string): ComponentNode | undefined => {
    if (seen.has(id)) return undefined
    seen.add(id)
    const node = structure.nodes[id]
    if (!node) return undefined
    if (pred(node)) return node
    for (const cid of node.childrenIds) {
      const hit = walk(cid)
      if (hit) return hit
    }
    return undefined
  }
  return walk(structure.rootId)
}

function labelPartNode(structure: ComponentStructure): ComponentNode | undefined {
  return findInSubtree(structure, (n) => n.kind === 'text' && partLeaf(n) === 'label')
}

function indicatorPartNode(structure: ComponentStructure): ComponentNode | undefined {
  return findInSubtree(structure, (n) => n.kind === 'icon' && partLeaf(n) === 'indicator')
}

export function toggleButtonForm(structure: ComponentStructure): ToggleButtonForm {
  if (labelPartNode(structure)?.presentation === 'accessibleName') return 'icon'
  return indicatorPartNode(structure) ? 'iconText' : 'text'
}

function addIndicatorNode(structure: ComponentStructure, rootId: string): ComponentStructure {
  const seed = seedStructure('ToggleButton', 'ToggleButton', { includeOptional: true })
  const seedInd = Object.values(seed.nodes).find((n) => n.part?.split('.').pop() === 'indicator')
  const label = labelPartNode(structure)
  const parentId = label?.parentId ?? rootId
  const id = crypto.randomUUID()
  const next = clone(structure)
  next.nodes[id] = {
    ...(seedInd ?? {
      name: 'Indicator',
      kind: 'icon',
      tag: 'svg',
      part: 'indicator',
      origin: 'archetype',
      locked: false,
    }),
    id,
    parentId,
    childrenIds: [],

    content: { kind: 'static', text: 'star' },
  }
  next.nodes[parentId] = {
    ...next.nodes[parentId],
    childrenIds: insertBefore(next.nodes[parentId].childrenIds, id, label?.id ?? null),
  }
  return next
}

export function setToggleButtonForm(
  structure: ComponentStructure,
  rootId: string,
  form: ToggleButtonForm,
): ComponentStructure {
  if (!structure.nodes[rootId]) return structure
  let next = clone(structure)

  const label = labelPartNode(next)
  if (label) {
    const { presentation: _drop, ...rest } = next.nodes[label.id]
    next.nodes[label.id] = form === 'icon' ? { ...rest, presentation: 'accessibleName' } : rest
  }

  const wantIcon = form === 'iconText' || form === 'icon'
  const indicator = indicatorPartNode(next)
  if (wantIcon && !indicator) next = addIndicatorNode(next, rootId)
  else if (!wantIcon && indicator) next = removeNode(next, indicator.id)

  return next
}

export function setNodeMotion(
  structure: ComponentStructure,
  nodeId: string,
  motion: NodeMotion | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (motion === null || motion.transitions.length === 0) {
    const { motion: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, motion }
  }
  return next
}

export function setCalendar(
  structure: ComponentStructure,
  nodeId: string,
  calendar: NodeCalendar | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (calendar === null) {
    const { calendar: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, calendar }
  }
  return next
}

export function setTimePicker(
  structure: ComponentStructure,
  nodeId: string,
  timePicker: NodeTimePicker | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (timePicker === null) {
    const { timePicker: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, timePicker }
  }
  return next
}

// ─── Per-archetype config surfaces (proposal 0034) ────────────────────────────

// Alert severity is a PAINT variant (like GroupRealization): choosing it repaints the
// alert's fill/border and the icon's ink with the matching semantic status tokens, and
// records the choice on the root so the Inspector shows it. `info` is the seeded default
// so it clears the field.
const ALERT_SEVERITY_ROOT: Record<AlertSeverity, Record<string, string>> = {
  info: { fill: 'info-subtle', 'border.color': 'info' },
  success: { fill: 'success-subtle', 'border.color': 'success' },
  warning: { fill: 'warning-subtle', 'border.color': 'warning' },
  danger: { fill: 'danger-subtle', 'border.color': 'danger' },
}
const ALERT_SEVERITY_ICON: Record<AlertSeverity, string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}
const leafOf = (n: ComponentNode): string | undefined => n.part?.split('.').pop()

export function setAlertSeverity(
  structure: ComponentStructure,
  rootId: string,
  severity: AlertSeverity | null,
): ComponentStructure {
  const root = structure.nodes[rootId]
  if (!root) return structure
  const eff: AlertSeverity = severity ?? 'info'
  const next = clone(structure)
  const rootFacets = ALERT_SEVERITY_ROOT[eff]
  next.nodes[rootId] = {
    ...next.nodes[rootId],
    facets: { ...next.nodes[rootId].facets, ...rootFacets },
    ...(severity && severity !== 'info' ? { severity } : {}),
  }
  if (!severity || severity === 'info') delete next.nodes[rootId].severity
  for (const n of Object.values(next.nodes)) {
    if (leafOf(n) === 'icon') n.facets = { ...n.facets, ink: ALERT_SEVERITY_ICON[eff] }
  }
  return next
}

// The remaining surfaces are plain config objects stored on the node (same shape as
// setCalendar/setTimePicker): the generated component reads them; a null clears.
function setNodeField<K extends keyof ComponentNode>(
  structure: ComponentStructure,
  nodeId: string,
  key: K,
  value: ComponentNode[K] | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (value === null) {
    const rest = { ...next.nodes[nodeId] }
    delete rest[key]
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...next.nodes[nodeId], [key]: value }
  }
  return next
}

export const setAccordionMode = (s: ComponentStructure, id: string, v: AccordionMode | null) =>
  setNodeField(s, id, 'accordion', v)
export const setTabs = (s: ComponentStructure, id: string, v: NodeTabs | null) =>
  setNodeField(s, id, 'tabs', v)
export const setSlider = (s: ComponentStructure, id: string, v: NodeSlider | null) =>
  setNodeField(s, id, 'slider', v)
export const setRating = (s: ComponentStructure, id: string, v: NodeRating | null) =>
  setNodeField(s, id, 'rating', v)
export const setColorPickerConfig = (s: ComponentStructure, id: string, v: NodeColorPicker | null) =>
  setNodeField(s, id, 'colorPicker', v)
export const setOverlay = (s: ComponentStructure, id: string, v: NodeOverlay | null) =>
  setNodeField(s, id, 'overlay', v)

// Conditional presence (0031, predicate in 0032). A null/unconditional predicate removes
// the field entirely (node reverts to always-present), mirroring setNodeMotion's empty case.
export function setNodePresence(
  structure: ComponentStructure,
  nodeId: string,
  presence: Predicate | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (!presence || isUnconditional(presence)) {
    const { presence: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, presence }
  }
  return next
}

export function setStateBindings(
  structure: ComponentStructure,
  nodeId: string,
  bindings: NodeStateBinding[],
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (bindings.length === 0) {
    const { stateBindings: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, stateBindings: bindings }
  }
  return next
}

export function setSlot(
  structure: ComponentStructure,
  nodeId: string,
  slot: NodeSlot | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (slot === null) {
    const { slot: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, slot }
  }
  return next
}

export function setRepeat(
  structure: ComponentStructure,
  nodeId: string,
  repeat: NodeRepeat | null,
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  if (repeat === null) {
    const { repeat: _removed, ...rest } = node
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, repeat }
  }
  return next
}

function setNodeStates(
  structure: ComponentStructure,
  nodeId: string,
  fn: (rules: StateRule[]) => StateRule[],
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  next.nodes[nodeId] = { ...node, states: fn(node.states ?? []) }
  return next
}

function mapRule(rules: StateRule[], ruleId: string, fn: (r: StateRule) => StateRule): StateRule[] {
  return rules.map((r) => (r.id === ruleId ? fn(r) : r))
}

export function addStateRule(
  structure: ComponentStructure,
  nodeId: string,
  rule: StateRule,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) => [...rules, rule])
}

export function updateStateRule(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
  patch: Partial<StateRule>,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) =>
    mapRule(rules, ruleId, (r) => ({ ...r, ...patch })),
  )
}

export function removeStateRule(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) => rules.filter((r) => r.id !== ruleId))
}

export function setStateRuleFacet(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
  facet: string,
  value: string,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) =>
    mapRule(rules, ruleId, (r) => ({ ...r, facets: { ...(r.facets ?? {}), [facet]: value } })),
  )
}

export function clearStateRuleFacet(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
  facet: string,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) =>
    mapRule(rules, ruleId, (r) => {
      if (!r.facets || !(facet in r.facets)) return r
      const { [facet]: _removed, ...rest } = r.facets
      return { ...r, facets: rest }
    }),
  )
}

export function setStateRuleLayout(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
  key: string,
  value: string,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) =>
    mapRule(rules, ruleId, (r) => ({ ...r, layout: { ...(r.layout ?? {}), [key]: value } })),
  )
}

export function clearStateRuleLayout(
  structure: ComponentStructure,
  nodeId: string,
  ruleId: string,
  key: string,
): ComponentStructure {
  return setNodeStates(structure, nodeId, (rules) =>
    mapRule(rules, ruleId, (r) => {
      if (!r.layout || !(key in r.layout)) return r
      const { [key]: _removed, ...rest } = r.layout
      return { ...r, layout: rest }
    }),
  )
}

function setNodeBehaviors(
  structure: ComponentStructure,
  nodeId: string,
  fn: (behaviors: NodeBehavior[]) => NodeBehavior[],
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  next.nodes[nodeId] = { ...node, behaviors: fn(node.behaviors ?? []) }
  return next
}

export function addBehavior(
  structure: ComponentStructure,
  nodeId: string,
  behavior: NodeBehavior,
): ComponentStructure {
  return setNodeBehaviors(structure, nodeId, (bs) => [...bs, behavior])
}

export function updateBehavior(
  structure: ComponentStructure,
  nodeId: string,
  behaviorId: string,
  behavior: NodeBehavior,
): ComponentStructure {
  return setNodeBehaviors(structure, nodeId, (bs) =>
    bs.map((b) => (b.id === behaviorId ? behavior : b)),
  )
}

export function removeBehavior(
  structure: ComponentStructure,
  nodeId: string,
  behaviorId: string,
): ComponentStructure {
  return setNodeBehaviors(structure, nodeId, (bs) => bs.filter((b) => b.id !== behaviorId))
}

function setNodeEmits(
  structure: ComponentStructure,
  nodeId: string,
  fn: (emits: EventEmission[]) => EventEmission[],
): ComponentStructure {
  const node = structure.nodes[nodeId]
  if (!node) return structure
  const next = clone(structure)
  const emits = fn(node.emits ?? [])
  if (emits.length === 0) {
    const { emits: _removed, ...rest } = next.nodes[nodeId]
    next.nodes[nodeId] = rest
  } else {
    next.nodes[nodeId] = { ...node, emits }
  }
  return next
}

export function addEmission(
  structure: ComponentStructure,
  nodeId: string,
  emission: EventEmission,
): ComponentStructure {
  return setNodeEmits(structure, nodeId, (es) => [...es, emission])
}

export function updateEmission(
  structure: ComponentStructure,
  nodeId: string,
  emissionId: string,
  emission: EventEmission,
): ComponentStructure {
  return setNodeEmits(structure, nodeId, (es) =>
    es.map((e) => (e.id === emissionId ? emission : e)),
  )
}

export function removeEmission(
  structure: ComponentStructure,
  nodeId: string,
  emissionId: string,
): ComponentStructure {
  return setNodeEmits(structure, nodeId, (es) => es.filter((e) => e.id !== emissionId))
}

export function moveNode(
  structure: ComponentStructure,
  nodeId: string,
  newParentId: string,
  beforeNodeId: string | null,
): ComponentStructure {
  if (nodeId === structure.rootId) return structure
  const node = structure.nodes[nodeId]
  const newParent = structure.nodes[newParentId]
  if (!node || !newParent) return structure

  const next = clone(structure)

  if (node.parentId) {
    const oldParent = next.nodes[node.parentId]
    if (oldParent) {
      next.nodes[node.parentId] = {
        ...oldParent,
        childrenIds: oldParent.childrenIds.filter((c) => c !== nodeId),
      }
    }
  }

  next.nodes[nodeId] = { ...next.nodes[nodeId], parentId: newParentId }
  const parentNow = next.nodes[newParentId]
  next.nodes[newParentId] = {
    ...parentNow,
    childrenIds: insertBefore(parentNow.childrenIds, nodeId, beforeNodeId),
  }
  return next
}

export function wrapNodes(
  structure: ComponentStructure,
  nodeIds: string[],
  container: ComponentNode,
): ComponentStructure {
  if (nodeIds.length === 0) return structure
  if (structure.nodes[container.id]) return structure
  const ids = new Set(nodeIds)
  if (ids.has(structure.rootId)) return structure

  const targets = nodeIds.map((id) => structure.nodes[id])
  if (targets.some((n) => !n)) return structure
  const parentId = targets[0]!.parentId
  if (parentId === null) return structure
  if (targets.some((n) => n!.parentId !== parentId)) return structure
  const parent = structure.nodes[parentId]
  if (!parent) return structure

  const next = clone(structure)

  const ordered = parent.childrenIds.filter((id) => ids.has(id))
  let placed = false
  const childrenIds: string[] = []
  for (const id of parent.childrenIds) {
    if (ids.has(id)) {
      if (!placed) {
        childrenIds.push(container.id)
        placed = true
      }
    } else {
      childrenIds.push(id)
    }
  }
  next.nodes[parentId] = { ...parent, childrenIds }
  next.nodes[container.id] = { ...container, parentId, childrenIds: ordered }
  for (const id of ordered) {
    next.nodes[id] = { ...next.nodes[id], parentId: container.id }
  }
  return next
}

function toMaterializedShell(src: ComponentNode, childId: string): ComponentNode {
  return {
    ...src,
    kind: 'container',
    tag: 'label',
    facets: undefined,
    layout: undefined,
    states: undefined,
    motion: undefined,
    content: undefined,
    childrenIds: [childId],
  }
}

export function materializeCheckbox(
  structure: ComponentStructure,
  nodeId: string,
  ids: { indicator: string; glyph: string },
): ComponentStructure {
  const src = structure.nodes[nodeId]
  if (!src || customToggleVariant(src) !== 'checkbox') return structure

  const next = clone(structure)
  const existingGlyph = checkboxGlyphChild(src, structure.nodes)
  const glyphId = existingGlyph?.id ?? ids.glyph

  next.nodes[ids.indicator] = {
    id: ids.indicator,
    name: 'Indicator',
    kind: 'container',
    tag: 'span',
    part: CHECKBOX_INDICATOR_PART,
    origin: 'archetype',
    locked: true,
    parentId: nodeId,
    childrenIds: [glyphId],
    facets: src.facets,
    layout: src.layout,
    states: src.states,
    motion: src.motion,
  }

  next.nodes[glyphId] = existingGlyph
    ? { ...existingGlyph, parentId: ids.indicator, locked: true }
    : {
        id: glyphId,
        name: 'Checkmark',
        kind: 'icon',
        tag: 'svg',
        part: CHECKBOX_GLYPH_PART,
        origin: 'archetype',
        locked: true,
        parentId: ids.indicator,
        childrenIds: [],
        content: { kind: 'static', text: 'check' },
      }

  next.nodes[nodeId] = toMaterializedShell(src, ids.indicator)
  return next
}

export function materializeSwitch(
  structure: ComponentStructure,
  nodeId: string,
  ids: { track: string; thumb: string },
): ComponentStructure {
  const src = structure.nodes[nodeId]
  if (!src || customToggleVariant(src) !== 'switch') return structure

  const next = clone(structure)

  next.nodes[ids.track] = {
    id: ids.track,
    name: 'Track',
    kind: 'container',
    tag: 'span',
    part: SWITCH_TRACK_PART,
    origin: 'archetype',
    locked: true,
    parentId: nodeId,
    childrenIds: [ids.thumb],
    facets: src.facets,
    layout: src.layout,
    states: src.states,
    motion: src.motion,
  }

  next.nodes[ids.thumb] = {
    id: ids.thumb,
    name: 'Thumb',
    kind: 'container',
    tag: 'span',
    part: SWITCH_THUMB_PART,
    origin: 'archetype',
    locked: true,
    parentId: ids.track,
    childrenIds: [],
  }

  next.nodes[nodeId] = toMaterializedShell(src, ids.track)
  return next
}
