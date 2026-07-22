// ─── Node tree → Figma layer scene (proposal 0010 phase 2) ───────────────────
// Pure compiler: ComponentIR + DocumentFoundations + one resolved variant combo →
// a serializable Figma layer tree. Never imports the Figma SDK (platform-
// independence line) — the plugin (apps/figma-plugin) is the only place that calls
// figma.createFrame/createText/etc, reading this JSON as its instructions.

import {
  FACETS,
  defaultContextSelections,
  findToken,
  isRawValue,
  resolveFacet,
  resolveIcon,
  resolveNodeFacets,
  resolveNodeLayout,
  resolveToken,
  iconifySvgUrl,
  customToggleVariant,
  checkboxGlyphChild,
  normalizeContentValue,
  coercePredicate,
  evalPredicate,
  type ComponentIR,
  type ComponentNode,
  type DocumentFoundations,
  type FacetScale,
  type NodeKind,
  type PropCondition,
  type StateName,
} from '@mildastudio/core'
import { variableName } from './model'
import type { VariantCombo } from './variants'

export interface FigmaBinding {
  value?: string
  // Present when the facet resolves to a token exported as a Figma Variable in
  // figma-variables.json (see model.ts:variableName) — the plugin should bind the
  // field to that variable instead of using `value` as a literal.
  variableRef?: string
}

export interface FigmaAutoLayoutDimension {
  mode: 'fit' | 'fill' | 'fixed'
  value?: FigmaBinding
}

export interface FigmaAutoLayout {
  direction: 'row' | 'column'
  align?: 'start' | 'center' | 'end' | 'stretch'
  distribute?: 'start' | 'center' | 'end' | 'between' | 'around'
  wrap?: boolean
  width?: FigmaAutoLayoutDimension
  height?: FigmaAutoLayoutDimension
}

interface FigmaNodeBase {
  id: string
  name: string
}

export interface FigmaFrameNode extends FigmaNodeBase {
  type: 'FRAME'
  autoLayout?: FigmaAutoLayout
  style: Record<string, FigmaBinding>
  children: FigmaSceneNode[]
}

export interface FigmaTextNode extends FigmaNodeBase {
  type: 'TEXT'
  characters: string
  // Set when characters is a prop-bound placeholder ("$label") — the name of the
  // TEXT component property (see properties.ts) this layer's characters should bind to.
  textPropertyRef?: string
  style: Record<string, FigmaBinding>
}

export interface FigmaVectorNode extends FigmaNodeBase {
  type: 'VECTOR'
  svg?: string
  url?: string
  iconPropertyRef?: string
  style: Record<string, FigmaBinding>
}

export interface FigmaInstanceNode extends FigmaNodeBase {
  type: 'INSTANCE'
  // The referenced component's IR id — resolve against the export document's
  // `componentNames` map (componentId → exported Figma component name) since the
  // referenced component may not have been walked yet.
  componentRef: string
}

export interface FigmaPlaceholderNode extends FigmaNodeBase {
  type: 'PLACEHOLDER'
  reason: string
}

// A sealed boolean control (checkbox/switch) has no exposed anatomy of its own
// to walk — its box/glyph/track/thumb are lowered, hidden realization detail
// (packages/core/behavior/lowerControl.ts), invisible to every other target's
// generic node-tree walk too. Rather than leave it an empty frame (the only
// other option a "no Figma mapping" node has), the plugin draws this directly
// from the SAME default geometry/state constants the CSS target already uses,
// so a re-styled/re-themed toggle after "switch context" stays consistent —
// see model.ts's variableRef convention, carried through in `color`.
export interface FigmaControlSchematicNode extends FigmaNodeBase {
  type: 'CONTROL_SCHEMATIC'
  variant: 'checkbox' | 'switch'
  checked: boolean
  color: FigmaBinding
}

export type FigmaSceneNode =
  | FigmaFrameNode
  | FigmaTextNode
  | FigmaVectorNode
  | FigmaInstanceNode
  | FigmaPlaceholderNode
  | FigmaControlSchematicNode

export interface SceneResult {
  root: FigmaSceneNode
  skipped: string[]
}

interface SceneContext {
  foundations: DocumentFoundations
  propCondition: PropCondition
  states: ReadonlySet<StateName>
  contextSelections: Record<string, string>
  assets: Record<string, { url?: string }>
  // Figma is a visual medium — a bound text/icon with no per-variant override
  // must show something a designer can actually look at, never a raw "$propName"
  // placeholder (that's only appropriate for the DSL-text view). Keyed by prop
  // name, holding each prop's authored default value as a display string.
  propDefaults: Record<string, string>
}

const CONTAINER_KINDS = new Set<NodeKind>([
  'container',
  'control',
  'item',
  'fragment',
  'table',
  'row',
  'cell',
])

function resolveFacetBinding(scale: FacetScale, id: string, ctx: SceneContext): FigmaBinding {
  if (isRawValue(id)) return { value: id }
  const token = findToken(ctx.foundations, id, scale)
  if (token) {
    return {
      variableRef: variableName(token),
      value: resolveToken(id, ctx.foundations, { contextSelections: ctx.contextSelections }, token.type),
    }
  }
  const literal = resolveFacet(scale, id)
  return literal ? { value: literal } : {}
}

function buildStyle(node: ComponentNode, ctx: SceneContext): Record<string, FigmaBinding> {
  const facets = resolveNodeFacets(node, ctx.propCondition, ctx.states)
  const style: Record<string, FigmaBinding> = {}
  for (const [key, id] of Object.entries(facets)) {
    if (!id) continue
    const def = FACETS[key]
    if (!def) continue
    style[key] = resolveFacetBinding(def.scale, id, ctx)
  }
  return style
}

function dimension(v: string | undefined, ctx: SceneContext): FigmaAutoLayoutDimension | undefined {
  if (!v) return undefined
  if (v === 'fit' || v === 'fill') return { mode: v }
  return { mode: 'fixed', value: resolveFacetBinding('size', v, ctx) }
}

function buildAutoLayout(node: ComponentNode, ctx: SceneContext): FigmaAutoLayout | undefined {
  const layout = resolveNodeLayout(node, ctx.propCondition, ctx.states)
  if (!layout.direction && !layout.align && !layout.distribute && !layout.width && !layout.height) {
    return undefined
  }
  return {
    direction: layout.direction === 'column' ? 'column' : 'row',
    align: layout.align as FigmaAutoLayout['align'],
    distribute: layout.distribute as FigmaAutoLayout['distribute'],
    wrap: layout.wrap === 'wrap',
    width: dimension(layout.width, ctx),
    height: dimension(layout.height, ctx),
  }
}

// A content rule's predicate (0032) evaluated against a Figma variant's prop combo.
// Variants carry no interaction states, so states resolve as absent — a state/context
// leaf then simply doesn't match, the safe default for this best-effort visual target.
function ruleWhenHolds(when: unknown, propCondition: PropCondition): boolean {
  return evalPredicate(coercePredicate(when), { props: propCondition, states: EMPTY_FIGMA_STATES })
}

const EMPTY_FIGMA_STATES: ReadonlySet<never> = new Set()

// Shared by text nodes (characters) and icon nodes (glyph name) — both store their
// content the same way: static text or a prop-bound default with optional per-
// prop-condition overrides.
function resolveContentForVariant(
  node: ComponentNode,
  ctx: SceneContext,
): { text: string; propertyRef?: string } {
  const content = node.content
  if (!content) return { text: '' }
  if (content.kind === 'static') return { text: content.text }
  const matched = content.rules.find((r) => ruleWhenHolds(r.when, ctx.propCondition))
  const value = normalizeContentValue(matched ? matched.value : content.default)
  if (value.kind === 'value') return { text: value.value == null ? '' : String(value.value) }
  const sample = ctx.propDefaults[value.propName]
  const display = sample && sample.length > 0 ? sample : humanize(value.propName)
  return { text: display, propertyRef: value.propName }
}

// A prop with no authored default still needs *something* legible in a visual
// medium — "iconName" reads better as "Icon Name" than as a bare identifier.
// A dotted name ("item.label") is a per-iteration repeat binding, not a contract
// prop (see seed.ts's `${itemAlias}.label`) — only its last segment is meaningful
// to a reader, the alias prefix would just read as noise ("Item.label").
function humanize(propName: string): string {
  const tail = propName.includes('.') ? propName.slice(propName.lastIndexOf('.') + 1) : propName
  const spaced = tail
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  if (!spaced) return propName
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function buildTextNode(node: ComponentNode, ctx: SceneContext): FigmaTextNode {
  const { text, propertyRef } = resolveContentForVariant(node, ctx)
  return {
    id: node.id,
    name: node.name,
    type: 'TEXT',
    characters: text,
    textPropertyRef: propertyRef,
    style: buildStyle(node, ctx),
  }
}

function buildIconNode(node: ComponentNode, ctx: SceneContext, skipped: string[]): FigmaVectorNode {
  const { text: glyph, propertyRef } = resolveContentForVariant(node, ctx)
  const resolved = glyph ? resolveIcon(glyph, ctx.foundations.icons, ctx.assets) : undefined

  let svg: string | undefined
  let url: string | undefined
  if (resolved?.kind === 'custom') {
    url = resolved.url
  } else if (resolved?.kind === 'set') {
    svg = resolved.svg
    if (!svg) url = iconifySvgUrl(resolved.prefix, resolved.name)
  }
  if (!svg && !url) {
    skipped.push(`Icon node "${node.name}" (glyph "${glyph ?? ''}") has no resolvable SVG or URL.`)
  }

  return {
    id: node.id,
    name: node.name,
    type: 'VECTOR',
    svg,
    url,
    iconPropertyRef: propertyRef,
    style: buildStyle(node, ctx),
  }
}

function buildFrameNode(
  node: ComponentNode,
  ir: ComponentIR,
  ctx: SceneContext,
  skipped: string[],
): FigmaFrameNode {
  if (node.slot) {
    skipped.push(
      `Node "${node.name}" is an exposed slot; only its current children were exported, not slot semantics.`,
    )
  }
  const children = node.childrenIds
    .map((id) => ir.structure.nodes[id])
    .filter((n): n is ComponentNode => !!n)
    .map((child) => buildNode(child, ir, ctx, skipped))

  return {
    id: node.id,
    name: node.name,
    type: 'FRAME',
    autoLayout: buildAutoLayout(node, ctx),
    style: buildStyle(node, ctx),
    children,
  }
}

function buildNode(
  node: ComponentNode,
  ir: ComponentIR,
  ctx: SceneContext,
  skipped: string[],
): FigmaSceneNode {
  if (node.kind === 'text') return buildTextNode(node, ctx)
  if (node.kind === 'icon') return buildIconNode(node, ctx, skipped)
  if (node.kind === 'instance' && node.instance) {
    return { id: node.id, name: node.name, type: 'INSTANCE', componentRef: node.instance.componentId }
  }
  if (node.kind === 'input' || node.kind === 'output') {
    // A "Make custom" toggle lowers to a real `container` node (real indicator/
    // glyph/track/thumb children) — that already flows through CONTAINER_KINDS
    // below like any other tree. Only the SEALED default (still kind 'input',
    // no exposed anatomy) needs this synthesized stand-in.
    const toggle = customToggleVariant(node)
    if (toggle) return buildSealedToggleNode(node, ir, ctx, toggle, skipped)
    return { id: node.id, name: node.name, type: 'FRAME', style: buildStyle(node, ctx), children: [] }
  }
  if (CONTAINER_KINDS.has(node.kind)) return buildFrameNode(node, ir, ctx, skipped)

  const reason =
    node.kind === 'foreign'
      ? `Foreign code node "${node.name}" has no Figma equivalent — arbitrary code cannot be drawn.`
      : node.kind === 'content'
        ? `Media node "${node.name}" was not exported — image/video content export is not yet supported.`
        : `Node "${node.name}" (kind "${node.kind}") has no Figma mapping.`
  skipped.push(reason)
  return { id: node.id, name: node.name, type: 'PLACEHOLDER', reason }
}

function buildSealedToggleNode(
  node: ComponentNode,
  ir: ComponentIR,
  ctx: SceneContext,
  variant: 'checkbox' | 'switch',
  skipped: string[],
): FigmaControlSchematicNode {
  // A sealed control exposes no facets of its own by design — buildStyle still
  // resolves whatever the archetype DID set directly on this node (rare, but
  // some seeds do), falling back to a neutral default so the shape is at least
  // visible instead of an invisible near-white outline.
  const style = buildStyle(node, ctx)
  const color: FigmaBinding = style['border.color'] ?? style.fill ?? style.ink ?? { value: '#1a1a1a' }

  if (variant === 'checkbox' && checkboxGlyphChild(node, ir.structure.nodes)) {
    skipped.push(
      `"${node.name}": a custom checkmark glyph was authored but is drawn with the default checkmark in Figma.`,
    )
  }

  return {
    id: node.id,
    name: node.name,
    type: 'CONTROL_SCHEMATIC',
    variant,
    checked: ctx.states.has('checked'),
    color,
  }
}

export function buildComponentScene(
  ir: ComponentIR,
  foundations: DocumentFoundations,
  variant: VariantCombo,
  assets: Record<string, { url?: string }> = {},
): SceneResult {
  const skipped: string[] = []
  const propDefaults: Record<string, string> = {}
  for (const prop of ir.contract?.props ?? []) {
    if (prop.default != null) propDefaults[prop.name] = String(prop.default)
  }
  const ctx: SceneContext = {
    foundations,
    propCondition: variant.propCondition,
    states: new Set(variant.states),
    contextSelections: defaultContextSelections(foundations),
    assets,
    propDefaults,
  }
  const rootNode = ir.structure.nodes[ir.structure.rootId]
  const root = rootNode
    ? buildNode(rootNode, ir, ctx, skipped)
    : ({ id: ir.structure.rootId, name: ir.name, type: 'PLACEHOLDER', reason: 'Missing root node.' } as const)
  return { root, skipped }
}
