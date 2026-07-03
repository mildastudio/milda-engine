import type {
  ComponentIR,
  ComponentNode,
  ContentValue,
  NodeContent,
  NodeRepeat,
  PropCondition,
} from './types'
import type { PropType, SharedType } from '../contract/types'
import { isRenderable, isTextRenderable, isTypeCompatible } from '../contract/typeCompat'

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

function whenHolds(
  when: PropCondition,
  previewProps: PropCondition,
  itemScopes: ItemScope[],
): boolean {
  return Object.entries(when).every(
    ([k, v]) => resolveBindingValue(k, previewProps, itemScopes) === v,
  )
}

function resolveContentValue(
  value: ContentValue,
  previewProps: PropCondition,
  mode: 'design' | 'preview',
  itemScopes: ItemScope[],
): string | null {
  if (value.kind === 'text') return value.text
  if (mode === 'design') return `$${value.propName}`
  const v = resolveBindingValue(value.propName, previewProps, itemScopes)
  return v !== undefined ? String(v) : null
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
    if (whenHolds(rule.when, previewProps, itemScopes))
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

function objectFields(type: PropType): { name: string; type: PropType }[] {
  return type.kind === 'object' ? type.fields.map((f) => ({ name: f.name, type: f.type })) : []
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
}

export function collectBindingSources(
  component: ComponentIR,
  nodeId: string,
  opts: CollectOpts = {},
): BindingSource[] {
  const out: BindingSource[] = []
  const pushProps = (props: { name: string; type: PropType }[], group: string) => {
    for (const p of props) {
      out.push({
        path: p.name,
        label: p.name,
        group,
        type: p.type,
        renderable: isRenderable(p.type),
      })
      for (const f of objectFields(p.type)) {
        out.push({
          path: `${p.name}.${f.name}`,
          label: `${p.name}.${f.name}`,
          group,
          type: f.type,
          renderable: isRenderable(f.type),
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
        renderable: isRenderable(itemType),
      })
      for (const f of objectFields(itemType)) {
        out.push({
          path: `${alias}.${f.name}`,
          label: `${alias}.${f.name}`,
          group: 'This item',
          type: f.type,
          renderable: isRenderable(f.type),
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

  return opts.textOnly ? out.filter((s) => isTextRenderable(s.type) || s.renderable) : out
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
