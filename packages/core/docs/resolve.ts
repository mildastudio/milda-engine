import type { ComponentIR } from '../structure/types'
import type { ComponentGroup } from '../structure/componentGroups'
import type { EventDef, PropDef, PropType, PropValue, SharedType } from '../contract/types'
import type { TokenType } from '../foundations/document'
import { propTypeLabel } from '../contract/label'
import { collectSlots } from '../structure/slots'
import type { DocBlock, DocProseKind, DocsFooter, DocsModel } from './document'

export interface ResolvedDocs {
  site: { name: string; tagline?: string; version?: string; searchPlaceholder?: string }

  footer?: DocsFooter
  pages: ResolvedPage[]
}

export interface ResolvedPage {
  id: string
  title: string

  group?: string

  parentId?: string
  blocks: ResolvedBlock[]
}

export type ResolvedBlock =
  | { id: string; kind: DocProseKind; text: string; anchor?: string }
  | { id: string; kind: 'divider' }
  | { id: string; kind: 'image'; assetId?: string }
  | { id: string; kind: 'component'; componentId?: string; component: ResolvedComponent | null }
  | {
      id: string
      kind: 'componentProps' | 'componentEvents' | 'componentComposition'
      componentId?: string
      component: ResolvedComponent | null
    }
  | {
      id: string
      kind: 'componentProp'
      componentId?: string
      propId?: string
      component: ResolvedComponent | null
      prop: ResolvedProp | null
    }
  | {
      id: string
      kind: 'componentEvent'
      componentId?: string
      eventName?: string
      component: ResolvedComponent | null
      event: ResolvedEvent | null
    }
  | { id: string; kind: 'example'; exampleId?: string }
  | { id: string; kind: 'componentGroup'; groupId?: string; group: ResolvedComponentGroup | null }
  | { id: string; kind: 'tokens' | 'swatch'; tokenType?: TokenType }

export interface ResolvedComponent {
  id: string
  name: string
  description?: string
  archetype: string | null
  props: ResolvedProp[]
  events: ResolvedEvent[]

  api: ResolvedSlot[]
}

export interface ResolvedComponentGroup {
  id: string
  name: string
  description?: string
  components: ResolvedComponent[]
}

export interface ResolvedProp {
  id: string
  name: string
  type: PropType

  typeLabel: string
  required: boolean
  description?: string
  default?: PropValue
}

export interface ResolvedEvent {
  name: string
  payload?: PropType
  payloadLabel?: string
  description?: string
}

export interface ResolvedSlot {
  name: string
  arity: string
  accepts: string
}

export interface ResolveDocsInput {
  docs: DocsModel | undefined

  components: Record<string, ComponentIR & { group?: string | null; order?: number }>

  componentGroups?: ComponentGroup[]

  sharedTypes?: SharedType[]
}

export function resolveDocs(input: ResolveDocsInput): ResolvedDocs {
  const pages = (input.docs?.pages ?? []).map((page) => ({
    id: page.id,
    title: page.title,
    group: page.group,
    parentId: page.parentId,
    blocks: page.blocks.map((block) => resolveBlock(block, input)),
  }))
  const site = {
    name: input.docs?.site?.name || 'Documentation',
    tagline: input.docs?.site?.tagline,
    version: input.docs?.site?.version,
    searchPlaceholder: input.docs?.site?.searchPlaceholder,
  }
  return { site, footer: input.docs?.footer, pages }
}

function resolveBlock(block: DocBlock, input: ResolveDocsInput): ResolvedBlock {
  switch (block.kind) {
    case 'divider':
      return { id: block.id, kind: 'divider' }
    case 'image':
      return { id: block.id, kind: 'image', assetId: block.assetId }
    case 'component': {
      const component = block.componentId ? input.components[block.componentId] : undefined
      return {
        id: block.id,
        kind: 'component',
        componentId: block.componentId,
        component: component
          ? resolveComponent(block.componentId as string, component, input.sharedTypes)
          : null,
      }
    }
    case 'componentProps':
    case 'componentEvents':
    case 'componentComposition': {
      const raw = block.componentId ? input.components[block.componentId] : undefined
      return {
        id: block.id,
        kind: block.kind,
        componentId: block.componentId,
        component: raw
          ? resolveComponent(block.componentId as string, raw, input.sharedTypes)
          : null,
      }
    }
    case 'componentProp': {
      const raw = block.componentId ? input.components[block.componentId] : undefined
      const component = raw
        ? resolveComponent(block.componentId as string, raw, input.sharedTypes)
        : null
      return {
        id: block.id,
        kind: 'componentProp',
        componentId: block.componentId,
        propId: block.propId,
        component,
        prop: component?.props.find((p) => p.id === block.propId) ?? null,
      }
    }
    case 'componentEvent': {
      const raw = block.componentId ? input.components[block.componentId] : undefined
      const component = raw
        ? resolveComponent(block.componentId as string, raw, input.sharedTypes)
        : null
      return {
        id: block.id,
        kind: 'componentEvent',
        componentId: block.componentId,
        eventName: block.eventName,
        component,
        event: component?.events.find((e) => e.name === block.eventName) ?? null,
      }
    }
    case 'example':
      return { id: block.id, kind: 'example', exampleId: block.exampleId }
    case 'componentGroup': {
      const group = block.groupId
        ? (input.componentGroups ?? []).find((g) => g.id === block.groupId)
        : undefined
      return {
        id: block.id,
        kind: 'componentGroup',
        groupId: block.groupId,
        group: group ? resolveComponentGroup(group, input) : null,
      }
    }
    case 'tokens':
      return { id: block.id, kind: 'tokens', tokenType: block.tokenType }
    case 'swatch':
      return { id: block.id, kind: 'swatch', tokenType: block.tokenType }
    default:
      return { id: block.id, kind: block.kind, text: block.text, anchor: block.anchor }
  }
}

function resolveComponent(
  id: string,
  component: ComponentIR,
  sharedTypes?: SharedType[],
): ResolvedComponent {
  return {
    id,
    name: component.name,
    description: component.description,
    archetype: component.archetype,
    props: (component.contract?.props ?? []).map((p) => resolveProp(p, sharedTypes)),
    events: (component.contract?.events ?? []).map((e) => resolveEvent(e, sharedTypes)),
    api: collectSlots(component).map((s) => ({
      name: s.name,
      arity: s.slot.arity,
      accepts: s.slot.accepts.kind,
    })),
  }
}

function resolveComponentGroup(
  group: ComponentGroup,
  input: ResolveDocsInput,
): ResolvedComponentGroup {
  const members = Object.entries(input.components)
    .filter(([, c]) => (c.group ?? null) === group.id)
    .filter(([, c]) => !c.docsHidden)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([id, c]) => resolveComponent(id, c, input.sharedTypes))
  return { id: group.id, name: group.name, description: group.description, components: members }
}

function resolveProp(p: PropDef, sharedTypes?: SharedType[]): ResolvedProp {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    typeLabel: propTypeLabel(p.type, sharedTypes),
    required: Boolean(p.required),
    description: p.description,
    default: p.default,
  }
}

function resolveEvent(e: EventDef, sharedTypes?: SharedType[]): ResolvedEvent {
  return {
    name: e.name,
    payload: e.payload,
    payloadLabel: e.payload ? propTypeLabel(e.payload, sharedTypes) : undefined,
    description: e.description,
  }
}
