import type { Predicate } from '../structure/predicate'

export type PropType =
  | { kind: 'string' }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: string[] }
  // A prop TYPED BY a foundations context group (proposal 0001). Its admissible values are the
  // group's contexts, and setting it selects that context for this instance - which is how a
  // `variant`/`size`/`color` prop drives the tokens that `alias by` the group, per instance,
  // instead of the theme's ambient choice. An enum could hold the values but not the binding, and
  // the binding is the point: without it every variant-bearing component resolves to one painting.
  | { kind: 'context'; group: string }
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

// Descriptive prop metadata (proposal 0026) - status (incl. deprecated), plus the
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
  // emitted by the generator - purely an authoring aid, like slot/media samples.
  sample?: PropValue
  required?: boolean
  // Required only while a condition over the SAME contract's other props holds (proposal 0052
  // §4): `loadingLabel : string required when loading`. A fact about one instance, so it is part
  // of the contract - versioned, and typed by the generator where the type can say it - rather
  // than a usage rule. Prop leaves only: a state or a context has no value where it is used.
  requiredWhen?: Predicate
  description?: string

  // Set when this prop is a GLOBAL prop the component takes by reference (proposal 0051 §5).
  // `type` and `default` are still carried - a consumer must not have to resolve a registry to
  // know the component's API - so this says where they came FROM: the surface prints
  // `global variant` instead of restating them, and the editor shows one control instead of a
  // form. The declaration lives in `DocumentFoundations.globalProps`, matched by NAME, which is
  // how the surface refers to it.
  global?: true

  binding?: string

  meta?: PropMeta
}

/**
 * A prop declared once for the whole system (proposal 0051 §5). Its `default` is the system-wide
 * value every component inherits; an instance overrides it by passing the prop.
 */
export interface GlobalProp {
  id: string
  name: string
  type: PropType
  default?: PropValue
  description?: string
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

/**
 * A constraint over a GROUP of one contract's props (proposal 0052 §4): exactly one of them
 * (`one-of`), at least one (`any-of`), at most one (`exclusive`). "Supplied" means written at the
 * use site; a declared default does not count. Members are named, as a predicate's prop leaf is,
 * so a rename carries through the same way.
 */
export type PropConstraintKind = 'one-of' | 'any-of' | 'exclusive'

export const PROP_CONSTRAINT_KINDS: readonly PropConstraintKind[] = [
  'one-of',
  'any-of',
  'exclusive',
]

export interface PropConstraint {
  /** An editor handle for the mutations; never exported, never part of the surface. */
  id: string
  kind: PropConstraintKind
  props: string[]
}

export interface ComponentContract {
  props: PropDef[]
  events: EventDef[]
  // Absent on every contract that has none, so nothing about an existing component changes.
  constraints?: PropConstraint[]
}
