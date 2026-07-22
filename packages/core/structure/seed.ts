import { archetypesByName, atomsByName, compositesByName } from '@mildastudio/milda'
import type { AnatomyPart, PartRole } from '@mildastudio/milda'
import type { ComponentContract, EventDef, PropDef, PropType, PropValue } from '../contract/types'
import { BUILTIN_COLOR_ID, BUILTIN_DATE_ID } from '../contract/builtins'
import { applyArchetypeDefaults } from '../defaults'
import {
  effectiveValueType,
  type ComponentNode,
  type ComponentStructure,
  type NodeKind,
  type NodeTag,
  type RepeatSource,
} from './types'
import { defaultEventName, interactionForSignal } from './signals'

const ROLE_TO_KIND: Record<PartRole, NodeKind> = {
  container: 'container',
  item: 'item',
  text: 'text',
  control: 'control',
  input: 'input',
  icon: 'icon',
  content: 'content',
}

const ROLE_TO_TAG: Record<PartRole, NodeTag> = {
  container: 'div',
  item: 'li',
  text: 'span',
  control: 'button',
  input: 'input',
  icon: 'svg',
  content: 'img',
}

function uid(): string {
  return crypto.randomUUID()
}

function prettify(name: string): string {
  const local = name.split('.').pop() ?? name
  return local.charAt(0).toUpperCase() + local.slice(1)
}

const BORN_ITEM_ALIAS = 'item'
function bornItemsStatic(): RepeatSource {
  return {
    kind: 'static',
    items: [
      { label: 'One', value: 'one' },
      { label: 'Two', value: 'two' },
      { label: 'Three', value: 'three' },
    ],
    itemType: {
      kind: 'object',
      fields: [
        { id: uid(), name: 'label', type: { kind: 'string' }, required: true },
        { id: uid(), name: 'value', type: { kind: 'string' }, required: true },
      ],
    },
  }
}

function build(
  part: AnatomyPart,
  parentId: string,
  parentPath: string,
  nodes: Record<string, ComponentNode>,
  includeOptional: boolean,
  bornRepeat: boolean,
  itemAlias: string | undefined,
  underItem: boolean,
): string {
  const id = uid()
  const path = parentPath ? `${parentPath}.${part.name}` : part.name
  const isItem = part.role === 'item'
  const isLabel = part.role === 'text' && part.name === 'label'

  const repeatHere = bornRepeat && isItem
  const underRepeat = itemAlias !== undefined
  const node: ComponentNode = {
    id,
    name: prettify(part.name),
    kind: ROLE_TO_KIND[part.role],
    tag: ROLE_TO_TAG[part.role],
    part: path,
    origin: 'archetype',
    locked: part.optional !== true,
    parentId,
    childrenIds: [],
    ...(repeatHere ? { repeat: { source: bornItemsStatic(), itemAlias: BORN_ITEM_ALIAS } } : {}),

    ...(isLabel && underRepeat
      ? {
          content: {
            kind: 'dynamic' as const,
            default: { kind: 'bind' as const, propName: `${itemAlias}.label` },
            rules: [],
          },
        }
      : isLabel
        ? {
            slot: {
              default: true,
              arity: 'single' as const,
              accepts: { kind: 'content' as const },
              // A born collection's item is a lone template (no real items yet), so
              // its label would otherwise show only the bracketed "content goes
              // here" placeholder. A generic design-time text sample — never bound,
              // never generated — reads it as a filled row instead, matching the
              // repeated static option's own "One/Two/Three" placeholder spirit.
              ...(underItem ? { sample: { kind: 'text' as const, text: 'Item' } } : {}),
            },
          }
        : {}),
  }
  nodes[id] = node

  const childAlias = repeatHere ? BORN_ITEM_ALIAS : itemAlias
  node.childrenIds = (part.children ?? [])
    .filter((child) => includeOptional || child.optional !== true)
    .map((child) =>
      build(child, id, path, nodes, includeOptional, bornRepeat, childAlias, underItem || isItem),
    )
  return id
}

export function hasAnatomy(archetype: string | null): boolean {
  return !!(archetype && archetypesByName[archetype]?.anatomy?.length)
}

export function seedStructure(
  archetype: string | null,
  name: string,
  opts: { includeOptional?: boolean; bornRepeat?: boolean } = {},
): ComponentStructure {
  const includeOptional = opts.includeOptional ?? false
  const bornRepeat = opts.bornRepeat ?? false
  const rootId = uid()
  const nodes: Record<string, ComponentNode> = {}
  nodes[rootId] = {
    id: rootId,
    name,
    kind: 'container',
    tag: 'auto',
    origin: 'root',
    locked: true,
    parentId: null,
    childrenIds: [],
  }

  const parts = archetype ? archetypesByName[archetype]?.anatomy : undefined
  if (parts) {
    const lowered = archetype ? LOWERED_VALUE_CONTROL[archetype] : undefined

    const kept = lowered ? parts.filter((p) => !lowered.collapses.includes(p.name)) : parts
    const childIds = kept
      .filter((part) => includeOptional || part.optional !== true)
      .map((part) => build(part, rootId, '', nodes, includeOptional, bornRepeat, undefined, false))
    if (lowered) childIds.unshift(buildLoweredValueControl(lowered, rootId, nodes))
    nodes[rootId].childrenIds = childIds
  }

  if (archetype && PART_OVERRIDES[archetype]) {
    const overrides = PART_OVERRIDES[archetype]
    for (const node of Object.values(nodes)) {
      const leaf = node.part?.split('.').pop()
      if (leaf && overrides[leaf]) Object.assign(node, overrides[leaf])
    }
  }

  if (archetype === 'Tooltip') seedTooltipDescription(nodes)

  const structure = { rootId, nodes }
  applyArchetypeDefaults(structure, archetype)

  if (archetype && GROUP_ARCHETYPES.has(archetype)) applyGroupVariant(structure, rootId, 'radio')
  return structure
}

// Part-level seed refinements where the anatomy's generic role→tag/value mapping
// falls short of the platform control the archetype promises: a TextArea's control
// is a MULTILINE field (textarea, not a single-line input); a Stepper steps a
// NUMBER (so the born field types/steps numerically and the generator's stepper
// plan can attach). A bare trigger with no anatomy children of its own (Tooltip's,
// Popover's) isn't a design-system-owned button — it wraps WHATEVER the consumer
// hovers/clicks (Radix's `asChild`), so it's the component's default content slot
// instead: `{children}` in the generated code, a design-time text sample on the
// canvas (never bound, never generated — same status as a repeated item's sample).
const PART_OVERRIDES: Record<string, Record<string, Partial<ComponentNode>>> = {
  TextArea: { control: { tag: 'textarea' } },
  Stepper: { control: { value: { type: { kind: 'number' } } } },
  Tooltip: {
    trigger: {
      slot: {
        default: true,
        arity: 'single',
        accepts: { kind: 'content' },
        sample: { kind: 'text', text: 'Hover me' },
      },
    },
  },
}

// A tooltip's trigger is DESCRIBED by its own tip text (WAI-ARIA: aria-describedby —
// a supplement to whatever name the consumer's wrapped content already carries, never
// a replacement for it, unlike labelledBy). This relationship is intrinsic to what a
// Tooltip IS, not an authoring choice per instance, so it's seeded once here rather
// than left for every author to wire by hand in the Inspector.
function seedTooltipDescription(nodes: Record<string, ComponentNode>): void {
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const trigger = Object.values(nodes).find((n) => leaf(n) === 'trigger')
  const content = Object.values(nodes).find((n) => leaf(n) === 'content')
  if (trigger && content) trigger.a11y = { ...trigger.a11y, describedBy: content.id }
}

interface LoweredValueControl {
  atom: string
  collapses: string[]
  prop: { name: string; type: PropType; default: PropValue }
}
const LOWERED_VALUE_CONTROL: Record<string, LoweredValueControl> = {
  BooleanInput: {
    atom: 'toggle',
    collapses: ['control', 'indicator'],
    prop: { name: 'checked', type: { kind: 'boolean' }, default: false },
  },
}

interface VariantStyle {
  facets: Record<string, string>
  layout?: Record<string, string>
  checkedFacets: Record<string, string>
}
export const CONTROL_VARIANT_STYLE: Record<'checkbox' | 'switch', VariantStyle> = {
  checkbox: {
    facets: { fill: 'surface', corner: 'sm', 'border.width': 'thin', 'border.color': 'accent' },
    layout: { width: '20px', height: '20px' },
    checkedFacets: { fill: 'accent', 'border.color': 'accent', ink: 'on-accent' },
  },
  switch: {
    facets: { fill: 'surface', 'border.width': 'thin', 'border.color': 'accent', ink: 'accent' },

    checkedFacets: { fill: 'accent', 'border.color': 'accent', ink: 'on-accent' },
  },
}

export function controlVariantStyle(
  variant: 'checkbox' | 'switch',
): Pick<ComponentNode, 'facets' | 'layout' | 'states'> {
  const s = CONTROL_VARIANT_STYLE[variant]
  return {
    facets: { ...s.facets },
    layout: s.layout ? { ...s.layout } : undefined,
    states: [{ id: uid(), props: {}, states: ['checked'], facets: { ...s.checkedFacets } }],
  }
}

interface GroupPartStyle {
  facets: Record<string, string>
  layout?: Record<string, string>

  selected?: Record<string, string>
  hovered?: Record<string, string>

  kind?: NodeKind
}
interface GroupVariantStyle {
  root: GroupPartStyle
  option: GroupPartStyle
  indicator: GroupPartStyle
  label: GroupPartStyle
}
export const GROUP_VARIANT_STYLE: Record<'radio' | 'segmented', GroupVariantStyle> = {
  radio: {
    root: { facets: { gap: 'sm' }, layout: { direction: 'column' } },

    option: {
      facets: { gap: 'sm' },
      layout: { direction: 'row', align: 'center' },
      hovered: { fill: 'surface-sunken' },
    },

    indicator: {
      kind: 'container',
      facets: {
        fill: 'surface',
        // Roundness is intrinsic to a radio (a square dot reads as a checkbox), so it is a
        // raw circle rather than the `pill` radius token — this way it survives even a
        // token-less (empty) project and never follows a re-themed pill radius.
        corner: '50%',
        'border.width': 'thin',
        'border.color': 'border-strong',
      },
      layout: { width: '16px', height: '16px' },
      selected: { fill: 'accent', 'border.color': 'accent' },
    },
    label: { facets: { ink: 'text', 'text.size': 'md' } },
  },
  segmented: {
    root: {
      facets: {
        fill: 'surface-sunken',
        corner: 'md',
        inset: 'xs',
        gap: 'xs',
        'border.width': 'hairline',
        'border.color': 'border',
      },
      layout: { direction: 'row', align: 'center' },
    },

    option: {
      facets: { ink: 'text', corner: 'sm', inset: 'sm' },
      layout: { direction: 'row', align: 'center', distribute: 'center' },
      selected: { fill: 'surface', elevation: 'sm' },
      hovered: { fill: 'surface-sunken' },
    },

    indicator: { facets: {}, layout: { width: '0px', height: '0px' } },
    label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
  },
}

const GROUP_LEAVES = ['root', 'option', 'indicator', 'label'] as const
type GroupLeaf = (typeof GROUP_LEAVES)[number]

const GROUP_ARCHETYPES = new Set(['ChoiceGroup'])

// Collections read as a lone item template are unrecognisable, so the studio seeds them
// born with a 3-item static sample ("One/Two/Three") — a design-time sample the author
// replaces by binding a prop or editing items (never bound, never generated). Proposal
// 0034 §C generalizes what ChoiceGroup already did to every collection whose repeatable
// unit is a single `item`-role part. Table (nested column/row/cell items) and Tabs (its
// tab is a `control`, not an `item`) need a paired/2-D sample and are handled separately.
const SAMPLE_ITEM_ARCHETYPES = new Set([
  'ChoiceGroup',
  'List',
  'Menu',
  'MenuButton',
  'ContextMenu',
  'NavigationBar',
  'Breadcrumbs',
  'SingleSelect',
  'MultiSelect',
  'Combobox',
  'Tree',
  'Grid',
  'Carousel',
  'Rating',
  'TagsInput',
  'Pagination',
  'Accordion',
  'Wizard',
])

export function bornWithSampleItems(archetype: string | null): boolean {
  return !!archetype && SAMPLE_ITEM_ARCHETYPES.has(archetype)
}

function paintGroupPart(
  structure: ComponentStructure,
  node: ComponentNode,
  variant: 'radio' | 'segmented',
  leaf: GroupLeaf,
): void {
  const part = GROUP_VARIANT_STYLE[variant][leaf]
  const next: ComponentNode = {
    ...node,
    facets: { ...part.facets },
    layout: part.layout ? { ...part.layout } : undefined,
  }

  if (part.kind && part.kind !== node.kind) {
    next.kind = part.kind
    next.tag = part.kind === 'container' ? 'div' : node.tag
  }

  if (leaf === 'option' || leaf === 'indicator') {
    const others = (node.states ?? []).filter(
      (r) => !r.states.includes('selected') && !r.states.includes('hovered'),
    )
    const sel = part.selected
    const hov = part.hovered
    next.states = [
      ...others,
      ...(sel && Object.keys(sel).length
        ? [{ id: uid(), props: {}, states: ['selected' as const], facets: { ...sel } }]
        : []),
      ...(hov && Object.keys(hov).length
        ? [{ id: uid(), props: {}, states: ['hovered' as const], facets: { ...hov } }]
        : []),
    ]
  }
  structure.nodes[node.id] = next
}

export function applyGroupVariant(
  structure: ComponentStructure,
  rootId: string,
  variant: 'radio' | 'segmented',
): void {
  const root = structure.nodes[rootId]
  if (root) paintGroupPart(structure, root, variant, 'root')
  for (const node of Object.values(structure.nodes)) {
    if (node.id === rootId) continue
    const leaf = node.part?.split('.').pop()
    if (leaf === 'option' || leaf === 'indicator' || leaf === 'label') {
      paintGroupPart(structure, node, variant, leaf)
    }
  }
}

function buildLoweredValueControl(
  spec: LoweredValueControl,
  parentId: string,
  nodes: Record<string, ComponentNode>,
): string {
  const id = uid()
  nodes[id] = {
    id,
    name: 'Checkbox',
    kind: 'input',
    tag: 'input',
    origin: 'archetype',
    locked: true,
    parentId,
    childrenIds: [],
    composes: [{ atom: spec.atom }],
    ...controlVariantStyle('checkbox'),
  }
  return id
}

function loweredValueNode(
  structure: ComponentStructure,
  archetype: string | null,
): ComponentNode | undefined {
  if (!archetype || !LOWERED_VALUE_CONTROL[archetype]) return undefined
  return Object.values(structure.nodes).find(
    (n) => n.kind === 'input' && effectiveValueType(n)?.kind === 'boolean',
  )
}

function requiredAtomName(ref: string): string | null {
  const trimmed = ref.trim()
  if (trimmed.endsWith('?')) return null
  return trimmed.split(/[.(]/)[0].trim()
}

// A required `composes` entry parsed into its atom name + baked-in mode
// (`selection.multiple` → mode 'multiple', `presentation(dialog)` → mode 'dialog').
// Returns null for OPTIONAL refs (`async-state?`) — they are opt-in, so they add no
// props/events until enabled. Mirrors `parseRef` in apps/studio/lib/archetypes.ts.
function requiredRef(ref: string): { name: string; mode?: string } | null {
  const trimmed = ref.trim()
  if (trimmed.endsWith('?')) return null
  const paren = trimmed.match(/^([^(]+)\(([^)]+)\)$/)
  if (paren) return { name: paren[1].trim(), mode: paren[2].trim() }
  if (trimmed.includes('.')) {
    const [n, m] = trimmed.split('.')
    return { name: n.trim(), mode: m.trim() }
  }
  return { name: trimmed }
}

// ─── Atom value/data props (proposal 0034, axis A) ────────────────────────────
// The value-bearing atoms declare `params` (value/min/max/step/selected) but the
// prelude keeps them abstract (no types). This table lowers those params into
// concrete contract props, generalizing what LOWERED_VALUE_CONTROL does for
// BooleanInput and PICKER_VALUE_API does for the pickers to EVERY input archetype.
// Without it a born TextField/Slider/Stepper/Select had events but no `value` prop.
interface AtomValueProp {
  name: string
  type: PropType
  default?: PropValue
  // Also seed `value` + `valueBinding` on the archetype's lone input node so the
  // generator emits a real bound control (text draft, number stepper). Selection /
  // range have no input node and stay contract-only.
  wireInput?: boolean
}
// Ordered so that when several composed atoms would claim `value`, the collection /
// committed value wins over the free-text draft (Combobox, TagsInput compose both).
const ATOM_VALUE_API: Array<{ atom: string; mode?: string; props: AtomValueProp[] }> = [
  { atom: 'selection', mode: 'multiple', props: [{ name: 'value', type: { kind: 'array', item: { kind: 'string' } } }] },
  // single / range / bare selection → one member.
  { atom: 'selection', props: [{ name: 'value', type: { kind: 'string' } }] },
  {
    atom: 'range',
    props: [
      { name: 'value', type: { kind: 'number' }, default: 0 },
      { name: 'min', type: { kind: 'number' }, default: 0 },
      { name: 'max', type: { kind: 'number' }, default: 100 },
      { name: 'step', type: { kind: 'number' }, default: 1 },
    ],
  },
  {
    atom: 'stepping',
    props: [
      { name: 'value', type: { kind: 'number' }, default: 0, wireInput: true },
      { name: 'min', type: { kind: 'number' } },
      { name: 'max', type: { kind: 'number' } },
      { name: 'step', type: { kind: 'number' }, default: 1 },
    ],
  },
  { atom: 'value-entry', props: [{ name: 'value', type: { kind: 'string' }, default: '', wireInput: true }] },
]

// Lower each required value-bearing atom's params into contract props, wiring the
// lone input node where one exists. Iterates ATOM_VALUE_API in PRIORITY order (not
// `composes` order) so that when an archetype composes several value atoms
// (Combobox/TagsInput = value-entry + selection), the collection/committed value
// claims `value` before the free-text draft. Skips names already taken (the lowered
// BooleanInput `checked`), so the special cases stay authoritative.
function applyAtomValueProps(
  structure: ComponentStructure,
  composes: string[],
  props: PropDef[],
): void {
  const taken = new Set(props.map((p) => p.name))
  const refs = composes.map(requiredRef).filter((r): r is { name: string; mode?: string } => !!r)
  const inputs = Object.values(structure.nodes).filter((n) => n.kind === 'input')
  const inputNode = inputs.length === 1 ? inputs[0] : undefined
  for (const spec of ATOM_VALUE_API) {
    const matches = refs.some(
      (r) => r.name === spec.atom && (spec.mode === undefined || r.mode === spec.mode),
    )
    if (!matches) continue
    for (const p of spec.props) {
      if (taken.has(p.name)) continue
      taken.add(p.name)
      props.push({
        id: uid(),
        name: p.name,
        type: p.type,
        ...(p.default !== undefined ? { default: p.default } : {}),
      })
      if (p.wireInput && inputNode) {
        if (!inputNode.value) inputNode.value = { type: p.type }
        if (!inputNode.valueBinding) inputNode.valueBinding = { propName: p.name }
      }
    }
  }
}

export function seedArchetypeContract(
  structure: ComponentStructure,
  archetype: string | null,
): ComponentContract {
  const events: EventDef[] = []
  const props: PropDef[] = []
  const def = archetype ? archetypesByName[archetype] : undefined
  if (!def) return { props, events }
  const root = structure.nodes[structure.rootId]

  const lowered = archetype ? LOWERED_VALUE_CONTROL[archetype] : undefined
  const valueNode = lowered ? loweredValueNode(structure, archetype) : undefined
  const host = valueNode ?? root
  if (lowered && valueNode) {
    props.push({
      id: uid(),
      name: lowered.prop.name,
      type: lowered.prop.type,
      default: lowered.prop.default,
    })
    valueNode.valueBinding = { propName: lowered.prop.name }
  }

  const seen = new Set<string>()
  for (const ref of def.composes) {
    const name = requiredAtomName(ref)
    if (!name) continue
    // Emits come from an atom OR a composite (proposal 0034 §B): a composite is not
    // in `atomsByName`, so Disclosure (`disclosure`) / Wizard (`stepping-nav`) had no
    // events until composites carried their own `emits`.
    const emits = atomsByName[name]?.emits ?? compositesByName[name]?.emits ?? []
    for (const e of emits) {
      const on = interactionForSignal(e.name)
      if (!on || seen.has(e.name)) continue
      seen.add(e.name)
      const eventId = uid()

      const payload = valueNode && host === valueNode ? lowered!.prop.type : undefined
      events.push({
        id: eventId,
        name: defaultEventName(e.name),
        origin: 'archetype',
        locked: true,
        signal: e.name,
        ...(payload ? { payload } : {}),
      })
      if (host)
        host.emits = [
          ...(host.emits ?? []),
          { id: uid(), eventId, on, signal: e.name, locked: true },
        ]
    }
  }

  // Behavior-archetype pickers (DatePicker/TimePicker/ColorPicker) own their runtime
  // value API in the dedicated emitter (proposal 0029), so it isn't derived from atoms
  // above. Surface it on the contract so the Interface panel + docs show value/min/max
  // (the exact carrier + single-vs-range shape follow the project's representation
  // setting and node.calendar; this documents the base API).
  const pv = archetype ? PICKER_VALUE_API[archetype] : undefined
  if (pv) {
    props.push({ id: uid(), name: 'value', type: pv.value, description: pv.valueDesc })
    if (pv.bounds) {
      props.push({ id: uid(), name: 'min', type: pv.value, description: `Earliest selectable ${pv.noun}.` })
      props.push({ id: uid(), name: 'max', type: pv.value, description: `Latest selectable ${pv.noun}.` })
    }
  } else {
    // Generic value/data props (proposal 0034 axis A) for every other input. Pickers
    // are skipped above — they own their value API (date/color carriers, no numeric
    // min/max) and would otherwise pick up `range`'s numeric bounds.
    applyAtomValueProps(structure, def.composes, props)
  }

  return { props, events }
}

// The value carrier + bounds each picker archetype exposes on its generated contract.
const PICKER_VALUE_API: Record<
  string,
  { value: PropType; bounds: boolean; valueDesc: string; noun: string }
> = {
  DatePicker: {
    value: { kind: 'ref', ref: BUILTIN_DATE_ID },
    bounds: true,
    noun: 'date',
    valueDesc: 'The selected date, or a { start, end } range when Selection is set to Range.',
  },
  TimePicker: {
    value: { kind: 'string' },
    bounds: true,
    noun: 'time',
    valueDesc: 'The selected time (e.g. "09:30").',
  },
  ColorPicker: {
    value: { kind: 'ref', ref: BUILTIN_COLOR_ID },
    bounds: false,
    noun: 'color',
    valueDesc: 'The selected color, in the project’s color representation (hex by default).',
  },
}
