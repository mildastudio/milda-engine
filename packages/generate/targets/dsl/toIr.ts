// ─── AST → editor-IR adapter (foundations) ────────────────────────────────────
// Completes the round-trip: `.milda` text → parse (milda) → canonical AST → HERE →
// the editor IR (@mildastudio/core `DocumentFoundations`) the app loads and edits.
//
// The two representations differ in vocabulary — that difference is the work:
//   • token TYPE: the AST's `TokenType` (color/spacing/typography/shadow/…) maps to
//     the editor's scale-based `TokenType` (color/spacing/fontSize/textStyle/…).
//   • token VALUE: the AST is TYPED (`{space:'srgb',channels:[…]}`, `{value,unit}`);
//     the editor stores CSS-ish raw strings in a `Slot`. So typed values are rendered
//     back to strings (channels→hex, `{value,unit}`→`rem`/`px`), and alias `refs`
//     (context→token-id) become a `byContext` slot map.
//
// Scope: foundations (context-groups + tokens). Component AST→IR (node-tree
// reconstruction from `anatomy` parts) is the next slice; `documentAstToIr` returns
// components untouched with a note.

import type {
  ComponentIR,
  ComponentNode,
  ComponentStructure,
  DocumentFoundations,
  EventDef as IrEventDef,
  Layer as IrLayer,
  NodeKind,
  PropDef as IrPropDef,
  PropType,
  Slot as IrSlot,
  StateRule,
  Token as IrToken,
  TokenType as IrTokenType,
  TokenValue as IrTokenValue,
} from '@mildastudio/core'
import type {
  ColorValue,
  Component as AstComponent,
  ContextGroup as AstContextGroup,
  DimensionValue,
  EventDef as AstEventDef,
  FacetMap,
  FacetValue,
  Foundations as AstFoundations,
  InsetValue,
  LayoutSpec,
  Part,
  PropDef as AstPropDef,
  Token as AstToken,
  TokenType as AstTokenType,
  TypeExpr,
} from '@mildastudio/milda'

export interface FoundationsToIrResult {
  foundations: DocumentFoundations
  issues: string[]
}

// AST token type → editor-IR scale type. The IR has no home for a few AST types
// (fontFamily lives in `foundations.fonts`; blur/tonal/backdrop have no scale) — those
// fall back to the nearest scale and are flagged.
const TYPE_TO_IR: Record<AstTokenType, IrTokenType> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'radius',
  size: 'size',
  duration: 'duration',
  opacity: 'opacity',
  elevation: 'elevation',
  typography: 'textStyle',
  border: 'borderWidth',
  shadow: 'elevation',
  fontFamily: 'fontSize', // no IR fontFamily token type — fonts live in foundations.fonts
  blur: 'elevation',
  tonal: 'elevation',
  ring: 'color',
  backdrop: 'color',
  none: 'elevation',
}

const IR_LOSSY = new Set<AstTokenType>(['fontFamily', 'blur', 'tonal', 'ring', 'backdrop', 'none'])

// An sRGB/HSL/… ColorValue → a CSS color string for an IR raw slot.
function colorToCss(c: ColorValue): string {
  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)))
  if (c.space === 'srgb') {
    const [r, g, b] = c.channels
    const hex = (n: number) => clamp255(n).toString(16).padStart(2, '0')
    const base = `#${hex(r)}${hex(g)}${hex(b)}`
    return c.alpha != null && c.alpha < 1 ? `${base}${hex(c.alpha)}` : base
  }
  if (c.space === 'hsl') {
    const [h, s, l] = c.channels
    const pct = (n: number) => `${Math.round(n * 100)}%`
    const a = c.alpha != null && c.alpha < 1 ? ` / ${c.alpha}` : ''
    return `hsl(${Math.round(h)} ${pct(s)} ${pct(l)}${a})`
  }
  // display-p3 / oklch → CSS color() / oklch() best-effort.
  const chans = c.channels.join(' ')
  const a = c.alpha != null && c.alpha < 1 ? ` / ${c.alpha}` : ''
  return c.space === 'oklch' ? `oklch(${chans}${a})` : `color(${c.space} ${chans}${a})`
}

// A DimensionValue → a CSS length for an IR raw slot.
function dimensionToCss(d: DimensionValue): string {
  switch (d.unit) {
    case 'scaled':
      return `${d.value}rem`
    case 'fixed':
      return `${d.value}px`
    case 'percent':
      return `${d.value}%`
    case 'em':
      return `${d.value}em`
    default:
      return String(d.value)
  }
}

// An AST token value → an editor-IR TokenValue.
function valueToIr(tok: AstToken, issues: string[]): IrTokenValue {
  const v = tok.value
  if (v.kind === 'alias') {
    // AST alias refs (context-id → token-id) → IR byContext slots (context-id → {ref}).
    const slots: Record<string, IrSlot> = {}
    for (const [ctx, id] of Object.entries(v.refs)) slots[ctx] = { ref: id }
    return { kind: 'byContext', by: v.by, slots }
  }
  if (v.kind === 'escape') {
    return { kind: 'fixed', slot: { raw: v.raw } }
  }
  // raw — render the typed value back to an IR raw slot string.
  const raw = v.value as unknown
  if (tok.type === 'color' && raw && typeof raw === 'object' && 'space' in (raw as object)) {
    return { kind: 'fixed', slot: { raw: colorToCss(raw as ColorValue) } }
  }
  if (raw && typeof raw === 'object' && 'value' in (raw as object) && 'unit' in (raw as object)) {
    return { kind: 'fixed', slot: { raw: dimensionToCss(raw as DimensionValue) } }
  }
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { kind: 'fixed', slot: { raw: String(raw) } }
  }
  // A structured value with no scalar rendering (typography, shadow, …): stringify so
  // nothing is lost, and flag it — the editor stores composite values differently.
  issues.push(`token "${tok.name}" (${tok.type}): composite value stringified into a raw slot`)
  return { kind: 'fixed', slot: { raw: JSON.stringify(raw) } }
}

function contextGroupToIr(cg: AstContextGroup): DocumentFoundations['contextGroups'][number] {
  return { id: cg.id, name: cg.name, contexts: cg.contexts.map((c) => ({ id: c.id, name: c.name })) }
}

export function foundationsToIr(f: AstFoundations): FoundationsToIrResult {
  const issues: string[] = []
  const layers: IrLayer[] = f.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    order: layer.order,
    groups: [],
    tokens: layer.tokens.map((t, i): IrToken => {
      const irType = TYPE_TO_IR[t.type] ?? 'size'
      if (IR_LOSSY.has(t.type)) {
        issues.push(`token "${t.name}": AST type "${t.type}" has no editor scale; mapped to "${irType}"`)
      }
      return { id: t.id, name: t.name, type: irType, value: valueToIr(t, issues), group: null, order: i }
    }),
  }))

  const foundations: DocumentFoundations = {
    contextGroups: f.contextGroups.map(contextGroupToIr),
    layers,
    fonts: [],
    icons: { sets: [], icons: [] },
  }
  return { foundations, issues }
}

// ─── components ──────────────────────────────────────────────────────────────
// The inverse here is inherently heuristic: the AST `anatomy` is a FLAT map of parts
// (facets/layout/variants), while the editor IR is a node TREE with kinds/tags/origins
// that the surface doesn't carry. So node nesting is recovered from dotted part names
// (`surface.option` ⇒ child of `surface`), node kind is inferred, and tags default to
// `auto`. The result is a valid, editable ComponentIR — not a byte-identical original.

const seg = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'

// AST FacetName → editor facet key. Names with no editor facet (typography axes,
// state-layer, backdrop) map to null and are dropped with a note.
const FACET_TO_IR: Record<string, string | null> = {
  fill: 'fill',
  ink: 'ink',
  corner: 'corner',
  gap: 'gap',
  elevation: 'elevation',
  opacity: 'opacity',
  ring: 'ring',
  text: 'text.size',
  border: 'border.color',
  textClamp: null,
  textWrap: null,
  overlay: null,
  backdrop: null,
}

function facetValueToStr(v: FacetValue): string | null {
  if ('token' in v) return v.token
  if ('raw' in v) return v.raw
  if ('literal' in v) return String(v.literal)
  return null // inset handled by the caller
}

function applyInset(inset: InsetValue, out: Record<string, string>): void {
  if ('all' in inset && inset.all) out.inset = inset.all
  else if ('block' in inset || 'inline' in inset) {
    const i = inset as { block?: string; inline?: string }
    if (i.block) out.insetY = i.block
    if (i.inline) out.insetX = i.inline
  } else {
    const i = inset as { top?: string; left?: string }
    if (i.top) out.insetY = i.top
    if (i.left) out.insetX = i.left
  }
}

function facetMapToIr(fm: FacetMap | undefined, issues: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fm) return out
  for (const [name, val] of Object.entries(fm)) {
    if (!val) continue
    if (name === 'inset' && 'inset' in val) {
      applyInset(val.inset, out)
      continue
    }
    const irKey = FACET_TO_IR[name]
    if (irKey === null) {
      issues.push(`facet "${name}" has no editor equivalent — dropped`)
      continue
    }
    if (irKey === undefined) continue
    const s = facetValueToStr(val)
    if (s != null) out[irKey] = s
  }
  return out
}

function axisToStr(axis: NonNullable<LayoutSpec['size']>['width'], issues: string[]): string | undefined {
  if (!axis) return undefined
  const intent = typeof axis === 'object' && 'intent' in axis ? axis.intent : axis
  if (intent === 'fit' || intent === 'fill') return intent
  if (intent && typeof intent === 'object') {
    if ('fixed' in intent) return intent.fixed
    if ('weight' in intent) {
      issues.push('axis weight() has no editor size mode — treated as fill')
      return 'fill'
    }
    if ('ratio' in intent) {
      issues.push('axis ratio() has no editor size mode — treated as fit')
      return 'fit'
    }
  }
  return 'fit'
}

// LayoutSpec → editor `layout` map, spilling `gap`/`inset` back onto the node's facets
// (where the editor stores them), mirroring the emitter's layout-block assembly.
function layoutToIr(ls: LayoutSpec, facetsOut: Record<string, string>, issues: string[]): Record<string, string> {
  const layout: Record<string, string> = {}
  if (ls.stack) {
    if (ls.stack === 'layers') issues.push('layout stack=layers has no editor direction — treated as row')
    layout.direction = ls.stack === 'column' ? 'column' : 'row'
  }
  if (ls.align) layout.align = ls.align
  if (ls.distribute) layout.distribute = ls.distribute
  if (ls.flow) layout.wrap = 'wrap'
  if (ls.gap) facetsOut.gap = ls.gap
  if (ls.inset) applyInset(ls.inset, facetsOut)
  if (ls.size?.width) {
    const w = axisToStr(ls.size.width, issues)
    if (w) layout.width = w
  }
  if (ls.size?.height) {
    const h = axisToStr(ls.size.height, issues)
    if (h) layout.height = h
  }
  return layout
}

let ruleSeq = 0
function partStateRules(part: Part, issues: string[]): StateRule[] {
  const rules: StateRule[] = []
  for (const [name, ps] of Object.entries(part.states ?? {})) {
    if (!ps) continue
    const facets = facetMapToIr(ps.facets, issues)
    const layout = ps.layout ? layoutToIr(ps.layout, facets, issues) : undefined
    rules.push({
      id: `sr${ruleSeq++}`,
      props: {},
      states: [name as StateRule['states'][number]],
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
    })
  }
  for (const v of part.variants ?? []) {
    const facets = facetMapToIr(v.facets, issues)
    const layout = v.layout ? layoutToIr(v.layout, facets, issues) : undefined
    rules.push({
      id: `sr${ruleSeq++}`,
      props: v.when ? { [v.when.prop]: v.when.eq } : {},
      states: (v.states ?? []) as StateRule['states'],
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
    })
  }
  return rules
}

// AST TypeExpr → editor PropType (a structural superset; recurse the shared subset).
function typeToIr(t: TypeExpr): PropType {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return t
    case 'enum':
      return { kind: 'enum', values: t.values }
    case 'union':
      return { kind: 'union', members: t.members.map(typeToIr) }
    case 'ref':
      return { kind: 'ref', ref: t.ref }
    case 'array':
      return { kind: 'array', item: typeToIr(t.item) }
    case 'object':
      return {
        kind: 'object',
        fields: t.fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: typeToIr(f.type),
          required: f.required,
          ...(f.description ? { description: f.description } : {}),
        })),
      }
    case 'component':
      return { kind: 'component', ...(t.componentIds ? { componentIds: t.componentIds } : {}) }
    default:
      return { kind: 'any' }
  }
}

function propToIr(p: AstPropDef): IrPropDef {
  const out: IrPropDef = { id: p.id ?? `prop.${seg(p.name)}`, name: p.name, type: typeToIr(p.type) }
  if (p.default !== undefined) out.default = p.default
  if (p.required !== undefined) out.required = p.required
  if (p.description) out.description = p.description
  if (p.binding) out.binding = p.binding
  return out
}

function eventToIr(e: AstEventDef): IrEventDef {
  const out: IrEventDef = { id: e.id ?? `ev.${seg(e.name)}`, name: e.name }
  if (e.payload) out.payload = typeToIr(e.payload)
  if (e.description) out.description = e.description
  return out
}

export interface ComponentToIrResult {
  component: ComponentIR
  issues: string[]
}

export function componentToIr(c: AstComponent): ComponentToIrResult {
  const issues: string[] = []
  const entries = Object.entries(c.anatomy)
  const cid = c.id || `cmp.${seg(c.name)}`
  const nodeId = (partName: string) => `${cid}:${seg(partName)}`

  const nodes: Record<string, ComponentNode> = {}
  const rootName = entries[0]?.[0]

  // Resolve each part's parent: the longest dotted-prefix that is also a part;
  // else the first part (root); the root itself has no parent.
  const parentOf = (partName: string): string | null => {
    if (partName === rootName) return null
    if (partName.includes('.')) {
      const segs = partName.split('.')
      for (let i = segs.length - 1; i >= 1; i--) {
        const prefix = segs.slice(0, i).join('.')
        if (c.anatomy[prefix]) return prefix
      }
    }
    return rootName ?? null
  }

  for (const [partName, part] of entries) {
    const facets = facetMapToIr(part.facets, issues)
    const layout = part.layout ? layoutToIr(part.layout, facets, issues) : undefined
    const states = partStateRules(part, issues)
    const isRoot = partName === rootName
    const node: ComponentNode = {
      id: nodeId(partName),
      name: partName.split('.').pop() || partName,
      kind: 'container', // refined below once children are known
      tag: 'auto',
      part: partName,
      origin: isRoot ? 'root' : 'archetype',
      locked: false,
      parentId: null,
      childrenIds: [],
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
      ...(states.length ? { states } : {}),
    }
    nodes[node.id] = node
  }

  // Wire parent/child links.
  for (const [partName] of entries) {
    const parent = parentOf(partName)
    const node = nodes[nodeId(partName)]
    if (parent) {
      node.parentId = nodeId(parent)
      nodes[nodeId(parent)]?.childrenIds.push(node.id)
    }
  }

  // Infer node kind now that children are known: parents are containers; leaves with
  // text/ink paint are text, otherwise items.
  for (const node of Object.values(nodes)) {
    if (node.origin === 'root') continue
    if (node.childrenIds.length) node.kind = 'container'
    else if (node.facets?.ink || node.facets?.['text.size']) node.kind = 'text'
    else node.kind = 'item'
  }

  const rootId = rootName ? nodeId(rootName) : `${cid}:root`
  if (!rootName) {
    // An anatomy-less component still needs a root node to be editable.
    nodes[rootId] = {
      id: rootId,
      name: 'root',
      kind: 'container',
      tag: 'auto',
      origin: 'root',
      locked: false,
      parentId: null,
      childrenIds: [],
    }
    issues.push('component has no anatomy — synthesized an empty root node')
  }

  const structure: ComponentStructure = { rootId, nodes }
  const component: ComponentIR = {
    name: c.name,
    ...(c.description ? { description: c.description } : {}),
    archetype: c.archetype || null,
    structure,
    contract: { props: c.contract.props.map(propToIr), events: c.contract.events.map(eventToIr) },
  }
  return { component, issues }
}

export interface DocumentToIrResult {
  foundations: DocumentFoundations
  components: ComponentIR[]
  issues: string[]
}

// A whole parsed AST document → the editor IR pieces the app loads: foundations +
// components. (Assets, docs, examples, component groups are not expressed in the DSL.)
export function documentToIr(doc: {
  foundations: AstFoundations
  components: AstComponent[]
}): DocumentToIrResult {
  const f = foundationsToIr(doc.foundations)
  const issues = [...f.issues]
  const components: ComponentIR[] = []
  for (const c of doc.components) {
    const r = componentToIr(c)
    components.push(r.component)
    for (const i of r.issues) issues.push(`${c.name}: ${i}`)
  }
  return { foundations: f.foundations, components, issues }
}
