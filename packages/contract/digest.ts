import type { ComponentIR, PropType, PropField, SharedType, NodeSlot } from '@mildastudio/core'
import { collectSlots } from '@mildastudio/core'

export interface ContractDigest {
  components: Record<string, ComponentDigest>
}

export interface ComponentDigest {
  props: Record<string, PropDigest>

  events: Record<string, { payload: PropType | null }>

  slots: Record<string, SlotDigest>
}

export interface PropDigest {
  type: PropType
  required: boolean
}

export interface SlotDigest {
  arity: NodeSlot['arity']

  accepts: string
}

function resolveType(type: PropType, shared: SharedType[], seen: Set<string>): PropType {
  switch (type.kind) {
    case 'ref': {
      if (seen.has(type.ref)) return type
      const def = shared.find((t) => t.id === type.ref)
      if (!def) return type
      return resolveType(def.definition, shared, new Set(seen).add(type.ref))
    }
    case 'array':
      return { kind: 'array', item: resolveType(type.item, shared, seen) }
    case 'object':
      return { kind: 'object', fields: type.fields.map((f) => resolveField(f, shared, seen)) }
    case 'union':
      return { kind: 'union', members: type.members.map((m) => resolveType(m, shared, seen)) }
    case 'intersection':
      return {
        kind: 'intersection',
        members: type.members.map((m) => resolveType(m, shared, seen)),
      }
    case 'record':
      return {
        kind: 'record',
        key: resolveType(type.key, shared, seen),
        value: resolveType(type.value, shared, seen),
      }
    case 'function':
      return {
        kind: 'function',
        params: type.params.map((p) => ({ name: p.name, type: resolveType(p.type, shared, seen) })),
        returnType: resolveType(type.returnType, shared, seen),
      }
    default:
      return type
  }
}

function resolveField(field: PropField, shared: SharedType[], seen: Set<string>): PropField {
  return { ...field, type: resolveType(field.type, shared, seen) }
}

function acceptsLabel(slot: NodeSlot): string {
  return slot.accepts.kind === 'type' ? `type:${slot.accepts.ref}` : slot.accepts.kind
}

export function buildDigest(
  components: ComponentIR[],
  sharedTypes: SharedType[] = [],
): ContractDigest {
  const out: ContractDigest = { components: {} }
  for (const component of [...components].sort((a, b) => a.name.localeCompare(b.name))) {
    const seen = new Set<string>()
    const props: Record<string, PropDigest> = {}
    for (const p of component.contract?.props ?? []) {
      props[p.name] = {
        type: resolveType(p.type, sharedTypes, seen),
        required: p.required === true,
      }
    }
    const events: Record<string, { payload: PropType | null }> = {}
    for (const e of component.contract?.events ?? []) {
      events[e.name] = { payload: e.payload ? resolveType(e.payload, sharedTypes, seen) : null }
    }
    const slots: Record<string, SlotDigest> = {}
    for (const s of collectSlots(component)) {
      slots[s.name] = { arity: s.slot.arity, accepts: acceptsLabel(s.slot) }
    }
    out.components[component.name] = { props, events, slots }
  }
  return out
}
