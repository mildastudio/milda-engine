import type { ComponentContract, PropType, PropValue } from '../contract/types'
import type { NodeBehavior } from '../behavior/free'
import type { Predicate } from './predicate'

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

// A value that is either FIXED (a typed literal) or BOUND to a prop / data source. The
// fixed leg is a typed `PropValue` (`{ kind: 'value'; value }`) so the editor offers a
// type-native control per target (icon picker, colour swatch, number stepper, switch,
// enum select) rather than a raw text field. The legacy string leg (`{ kind: 'text' }`)
// was migrated to `value` (`migrateDocument`); `normalizeContentValue` still folds any
// un-migrated `text` at runtime for safety.
export type ContentValue =
  | { kind: 'value'; value: PropValue }
  | { kind: 'bind'; propName: string }

export interface ContentRule {
  id: string
  // Predicate gate (0032). Absent ⇒ the rule always matches (an "otherwise" leg). Legacy
  // documents stored a `PropCondition` map here; reads coerce it via `coercePredicate`.
  when?: Predicate
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

// A design-time-only preview aid for a `bind` media source — the generator ignores
// it entirely (same convention as a slot's `sample`). Lets the canvas/docs show a
// real image for an avatar/card-image/etc. whose actual source is consumer-supplied.
// Unlike `MediaSource.static` this is LITERAL data an author typed in, not a design-
// system vocabulary choice (same standing as a text node's static string), so a
// raw `url` is honest here even though the rest of the Studio UI is selects-only —
// it never ships, never enters the contract, purely a canvas/docs stand-in.
export type MediaSample = { kind: 'asset'; assetId: string } | { kind: 'url'; url: string }

// Two honest cases (proposal 0028), same split as icon provenance (0019):
// - `bind` — the DEFAULT, encouraged case for reusable "media slot" components
//   (avatar, card header, aspect-ratio box). The consumer supplies the source at
//   runtime; an optional `sample` asset is a preview-only stand-in, never emitted.
// - `static` — the image itself IS the design system's content (a logo, an
//   empty-state illustration, a brand animation). A deliberate, less common choice;
//   unlike `bind`, this is meant to ship as real output.
export type MediaSource =
  | { kind: 'bind'; propName: string; sample?: MediaSample }
  | { kind: 'static'; assetId: string }

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

  // A node whose text further describes this one (aria-describedby) — a
  // SUPPLEMENT to the accessible name, not a replacement for it (unlike
  // `labelledBy`). E.g. the relationship a Tooltip's trigger has to its content.
  describedBy?: string
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

// A single typed demo-state variable (proposal 0021 slice 2, extended): its declared
// type and initial value. The example's preview seeds its prop store from `initial`,
// and node/instance bindings read the variable and react when an interaction flips it.
// Historically these were bare booleans; `normalizeDemoState` upgrades the old shape.
export interface DemoStateVar {
  type: PropType
  initial: PropValue
}

export interface DemoAction {
  id: string
  on: InteractionKind
  variable: string
  // `toggle` only applies to a boolean variable; `set` writes `value` (typed to the
  // target variable's declared type) into the prop store.
  op: 'set' | 'toggle'
  value?: PropValue
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

  // Human-authored doc prose for this slot — the SSoT the Docs page shows and edits
  // (proposal 0018). Purely documentation; never affects realization.
  description?: string
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
  // Calendar/time cell states (proposal 0029) - data-driven by the behavior core,
  // stylable on the DatePicker `day` / TimePicker `option` parts.
  | 'today'
  | 'outside-month'
  | 'range-start'
  | 'range-end'
  | 'in-range'
  | 'highlighted'

export type PropCondition = Record<string, PropValue>

// A condition on an ANCESTOR node's UI state — "when {nodeId} is {state}". Lets a
// descendant respond to a specific ancestor's interaction/semantic state (the icon
// repaints when its Button is hovered). The nodeId names an ancestor on this node's
// path to the root; the generator emits it as a descendant selector
// (`.button:hover .icon`) and the editor matches it against that ancestor's live state.
export interface AncestorStateCondition {
  nodeId: string
  state: StateName
}

export interface StateRule {
  id: string

  props: PropCondition
  states: StateName[]
  // Ancestor-anchored conditions (all must hold, ANDed with `states`/`props`). Absent on
  // ordinary self-scoped rules, so existing rules and generator paths are unchanged.
  ancestorStates?: AncestorStateCondition[]

  // Rich condition (proposal 0032). When present it is the CANONICAL condition and
  // SUPERSEDES `props`/`states`/`ancestorStates` (those stay the representable fast path the
  // matrix picker writes; `when` holds operators / OR / NOT the CSS target realizes via a
  // computed `data-cond` boolean). Absent on all existing rules — additive, no migration.
  when?: Predicate

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

// ─── Calendar configuration (proposal 0029) ──────────────────────────────────
// Per-component DatePicker settings, baked into the generated component (not
// runtime props). Same node-attached pattern as `motion` (0017) / `mediaSource`
// (0028) / `a11y` (0013). The date-value *representation* is deliberately NOT
// here — it is a project/publish-level decision (target options, 0015).

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface NodeCalendar {
  // Single date, or a start..end range (composes `selection.range`).
  selectionMode: 'single' | 'range'
  // First column of the grid. 0 = Sunday .. 6 = Saturday.
  weekStartsOn: Weekday
  // Weekdays that are always disabled (e.g. weekends).
  disabledWeekdays?: Weekday[]
}

// Per-component TimePicker settings (proposal 0029), baked into the generated
// component. Same node-attached pattern as `calendar`. The time-value representation
// is a project/publish-level decision (target options, 0015), not here.
export interface NodeTimePicker {
  // Minutes between selectable slots (e.g. 15, 30, 60).
  step: number
  // Show 12-hour (AM/PM) vs 24-hour labels; the view formats via Intl.
  use24Hour: boolean
}

// Alert/Banner intent (proposal 0034). A paint-variant like GroupRealization: picking
// a severity repaints the alert's fill/border/icon with the matching semantic status
// tokens. Stored on the root so the Inspector can show the current choice; absent =
// the seeded default (info).
export type AlertSeverity = 'info' | 'success' | 'warning' | 'danger'

// Accordion expand policy (proposal 0034). `single` = at most one panel open at a
// time (composes selection.single); `multiple` = independent per-item disclosure.
// Baked into the generated component. Absent = single.
export type AccordionMode = 'single' | 'multiple'

// Tabs presentation (proposal 0034). Orientation of the tab list and whether focus
// alone activates a tab (`automatic`, WAI-ARIA auto-activation) or activation waits
// for Enter/Space (`manual`). Absent = horizontal + automatic.
export interface NodeTabs {
  orientation: 'horizontal' | 'vertical'
  activation: 'automatic' | 'manual'
}

// Slider shape (proposal 0034). `range` = dual-thumb {lo,hi}; orientation flips the
// track. Baked into the generated component; the value prop shape follows `range`.
export interface NodeSlider {
  range: boolean
  orientation: 'horizontal' | 'vertical'
}

// Rating shape (proposal 0034). Item count + optional half-step granularity. Baked
// into the generated component; drives the born sample item count too.
export interface NodeRating {
  max: number
  allowHalf: boolean
}

// ColorPicker value representation (proposal 0034). The carrier the picker reads/writes
// and whether an alpha channel is offered. The exact color TYPE stays a project/publish
// decision (target options, 0015); this is the picker's own surface config.
export interface NodeColorPicker {
  representation: 'hex' | 'rgb' | 'hsl'
  alpha: boolean
}

// Overlay dismissal + placement (proposal 0034) for Dialog/Drawer/Popover. `triggers`
// are the configured dismiss gestures (`dismiss` atom's `when`); `placement` is the
// anchored side/edge. Absent fields fall back to per-archetype defaults.
export type DismissTrigger = 'outside' | 'escape' | 'closeButton'
export interface NodeOverlay {
  dismiss?: DismissTrigger[]
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
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

  // Navigation destination for a navigating node (Link root / <a>). Static URL or bound to
  // a prop, same ContentValue pattern as `mediaAlt` / `a11y.name` — the destination is a
  // declared, bindable seam, NOT inferred from a prop name. The web target lowers it to the
  // native `href`; other targets realize it via their own navigation primitive.
  destination?: ContentValue

  repeat?: NodeRepeat

  valueBinding?: NodeValueBinding

  value?: ValueSpec

  media?: MediaType

  mediaSource?: MediaSource

  // Accessible alt text for a `content`/img node — static or bound to a prop, same
  // pattern as NodeA11y.name (0013). Defaults to the asset's own `alt` when unset
  // and mediaSource is `static`.
  mediaAlt?: ContentValue

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

  calendar?: NodeCalendar

  timePicker?: NodeTimePicker

  // Per-archetype config surfaces (proposal 0034), same node-attached pattern as
  // calendar/timePicker. Each is set from a bespoke Inspector section.
  severity?: AlertSeverity
  accordion?: AccordionMode
  tabs?: NodeTabs
  slider?: NodeSlider
  rating?: NodeRating
  colorPicker?: NodeColorPicker
  overlay?: NodeOverlay

  stateBindings?: NodeStateBinding[]

  emits?: EventEmission[]

  states?: StateRule[]

  // Conditional presence (0031, generalized to a predicate in 0032) — when set, the node
  // renders only when the predicate holds; absent = always present. Unlike StateRule
  // (which repaints an ever-present node), presence gates whether the node is rendered at
  // all. The predicate can test props (repeat-item-alias aware), UI states, and (0032
  // phase 4) foundations context, with operators and AND/OR/NOT. Not authored on the root
  // or on compound-internal `part` nodes (their dedicated emitters bypass the child path).
  presence?: Predicate

  behaviors?: NodeBehavior[]

  slot?: NodeSlot

  contract?: ComponentContract
  parentId: string | null
  childrenIds: string[]
}

// ─── Component-level behavior composition (proposal 0024, phase 2) ────────────
// The §9 algebra a component composes from its atoms — authored per-component and
// stored on the IR (previously only implicit in the archetype). Each entry carries a
// stable `id` so the editor can add/update/remove it. The generator/emitter read the
// EFFECTIVE composition = the archetype's canonical wiring ⊕ these authored entries.

export interface CompositionUse {
  id: string
  // The atom being used, e.g. `activation` or `selection.single`.
  atom: string
  // The local alias the wires reference, e.g. `A`, `S`.
  as: string
  // Optional atom params (e.g. `{ mode: 'single' }`).
  params?: Record<string, string>
}

export interface CompositionWire {
  id: string
  // A machine.event source, e.g. `A.invoke`.
  from: string
  // A machine.event target, e.g. `P.toggle`.
  to: string
  // An optional call argument on the target, e.g. `first` in `B.to(first)`.
  arg?: string
  // An optional guard condition (raw predicate text, e.g. `loading` or `size=lg`).
  when?: string
}

export interface CompositionGate {
  id: string
  // The machine that only listens under a condition, e.g. `D` or `spinner`.
  machine: string
  // The predicate it is gated on, e.g. `P.open`.
  activeWhen: string
}

export interface ComponentComposition {
  uses: CompositionUse[]
  wires: CompositionWire[]
  gates: CompositionGate[]
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

  // Authored behavior composition (proposal 0024, phase 2). Absent ⇒ the component
  // uses only its archetype's canonical composition; present ⇒ overlaid on top.
  composition?: ComponentComposition

  // Free-form descriptive metadata (proposal 0026) — status/since/tags/author/…
  // Never contractual (excluded from the contract digest); optional → absent on
  // documents authored before metadata existed (no migration needed).
  meta?: Record<string, string | number | boolean | Array<string | number | boolean>>

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
