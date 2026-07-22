import type {
  ComponentIR,
  ComponentNode,
  ContentValue,
  DemoStateVar,
  NodeContent,
  NodeRepeat,
  PropCondition,
} from './types'
import type { PropType, PropValue, SharedType } from '../contract/types'
import { isRenderable, isTextRenderable, isTypeCompatible, resolvePropType } from '../contract/typeCompat'
import { coercePredicate, evalPredicate } from './predicate'

const EMPTY_STATES: ReadonlySet<never> = new Set()

export interface ItemScope {
  alias: string
  item: unknown
}

const STRING_TYPE: PropType = { kind: 'string' }

function walkPath(value: unknown, keys: string[]): unknown {
  let val = value
  for (const key of keys) {
    if (val == null || typeof val !== 'object') return undefined
    val = (val as Record<string, unknown>)[key]
  }
  return val
}

export function resolveBindingValue(
  path: string,
  previewProps: PropCondition,
  itemScopes: ItemScope[],
): unknown {
  const [first, ...rest] = path.split('.')
  for (let i = itemScopes.length - 1; i >= 0; i--) {
    if (itemScopes[i].alias === first) return walkPath(itemScopes[i].item, rest)
  }
  return rest.length > 0 ? walkPath(previewProps[first], rest) : previewProps[first]
}

export function normalizeNodeContent(content: NodeContent | undefined): NodeContent | undefined {
  if (content && content.kind === 'dynamic' && 'propName' in content) {
    return {
      kind: 'dynamic',
      default: { kind: 'bind', propName: (content as { propName: string }).propName },
      rules: [],
    }
  }
  return content
}

export function whenHolds(
  when: PropCondition,
  previewProps: PropCondition,
  itemScopes: ItemScope[],
): boolean {
  return Object.entries(when).every(
    ([k, v]) => resolveBindingValue(k, previewProps, itemScopes) === v,
  )
}

// Collapse a ContentValue to its canonical two-leg form (`value` | `bind`), folding the
// legacy string leg (`text`) into `value`. Callers and back-ends can then handle exactly
// two cases; the `text` leg stays in the type only until the migration retires it.
export function normalizeContentValue(
  value: ContentValue,
): { kind: 'value'; value: PropValue } | { kind: 'bind'; propName: string } {
  // Defensive: un-migrated documents may still carry the legacy string leg at runtime.
  const legacy = value as { kind: string; text?: string }
  if (legacy.kind === 'text') return { kind: 'value', value: legacy.text ?? '' }
  return value
}

function resolveContentValue(
  value: ContentValue,
  previewProps: PropCondition,
  mode: 'design' | 'preview',
  itemScopes: ItemScope[],
): string | null {
  const v = normalizeContentValue(value)
  if (v.kind === 'value') return v.value === undefined || v.value === null ? null : String(v.value)
  if (mode === 'design') return `$${v.propName}`
  const resolved = resolveBindingValue(v.propName, previewProps, itemScopes)
  return resolved !== undefined ? String(resolved) : null
}

export function resolveNodeContent(
  node: ComponentNode,
  previewProps: PropCondition,
  mode: 'design' | 'preview',
  itemScopes: ItemScope[],
): string | null {
  const content = normalizeNodeContent(node.content)

  if (!content) return null
  if (content.kind === 'static') return content.text
  for (const rule of content.rules) {
    if (evalPredicate(coercePredicate(rule.when), { props: previewProps, states: EMPTY_STATES, itemScopes }))
      return resolveContentValue(rule.value, previewProps, mode, itemScopes)
  }
  return resolveContentValue(content.default, previewProps, mode, itemScopes)
}

export function resolveRepeatItems(
  repeat: NodeRepeat,
  previewProps: PropCondition,
  itemScopes: ItemScope[],
): unknown[] {
  const source = repeat.source
  if (source.kind === 'prop') {
    const v = resolveBindingValue(source.propName, previewProps, itemScopes)
    return Array.isArray(v) ? v : []
  }
  if (source.kind === 'static') return Array.isArray(source.items) ? source.items : []
  return []
}

function inferType(value: unknown): PropType {
  if (typeof value === 'number') return { kind: 'number' }
  if (typeof value === 'boolean') return { kind: 'boolean' }
  if (Array.isArray(value)) return { kind: 'array', item: inferType(value[0]) }
  if (value != null && typeof value === 'object') {
    return {
      kind: 'object',
      fields: Object.keys(value as Record<string, unknown>).map((name) => ({
        id: name,
        name,
        type: inferType((value as Record<string, unknown>)[name]),
        required: false,
      })),
    }
  }
  return STRING_TYPE
}

export function deriveItemType(repeat: NodeRepeat, component: ComponentIR): PropType {
  const src = repeat.source
  if (src.kind === 'prop') {
    const prop = component.contract?.props.find((p) => p.name === src.propName)
    if (prop?.type.kind === 'array') return prop.type.item
    return STRING_TYPE
  }
  if (src.itemType) return src.itemType
  return inferType(src.items?.[0])
}

// How deep the bind picker descends into nested object types when enumerating
// bindable targets, so a primitive nested several levels down (a.b.c) becomes its
// own dotted path. Caps recursion against self-referential shared types.
const MAX_BIND_DEPTH = 6

// The object fields of a type, seeing through `ref` (shared types) and flattening
// `intersection` members. Arrays are intentionally NOT descended — an array element
// is only reachable via a `repeat` item alias, never a static dotted path — and
// `record`/`union` have no fixed field names to enumerate.
function objectTypeFields(
  type: PropType,
  sharedTypes?: SharedType[],
): { name: string; type: PropType }[] | null {
  const t = resolvePropType(type, sharedTypes)
  if (t.kind === 'object') return t.fields.map((f) => ({ name: f.name, type: f.type }))
  if (t.kind === 'intersection') {
    const fields = t.members.flatMap((m) => objectTypeFields(m, sharedTypes) ?? [])
    return fields.length ? fields : null
  }
  return null
}

// All bindable descendant paths under `basePath` (dotted, one entry per nesting
// level), so a primitive inside a compound value can be bound directly. Recursion is
// bounded by `depth`; the resolver (`walkPath`) descends the same dotted path at runtime.
export function descendantFields(
  basePath: string,
  type: PropType,
  sharedTypes?: SharedType[],
  depth: number = MAX_BIND_DEPTH,
): { path: string; type: PropType }[] {
  if (depth <= 0) return []
  const fields = objectTypeFields(type, sharedTypes)
  if (!fields) return []
  const out: { path: string; type: PropType }[] = []
  for (const f of fields) {
    const path = `${basePath}.${f.name}`
    out.push({ path, type: f.type })
    out.push(...descendantFields(path, f.type, sharedTypes, depth - 1))
  }
  return out
}

export interface BindingSource {
  path: string
  label: string

  group: string
  type: PropType
  renderable: boolean
}

export interface CollectOpts {
  textOnly?: boolean
  // Shared types so a prop typed as a built-in ref (IconName, Color, Date, File — all defined
  // as `string`) resolves before the renderable/text-renderable checks. Without it a
  // `ref`-typed prop reads as non-renderable and is dropped (e.g. an IconName prop never
  // offered for an icon glyph binding).
  sharedTypes?: SharedType[]
}

export function collectBindingSources(
  component: ComponentIR,
  nodeId: string,
  opts: CollectOpts = {},
): BindingSource[] {
  const out: BindingSource[] = []
  const st = opts.sharedTypes
  const pushProps = (props: { name: string; type: PropType }[], group: string) => {
    for (const p of props) {
      out.push({
        path: p.name,
        label: p.name,
        group,
        type: p.type,
        renderable: isRenderable(p.type, st),
      })
      for (const f of descendantFields(p.name, p.type, st)) {
        out.push({
          path: f.path,
          label: f.path,
          group,
          type: f.type,
          renderable: isRenderable(f.type, st),
        })
      }
    }
  }

  let cur: ComponentNode | null = component.structure.nodes[nodeId] ?? null
  let firstContract = true
  while (cur) {
    if (cur.repeat) {
      const alias = cur.repeat.itemAlias
      const itemType = deriveItemType(cur.repeat, component)
      out.push({
        path: alias,
        label: alias,
        group: 'This item',
        type: itemType,
        renderable: isRenderable(itemType, st),
      })
      for (const f of descendantFields(alias, itemType, st)) {
        out.push({
          path: f.path,
          label: f.path,
          group: 'This item',
          type: f.type,
          renderable: isRenderable(f.type, st),
        })
      }
    }

    const isRoot = cur.parentId === null

    const contract = isRoot ? component.contract : cur.contract
    if (contract?.props.length) {
      const group = isRoot
        ? 'Component'
        : firstContract
          ? 'This sub-component'
          : cur.slot?.exposeAs || cur.name
      firstContract = false
      pushProps(contract.props, group)
    }

    cur = cur.parentId ? (component.structure.nodes[cur.parentId] ?? null) : null
  }

  return opts.textOnly ? out.filter((s) => isTextRenderable(s.type, st) || s.renderable) : out
}

export function sortByCompatibility(
  sources: BindingSource[],
  requiredType: PropType | undefined,
  sharedTypes: SharedType[] = [],
): { source: BindingSource; compatible: boolean }[] {
  return sources
    .map((source) => ({
      source,
      compatible: requiredType ? isTypeCompatible(source.type, requiredType, sharedTypes) : true,
    }))
    .sort((a, b) => Number(b.compatible) - Number(a.compatible))
}

// ─── Demo state (proposal 0021 slice 2, extended to typed variables) ──────────

// Slice 2 stored an example's demo state as `Record<string, boolean>`; it now stores
// typed variables (`{ type, initial }`). Normalize either shape so old documents keep
// working and upgrade to the typed shape the next time they're written.
export function normalizeDemoVar(raw: unknown): DemoStateVar {
  if (raw !== null && typeof raw === 'object' && 'type' in (raw as object)) {
    const v = raw as DemoStateVar
    return { type: v.type, initial: v.initial }
  }
  return { type: { kind: 'boolean' }, initial: Boolean(raw) }
}

export function normalizeDemoState(
  state: Record<string, unknown> | undefined,
): Record<string, DemoStateVar> {
  const out: Record<string, DemoStateVar> = {}
  for (const [name, raw] of Object.entries(state ?? {})) out[name] = normalizeDemoVar(raw)
  return out
}

// The initial prop store an example's live preview seeds from its demo state —
// variable name → initial value.
export function demoInitialProps(state: Record<string, unknown> | undefined): PropCondition {
  const out: PropCondition = {}
  for (const [name, v] of Object.entries(normalizeDemoState(state))) out[name] = v.initial
  return out
}
