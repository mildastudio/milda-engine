import type { ComponentContract, PropType, PropValue } from '../contract/types'
import type { NodeBehavior } from '../behavior/free'

export type NodeKind =
  | 'container'
  | 'item'
  | 'text'
  | 'control'
  | 'input'
  | 'output'
  | 'icon'
  | 'content'
  | 'fragment'
  | 'foreign'
  | 'table'
  | 'row'
  | 'cell'
  | 'instance'

export type NodeTag =
  | 'auto'
  | 'div'
  | 'span'
  | 'button'
  | 'a'
  | 'input'
  | 'textarea'
  | 'label'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'li'
  | 'nav'
  | 'section'
  | 'form'
  | 'img'
  | 'svg'
  | 'table'
  | 'tr'
  | 'td'
  | 'th'

export type NodeOrigin = 'root' | 'archetype' | 'author'

export type ContentValue = { kind: 'text'; text: string } | { kind: 'bind'; propName: string }

export interface ContentRule {
  id: string
  when: PropCondition
  value: ContentValue
}

export type NodeContent =
  | { kind: 'static'; text: string }
  | { kind: 'dynamic'; default: ContentValue; rules: ContentRule[] }

export type RepeatSource =
  | { kind: 'prop'; propName: string }
  | { kind: 'static'; items: PropValue[]; itemType?: PropType }

export interface NodeRepeat {
  source: RepeatSource
  itemAlias: string

  sample?: SlotSample
}

export interface NodeValueBinding {
  propName: string
}

export interface ValueSpec {
  type: PropType
}

export type MediaType = 'img' | 'video' | 'audio' | 'embed'

export interface CellSpec {
  header?: boolean
  scope?: 'col' | 'row'
}

export interface InstanceProp {
  name: string

  value: ContentValue
}

export interface ComponentInstance {
  componentId: string

  props?: InstanceProp[]
}

export interface NodeA11y {
  name?: ContentValue

  labelledBy?: string
}

export interface ControlRealization {
  as: 'checkbox' | 'switch'
}

export interface GroupRealization {
  as: 'radio' | 'segmented'
}

export type NodePresentation = 'accessibleName'

export interface AtomRef {
  atom: string

  mode?: string
}

export interface ForeignContent {
  code: string

  label?: string
}

export type InteractionKind =
  | 'activate'
  | 'change'
  | 'input'
  | 'focus'
  | 'blur'
  | 'select'
  | 'open'
  | 'close'
  | 'dismiss'

export interface DemoAction {
  id: string
  on: InteractionKind
  variable: string
  op: 'set' | 'toggle'
  value?: boolean
}

export interface EventEmission {
  id: string
  eventId: string
  on: InteractionKind
  payload?: ContentValue

  signal?: string

  locked?: boolean
}

export interface NodeStateBinding {
  id: string

  state: string

  propName: string
}

export type SlotArity = 'single' | 'optional' | 'many'

export type SlotAccepts =
  | { kind: 'content' }
  | { kind: 'type'; ref: string }
  | { kind: 'component'; ref: string }

export type SlotRole = 'trigger' | 'panel'

export interface NodeSlot {
  default?: boolean
  arity: SlotArity
  accepts: SlotAccepts

  keyedBy?: string

  exposeAs?: string

  sample?: SlotSample

  role?: SlotRole
}

export type SlotSample =
  | { kind: 'text'; text: string }
  | { kind: 'example'; exampleId: string }
  | { kind: 'list'; items: SlotSample[] }

export type StateName =
  | 'hovered'
  | 'pressed'
  | 'focused'
  | 'focus-visible'
  | 'active'
  | 'selected'
  | 'checked'
  | 'indeterminate'
  | 'expanded'
  | 'open'
  | 'disabled'
  | 'readonly'
  | 'loading'
  | 'error'
  | 'success'
  | 'first'
  | 'last'
  | 'odd'
  | 'even'

export type PropCondition = Record<string, PropValue>

export interface StateRule {
  id: string

  props: PropCondition
  states: StateName[]

  facets?: Record<string, string>
  layout?: Record<string, string>

  glyph?: string
}

export interface MotionTransition {
  id: string

  facets?: string[]
  duration: string
  easing?: string
  delay?: string
}

export interface NodeMotion {
  transitions: MotionTransition[]
}

export interface ComponentNode {
  id: string
  name: string
  kind: NodeKind
  tag: NodeTag

  part?: string
  origin: NodeOrigin

  locked: boolean

  facets?: Record<string, string>

  layout?: Record<string, string>

  content?: NodeContent

  repeat?: NodeRepeat

  valueBinding?: NodeValueBinding

  value?: ValueSpec

  media?: MediaType

  foreign?: ForeignContent

  composes?: AtomRef[]

  cell?: CellSpec

  instance?: ComponentInstance

  a11y?: NodeA11y

  actions?: DemoAction[]

  control?: ControlRealization

  group?: GroupRealization

  presentation?: NodePresentation

  motion?: NodeMotion

  stateBindings?: NodeStateBinding[]

  emits?: EventEmission[]

  states?: StateRule[]

  behaviors?: NodeBehavior[]

  slot?: NodeSlot

  contract?: ComponentContract
  parentId: string | null
  childrenIds: string[]
}

export interface ComponentStructure {
  rootId: string
  nodes: Record<string, ComponentNode>
}

export interface ComponentIR {
  name: string

  description?: string

  internal?: boolean

  docsHidden?: boolean
  archetype: string | null
  structure: ComponentStructure

  contract?: ComponentContract

  targets?: Record<string, Record<string, unknown>>
}

export function effectiveValueType(node: ComponentNode): PropType | undefined {
  if (node.value) return node.value.type
  const atoms = new Set((node.composes ?? []).map((c) => c.atom))
  if (atoms.has('toggle')) return { kind: 'boolean' }
  if (atoms.has('range') || atoms.has('stepping')) return { kind: 'number' }
  return undefined
}

export function canAcceptChildren(node: ComponentNode): boolean {
  return (
    node.kind === 'container' ||
    node.kind === 'item' ||
    node.kind === 'control' ||
    node.kind === 'fragment' ||
    node.kind === 'table' ||
    node.kind === 'row' ||
    node.kind === 'cell'
  )
}

export function canExposeAsSlot(node: ComponentNode): boolean {
  return canAcceptChildren(node) || node.kind === 'text'
}

export function canRepeat(node: ComponentNode): boolean {
  return node.kind !== 'input' && node.kind !== 'output'
}

export function isSelfOrDescendant(
  structure: ComponentStructure,
  candidateId: string,
  ancestorId: string,
): boolean {
  let current: ComponentNode | undefined = structure.nodes[candidateId]
  while (current) {
    if (current.id === ancestorId) return true
    if (!current.parentId) return false
    current = structure.nodes[current.parentId]
  }
  return false
}
