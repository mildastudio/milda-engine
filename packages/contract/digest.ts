import type {
  ComponentIR,
  NodeSlot,
  Predicate,
  PropConstraint,
  PropField,
  PropType,
  SharedType,
  UsageRule,
} from '@mildastudio/core'
import { collectSlots } from '@mildastudio/core'

// The digest stays keyed by NAME - names are the public API surface - but since
// v2 every member also carries the STABLE editor id it came from. Pairing by id
// across two digests is what turns a rename into a first-class change instead of
// a spurious remove+add. Digests recorded before v2 simply lack ids and diff by
// name (the old behavior).
export interface ContractDigest {
  components: Record<string, ComponentDigest>
  // The usage rules, by id (proposal 0052 §9). Outside the semver rollup - a rule cannot break a
  // build - but in the digest so a release can say which rules it added, dropped or re-graded.
  // Absent on every digest recorded before 0052, and on one built without rules; the diff then
  // says nothing about rules rather than reporting all of them as new.
  rules?: Record<string, RuleDigest>
}

export interface RuleDigest {
  severity: UsageRule['severity']
  /** The statement without its id, severity and reason, as canonical JSON. */
  statement: string
}

export interface ComponentDigest {
  id?: string

  props: Record<string, PropDigest>

  // The group constraints (0052 §4), each as `kind(a,b)` with its members sorted - their order
  // means nothing. Absent when there are none, so a digest recorded before 0052 compares equal.
  constraints?: string[]

  events: Record<string, EventDigest>

  slots: Record<string, SlotDigest>
}

export interface PropDigest {
  id?: string
  type: PropType
  required: boolean
  // Present only when set, for the same reason `constraints` is.
  requiredWhen?: Predicate
}

export interface EventDigest {
  id?: string
  payload: PropType | null
}

export interface SlotDigest {
  // The slot node's id - stable across exposeAs renames.
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

export function constraintKey(c: Pick<PropConstraint, 'kind' | 'props'>): string {
  return `${c.kind}(${[...c.props].sort().join(',')})`
}

// JSON with sorted keys, so two rules that say the same thing digest the same however their
// objects were built.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function buildDigest(
  components: ComponentIR[],
  sharedTypes: SharedType[] = [],
  rules?: UsageRule[],
): ContractDigest {
  const out: ContractDigest = { components: {} }
  if (rules) {
    out.rules = {}
    for (const { id, severity, rationale: _rationale, ...statement } of rules)
      out.rules[id] = { severity, statement: canonical(statement) }
  }
  for (const component of [...components].sort((a, b) => a.name.localeCompare(b.name))) {
    const seen = new Set<string>()
    const props: Record<string, PropDigest> = {}
    for (const p of component.contract?.props ?? []) {
      props[p.name] = {
        id: p.id,
        type: resolveType(p.type, sharedTypes, seen),
        required: p.required === true,
        ...(p.requiredWhen ? { requiredWhen: p.requiredWhen } : {}),
      }
    }
    const events: Record<string, EventDigest> = {}
    for (const e of component.contract?.events ?? []) {
      events[e.name] = {
        id: e.id,
        payload: e.payload ? resolveType(e.payload, sharedTypes, seen) : null,
      }
    }
    const slots: Record<string, SlotDigest> = {}
    for (const s of collectSlots(component)) {
      slots[s.name] = { id: s.nodeId, arity: s.slot.arity, accepts: acceptsLabel(s.slot) }
    }
    // ComponentIR itself carries no id; the editor's EditorComponent does. Read
    // it defensively so bare-IR callers (generators, CLI fixtures) still digest.
    const constraints = (component.contract?.constraints ?? []).map(constraintKey).sort()
    out.components[component.name] = {
      id: (component as { id?: string }).id,
      props,
      ...(constraints.length ? { constraints } : {}),
      events,
      slots,
    }
  }
  return out
}
