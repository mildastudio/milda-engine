import type { ComponentIR, PropType, PropField, SharedType, NodeSlot } from '@mildastudio/core'
import { collectSlots } from '@mildastudio/core'

// The digest stays keyed by NAME — names are the public API surface — but since
// v2 every member also carries the STABLE editor id it came from. Pairing by id
// across two digests is what turns a rename into a first-class change instead of
// a spurious remove+add. Digests recorded before v2 simply lack ids and diff by
// name (the old behavior).
export interface ContractDigest {
  components: Record<string, ComponentDigest>
}

export interface ComponentDigest {
  id?: string

  props: Record<string, PropDigest>

  events: Record<string, EventDigest>

  slots: Record<string, SlotDigest>
}

export interface PropDigest {
  id?: string
  type: PropType
  required: boolean
}

export interface EventDigest {
  id?: string
  payload: PropType | null
}

export interface SlotDigest {
  // The slot node's id — stable across exposeAs renames.
  id?: string

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
        id: p.id,
        type: resolveType(p.type, sharedTypes, seen),
        required: p.required === true,
      }
    }
    const events: Record<string, EventDigest> = {}
    for (const e of component.contract?.events ?? []) {
      events[e.name] = { id: e.id, payload: e.payload ? resolveType(e.payload, sharedTypes, seen) : null }
    }
    const slots: Record<string, SlotDigest> = {}
    for (const s of collectSlots(component)) {
      slots[s.name] = { id: s.nodeId, arity: s.slot.arity, accepts: acceptsLabel(s.slot) }
    }
    // ComponentIR itself carries no id; the editor's EditorComponent does. Read
    // it defensively so bare-IR callers (generators, CLI fixtures) still digest.
    out.components[component.name] = { id: (component as { id?: string }).id, props, events, slots }
  }
  return out
}
