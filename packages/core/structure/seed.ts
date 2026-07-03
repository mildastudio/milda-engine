import { archetypesByName, atomsByName } from '@mildastudio/milda'
import type { AnatomyPart, PartRole } from '@mildastudio/milda'
import type { ComponentContract, EventDef, PropDef, PropType, PropValue } from '../contract/types'
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
            },
          }
        : {}),
  }
  nodes[id] = node

  const childAlias = repeatHere ? BORN_ITEM_ALIAS : itemAlias
  node.childrenIds = (part.children ?? [])
    .filter((child) => includeOptional || child.optional !== true)
    .map((child) => build(child, id, path, nodes, includeOptional, bornRepeat, childAlias))
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
      .map((part) => build(part, rootId, '', nodes, includeOptional, bornRepeat, undefined))
    if (lowered) childIds.unshift(buildLoweredValueControl(lowered, rootId, nodes))
    nodes[rootId].childrenIds = childIds
  }

  const structure = { rootId, nodes }
  applyArchetypeDefaults(structure, archetype)

  if (archetype && GROUP_ARCHETYPES.has(archetype)) applyGroupVariant(structure, rootId, 'radio')
  return structure
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

    option: { facets: { gap: 'sm' }, layout: { direction: 'row', align: 'center' } },

    indicator: {
      kind: 'container',
      facets: {
        fill: 'surface',
        corner: 'pill',
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
    },

    indicator: { facets: {}, layout: { width: '0px', height: '0px' } },
    label: { facets: { ink: 'text', 'text.size': 'sm', 'text.weight': 'medium' } },
  },
}

const GROUP_LEAVES = ['root', 'option', 'indicator', 'label'] as const
type GroupLeaf = (typeof GROUP_LEAVES)[number]

const GROUP_ARCHETYPES = new Set(['ChoiceGroup'])

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
    const others = (node.states ?? []).filter((r) => !r.states.includes('selected'))
    const sel = part.selected
    next.states =
      sel && Object.keys(sel).length
        ? [...others, { id: uid(), props: {}, states: ['selected'], facets: { ...sel } }]
        : others
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
    const atom = atomsByName[name]
    for (const e of atom?.emits ?? []) {
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
  return { props, events }
}
