export type PropType =
  | { kind: 'string' }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'union'; members: PropType[] }
  | { kind: 'ref'; ref: string; args?: PropType[] }
  | { kind: 'array'; item: PropType }
  | { kind: 'object'; fields: PropField[] }
  | { kind: 'component'; componentIds?: string[] }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'any' }
  | { kind: 'typeParam'; name: string }
  | { kind: 'function'; params: Array<{ name: string; type: PropType }>; returnType: PropType }
  | { kind: 'record'; key: PropType; value: PropType }
  | { kind: 'intersection'; members: PropType[] }

export interface PropField {
  id: string
  name: string
  type: PropType
  required: boolean
  description?: string
}

export type PropValue = string | number | boolean | PropValue[] | { [k: string]: PropValue }

// Descriptive prop metadata (proposal 0026) — status (incl. deprecated), plus the
// auto-stamped `since` (release version it first shipped). Never contractual;
// excluded from the contract digest. Authored via a select; `since` is stamped
// automatically.
export interface PropMeta {
  status?: 'stable' | 'beta' | 'experimental' | 'deprecated'
  since?: string
}

export interface PropDef {
  id: string
  name: string
  type: PropType
  default?: PropValue
  // A design-time SAMPLE value, distinct from the runtime `default`: the value the editor
  // canvas and thumbnails resolve bindings against, so a bound node reads like a finished
  // component even when the prop has no default (or you don't want a runtime one). Never
  // emitted by the generator — purely an authoring aid, like slot/media samples.
  sample?: PropValue
  required?: boolean
  description?: string

  binding?: string

  meta?: PropMeta
}

export type EventOrigin = 'archetype' | 'author'

export interface EventDef {
  id: string
  name: string
  payload?: PropType
  description?: string

  origin?: EventOrigin
  locked?: boolean
  signal?: string
}

export interface SharedType {
  id: string
  name: string
  description?: string

  params?: string[]
  definition: PropType

  exposed?: boolean

  builtin?: boolean
}

export interface ComponentContract {
  props: PropDef[]
  events: EventDef[]
}
