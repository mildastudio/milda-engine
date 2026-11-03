import type { StyleDecl } from '../_shared/decl'
import {
  baselineDecls,
  cssVarRef,
  easingVarName,
  facetCssVar,
  facetDecls,
  layoutVarDecls,
  type LayoutLoweringOptions,
  makeFacetVarResolver,
  motionDecls,
  timingTransitionDecl,
  controlTransitionProps,
  CHECKBOX_ROOT_DECLS,
  CHECKBOX_INDICATOR_DECLS,
  CHECKBOX_GLYPH_DECLS,
  CHECKBOX_GLYPH_CHECKED_DECLS,
  CHECKBOX_FOCUS_DECLS,
  CHECKBOX_DISABLED_DECLS,
  SWITCH_TRACK_DECLS,
  SWITCH_THUMB_DECLS,
  SWITCH_THUMB_CHECKED_DECLS,
  SR_ONLY_DECLS,
  anchorDecls,
  backdropDecls,
  surfacePositionDecls,
} from '../_shared'
import { contextDataAttr, contextValue } from '../_shared'
import {
  collectSlots,
  iconifySvgUrl,
  couldBeLiteral,
  normalizeNodeContent,
  resolveIcon,
  resolveMediaSource,
  planBehavior,
  planCompound,
  normalizeContentValue,
  contextOfValue,
  type ComponentIR,
  type ComponentNode,
  type ContentValue,
  type ContextGroup,
  type DocumentFoundations,
  type FacetResolver,
  type DisclosurePlan,
  type OpenTrigger,
  type SelectionPlan,
  type EventDef,
  type EventEmission,
  type IconLibrary,
  coercePredicate,
  ruleNeedsDataCond,
  dataCondAttr,
  type PropCondition,
  type Predicate,
  type PredicateRef,
  type PropType,
  type SharedType,
  type SlotSurface,
  type OverlayManagementBehavior,
  type OverlayPlacement,
  effectiveValueType,
  effectiveBehaviors,
  isOverlaySurface,
  presentationMode,
  customToggleVariant,
  checkboxGlyphChild,
  materializedToggleParts,
  isNameableControl,
  activatingLabel,
  CHECKBOX_INDICATOR_TRANSITION,
  CHECKBOX_GLYPH_TRANSITION,
  SWITCH_TRACK_TRANSITION,
  SWITCH_THUMB_TRANSITION,
  type ControlTransition,
  normalizeColorPicker,
  type ResolvedColorPicker,
  type ColorFormat,
  BUILTIN_COLOR_ID,
  BUILTIN_ICON_NAME_ID,
  BUILTIN_DATE_ID,
  BUILTIN_FILE_ID,
  iconLabel,
  type Icon,
  type PropDef,
  type PropValue,
  type RepeatSource,
  type StateName,
} from '@mildastudio/core'
import { StyleSheet } from '../../css/sheet'
import { applyInterfaceConstraints } from './constraints'
import { reactHandlerProp } from './interaction'

export interface ReactSurface {
  className: boolean
  style: boolean
  aria: boolean
  data: boolean
  domEvents: boolean
  nativeAttrs: boolean
}

export const SEALED_SURFACE: ReactSurface = {
  className: false,
  style: false,
  aria: false,
  data: false,
  domEvents: false,
  nativeAttrs: false,
}

export function resolveSurface(component: ComponentIR, options: EmitOptions): ReactSurface {
  const perComponent = (component.targets?.react as { surface?: Partial<ReactSurface> } | undefined)
    ?.surface
  return { ...SEALED_SURFACE, ...options.surface, ...perComponent }
}

export interface EmitOptions {
  // The token set the package's `theme.css` is written from. Given, a facet value becomes a
  // `var()` only when one of these tokens claims it and is otherwise read as a literal (proposal
  // 0049); absent, every value is taken for a token id, which is what a bare `emit()` always did.
  foundations?: DocumentFoundations

  emitStyle?: 'compound' | 'props' | 'both'
  naming?: 'dot' | 'flat'
  forwardRef?: boolean
  asChild?: boolean

  surface?: Partial<ReactSurface>

  sharedTypes?: SharedType[]

  componentsById?: Record<string, ComponentIR>

  styling?: 'css-modules'

  icons?: IconLibrary
  assets?: Record<string, { url?: string }>

  // The document's context groups, needed by any prop TYPED BY one (proposal 0001): its TS type
  // is the group's contexts, and the value it carries selects that context for this instance.
  contextGroups?: DocumentFoundations['contextGroups']

  // DatePicker date-value representation (proposal 0029 §4.1), a project/publish-level
  // choice covering the ecosystem union. Defaults: isoDate + object range.
  dateRepresentation?: 'isoDate' | 'nativeDate' | 'epochMs' | 'ymd'
  dateRangeShape?: 'object' | 'tuple'

  // TimePicker time-value representation. Default isoTime ('HH:mm').
  timeRepresentation?: 'isoTime' | 'minutes' | 'hm'

  // ColorPicker color-value representation. Default hex ('#rrggbb').
  colorRepresentation?: 'hex' | 'rgb' | 'hsl'

  // How the shared behavior core (calendar/time) reaches a generated component
  // (proposal 0029 §8.3). 'vendored' (default) copies the core beside the component;
  // 'package' imports it from a shared published package (deduped across a whole DS
  // and, critically, across microfrontends). behaviorPackage is the specifier used
  // in 'package' mode (defaults to BEHAVIOR_PACKAGE_DEFAULT).
  behaviorDelivery?: 'vendored' | 'package'
  behaviorPackage?: string
}

// Default specifier for the shared behavior package in 'package' delivery mode. The
// release layer may override it (e.g. `${scope}/behavior`) via EmitOptions.behaviorPackage.
export const BEHAVIOR_PACKAGE_DEFAULT = '@mildastudio/ds-behavior'

// Exported for the conformance checker (proposal 0053 §2.2), which inverts it: a raw
// `<button>` in a consumer's code is a finding only because THIS table says the library's
// Button renders one.
export const ROOT_ELEMENT: Readonly<Record<string, string>> = {
  Button: 'button',
  ToggleButton: 'button',
  Link: 'a',
  Form: 'form',
}

function rootElement(component: ComponentIR): string {
  return (component.archetype && ROOT_ELEMENT[component.archetype]) || 'div'
}

function emitsList(node: ComponentNode, component: ComponentIR): boolean {
  return (
    node.kind === 'container' &&
    node.childrenIds.some((id) => component.structure.nodes[id]?.kind === 'item')
  )
}

// The web element a neutral node KIND lowers to. `auto` used to mean `div` for every kind,
// which is wrong for an icon or a text run and - more importantly - made `tag` load-bearing
// information that a platform-neutral `.milda` cannot carry (proposal 0041): a file that
// spells out `div`/`span`/`svg` is a DOM description, not a design system. With this, `kind`
// is enough, and the element becomes what it always should have been: a target decision.
const KIND_ELEMENT: Partial<Record<ComponentNode['kind'], string>> = {
  text: 'span',
  icon: 'svg',
  item: 'li',
  control: 'button',
  input: 'input',
  content: 'img',
  table: 'table',
  row: 'tr',
  cell: 'td',
  fragment: 'div',
}

export function kindElement(node: ComponentNode): string {
  return KIND_ELEMENT[node.kind] ?? 'div'
}

export function resolveTag(node: ComponentNode, component: ComponentIR): string {
  if (node.parentId === null) {
    return rootElement(component)
  }
  if (node.tag === 'auto') {
    // An `li` is only an `li` inside a list, same rule as the explicit-tag path below.
    const derived = kindElement(node)
    if (derived === 'li') {
      const parent = component.structure.nodes[node.parentId]
      if (!parent || !emitsList(parent, component)) return 'div'
    }
    if (derived === 'div' && emitsList(node, component)) return 'ul'
    // A `button` takes PHRASING content, so a `div` inside one is invalid HTML. The explicit-tag
    // path below has said so for a while; the derived path had not, so a container part inside a
    // button root emitted a div anyway (the Radix Button's spinner overlay is one).
    if (derived === 'div' && rootElement(component) === 'button') return 'span'
    return derived
  }
  if (emitsList(node, component)) return 'ul'

  if (node.kind === 'container' && node.tag === 'div' && rootElement(component) === 'button') {
    return 'span'
  }

  if (node.tag === 'li') {
    const parent = component.structure.nodes[node.parentId]
    if (!parent || !emitsList(parent, component)) return 'div'
  }
  return node.tag
}

function pascalCase(base: string): string {
  return base
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')
}

/**
 * The identifier a contract prop is written as in the generated API. Exported so a
 * reader of consumer code (the 0053 checker) matches `isOpen` against the prop authored
 * as "is open" by the same rule that printed it, rather than a second guess at one.
 */
export function propIdentifier(name: string): string {
  return camelCase(name)
}

function camelCase(base: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(base)) return base
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (parts.length === 0) return base
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('')
  )
}

export function componentName(component: ComponentIR): string {
  const pascal = pascalCase(component.name || component.archetype || 'Component')
  return /^[A-Za-z]/.test(pascal) ? pascal : 'Component'
}

const leafOf = (node: ComponentNode): string | undefined => node.part?.split('.').pop()

function childrenOf(node: ComponentNode, component: ComponentIR): ComponentNode[] {
  return node.childrenIds
    .map((id) => component.structure.nodes[id])
    .filter((n): n is ComponentNode => Boolean(n))
}

function tsType(ctx: EmitCtx, t: PropType, sharedTypes: SharedType[] = []): string {
  switch (t.kind) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'enum':
      return t.values.length ? t.values.map((v) => JSON.stringify(v)).join(' | ') : 'string'
    // A prop typed by a context group is a closed set of names - the group's contexts - so it
    // types as their union. `unknown` was what a consumer got before (via a dangling shared-type
    // ref), which typechecks and admits anything, so the whole Radix variant matrix was a prop
    // nobody could use correctly and nothing read.
    case 'context': {
      const group = ctx.contextGroups.get(t.group)
      const values = (group?.contexts ?? []).map((c) => contextValue(c.name))
      return values.length ? values.map((v) => JSON.stringify(v)).join(' | ') : 'string'
    }
    case 'union':
      return t.members.length
        ? t.members.map((m) => tsType(ctx, m, sharedTypes)).join(' | ')
        : 'unknown'
    case 'array': {
      const inner = tsType(ctx, t.item, sharedTypes)
      return t.item.kind === 'union' ? `(${inner})[]` : `${inner}[]`
    }
    case 'object':
      return `{ ${t.fields.map((f) => `${f.name}${f.required ? '' : '?'}: ${tsType(ctx, f.type, sharedTypes)}`).join('; ')} }`
    case 'component':
      return 'ReactNode'
    case 'ref': {
      if (t.ref === BUILTIN_ICON_NAME_ID) {
        if (!hasIconModule(ctx)) return 'string'
        ctx.usesIconNameType = true
        return 'IconName'
      }
      if (t.ref === BUILTIN_FILE_ID) return 'File'
      if (t.ref === BUILTIN_COLOR_ID || t.ref === BUILTIN_DATE_ID) return 'string'
      const st = sharedTypes.find((s) => s.id === t.ref)
      if (!st) return 'unknown'
      const name = st.name
      const params = st.params ?? []
      if (params.length > 0) {
        const argTypes = params.map((_, i) => {
          const arg = t.args?.[i]
          return arg ? tsType(ctx, arg, sharedTypes) : 'unknown'
        })
        return `${name}<${argTypes.join(', ')}>`
      }
      return name
    }
    case 'typeParam':
      return t.name
    case 'literal':
      return JSON.stringify(t.value)
    case 'any':
      return 'unknown'
    case 'function': {
      const ps = t.params.map((p) => `${p.name}: ${tsType(ctx, p.type, sharedTypes)}`).join(', ')
      return `(${ps}) => ${tsType(ctx, t.returnType, sharedTypes)}`
    }
    case 'record':
      return `Record<${tsType(ctx, t.key, sharedTypes)}, ${tsType(ctx, t.value, sharedTypes)}>`
    case 'intersection':
      return t.members.map((m) => tsType(ctx, m, sharedTypes)).join(' & ')
  }
}

function propTypeLines(
  ctx: EmitCtx,
  component: ComponentIR,
  sharedTypes: SharedType[] = [],
): string[] {
  return (component.contract?.props ?? []).map(
    (p) => `  ${camelCase(p.name)}${p.required ? '' : '?'}: ${tsType(ctx, p.type, sharedTypes)}`,
  )
}

function propNames(component: ComponentIR): string[] {
  return (component.contract?.props ?? []).map((p) => camelCase(p.name))
}

function eventHandlerName(name: string): string {
  return `on${pascalCase(name)}`
}

function eventPropLines(
  ctx: EmitCtx,
  events: EventDef[] = [],
  sharedTypes: SharedType[] = [],
): string[] {
  return events
    .filter((e) => e.name)
    .map((e) => {
      const sig = e.payload
        ? `(payload: ${tsType(ctx, e.payload, sharedTypes)}) => void`
        : `() => void`
      return `  ${eventHandlerName(e.name)}?: ${sig}`
    })
}

const NATIVE_PROP_NAMES = new Set([
  'disabled',
  'type',
  'name',
  'value',
  'href',
  'target',
  'rel',
  'title',
  'id',
  'autoFocus',
  'tabIndex',
  'form',
  'required',
  'readOnly',
  'placeholder',
  'checked',
])

const NATIVE_HANDLERS = new Set([
  'onClick',
  'onDoubleClick',
  'onChange',
  'onInput',
  'onSubmit',
  'onReset',
  'onFocus',
  'onBlur',
  'onKeyDown',
  'onKeyUp',
  'onKeyPress',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseDown',
  'onMouseUp',
  'onMouseOver',
  'onMouseOut',
  'onPointerDown',
  'onPointerUp',
  'onPointerEnter',
  'onPointerLeave',
  'onTouchStart',
  'onTouchEnd',
  'onScroll',
  'onWheel',
  'onCopy',
  'onPaste',
  'onCut',
])

function customEventPropLines(
  ctx: EmitCtx,
  events: EventDef[] = [],
  sharedTypes: SharedType[] = [],
): string[] {
  return eventPropLines(ctx, events, sharedTypes).filter((line) => {
    const handler = line.trim().split('?:')[0]
    return !NATIVE_HANDLERS.has(handler)
  })
}

function emittedEventNames(ctx: EmitCtx, component: ComponentIR): string[] {
  const names = new Set<string>()
  for (const n of Object.values(component.structure.nodes))
    for (const e of n.emits ?? []) names.add(emissionEventName(ctx, e.eventId))
  return [...names]
}
function emittedHandlerNames(ctx: EmitCtx, component: ComponentIR): string[] {
  return emittedEventNames(ctx, component).map(eventHandlerName)
}

function interfaceEventDefs(ctx: EmitCtx, component: ComponentIR): EventDef[] {
  const byName = new Map<string, EventDef>()
  for (const e of component.contract?.events ?? []) if (e.name) byName.set(e.name, e)
  const props = component.contract?.props ?? []
  for (const node of Object.values(component.structure.nodes)) {
    for (const em of node.emits ?? []) {
      const name = emissionEventName(ctx, em.eventId)
      if (!name || byName.has(name)) continue
      const pv = em.payload
      let payload: PropType | undefined
      if (pv?.kind === 'bind') {
        payload = props.find((p) => p.name === pv.propName)?.type ?? { kind: 'any' }
      } else if (pv) {
        payload = { kind: 'string' }
      }
      byName.set(name, { id: em.eventId, name, payload })
    }
  }
  return [...byName.values()]
}

function bindingExpr(path: string): string {
  const dot = path.indexOf('.')
  return dot === -1 ? camelCase(path) : camelCase(path.slice(0, dot)) + path.slice(dot)
}

function repeatItemsExpr(source: RepeatSource): string {
  if (source.kind === 'prop') {
    const expr = bindingExpr(source.propName)
    return expr ? `(${expr} ?? [])` : '[]'
  }
  return JSON.stringify(source.items ?? [])
}

// An instance's prop value, as an expression. A literal passed to a context-typed prop is spelled
// the way the target's union spells it - `variant={"soft"}`, never the stored `"Soft"`, which the
// prop's own type would reject and the release build would fail on.
function instancePropExpr(
  ctx: EmitCtx,
  target: ComponentIR,
  propName: string,
  value: ContentValue,
): string {
  const type = target.contract?.props.find((p) => p.name === propName)?.type
  if (type?.kind === 'context') {
    const v = normalizeContentValue(value)
    const group = ctx.contextGroups.get(type.group)
    const literal = v.kind === 'value' && group ? contextLiteral(group, v.value) : undefined
    if (literal) return literal
  }
  return contentValueExpr(value)
}

function contentValueExpr(value: ContentValue): string {
  const v = normalizeContentValue(value)
  return v.kind === 'value' ? JSON.stringify(v.value) : bindingExpr(v.propName)
}

function whenExpr(when: PropCondition): string {
  const parts = Object.entries(when).map(([k, v]) => `${bindingExpr(k)} === ${JSON.stringify(v)}`)
  return parts.length ? parts.join(' && ') : 'true'
}

// Native states whose truth maps to a forwarded prop by convention (mirrors the
// editor's NATIVE_PROP_STATE). Other data-bound states resolve via `stateBindings`.
const NATIVE_PRESENCE_STATE_PROP: Record<string, string> = {
  disabled: 'disabled',
  readonly: 'readOnly',
  checked: 'checked',
}

// The prop-backed boolean a presence `state` reads (0031). A stateBinding wins (the
// authored prop→state wiring); otherwise the native-prop convention. Returns undefined
// for states with no runtime boolean (auto/interaction) - the editor never offers those
// for presence, so this only fires on prop-driven states.
function presenceStateExpr(
  node: ComponentNode,
  state: string,
  // The nearest ancestor holding a binding for this state, when the node has none of its own.
  owner?: (nodeId: string, state: string) => ComponentNode | undefined,
): string | undefined {
  const binding = (node.stateBindings ?? []).find((b) => b.state === state)
  if (binding) return bindingExpr(binding.propName)
  // A state is a fact about the COMPONENT, not only about the node that reads it: the Radix
  // Button binds `loading` on its root and gates its spinner on it. Self-only lookup made that
  // presence unexpressible, so the spinner rendered unconditionally. The CSS side already flows
  // a root-controlled state down to every part (`buildControlledStateAnchor`), and the preview
  // does the same; this makes the runtime guard agree with them.
  const controlling = owner?.(node.id, state)
  const inherited = (controlling?.stateBindings ?? []).find((b) => b.state === state)
  if (inherited) return bindingExpr(inherited.propName)
  const native = NATIVE_PRESENCE_STATE_PROP[state]
  return native ? bindingExpr(native) : undefined
}

const PREDICATE_CMP_JS: Record<string, string> = {
  eq: '===',
  ne: '!==',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
}

// The JS boolean a predicate leaf's referenced value reads, or null when it has no static
// runtime representation in generated React (context - pending 0032 phase 4 - and
// non-prop-reachable states). Prop leaves use `bindingExpr` (repeat-item-alias aware).
function predicateRefExpr(ctx: EmitCtx, ref: PredicateRef, node: ComponentNode): string | null {
  if (ref.kind === 'prop') return bindingExpr(ref.path)
  if (ref.kind === 'state') return presenceStateExpr(node, ref.state, ctx.stateOwner) ?? null
  // Foundations context (0032 phase 4): read the active context id from the MildaContext
  // hook. `_mildaCtx` is declared once in the component body when `usesMildaContext` is set.
  if (ref.kind === 'context') {
    ctx.usesMildaContext = true
    return `_mildaCtx[${JSON.stringify(ref.group)}]`
  }
  // ancestor - CSS-only, no runtime JS boolean.
  return null
}

// Recursively translate a predicate (0032) to a JS boolean expression, or null when any
// part can't be expressed (fail-open: the caller then renders unconditionally rather than
// wrongly hiding). Groups parenthesize their members so precedence is explicit.
function predicateExpr(ctx: EmitCtx, p: Predicate, node: ComponentNode): string | null {
  switch (p.kind) {
    case 'cmp': {
      const left = predicateRefExpr(ctx, p.ref, node)
      if (left === null) return null
      if (p.op === 'set') return left
      if (p.op === 'unset') return `!(${left})`
      if (p.op === 'contains') return `(${left})?.includes(${JSON.stringify(p.value)})`
      return `${left} ${PREDICATE_CMP_JS[p.op]} ${JSON.stringify(p.value)}`
    }
    case 'not': {
      const e = predicateExpr(ctx, p.item, node)
      return e === null ? null : `!(${e})`
    }
    case 'all':
    case 'any': {
      if (p.items.length === 0) return p.kind === 'all' ? 'true' : 'false'
      const parts = p.items.map((i) => predicateExpr(ctx, i, node))
      if (parts.some((x) => x === null)) return null
      return parts.map((x) => `(${x})`).join(p.kind === 'all' ? ' && ' : ' || ')
    }
  }
}

// The JS boolean guarding a node's conditional presence, or null when unconditional
// (absent predicate, an always-true predicate, or one that can't be expressed).
function presenceExpr(ctx: EmitCtx, node: ComponentNode): string | null {
  if (!node.presence) return null
  const expr = predicateExpr(ctx, node.presence, node)
  return expr === null || expr === 'true' ? null : expr
}

// data-cond attributes (0032 §4.2) for a node's rich `when` styling rules that the CSS
// target keyed off `[data-cond-<id>]`. Each is set from the rule's predicate boolean, so a
// styling condition with OR/NOT/operators restyles at runtime. A rule whose predicate can't be
// expressed in JS (a pointer state no prop binds, an ancestor's state) gets no attribute and so
// never applies; that is recorded once per rule for the `skipped` report rather than left silent.
function condAttrs(ctx: EmitCtx, node: ComponentNode): string {
  return (node.states ?? [])
    .filter(ruleNeedsDataCond)
    .map((r) => {
      const expr = r.when ? predicateExpr(ctx, r.when, node) : null
      if (expr !== null) return ` ${dataCondAttr(r)}={${expr} ? '' : undefined}`
      const note =
        `part "${node.part?.split('.').pop() ?? node.name}": a condition combines a state or an ` +
        `ancestor the generated component cannot read at runtime, so the rule is never applied.`
      if (!ctx.deadConditions.includes(note)) ctx.deadConditions.push(note)
      return ''
    })
    .join('')
}

// Wrap a rendered element in its presence guard, if any. `pad` is the element's own
// indentation. In JSX-children position (a sibling among other elements) the guard is a
// JSX expression container `{cond && ( … )}`; inside a `.map(…)` arrow return or array
// literal it must be a bare JS expression `cond && ( … )` (no braces), so callers there
// pass `braces: false`.
function wrapPresence(
  ctx: EmitCtx,
  node: ComponentNode,
  el: string,
  pad: string,
  braces = true,
): string {
  const cond = presenceExpr(ctx, node)
  if (!cond) return el
  const guard = `(${cond}) && (\n${el}\n${pad})`
  return braces ? `${pad}{${guard}}` : `${pad}${guard}`
}

function contentExpr(ctx: EmitCtx, node: ComponentNode): string | null {
  // Authored content (a literal or a bound prop) always wins over the default-slot
  // fallback: `slot.default` only means "accept {children} when nothing else is
  // authored" - an author who binds real content has moved off the slot, and the
  // generated component must honor THAT, not silently drop it for `{children}`.
  const c = normalizeNodeContent(node.content)
  if (c) {
    if (c.kind === 'static') return JSON.stringify(c.text)
    let expr = contentValueExpr(c.default)
    for (let i = c.rules.length - 1; i >= 0; i--) {
      // A rule's predicate (0032) becomes the ternary test. An inexpressible predicate
      // (context/unreachable leaf, pending later phases) skips the rule rather than
      // emitting broken code - the fallthrough (`expr`) covers it.
      const cond = predicateExpr(
        ctx,
        coercePredicate(c.rules[i].when) ?? { kind: 'all', items: [] },
        node,
      )
      if (cond === null) continue
      expr = `${cond} ? ${contentValueExpr(c.rules[i].value)} : ${expr}`
    }
    return expr
  }
  if (node.slot?.default) return 'children'
  return null
}

function textContent(ctx: EmitCtx, node: ComponentNode): string {
  const expr = contentExpr(ctx, node)
  if (expr !== null) return `{${expr}}`
  return node.name
}

function inputTypeFor(t: PropType | undefined): string {
  if (!t) return 'text'
  switch (t.kind) {
    case 'boolean':
      return 'checkbox'
    case 'number':
      return 'number'
    case 'ref':
      if (t.ref === BUILTIN_COLOR_ID) return 'color'
      if (t.ref === BUILTIN_DATE_ID) return 'date'
      if (t.ref === BUILTIN_FILE_ID) return 'file'
      return 'text'
    default:
      return 'text'
  }
}

// The parent a node is laid out in, which the web lowering needs to know whether a `fill` is on
// the shared axis, whether the node sits in a `layers` stack, and what inset a `bleed` cancels
// (proposal 0056 §3.4). The base layout and facets: a rule on the parent that changes its
// direction does not re-lower the children, which is the one approximation this takes.
function layoutParentOf(ctx: EmitCtx, node: ComponentNode): LayoutLoweringOptions {
  const parent = node.parentId ? ctx.nodes[node.parentId] : undefined
  return {
    ...(parent ? { parent: { layout: parent.layout, facets: parent.facets } } : {}),
    facet: ctx.facetVar,
  }
}

function nodeStyleDecls(ctx: EmitCtx, node: ComponentNode, tag: string): StyleDecl[] {
  const buttonish = tag === 'button' || tag === 'a'
  const base: StyleDecl[] = []
  if (buttonish) {
    base.push({ prop: 'cursor', value: 'pointer' }, { prop: 'font', value: 'inherit' })

    if (tag === 'a')
      base.push(
        { prop: 'textDecoration', value: 'underline' },
        { prop: 'textUnderlineOffset', value: '2px' },
      )
  }

  const decls = [
    ...baselineDecls(node),
    ...base,
    ...layoutVarDecls(node.layout, layoutParentOf(ctx, node)),
    ...facetDecls(node.facets, ctx.facetVar),

    ...motionDecls(node.motion, durationVarRef, easingVarRef),
  ]

  const remapped =
    buttonish && decls.some((d) => d.prop === 'display')
      ? decls.map((d) => (d.prop === 'display' ? { prop: 'display', value: 'inline-flex' } : d))
      : decls

  return dedupeDecls(remapped)
}

function dedupeDecls(decls: StyleDecl[]): StyleDecl[] {
  const lastValue = new Map<string, string>()
  for (const d of decls) lastValue.set(d.prop, d.value)
  const seen = new Set<string>()
  const out: StyleDecl[] = []
  for (const d of decls) {
    if (seen.has(d.prop)) continue
    seen.add(d.prop)
    out.push({ prop: d.prop, value: lastValue.get(d.prop)! })
  }
  return out
}

function styleLiteral(decls: StyleDecl[]): string {
  return decls.map((d) => `${String(d.prop)}: '${d.value}'`).join(', ')
}

// Everything one component's emission needs to know about itself, threaded explicitly.
//
// This used to be 18 module-level `let` bindings reset at the top of `emitComponent`, which
// made emission a singleton: a nested or concurrent `emitComponent` would silently overwrite
// the outer one's sheet, icon flags and behavior plans. It was also the reason this file
// could not be split - moving a helper out would have promoted ambient state into a
// cross-module mutable singleton, which is strictly worse. With the state named and passed,
// emission is re-entrant and the file is free to come apart along its natural seams.
//
// Some fields are decided once per component (`props`, `surface`, the behavior plans); others
// accumulate during emission (`sheet`, `instances`, the `uses*` flags) and are read afterwards
// to decide imports. `selectionCond` is the one field that is saved and restored around a
// subtree rather than only appended to.
interface EmitCtx {
  sheet: StyleSheet

  // Facet value -> CSS, for every declaration this component emits (see `EmitOptions.foundations`).
  facetVar: FacetResolver

  usesIconComponent: boolean
  usesIconNameType: boolean

  // Set when a component's predicate (presence/content/styling) gates on a foundations
  // context (0032 phase 4) - the component then imports + calls the MildaContext hook.
  usesMildaContext: boolean

  // Rich `when` rules (0032) whose condition has a leaf generated React cannot evaluate at runtime
  // (a pointer state no prop binds, an ancestor's state). The style sheet keys such a rule off a
  // `data-cond` attribute only the runtime sets, so the rule can never apply: it is reported in
  // the target's `skipped` list instead of disappearing.
  deadConditions: string[]

  props: Map<string, PropDef>

  iconLib: IconLibrary | undefined
  assets: Record<string, { url?: string }> | undefined

  componentsById: Map<string, ComponentIR>
  // The component's own nodes, so a node can find its parent (the layout lowering needs it).
  nodes: Record<string, ComponentNode>
  instances: Set<string>

  // Context groups by id, for a prop typed by one (proposal 0001).
  contextGroups: Map<string, DocumentFoundations['contextGroups'][number]>

  // The nearest ANCESTOR node that binds a given state to a prop, for a node that does not bind
  // it itself. A state belongs to the component, so a child's presence guard has to be able to
  // read the state its root controls (see `presenceStateExpr`).
  stateOwner: (nodeId: string, state: string) => ComponentNode | undefined

  eventNames: Map<string, string>

  // The payload type each handler prop is DECLARED with in the emitted interface, keyed by
  // event name - the same resolution `interfaceEventDefs` uses. Call sites reconcile their
  // argument against this: an arity mismatch (payload-less event called with a value, or a
  // declared payload called with nothing) is a hard tsc error in the released package.
  eventPayloads: Map<string, PropType | undefined>

  surface: ReactSurface

  // Two different questions, deliberately two fields. `selectionAria` is the archetype's
  // WAI-ARIA contract (tablist/tab, radiogroup/radio, listbox/option) and comes from core's
  // `planBehavior` - the same plan the Studio canvas renders from. `selection` is the
  // RUNTIME selection state, which only exists once the author has wired a `value` prop and
  // a bound repeat. Folding the first into the second is what shipped a seeded Tabs as a
  // roleless <div> while the canvas showed its designer a real tab list.
  selectionAria: SelectionPlan | null
  selection: SelectionInfo | null
  selectionCond: string | null
  stepper: StepperInfo | null
  slider: SliderInfo | null
  textEntry: TextEntryInfo | null

  a11y: A11yPlan
}

// Walks strictly UPWARD from a node to the first ancestor that binds `state` to a prop. The
// node's own binding is the caller's business (it wins); this answers "who else knows".
function buildStateOwner(
  component: ComponentIR,
): (nodeId: string, state: string) => ComponentNode | undefined {
  const nodes = component.structure.nodes
  const parent = new Map<string, string>()
  const walk = (id: string) => {
    for (const childId of nodes[id]?.childrenIds ?? []) {
      parent.set(childId, id)
      walk(childId)
    }
  }
  walk(component.structure.rootId)
  return (nodeId, state) => {
    let cur = parent.get(nodeId)
    while (cur) {
      const node = nodes[cur]
      if (node?.stateBindings?.some((b) => b.state === state)) return node
      cur = parent.get(cur)
    }
    return undefined
  }
}

function createEmitCtx(component: ComponentIR, options: EmitOptions): EmitCtx {
  const facetVar = options.foundations ? makeFacetVarResolver(options.foundations) : facetCssVar
  const sheet = new StyleSheet(facetVar)
  // A `when variant = Secondary` rule on a context-typed prop must select the value the
  // attribute carries, which is the context's public spelling (`contextPropAttrs` below). Any
  // other prop keeps the IR's value, which is also what its attribute carries.
  const groups = new Map((options.contextGroups ?? []).map((g) => [g.id, g]))
  sheet.setPropValueSpelling((prop, value) => {
    const p = (component.contract?.props ?? []).find((x) => x.name === prop)
    const group = p?.type.kind === 'context' ? groups.get(p.type.group) : undefined
    if (!group) return String(value)
    const id = contextOfValue(group, value)
    const name = id ? group.contexts.find((c) => c.id === id)?.name : undefined
    return name ? contextValue(name) : String(value)
  })
  const ctx: EmitCtx = {
    sheet,
    facetVar,
    usesIconComponent: false,
    usesIconNameType: false,
    usesMildaContext: false,
    deadConditions: [],
    props: new Map((component.contract?.props ?? []).map((p) => [p.name, p])),
    iconLib: options.icons,
    assets: options.assets,
    componentsById: new Map(Object.entries(options.componentsById ?? {})),
    nodes: component.structure.nodes,
    instances: new Set(),
    stateOwner: buildStateOwner(component),
    contextGroups: new Map((options.contextGroups ?? []).map((g) => [g.id, g])),
    eventNames: new Map((component.contract?.events ?? []).map((e) => [e.id, e.name])),
    eventPayloads: new Map(),
    surface: resolveSurface(component, options),
    // Planned up front for the same reason `a11y` is: the vertical emitters return long
    // before `emitComponent` reaches the generic path, and a plan computed down there would
    // be invisible to them.
    selectionAria: selectionAriaPlan(component),
    selection: null,
    selectionCond: null,
    stepper: null,
    slider: null,
    textEntry: null,
    // Planned here rather than part-way down `emitComponent`, where it used to sit. The
    // vertical emitters (date/time/colour picker, compound, disclosure, select, combobox,
    // menu) all return before that point, so they ran against an empty plan and would have
    // dropped `aria-labelledby`/`aria-describedby` silently the moment one of them reached
    // a labelling helper. Output over the whole example library is unchanged by moving it.
    a11y: planA11y(component),
  }
  // Resolving event payloads reads `eventNames` back off the context, so it can only run
  // once the object exists.
  ctx.eventPayloads = new Map(interfaceEventDefs(ctx, component).map((e) => [e.name, e.payload]))
  return ctx
}

function staticIconName(node: ComponentNode): string | undefined {
  const c = node.content
  if (c?.kind === 'static') return c.text || undefined
  if (c?.kind === 'dynamic') {
    const v = normalizeContentValue(c.default)
    if (v.kind === 'value') return v.value == null ? undefined : String(v.value) || undefined
  }
  return undefined
}

function hasIconModule(ctx: EmitCtx): boolean {
  return (ctx.iconLib?.icons.length ?? 0) > 0
}

function mildaContextImport(ctx: EmitCtx): string[] {
  return ctx.usesMildaContext ? [`import { useMildaContext } from './MildaContext'`] : []
}

function emissionEventName(ctx: EmitCtx, eventId: string): string {
  return ctx.eventNames.get(eventId) ?? eventId
}

function eventPayloadType(ctx: EmitCtx, name: string): PropType | undefined {
  return ctx.eventPayloads.get(name)
}

function instanceImport(ctx: EmitCtx): string[] {
  return [...ctx.instances].sort().map((n) => `import { ${n} } from './${n}'`)
}

interface A11yPlan {
  labelId: Map<string, string>

  controlId: Map<string, string>

  labelFor: Map<string, string>

  describedId: Map<string, string>

  needsUseId: boolean
}
function planA11y(component: ComponentIR): A11yPlan {
  const nodes = component.structure.nodes
  const labelId = new Map<string, string>()
  const controlId = new Map<string, string>()
  const labelFor = new Map<string, string>()
  const describedId = new Map<string, string>()
  let i = 0
  for (const n of Object.values(nodes)) {
    const target = n.a11y?.labelledBy
    if (!target || !nodes[target]) continue

    const label = activatingLabel(n, nodes)
    if (label && !labelFor.has(label.id)) {
      const idExpr = '`${_aid}-c' + i++ + '`'
      controlId.set(n.id, idExpr)
      labelFor.set(label.id, idExpr)
    } else if (!labelId.has(target)) {
      labelId.set(target, '`${_aid}-l' + i++ + '`')
    }
  }
  for (const n of Object.values(nodes)) {
    const target = n.a11y?.describedBy
    if (!target || !nodes[target] || describedId.has(target)) continue
    describedId.set(target, '`${_aid}-d' + i++ + '`')
  }
  return {
    labelId,
    controlId,
    labelFor,
    describedId,
    needsUseId: labelId.size > 0 || controlId.size > 0 || describedId.size > 0,
  }
}

function a11yAttrs(ctx: EmitCtx, node: ComponentNode): string {
  const a = node.a11y
  if (!a) return ''
  let out = ''
  if (a.name) out += ` aria-label={${contentValueExpr(a.name)}}`
  const cid = ctx.a11y.controlId.get(node.id)
  if (cid) out += ` id={${cid}}`
  else if (a.labelledBy && ctx.a11y.labelId.has(a.labelledBy)) {
    out += ` aria-labelledby={${ctx.a11y.labelId.get(a.labelledBy)}}`
  }
  if (a.describedBy && ctx.a11y.describedId.has(a.describedBy)) {
    out += ` aria-describedby={${ctx.a11y.describedId.get(a.describedBy)}}`
  }
  return out
}

function a11yLabelAttrs(ctx: EmitCtx, node: ComponentNode): string {
  let out = ''
  const forExpr = ctx.a11y.labelFor.get(node.id)
  if (forExpr) out += ` htmlFor={${forExpr}}`
  const idExpr = ctx.a11y.labelId.get(node.id) ?? ctx.a11y.describedId.get(node.id)
  if (idExpr) out += ` id={${idExpr}}`
  return out
}

function boundIconProp(node: ComponentNode): string | undefined {
  const c = node.content
  if (c?.kind === 'dynamic' && c.default.kind === 'bind') return c.default.propName
  return undefined
}

function iconModuleImport(ctx: EmitCtx): string[] {
  if (ctx.usesIconComponent) return [`import { Icon, type IconName } from './Icon'`]

  if (ctx.usesIconNameType) return [`import type { IconName } from './Icon'`]
  return []
}

function iconMaskUrl(ctx: EmitCtx, glyph: string): string | undefined {
  const resolved = resolveIcon(glyph, ctx.iconLib, ctx.assets)
  if (!resolved) return undefined
  if (resolved.kind === 'custom') return resolved.url
  if (resolved.svg) return `data:image/svg+xml,${encodeURIComponent(resolved.svg)}`
  return iconifySvgUrl(resolved.prefix, resolved.name)
}

const DEFAULT_CHECK_MASK_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
)}`

function iconDeliveryUrl(icon: Icon, assets: Record<string, { url?: string }>): string | undefined {
  if (icon.kind === 'custom') return assets[icon.assetId]?.url
  if (icon.svg) return `data:image/svg+xml,${encodeURIComponent(icon.svg)}`
  return iconifySvgUrl(icon.prefix, icon.name)
}

// The MildaContext shared module (0032 phase 4): a React context provider + hook holding
// the active foundations context selection (groupId → contextId). Components that gate on a
// context read it here. Emitted once per package (like Icon.tsx) when any component uses it;
// callers can skip it when no component gates on context.
export function toMildaContextModule(): string {
  return [
    `'use client'`,
    `import { createContext, useContext, type ReactNode } from 'react'`,
    ``,
    `// Active foundations context (0032): groupId -> contextId, e.g. { ColorScheme: 'dark' }.`,
    `// Mirror the data-* attributes that drive themed CSS so JS-gated components read the same`,
    `// selection. Set it once near your app root via <MildaProvider value={...}>.`,
    `export type MildaContexts = Record<string, string>`,
    ``,
    `const MildaContextValue = createContext<MildaContexts>({})`,
    ``,
    `export function MildaProvider({ value, children }: { value: MildaContexts; children: ReactNode }) {`,
    `  return <MildaContextValue.Provider value={value}>{children}</MildaContextValue.Provider>`,
    `}`,
    ``,
    `export function useMildaContext(): MildaContexts {`,
    `  return useContext(MildaContextValue)`,
    `}`,
    ``,
  ].join('\n')
}

function predHasContextLeaf(p: Predicate | undefined): boolean {
  if (!p) return false
  if (p.kind === 'cmp') return p.ref.kind === 'context'
  if (p.kind === 'not') return predHasContextLeaf(p.item)
  return p.items.some(predHasContextLeaf)
}

// Whether any of a component's predicates (presence / styling / content) gate on a
// foundations context - i.e. whether the package needs the MildaContext module.
export function componentUsesContext(ir: ComponentIR): boolean {
  for (const node of Object.values(ir.structure.nodes)) {
    if (predHasContextLeaf(node.presence)) return true
    for (const r of node.states ?? []) if (predHasContextLeaf(r.when)) return true
    const c = node.content
    if (c && c.kind === 'dynamic')
      for (const r of c.rules) if (predHasContextLeaf(coercePredicate(r.when))) return true
  }
  return false
}

export function toIconModule(
  lib: IconLibrary | undefined,
  assets: Record<string, { url?: string }> = {},
): string | null {
  const icons = lib?.icons ?? []
  if (icons.length === 0) return null

  const entries = new Map<string, string>()
  for (const icon of icons) {
    const key = iconLabel(icon)
    const url = iconDeliveryUrl(icon, assets)
    if (url && !entries.has(key)) entries.set(key, url)
  }
  if (entries.size === 0) return null
  const names = [...entries.keys()].sort()
  const union = names.map((n) => `  | ${JSON.stringify(n)}`).join('\n')
  const registry = names
    .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(entries.get(n))},`)
    .join('\n')

  const cdnBacked = names.filter((n) => !entries.get(n)!.startsWith('data:'))
  if (cdnBacked.length && typeof window === 'undefined') {
    console.warn(
      `[generate] ${cdnBacked.length} icon(s) resolve via the Iconify CDN at runtime ` +
        `(re-pin to vendor offline): ${cdnBacked.join(', ')}`,
    )
  }
  const cdnNote = cdnBacked.length
    ? [
        `// ⚠ NOT fully self-contained: the following glyph(s) load from the Iconify CDN`,
        `// at runtime - re-pin them in the icon library to vendor their SVG offline:`,
        ...cdnBacked.map((n) => `//   • ${n}`),
        ``,
      ]
    : []
  return [
    `import type { CSSProperties } from 'react'`,
    ``,
    ...cdnNote,
    `// Every curated icon in the design system, keyed by its name. Generated from the`,
    `// icon library - each glyph delivers as a self-contained CSS mask, no third-party`,
    `// icon runtime. Renaming an icon renames its key here.`,
    `export type IconName =`,
    union,
    ``,
    `const ICONS: Record<IconName, string> = {`,
    registry,
    `}`,
    ``,
    `export interface IconProps {`,
    `  name: IconName`,
    `  className?: string`,
    `  style?: CSSProperties`,
    `  // A meaningful label for a standalone icon. Omit for a decorative icon (the`,
    `  // default - hidden from assistive tech).`,
    `  label?: string`,
    `}`,
    ``,
    `// Paints the curated glyph as a currentColor-tinted mask, so it inherits the`,
    `// surrounding text color and scales with the font. Decorative by default.`,
    `export function Icon({ name, className, style, label }: IconProps) {`,
    `  const src = ICONS[name]`,
    `  return (`,
    `    <span`,
    `      className={className}`,
    `      role={label ? 'img' : undefined}`,
    `      aria-label={label}`,
    `      aria-hidden={label ? undefined : true}`,
    `      style={{`,
    `        display: 'inline-block',`,
    `        width: '1.15em',`,
    `        height: '1.15em',`,
    `        flex: 'none',`,
    `        backgroundColor: 'currentColor',`,
    '        WebkitMaskImage: `url("${src}")`,',
    '        maskImage: `url("${src}")`,',
    `        WebkitMaskRepeat: 'no-repeat',`,
    `        maskRepeat: 'no-repeat',`,
    `        WebkitMaskPosition: 'center',`,
    `        maskPosition: 'center',`,
    `        WebkitMaskSize: 'contain',`,
    `        maskSize: 'contain',`,
    `        ...style,`,
    `      }}`,
    `    />`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

const ICON_BOX_DECLS: StyleDecl[] = [
  { prop: 'display', value: 'inline-block' },
  { prop: 'width', value: '1.15em' },
  { prop: 'height', value: '1.15em' },
  { prop: 'flex', value: 'none' },
]

// The icon's color facet is `fill` (KIND_FACETS.icon). For a masked glyph the fill IS
// the mask paint (the solid color clipped to the glyph alpha), not a rectangle behind
// it - so resolve it here and drop the plain `background` the fill facet would emit.
// No fill set → inherit the surrounding text color, matching the editor preview.
function iconPaintColor(ctx: EmitCtx, facets: Record<string, string> | undefined): string {
  const fill = facets?.fill
  if (!fill) return 'currentColor'
  // Token first, literal second (proposal 0049), the order `facetDecls` reads every other facet in.
  return ctx.facetVar('color', fill) ?? (couldBeLiteral(fill) ? fill : 'currentColor')
}

function dropBackground(decls: StyleDecl[]): StyleDecl[] {
  return decls.filter((d) => d.prop !== 'background')
}

function iconMaskPaintDecls(url: string, paint = 'currentColor'): StyleDecl[] {
  const u = `url("${url}")`
  return [
    { prop: 'backgroundColor', value: paint },
    { prop: 'WebkitMaskImage', value: u },
    { prop: 'maskImage', value: u },
    { prop: 'WebkitMaskRepeat', value: 'no-repeat' },
    { prop: 'maskRepeat', value: 'no-repeat' },
    { prop: 'WebkitMaskPosition', value: 'center' },
    { prop: 'maskPosition', value: 'center' },
    { prop: 'WebkitMaskSize', value: 'contain' },
    { prop: 'maskSize', value: 'contain' },
  ]
}

function emitIcon(
  ctx: EmitCtx,
  node: ComponentNode,
  depth: number,
  keyAttr: string,
  overlays?: OverlayPlan,
): string {
  const pad = '  '.repeat(depth)
  const key = keyAttr ? ` ${keyAttr}` : ''
  const triggerFor = overlays?.triggers.get(node.id)
  const handlerAttr = emissionHandlers(
    ctx,
    node,
    triggerFor ? { onClick: [`${triggerFor.setter}((o) => !o)`] } : undefined,
  )

  const glyph = staticIconName(node)
  if (glyph) {
    const url = iconMaskUrl(ctx, glyph)
    if (url) {
      const glyphRule = (node.states ?? []).find((r) => r.glyph)
      const selUrl = glyphRule?.glyph ? iconMaskUrl(ctx, glyphRule.glyph) : undefined

      if (glyphRule && ctx.selectionCond && ctx.selectionAria?.itemRole === 'radio') {
        const cond = ctx.selectionCond
        const ring = [
          `boxSizing: 'border-box'`,
          `width: '1.05em'`,
          `height: '1.05em'`,
          `flex: 'none'`,
          `borderRadius: '50%'`,
          `border: '2px solid'`,
          `borderColor: ${cond} ? 'var(--ds-color-accent)' : 'var(--ds-color-border-strong)'`,
          `background: ${cond} ? 'radial-gradient(circle, var(--ds-color-accent) 0 3px, transparent 4px)' : 'transparent'`,
        ]
        return `${pad}<span${key} style={{ ${ring.join(', ')} }}${handlerAttr} aria-hidden />`
      }
      if (selUrl && ctx.selectionCond) {
        const cond = ctx.selectionCond
        const styleA = styleAttrsFor(ctx, node, [
          ...ICON_BOX_DECLS,
          ...dropBackground(nodeStyleDecls(ctx, node, 'span')),
          ...iconMaskPaintDecls(url, iconPaintColor(ctx, node.facets)),
        ])
        const mask = `${cond} ? 'url("${selUrl}")' : undefined`
        const ink = glyphRule!.facets?.ink
        const parts = [`WebkitMaskImage: ${mask}`, `maskImage: ${mask}`]
        if (ink) parts.push(`backgroundColor: ${cond} ? 'var(--ds-color-${ink})' : undefined`)
        return `${pad}<span${key}${styleA} style={{ ${parts.join(', ')} }}${handlerAttr} aria-hidden />`
      }
      const styleA = styleAttrsFor(ctx, node, [
        ...ICON_BOX_DECLS,
        ...dropBackground(nodeStyleDecls(ctx, node, 'span')),
        ...iconMaskPaintDecls(url, iconPaintColor(ctx, node.facets)),
      ])
      return `${pad}<span${key}${styleA}${handlerAttr} aria-hidden />`
    }
  }
  const boundProp = boundIconProp(node)
  if (boundProp) {
    const styleA = styleAttrsFor(ctx, node, [
      ...ICON_BOX_DECLS,
      ...nodeStyleDecls(ctx, node, 'span'),
    ])

    if (!hasIconModule(ctx))
      return `${pad}{${boundProp} && <span${key}${styleA}${handlerAttr} aria-hidden />}`
    ctx.usesIconComponent = true

    const iconEl = `<Icon name={${boundProp} as IconName}${handlerAttr ? '' : key}${styleA} />`
    return handlerAttr
      ? `${pad}{${boundProp} && <span${key}${handlerAttr} style={{ display: 'inline-flex' }}>${iconEl}</span>}`
      : `${pad}{${boundProp} && ${iconEl}}`
  }

  const styleA = styleAttrsFor(ctx, node, [...ICON_BOX_DECLS, ...nodeStyleDecls(ctx, node, 'span')])
  return `${pad}<span${key}${styleA}${handlerAttr} aria-hidden />`
}

function iconSpan(ctx: EmitCtx, node: ComponentNode): string {
  const glyph = staticIconName(node)
  if (glyph) {
    const url = iconMaskUrl(ctx, glyph)
    if (url) {
      const styleA = styleAttrsFor(ctx, node, [
        ...ICON_BOX_DECLS,
        ...dropBackground(nodeStyleDecls(ctx, node, 'span')),
        ...iconMaskPaintDecls(url, iconPaintColor(ctx, node.facets)),
      ])
      return `<span${styleA} aria-hidden />`
    }
  }
  const styleA = styleAttrsFor(ctx, node, [...ICON_BOX_DECLS, ...nodeStyleDecls(ctx, node, 'span')])
  return `<span${styleA} aria-hidden />`
}

function styleAttrsFor(ctx: EmitCtx, node: ComponentNode, baseDecls: StyleDecl[]): string {
  const b = ctx.sheet.register(node, baseDecls, layoutParentOf(ctx, node).parent)
  const cls = b.className ? ` className={styles.${b.className}}` : ''
  const data = b.dataAttrs.map((d) => ` ${d.attr}={${bindingExpr(d.prop)}}`).join('')
  return cls + data
}

function stylesImport(ctx: EmitCtx, name: string): string[] {
  return ctx.sheet.isEmpty ? [] : [`import styles from './${name}.module.css'`]
}

function checkedRuleDecls(ctx: EmitCtx, node: ComponentNode): StyleDecl[] {
  return (node.states ?? [])
    .filter((r) => Object.keys(r.props).length === 0 && r.states.includes('checked'))
    .flatMap((r) => [
      ...layoutVarDecls(r.layout, layoutParentOf(ctx, node)),
      ...facetDecls(r.facets, ctx.facetVar),
    ])
}

const durationVarRef = (id?: string) => facetCssVar('duration', id)
const easingVarRef = (id?: string) => (id ? cssVarRef(easingVarName(id)) : undefined)

const controlTiming = (t: ControlTransition): StyleDecl[] => {
  const props = controlTransitionProps(t.aspects)
  const d = timingTransitionDecl(props, t.duration, t.easing, durationVarRef, easingVarRef)
  return d ? [d] : []
}

function toggleChangeHandler(ctx: EmitCtx, node: ComponentNode): string {
  const em = (node.emits ?? []).find((e) => e.on === 'change' || e.on === 'activate')
  const name = em ? emissionEventName(ctx, em.eventId) : ''
  if (!name) return ''
  const checked = 'e.target.checked'
  const arg = controlStateArg(ctx, em, checked)
  // Only bind the event param when the payload actually reads it.
  const param = arg === checked ? '(e)' : '()'
  return ` onChange={${param} => on${pascalCase(name)}?.(${arg})}`
}

function emitCheckboxParts(
  ctx: EmitCtx,
  root: ComponentNode,
  indicator: ComponentNode,
  glyph: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  const pad = '  '.repeat(depth)

  const bind = root.valueBinding ? bindingExpr(root.valueBinding.propName) : null

  const indicatorBase = [
    ...CHECKBOX_INDICATOR_DECLS,
    ...layoutVarDecls(indicator.layout, layoutParentOf(ctx, indicator)),
    ...facetDecls(indicator.facets, ctx.facetVar),
    ...controlTiming(CHECKBOX_INDICATOR_TRANSITION),
  ]

  const glyphName = glyph ? staticIconName(glyph) : undefined

  const glyphMaskUrl =
    (glyphName ? iconMaskUrl(ctx, glyphName) : iconMaskUrl(ctx, 'check')) ?? DEFAULT_CHECK_MASK_URL
  const glyphTiming = controlTiming(CHECKBOX_GLYPH_TRANSITION)
  const glyphDecls = [
    ...CHECKBOX_GLYPH_DECLS,
    ...(glyph
      ? dropBackground([
          ...layoutVarDecls(glyph.layout, layoutParentOf(ctx, glyph)),
          ...facetDecls(glyph.facets, ctx.facetVar),
        ])
      : []),
    ...glyphTiming,
    ...iconMaskPaintDecls(glyphMaskUrl, iconPaintColor(ctx, glyph?.facets)),
  ]
  const cls = ctx.sheet.checkbox(root, {
    rootDecls: CHECKBOX_ROOT_DECLS,
    controlDecls: SR_ONLY_DECLS,
    indicatorBase,
    indicatorChecked: checkedRuleDecls(ctx, indicator),
    glyphDecls,
    glyphChecked: CHECKBOX_GLYPH_CHECKED_DECLS,
    focusDecls: CHECKBOX_FOCUS_DECLS,
    disabledDecls: CHECKBOX_DISABLED_DECLS,
  })
  const key = keyAttr ? ` ${keyAttr}` : ''
  const checkedA = bind ? ` defaultChecked={${bind}}` : ''
  const handlerAttr = toggleChangeHandler(ctx, root)

  const nameExpr = root.a11y?.name ? contentValueExpr(root.a11y.name) : null
  const ariaA = nameExpr
    ? a11yAttrs(ctx, { ...root, a11y: { ...root.a11y, name: undefined } })
    : a11yAttrs(ctx, root)
  const labelLine = nameExpr ? [`${pad}  <span>{${nameExpr}}</span>`] : []
  return [
    `${pad}<label${key} className={styles.${cls.root}}>`,
    `${pad}  <input type="checkbox" className={styles.${cls.control}}${ariaA}${handlerAttr}${checkedA} />`,
    `${pad}  <span className={styles.${cls.indicator}} aria-hidden>`,
    `${pad}    <span className={styles.${cls.glyph}} aria-hidden />`,
    `${pad}  </span>`,
    ...labelLine,
    `${pad}</label>`,
  ].join('\n')
}

function emitCheckbox(
  ctx: EmitCtx,
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  keyAttr: string,
): string {
  return emitCheckboxParts(
    ctx,
    node,
    node,
    checkboxGlyphChild(node, component.structure.nodes),
    depth,
    keyAttr,
  )
}

function emitMaterializedCheckbox(
  ctx: EmitCtx,
  node: ComponentNode,
  indicator: ComponentNode,
  glyph: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  return emitCheckboxParts(ctx, node, indicator, glyph, depth, keyAttr)
}

function emitSwitchParts(
  ctx: EmitCtx,
  root: ComponentNode,
  track: ComponentNode,
  thumb: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  const pad = '  '.repeat(depth)
  const bind = root.valueBinding ? bindingExpr(root.valueBinding.propName) : null

  const trackBase = [
    ...SWITCH_TRACK_DECLS,
    ...layoutVarDecls(track.layout, layoutParentOf(ctx, track)),
    ...facetDecls(track.facets, ctx.facetVar),
    ...controlTiming(SWITCH_TRACK_TRANSITION),
  ]

  const thumbDecls = [
    ...SWITCH_THUMB_DECLS,
    ...(thumb
      ? [
          ...layoutVarDecls(thumb.layout, layoutParentOf(ctx, thumb)),
          ...facetDecls(thumb.facets, ctx.facetVar),
        ]
      : []),
    ...controlTiming(SWITCH_THUMB_TRANSITION),
  ]
  const thumbChecked = [
    ...SWITCH_THUMB_CHECKED_DECLS,
    ...(thumb ? checkedRuleDecls(ctx, thumb) : []),
  ]
  const cls = ctx.sheet.switchControl(root, {
    rootDecls: CHECKBOX_ROOT_DECLS,
    controlDecls: SR_ONLY_DECLS,
    trackBase,
    trackChecked: checkedRuleDecls(ctx, track),
    thumbDecls,
    thumbChecked,
    focusDecls: CHECKBOX_FOCUS_DECLS,
    disabledDecls: CHECKBOX_DISABLED_DECLS,
  })
  const key = keyAttr ? ` ${keyAttr}` : ''
  const checkedA = bind ? ` defaultChecked={${bind}}` : ''
  const handlerAttr = toggleChangeHandler(ctx, root)

  const nameExpr = root.a11y?.name ? contentValueExpr(root.a11y.name) : null
  const ariaA = nameExpr
    ? a11yAttrs(ctx, { ...root, a11y: { ...root.a11y, name: undefined } })
    : a11yAttrs(ctx, root)
  const labelLine = nameExpr ? [`${pad}  <span>{${nameExpr}}</span>`] : []
  return [
    `${pad}<label${key} className={styles.${cls.root}}>`,
    `${pad}  <input type="checkbox" role="switch" className={styles.${cls.control}}${ariaA}${handlerAttr}${checkedA} />`,
    `${pad}  <span className={styles.${cls.track}} aria-hidden>`,
    `${pad}    <span className={styles.${cls.thumb}} />`,
    `${pad}  </span>`,
    ...labelLine,
    `${pad}</label>`,
  ].join('\n')
}

function emitSwitch(ctx: EmitCtx, node: ComponentNode, depth: number, keyAttr: string): string {
  return emitSwitchParts(ctx, node, node, undefined, depth, keyAttr)
}

function emitMaterializedSwitch(
  ctx: EmitCtx,
  node: ComponentNode,
  track: ComponentNode,
  thumb: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  return emitSwitchParts(ctx, node, track, thumb, depth, keyAttr)
}

interface OverlayInfo {
  surfaceId: string
  state: string
  setter: string
  anchorId: string | null
  kind: 'popover' | 'menu' | 'dialog' | 'sheet'
  modal: boolean
  dismissable: boolean
  // How the trigger presents it. `context` is secondary activation on the component's own
  // region (right-click on web, long-press on touch) - the ContextMenu case, where the
  // anchor is the root rather than a trigger part.
  openOn: OpenTrigger
  // A browsable surface announces its WAI-ARIA pattern, and its repeated item announces
  // the matching one. Both null where the surface is a plain container.
  surfaceRole?: string
  itemRole?: string
  itemNodeId?: string
  // Set when the surface needs an element handle of its own - today only for the
  // click-outside dismissal a context menu cannot do without.
  surfaceRef?: string
  // What the trigger announces. A hover-presented hint (Tooltip) is not a popup its
  // trigger expands, so it announces nothing - the same split `planBehavior` draws for
  // the canvas.
  announces: { haspopup?: 'menu' | 'dialog'; expanded: boolean }
}

function overlayAnnounces(
  kind: OverlayInfo['kind'],
  openOn: OpenTrigger,
): OverlayInfo['announces'] {
  if (openOn === 'hover') return { expanded: false }
  // A context region is not a control the user can see is expanded - there is nothing to
  // put the state on. The menu announces itself when it opens instead.
  if (openOn === 'context') return { expanded: false }
  if (kind === 'menu') return { haspopup: 'menu', expanded: true }
  if (kind === 'dialog' || kind === 'sheet') return { haspopup: 'dialog', expanded: true }
  return { expanded: true }
}
interface OverlayPlan {
  surfaces: Map<string, OverlayInfo>
  triggers: Map<string, OverlayInfo>
  // nodeId -> the ARIA role its repeated item announces.
  items: Map<string, string>
}

function planOverlays(component: ComponentIR): OverlayPlan {
  const surfaces = new Map<string, OverlayInfo>()
  const triggers = new Map<string, OverlayInfo>()
  const items = new Map<string, string>()
  let i = 0
  for (const n of Object.values(component.structure.nodes)) {
    if (!isOverlaySurface(n)) continue
    const mode = presentationMode(n) as OverlayInfo['kind']
    const beh = effectiveBehaviors(n)
    const om = beh.find(
      (b): b is OverlayManagementBehavior & { id: string } => b.kind === 'overlayManagement',
    )
    const dismissable =
      beh.some((b) => b.kind === 'clickaway') ||
      beh.some((b) => b.kind === 'focusTrap' && b.allowEscapeKey)
    const idx = i++
    const info: OverlayInfo = {
      surfaceId: n.id,
      state: `open${idx}`,
      setter: `setOpen${idx}`,
      anchorId: om?.anchorNodeId ?? null,
      kind: mode,
      modal: mode === 'dialog' || mode === 'sheet',
      dismissable,
      openOn: 'activate',
      announces: overlayAnnounces(mode, 'activate'),
    }
    surfaces.set(n.id, info)
    if (info.anchorId) triggers.set(info.anchorId, info)
  }

  const plan = planBehavior(component)
  // Fold in the popup plans this path realizes: trigger-owned activate-opened surfaces,
  // and context-opened ones, whose "trigger" is the component's own region. Inline
  // disclosures and standalone menus keep their static generic emission until they get a
  // vertical realization here.
  //
  // Context menus used to be excluded, which meant their surface never got an open state
  // and fell through to the static path - so a generated ContextMenu shipped as a
  // permanently-open menu with no way to open, close or announce itself.
  if (
    plan?.kind === 'disclosure' &&
    plan.surfaceId &&
    !surfaces.has(plan.surfaceId) &&
    plan.surfaceKind !== 'inline' &&
    !plan.standalone
  ) {
    const idx = i++
    const info: OverlayInfo = {
      surfaceId: plan.surfaceId,
      state: `open${idx}`,
      setter: `setOpen${idx}`,
      anchorId: plan.triggerId ?? null,
      kind: plan.surfaceKind as OverlayInfo['kind'],
      modal: plan.surfaceKind === 'dialog' || plan.surfaceKind === 'sheet',
      dismissable: plan.dismissable ?? true,
      openOn: plan.openOn,
      announces: overlayAnnounces(plan.surfaceKind as OverlayInfo['kind'], plan.openOn),
    }
    // The ARIA contract, taken from the same plan the canvas renders from. Scoped to the
    // context case because that is the one this path newly realizes; widening it to the
    // activate-opened surfaces here would change output they already agree on.
    if (plan.openOn === 'context' && plan.browsable) {
      info.surfaceRole = plan.selectable ? 'listbox' : 'menu'
      info.surfaceRef = `_surf${idx}Ref`
      if (plan.optionId) {
        info.itemRole = plan.selectable ? 'option' : 'menuitem'
        info.itemNodeId = plan.optionId
        items.set(plan.optionId, info.itemRole)
      }
    }
    surfaces.set(info.surfaceId, info)
    if (info.anchorId) triggers.set(info.anchorId, info)
  }
  return { surfaces, triggers, items }
}

interface SelectionInfo {
  itemNodeId: string
  alias: string
  field: string
  current: string
  setter: string
  itemsProp?: string
  event?: string
}

function selectionAriaPlan(component: ComponentIR): SelectionPlan | null {
  const plan = planBehavior(component)
  return plan?.kind === 'selection' ? plan : null
}

// The container's roving-arrow handler exists only when there is a runtime list to rove
// over: a bound `value` plus a repeat sourced from a prop.
function usesSelectionNav(ctx: EmitCtx): boolean {
  return !!ctx.selectionAria && !!ctx.selection?.itemsProp
}

function selectionContainerAttrs(ctx: EmitCtx, node: ComponentNode): string {
  const plan = ctx.selectionAria
  if (!plan || node.id !== plan.containerId) return ''
  return ` role="${plan.containerRole}"${usesSelectionNav(ctx) ? ' onKeyDown={_onSelKey}' : ''}`
}

// The picked state of a selection item. With a bound value it is the live comparison
// against the tracked one; without, there is no runtime selection to compare, so the
// archetype's birth state stands in - a tablist must announce a selected tab even before
// anyone wires it (WAI-ARIA), which is exactly what `defaultSelected` records.
function selectionItemAttrs(
  ctx: EmitCtx,
  node: ComponentNode,
  selItem: SelectionInfo | null,
): string {
  const plan = ctx.selectionAria
  if (!plan) return ''
  const attrs = (checked: string, tabIndex: string) =>
    ` role="${plan.itemRole}" ${plan.checkedAttr}={${checked}} tabIndex={${tabIndex}}`
  if (selItem) {
    const cond = `${selItem.current} === ${selItem.alias}.${selItem.field}`
    return attrs(cond, `${cond} ? 0 : -1`)
  }
  // A bound selection owns the item element wherever it sits; never emit both.
  if (ctx.selection || node.id !== plan.itemId) return ''
  if (node.repeat) {
    const first = `${node.repeat.itemAlias || 'item'}I === 0`
    return attrs(plan.defaultSelected != null ? first : 'false', `${first} ? 0 : -1`)
  }
  return attrs(String(plan.defaultSelected != null), '0')
}

// Tabs: the region the tab list controls. The id wiring the preview also emits
// (aria-controls/aria-labelledby) has no static counterpart here - the IR models ONE panel
// for a repeat of N tabs, so there is no correct tab to name it after until the panel
// becomes per-item.
function selectionPanelAttrs(ctx: EmitCtx, node: ComponentNode): string {
  const plan = ctx.selectionAria
  return plan?.panelId && node.id === plan.panelId ? ' role="tabpanel"' : ''
}

function planSelection(ctx: EmitCtx, component: ComponentIR): SelectionInfo | null {
  const valueProp = (component.contract?.props ?? []).find(
    (p) => p.name === 'value' && (p.type.kind === 'string' || p.type.kind === 'ref'),
  )
  if (!valueProp) return null
  for (const n of Object.values(component.structure.nodes)) {
    if (!n.repeat) continue
    const alias = n.repeat.itemAlias || 'item'
    const em = (n.emits ?? []).find(
      (e) =>
        (e.on === 'activate' || e.on === 'select') &&
        e.payload?.kind === 'bind' &&
        e.payload.propName.startsWith(`${alias}.`),
    )
    if (!em || em.payload?.kind !== 'bind') continue
    return {
      itemNodeId: n.id,
      alias,
      field: em.payload.propName.slice(alias.length + 1),
      current: '_selected',
      setter: 'setSelValue',
      itemsProp: n.repeat.source.kind === 'prop' ? camelCase(n.repeat.source.propName) : undefined,
      event: emissionEventName(ctx, em.eventId),
    }
  }
  return null
}

interface ToggleInfo {
  prop: string
  event?: string
  // Argument the event handler is called with, already reconciled with its declared payload
  // ('' when the event declares none). See `eventArg`.
  eventArg: string
  stateVar: string
  setter: string
  dataState: string
}
function planToggle(ctx: EmitCtx, component: ComponentIR): ToggleInfo | null {
  const root = component.structure.nodes[component.structure.rootId]
  if (!root) return null
  const binding = (root.stateBindings ?? []).find(
    (b) => b.state === 'selected' || b.state === 'pressed' || b.state === 'checked',
  )
  if (!binding) return null
  const prop = (component.contract?.props ?? []).find(
    (p) => p.name === binding.propName && p.type.kind === 'boolean',
  )
  if (!prop) return null
  const em = (root.emits ?? []).find((e) => e.on === 'activate' || e.on === 'change')
  const id = camelCase(binding.propName)
  const event = em ? emissionEventName(ctx, em.eventId) : undefined
  // The toggle's own next state is the natural payload, but only if the event is declared to
  // take a boolean - otherwise honour what the emission authored (or nothing at all).
  return {
    prop: id,
    event,
    eventArg: controlStateArg(ctx, em, 'next'),
    stateVar: `_${id}`,
    setter: `_set${pascalCase(binding.propName)}`,
    dataState: binding.state,
  }
}

interface StepperInfo {
  prop: string
  inputId: string
  decId: string
  incId: string
  event?: string
  hasMin: boolean
  hasMax: boolean
  hasStep: boolean
}
function planStepper(component: ComponentIR): StepperInfo | null {
  const all = Object.values(component.structure.nodes)
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const dec = all.find((n) => leaf(n) === 'decrement')
  const inc = all.find((n) => leaf(n) === 'increment')
  const input = all.find(
    (n) => n.kind === 'input' && effectiveValueType(n)?.kind === 'number' && n.valueBinding,
  )
  if (!dec || !inc || !input?.valueBinding) return null
  const props = component.contract?.props ?? []
  const event = (component.contract?.events ?? []).find((e) => e.payload?.kind === 'number')?.name
  return {
    prop: camelCase(input.valueBinding.propName),
    inputId: input.id,
    decId: dec.id,
    incId: inc.id,
    event,
    hasMin: props.some((p) => p.name === 'min'),
    hasMax: props.some((p) => p.name === 'max'),
    hasStep: props.some((p) => p.name === 'step'),
  }
}

interface TextEntryInfo {
  inputId: string
  prop: string
  event?: string
  clearId?: string
  clearEvent?: string
}
function planTextEntry(ctx: EmitCtx, component: ComponentIR): TextEntryInfo | null {
  const all = Object.values(component.structure.nodes)
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const input = all.find((n) => {
    if (n.kind !== 'input' || !n.valueBinding) return false
    const vt = effectiveValueType(n)
    return vt?.kind === 'string'
  })
  if (!input?.valueBinding) return null
  const em = (input.emits ?? []).find((e) => e.on === 'input' || e.on === 'change')
  const clear = all.find((n) => leaf(n) === 'clear')
  const clearEm = clear ? (clear.emits ?? [])[0] : undefined
  return {
    inputId: input.id,
    prop: camelCase(input.valueBinding.propName),
    event: em ? emissionEventName(ctx, em.eventId) : undefined,
    clearId: clear?.id,
    clearEvent: clearEm ? emissionEventName(ctx, clearEm.eventId) : undefined,
  }
}

interface SliderInfo {
  prop: string
  trackId: string
  rangeId?: string
  thumbId: string
  valueId?: string
  event?: string
  hasMin: boolean
  hasMax: boolean
  hasStep: boolean
  hasShowValue: boolean
  hasDisabled: boolean
}
function planSlider(component: ComponentIR): SliderInfo | null {
  const all = Object.values(component.structure.nodes)
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const thumb = all.find((n) => leaf(n) === 'thumb')
  const track = all.find((n) => leaf(n) === 'track')
  const props = component.contract?.props ?? []
  const valueProp = props.find((p) => p.name === 'value' && p.type.kind === 'number')
  if (!thumb || !track || !valueProp) return null
  return {
    prop: 'value',
    trackId: track.id,
    rangeId: all.find((n) => leaf(n) === 'range')?.id,
    thumbId: thumb.id,
    valueId: all.find((n) => leaf(n) === 'value')?.id,
    event: (component.contract?.events ?? []).find((e) => e.payload?.kind === 'number')?.name,
    hasMin: props.some((p) => p.name === 'min'),
    hasMax: props.some((p) => p.name === 'max'),
    hasStep: props.some((p) => p.name === 'step'),
    hasShowValue: props.some((p) => p.name === 'showValue'),
    hasDisabled: props.some((p) => p.name === 'disabled'),
  }
}

// A prop typed by a context group selects that context for its own instance (proposal 0001 §3),
// and the DOM already has the mechanism: the theme stylesheet keys a block of token overrides on
// `[data-<group>="<context>"]`, so setting the attribute on the component's own root re-points
// every token that aliases by the group - for this instance, without a single extra CSS rule from
// this emitter. That is what makes `variant="soft"` repaint a Button rather than being a prop the
// component destructures and ignores.
function contextPropAttrs(ctx: EmitCtx, component: ComponentIR): string {
  return (component.contract?.props ?? [])
    .flatMap((p) => {
      if (p.type.kind !== 'context') return []
      const group = ctx.contextGroups.get(p.type.group)
      if (!group) return []
      // A declared default is the system-wide value (0051 §5), so an unset prop falls back to it;
      // with no default the attribute is simply absent and the ambient selection stands.
      const fallback = contextLiteral(group, p.default)
      const expr = fallback ? `${bindingExpr(p.name)} ?? ${fallback}` : bindingExpr(p.name)
      return [` ${contextDataAttr(group.name)}={${expr}}`]
    })
    .join('')
}

/**
 * A context value as this target spells it, quoted - or undefined when it names no context of the
 * group. The IR holds the author's name (`Soft`); the generated API's union is `"soft"`, so a
 * value written out verbatim would not typecheck against the prop it is passed to.
 */
function contextLiteral(group: ContextGroup, value: unknown): string | undefined {
  const id = contextOfValue(group, value)
  const name = id ? group.contexts.find((c) => c.id === id)?.name : undefined
  return name ? JSON.stringify(contextValue(name)) : undefined
}

const BINDABLE_DATA_STATES = new Set(['selected', 'active', 'error', 'loading', 'success'])
function stateBindingAttrs(node: ComponentNode): string {
  return (node.stateBindings ?? [])
    .filter((b) => BINDABLE_DATA_STATES.has(b.state))
    .map((b) => ` data-${b.state}={${bindingExpr(b.propName)} ? '' : undefined}`)
    .join('')
}

function payloadFallback(t: PropType, def?: PropValue): string | null {
  switch (t.kind) {
    case 'array':
      return '[]'
    case 'object':
    case 'record':
      return '{}'
    case 'number':
      return def !== undefined ? JSON.stringify(def) : '0'
    case 'boolean':
      return def !== undefined ? JSON.stringify(def) : 'false'
    case 'string':
    case 'enum':
    case 'ref':
      return def !== undefined ? JSON.stringify(def) : "''"
    default:
      return def !== undefined ? JSON.stringify(def) : null
  }
}

// A value of the declared payload type to pass when the call site has nothing authored to
// hand over. `payloadFallback` covers the plain kinds; an enum needs a member of its own
// union, and anything with no neutral literal takes `undefined` (assignable to any/unknown
// and to an optional param) - the point is to keep the call's ARITY, not to invent data.
function neutralPayload(t: PropType): string {
  if (t.kind === 'enum') return t.values.length ? JSON.stringify(t.values[0]) : 'undefined'
  if (t.kind === 'literal') return JSON.stringify(t.value)
  return payloadFallback(t) ?? 'undefined'
}

// What an emission itself authors as its payload ('' when it authors none), with an optional
// prop's `undefined` filled in so a bound value still satisfies the payload param.
function authoredPayload(ctx: EmitCtx, em: EventEmission | undefined): string {
  if (!em?.payload) return ''
  let expr = contentValueExpr(em.payload)
  if (em.payload.kind === 'bind') {
    const p = ctx.props.get(em.payload.propName)
    if (p && !p.required) {
      const fb = payloadFallback(p.type, p.default)
      if (fb !== null) expr = `${expr} ?? ${fb}`
    }
  }
  return expr
}

// Reconcile a handler call's argument with the signature the interface DECLARES for that
// event: no declared payload ⇒ no argument, a declared payload ⇒ always one. Emitting a
// mismatch is not a runtime nicety - it fails `tsc` when the package is released.
function eventArg(ctx: EmitCtx, eventName: string, authored: string): string {
  const declared = eventPayloadType(ctx, eventName)
  if (!declared) return ''
  return authored || neutralPayload(declared)
}

// The argument a self-managing control (toggle, text entry, …) hands its change event: the new
// value it just computed, but only where the declared payload can actually take it. Otherwise
// the event gets whatever the emission authored, reconciled by `eventArg`.
function controlEventArg(
  ctx: EmitCtx,
  eventName: string | undefined,
  value: string,
  kind: PropType['kind'],
  em?: EventEmission,
): string {
  if (!eventName) return ''
  if (eventPayloadType(ctx, eventName)?.kind === kind) return value
  return eventArg(ctx, eventName, authoredPayload(ctx, em))
}

function controlStateArg(ctx: EmitCtx, em: EventEmission | undefined, state: string): string {
  return controlEventArg(
    ctx,
    em ? emissionEventName(ctx, em.eventId) : undefined,
    state,
    'boolean',
    em,
  )
}

function emissionHandlers(
  ctx: EmitCtx,
  node: ComponentNode,
  extra?: Record<string, string[]>,
): string {
  const byHandler = new Map<string, { stmts: string[]; needsEvent: boolean }>()
  const add = (handler: string, stmt: string, needsEvent = false) => {
    const entry = byHandler.get(handler) ?? { stmts: [], needsEvent: false }
    entry.stmts.push(stmt)
    entry.needsEvent = entry.needsEvent || needsEvent
    byHandler.set(handler, entry)
  }
  if (extra) for (const [h, stmts] of Object.entries(extra)) for (const s of stmts) add(h, s)
  for (const e of node.emits ?? []) {
    const handler = reactHandlerProp(e.on)
    const name = emissionEventName(ctx, e.eventId)
    const fn = `on${pascalCase(name)}`
    const payload = authoredPayload(ctx, e)

    // A native-named handler on a DOM-event surface isn't in our interface at all (it comes
    // from the spread React props), so it keeps forwarding the event object.
    const reuseNative =
      (ctx.surface.domEvents || ctx.surface.nativeAttrs) && !payload && NATIVE_HANDLERS.has(fn)
    add(handler, `${fn}?.(${reuseNative ? 'e' : eventArg(ctx, name, payload)})`, reuseNative)
  }
  return [...byHandler]
    .map(([h, { stmts, needsEvent }]) => {
      const param = needsEvent ? '(e)' : '()'
      return stmts.length === 1
        ? ` ${h}={${param} => ${stmts[0]}}`
        : ` ${h}={${param} => { ${stmts.join('; ')} }}`
    })
    .join('')
}

function emitChild(
  ctx: EmitCtx,
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  overlays?: OverlayPlan,
): string | null {
  if (!node.repeat) {
    const el = emitElement(ctx, node, component, depth, '', overlays)
    return el === null ? null : wrapPresence(ctx, node, el, '  '.repeat(depth))
  }

  const pad = '  '.repeat(depth)
  const alias = node.repeat.itemAlias || 'item'
  const idx = `${alias}I`

  const src = repeatItemsExpr(node.repeat.source)
  const el = emitElement(ctx, node, component, depth + 1, `key={${idx}}`, overlays)
  if (el === null) return null
  // Guard inside the map so a per-item presence keyed on the item alias resolves. The
  // arrow returns a bare expression, so no JSX braces around the guard here.
  const guarded = wrapPresence(ctx, node, el, '  '.repeat(depth + 1), false)
  return `${pad}{${src}.map((${alias}, ${idx}) => (\n${guarded}\n${pad}))}`
}

function childrenJsx(
  ctx: EmitCtx,
  parent: ComponentNode,
  component: ComponentIR,
  depth: number,
  overlays?: OverlayPlan,
): string[] {
  const children = childrenOf(parent, component)
  const repeatIdx = children.findIndex((c) => c.repeat)
  const sepIdx = children.findIndex((c) => leafOf(c) === 'separator' && !c.repeat)
  const interleave = repeatIdx >= 0 && sepIdx > repeatIdx
  const sepNode = interleave ? children[sepIdx] : null

  const out: string[] = []
  for (const c of children) {
    if (c === sepNode) continue
    if (interleave && c.repeat) {
      const s = emitRepeatWithSeparator(ctx, c, sepNode!, component, depth, overlays)
      if (s) out.push(s)
      continue
    }
    const s = emitChild(ctx, c, component, depth, overlays)
    if (s !== null) out.push(s)
  }
  return out
}

function emitRepeatWithSeparator(
  ctx: EmitCtx,
  node: ComponentNode,
  sep: ComponentNode,
  component: ComponentIR,
  depth: number,
  overlays?: OverlayPlan,
): string | null {
  const pad = '  '.repeat(depth)
  const alias = node.repeat!.itemAlias || 'item'
  const idx = `${alias}I`
  const src = repeatItemsExpr(node.repeat!.source)
  const el = emitElement(ctx, node, component, depth + 1, `key={\`i\${${idx}}\`}`, overlays)
  const sepEl = emitElement(ctx, sep, component, depth + 1, `key={\`s\${${idx}}\`}`, overlays)
  if (el === null) return null
  const guarded = wrapPresence(ctx, node, el, '  '.repeat(depth + 1), false)
  return `${pad}{${src}.map((${alias}, ${idx}) => [\n${guarded},\n${pad}  ${idx} < ${src}.length - 1 ? (\n${sepEl}\n${pad}  ) : null,\n${pad}])}`
}

function emitElement(
  ctx: EmitCtx,
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  keyAttr: string,
  overlays?: OverlayPlan,
): string | null {
  const pad = '  '.repeat(depth)
  const tag = resolveTag(node, component)

  const surface = overlays?.surfaces.get(node.id)
  if (surface && overlays) return emitOverlaySurface(ctx, node, component, depth, surface, overlays)

  if ((node.kind === 'icon' || node.kind === 'content') && !node.facets) return null

  if (node.kind === 'foreign') {
    const code = node.foreign?.code?.trim()
    return code ? `${pad}${code}` : null
  }

  if (node.kind === 'instance') {
    const ref = node.instance
    const target = ref ? ctx.componentsById.get(ref.componentId) : undefined
    if (!target) return null
    const name = componentName(target)
    ctx.instances.add(name)
    const instKey = keyAttr ? ` ${keyAttr}` : ''
    const props = (ref!.props ?? [])
      .filter((p) => p.name)
      .map((p) => ` ${camelCase(p.name)}={${instancePropExpr(ctx, target, p.name, p.value)}}`)
      .join('')
    return `${pad}<${name}${instKey}${props} />`
  }

  const toggleVariant = customToggleVariant(node)
  if (toggleVariant === 'switch') return emitSwitch(ctx, node, depth, keyAttr)
  if (toggleVariant === 'checkbox') return emitCheckbox(ctx, node, component, depth, keyAttr)

  const parts = materializedToggleParts(node, component.structure.nodes)
  if (parts?.variant === 'switch' && parts.track)
    return emitMaterializedSwitch(ctx, node, parts.track, parts.thumb, depth, keyAttr)
  if (parts?.variant === 'checkbox' && parts.indicator)
    return emitMaterializedCheckbox(ctx, node, parts.indicator, parts.glyph, depth, keyAttr)

  if (node.kind === 'icon') return emitIcon(ctx, node, depth, keyAttr, overlays)

  const selItem = ctx.selection && node.id === ctx.selection.itemNodeId ? ctx.selection : null

  const cursorDecl =
    selItem && tag !== 'button' && tag !== 'a' ? [{ prop: 'cursor', value: 'pointer' }] : []

  const srOnlyDecl = node.presentation === 'accessibleName' ? SR_ONLY_DECLS : []
  const styleA =
    styleAttrsFor(ctx, node, [...nodeStyleDecls(ctx, node, tag), ...cursorDecl, ...srOnlyDecl]) +
    condAttrs(ctx, node)
  const key = keyAttr ? ` ${keyAttr}` : ''

  const itemRole = overlays?.items.get(node.id)
  // -1 rather than 0: the surface owns the tab stop and moves focus between its items,
  // which is the WAI-ARIA menu pattern (one stop for the whole menu, arrows inside it).
  const itemRoleA = itemRole ? ` role="${itemRole}" tabIndex={-1}` : ''

  const triggerFor = overlays?.triggers.get(node.id)
  const onClickExtra = [
    ...(triggerFor && triggerFor.openOn !== 'context' ? [`${triggerFor.setter}((o) => !o)`] : []),
    ...(selItem ? [`${selItem.setter}(${selItem.alias}.${selItem.field})`] : []),
  ]

  const stepBtn =
    ctx.stepper && (node.id === ctx.stepper.decId || node.id === ctx.stepper.incId)
      ? ctx.stepper
      : null

  const clearBtn = ctx.textEntry && node.id === ctx.textEntry.clearId ? ctx.textEntry : null
  let handlerAttr: string
  if (stepBtn) {
    const ref = `_${stepBtn.prop}Ref.current`
    const setter = `_set${pascalCase(stepBtn.prop)}`
    const stepExpr = stepBtn.hasStep ? '(step ?? 1)' : '1'
    const ev = stepBtn.event ? `; on${pascalCase(stepBtn.event)}?.(n)` : ''
    const dec = node.id === stepBtn.decId
    const bound = dec
      ? stepBtn.hasMin
        ? `Math.max(min ?? -Infinity, ${ref} - ${stepExpr})`
        : `${ref} - ${stepExpr}`
      : stepBtn.hasMax
        ? `Math.min(max ?? Infinity, ${ref} + ${stepExpr})`
        : `${ref} + ${stepExpr}`
    handlerAttr = ` onClick={() => { const n = ${bound}; _${stepBtn.prop}Ref.current = n; ${setter}(n)${ev} }}`
  } else if (clearBtn) {
    const setter = `_set${pascalCase(clearBtn.prop)}`
    const clearEv = clearBtn.clearEvent
      ? `on${pascalCase(clearBtn.clearEvent)}?.(${eventArg(ctx, clearBtn.clearEvent, '')})`
      : ''
    const valEv = clearBtn.event
      ? `on${pascalCase(clearBtn.event)}?.(${controlEventArg(ctx, clearBtn.event, "''", 'string')})`
      : ''
    const calls = [`${setter}('')`, clearEv, valEv].filter(Boolean).join('; ')
    handlerAttr = ` type="button" onClick={() => { ${calls} }}`
  } else {
    handlerAttr = emissionHandlers(
      ctx,
      node,
      onClickExtra.length ? { onClick: onClickExtra } : undefined,
    )
  }
  const selCond = selItem ? `${selItem.current} === ${selItem.alias}.${selItem.field}` : ''
  const selA =
    (selItem ? ` data-selected={${selCond} ? '' : undefined}` : '') +
    selectionItemAttrs(ctx, node, selItem) +
    selectionContainerAttrs(ctx, node) +
    selectionPanelAttrs(ctx, node)
  // An overlay trigger announces the popup it owns and whether it is showing, the same
  // pair the canvas gets from `planBehavior`.
  const trigA = triggerFor?.announces.expanded
    ? `${triggerFor.announces.haspopup ? ` aria-haspopup="${triggerFor.announces.haspopup}"` : ''} aria-expanded={${triggerFor.state}}`
    : ''

  const labelA = a11yLabelAttrs(ctx, node)
  const ariaA = isNameableControl(node) ? a11yAttrs(ctx, node) : ''

  if (ctx.slider) {
    const s = ctx.slider
    if (node.id === s.valueId) {
      const inner = `<${tag}${key}${styleA}>{_${s.prop}}</${tag}>`
      return s.hasShowValue ? `${pad}{showValue && ${inner}}` : `${pad}${inner}`
    }
    if (node.id === s.rangeId) {
      return `${pad}<${tag}${key}${styleA} style={{ width: _pct + '%' }} />`
    }
    if (node.id === s.thumbId) {
      const t = tag === 'button' || tag === 'a' ? 'div' : tag
      return `${pad}<${t}${key}${styleA} style={{ position: 'absolute', left: _pct + '%', top: '50%', transform: 'translate(-50%, -50%)' }} aria-hidden />`
    }
  }

  if (node.kind === 'text') {
    const textTag = ctx.a11y.labelFor.has(node.id) ? 'label' : tag
    return `${pad}<${textTag}${key}${labelA}${styleA}${handlerAttr}>${textContent(ctx, node)}</${textTag}>`
  }
  if (node.kind === 'input') {
    if (ctx.stepper && node.id === ctx.stepper.inputId) {
      const sp = ctx.stepper
      const sv = `_${sp.prop}`
      const setter = `_set${pascalCase(sp.prop)}`
      const ev = sp.event ? `; on${pascalCase(sp.event)}?.(n)` : ''
      const mm = `${sp.hasMin ? ' min={min}' : ''}${sp.hasMax ? ' max={max}' : ''}${sp.hasStep ? ' step={step}' : ''}`
      return `${pad}<input${key}${ariaA}${styleA} type="number" value={${sv}} onChange={(e) => { const n = Number(e.target.value); _${sp.prop}Ref.current = n; ${setter}(n)${ev} }}${mm} />`
    }

    if (ctx.textEntry && node.id === ctx.textEntry.inputId) {
      const t = ctx.textEntry
      const sv = `_${t.prop}`
      const setter = `_set${pascalCase(t.prop)}`
      const ev = t.event
        ? `; on${pascalCase(t.event)}?.(${controlEventArg(ctx, t.event, 'v', 'string')})`
        : ''
      const phExpr = contentExpr(ctx, node)
      const ph = phExpr !== null ? ` placeholder={${phExpr}}` : ''
      const onCh = ` value={${sv}} onChange={(e) => { const v = e.target.value; ${setter}(v)${ev} }}`

      if (tag === 'textarea') return `${pad}<textarea${key}${ariaA}${styleA}${onCh}${ph} />`
      const typeA = component.archetype === 'SearchField' ? ' type="search"' : ' type="text"'
      return `${pad}<input${key}${ariaA}${styleA}${typeA}${onCh}${ph} />`
    }
    const vtype = effectiveValueType(node)
    const bind = node.valueBinding ? bindingExpr(node.valueBinding.propName) : null

    if (vtype?.kind === 'enum') {
      const opts = vtype.values
        .map((o) => `${pad}  <option value=${JSON.stringify(o)}>${o}</option>`)
        .join('\n')
      const sel = bind ? ` defaultValue={${bind}}` : ''
      return `${pad}<select${key}${ariaA}${styleA}${handlerAttr}${sel}>\n${opts}\n${pad}</select>`
    }

    const inputType = inputTypeFor(vtype)
    if (tag === 'textarea' && inputType === 'text') {
      const phExpr = contentExpr(ctx, node)
      const ph = phExpr !== null ? ` placeholder={${phExpr}}` : ''
      const val = bind ? ` defaultValue={${bind}}` : ''
      return `${pad}<textarea${key}${ariaA}${styleA}${handlerAttr}${ph}${val} />`
    }
    const typeA = inputType !== 'text' ? ` type="${inputType}"` : ''

    const val = bind
      ? inputType === 'checkbox'
        ? ` defaultChecked={${bind}}`
        : ` defaultValue={${bind}}`
      : ''

    const phExpr = inputType === 'checkbox' ? null : contentExpr(ctx, node)
    const ph = phExpr !== null ? ` placeholder={${phExpr}}` : ''
    const rng =
      vtype?.kind === 'number'
        ? `${vtype.min != null ? ` min={${vtype.min}}` : ''}${vtype.max != null ? ` max={${vtype.max}}` : ''}`
        : ''
    return `${pad}<input${key}${ariaA}${styleA}${handlerAttr}${typeA}${rng}${ph}${val} />`
  }
  if (node.kind === 'output') {
    const bind = node.valueBinding ? bindingExpr(node.valueBinding.propName) : null
    const ovtype = effectiveValueType(node)

    if (ovtype?.kind === 'number') {
      const max = ovtype.max != null ? ` max={${ovtype.max}}` : ''
      const val = bind ? ` value={${bind}}` : ''
      return `${pad}<progress${key}${styleA}${handlerAttr}${max}${val} />`
    }
    const expr = bind ?? contentExpr(ctx, node)
    return `${pad}<output${key}${styleA}${handlerAttr}>${expr !== null ? `{${expr}}` : ''}</output>`
  }
  if (node.kind === 'content') {
    switch (node.media ?? 'img') {
      case 'video':
        return `${pad}<video${key}${styleA}${handlerAttr} />`
      case 'audio':
        return `${pad}<audio${key}${styleA}${handlerAttr} />`
      case 'embed':
        return `${pad}<iframe${key}${styleA}${handlerAttr} title="" />`
      default: {
        // `bind` - the consumer supplies the URL at runtime; the node's `sample` is a
        // design-time-only preview aid (canvas/docs), never emitted here.
        // `static` - the image IS the design system's content (logo, illustration);
        // emits the resolved asset URL directly. NOTE (proposal 0028 §4): this is a
        // web-native assumption (a literal <img src> URL) - true byte-vendoring, the
        // way custom icon SVGs are inlined (0019), is deferred follow-up work, not
        // built here.
        const resolved = resolveMediaSource(node.mediaSource, ctx.assets)
        const srcA = resolved
          ? resolved.kind === 'bind'
            ? ` src={${bindingExpr(resolved.propName)}}`
            : ` src=${JSON.stringify(resolved.url)}`
          : ''
        const altExpr = node.mediaAlt ? contentValueExpr(node.mediaAlt) : null
        const altA = altExpr !== null ? ` alt={${altExpr}}` : ' alt=""'
        return `${pad}<img${key}${styleA}${handlerAttr}${srcA}${altA} />`
      }
    }
  }

  const prevSelCond = ctx.selectionCond
  if (selItem) ctx.selectionCond = `${selItem.current} === ${selItem.alias}.${selItem.field}`
  const kids = childrenJsx(ctx, node, component, depth + 1, overlays)
  ctx.selectionCond = prevSelCond

  if (ctx.slider && node.id === ctx.slider.trackId) {
    const s = ctx.slider
    const cp = '  '.repeat(depth + 1)
    const setter = `_set${pascalCase(s.prop)}`
    const ev = s.event ? `; on${pascalCase(s.event)}?.(n)` : ''
    const lo = s.hasMin ? 'min ?? 0' : '0'
    const hi = s.hasMax ? 'max ?? 100' : '100'
    const st = s.hasStep ? 'step ?? 1' : '1'
    const dis = s.hasDisabled ? ' disabled={disabled}' : ''
    const range = `${cp}<input type="range" min={${lo}} max={${hi}} step={${st}} value={_${s.prop}}${dis} onChange={(e) => { const n = Number(e.target.value); ${setter}(n)${ev} }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }} />`
    const inner = [...kids, range].join('\n')
    return `${pad}<${tag}${key}${styleA} style={{ position: 'relative' }}>\n${inner}\n${pad}</${tag}>`
  }

  if (node.kind === 'fragment') {
    return kids.length ? `${pad}<>\n${kids.join('\n')}\n${pad}</>` : null
  }

  if (node.kind === 'cell') {
    const cellTag = node.cell?.header ? 'th' : 'td'
    const scopeA = node.cell?.header && node.cell.scope ? ` scope="${node.cell.scope}"` : ''
    if (!kids.length) {
      const inline = node.content ? textContent(ctx, node) : ''
      if (inline)
        return `${pad}<${cellTag}${key}${styleA}${handlerAttr}${scopeA}>${inline}</${cellTag}>`
      return `${pad}<${cellTag}${key}${styleA}${handlerAttr}${scopeA} />`
    }
    return `${pad}<${cellTag}${key}${styleA}${handlerAttr}${scopeA}>\n${kids.join('\n')}\n${pad}</${cellTag}>`
  }

  if (node.kind === 'table') {
    const bodyPad = '  '.repeat(depth + 1)
    const inner = kids.length
      ? `\n${bodyPad}<tbody>\n${kids.join('\n')}\n${bodyPad}</tbody>\n${pad}`
      : ''
    return `${pad}<table${key}${styleA}${handlerAttr}>${inner}</table>`
  }

  const elTag = selItem && ctx.selectionAria && tag === 'li' ? 'div' : tag
  if (!kids.length) {
    // A default slot on a non-text node (a bare trigger meant to wrap whatever the
    // consumer passes - Tooltip/Popover/Drawer) renders {children} exactly like a
    // default-slot label does; `contentExpr` already resolves that regardless of
    // kind, so this only needs to stop gating on `node.content` being set.
    const inline = node.content || node.slot?.default ? textContent(ctx, node) : ''
    if (inline)
      return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${itemRoleA}${trigA}${styleA}${handlerAttr}>${inline}</${elTag}>`
    return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${itemRoleA}${trigA}${styleA}${handlerAttr} />`
  }
  return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${itemRoleA}${trigA}${styleA}${handlerAttr}>\n${kids.join('\n')}\n${pad}</${elTag}>`
}

/** The roving-cursor handler a browsable surface installs, named per overlay. */
const navName = (info: OverlayInfo): string => `_nav${info.state.replace('open', '')}`

// The DOM interface a ref on the overlay surface must be typed against. The surface is not
// always a `div` - a browsable context menu lowers to `ul`, and a `RefObject<HTMLDivElement>`
// on a `<ul>` is a type error in the SHIPPED package. `HTMLElementTagNameMap` is the DOM lib's
// own tag -> interface answer, so this cannot drift from whatever `resolveTag` decided; `div`
// keeps its plain name because that is the overwhelmingly common case and it reads better.
function surfaceRefType(component: ComponentIR, info: OverlayInfo): string {
  const node = component.structure.nodes[info.surfaceId]
  const tag = node ? resolveTag(node, component) : 'div'
  return tag === 'div' ? 'HTMLDivElement' : `HTMLElementTagNameMap['${tag}']`
}

function emitOverlaySurface(
  ctx: EmitCtx,
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  info: OverlayInfo,
  overlays: OverlayPlan,
): string | null {
  const pad = '  '.repeat(depth)
  const tag = resolveTag(node, component)
  const innerPad = '  '.repeat(depth + 1)
  const kids = childrenOf(node, component)
    .map((k) => emitChild(ctx, k, component, depth + (info.modal ? 3 : 2), overlays))
    .filter((s): s is string => s !== null)
  const body = kids.length ? `\n${kids.join('\n')}\n` : ''

  const surfStyle = styleAttrsFor(ctx, node, [
    ...surfacePositionDecls(info.kind),
    ...nodeStyleDecls(ctx, node, tag),
  ])

  if (info.modal) {
    const backStyle = styleAttr(backdropDecls(info.kind))
    const backDismiss = info.dismissable ? ` onClick={() => ${info.setter}(false)}` : ''
    return [
      `${pad}{${info.state} && createPortal(`,
      `${innerPad}<>`,
      `${innerPad}  <div${backStyle}${backDismiss} />`,
      `${innerPad}  <${tag}${surfStyle}>${body}${body ? innerPad + '  ' : ''}</${tag}>`,
      `${innerPad}</>,`,
      `${innerPad}document.body,`,
      `${pad})}`,
    ].join('\n')
  }

  const roleA = info.surfaceRole ? ` role="${info.surfaceRole}"` : ''
  const refA = info.surfaceRef ? ` ref={${info.surfaceRef}}` : ''
  const navA = info.surfaceRef
    ? ` tabIndex={-1} onKeyDown={${info.surfaceRef ? navName(info) : ''}}`
    : ''
  return `${pad}{${info.state} && (\n${innerPad}<${tag}${refA}${surfStyle}${roleA}${navA}>${body}${body ? innerPad : ''}</${tag}>\n${pad})}`
}

function styleAttr(decls: StyleDecl[]): string {
  const body = styleLiteral(decls)
  return body ? ` style={{ ${body} }}` : ''
}

const SURFACE_BASE: StyleDecl[] = [
  { prop: 'display', value: 'flex' },
  { prop: 'flexDirection', value: 'column' },
]

function emitDisclosure(ctx: EmitCtx, component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const facetStyle = (n: ComponentNode) => nodeStyleDecls(ctx, n, tagFor(n))

  const root = nodes[component.structure.rootId]
  const trigger = node(plan.triggerId)!
  const surface = node(plan.surfaceId)!
  const backdrop = node(plan.backdropId)

  // The root is a real node an author can select and paint on the canvas, so it needs an
  // element to carry that styling. This used to return a bare fragment (trigger + portal)
  // and silently drop everything the root wore. When the archetype has no trigger part of
  // its own the root IS the trigger, and wrapping would emit it twice.
  const rootIsTrigger = root.id === trigger.id
  const rootStyle = rootIsTrigger
    ? ''
    : styleAttrsFor(ctx, root, [
        ...anchorDecls(plan.surfaceKind),
        ...nodeStyleDecls(ctx, root, tagFor(root)),
      ])
  const rootTag = tagFor(root)

  const trigLines = childrenOf(trigger, component)
    .map((k) => {
      if (k.id === plan.triggerLabelId) {
        return `        <${tagFor(k)}${styleAttrsFor(ctx, k, facetStyle(k))}>{trigger}</${tagFor(k)}>`
      }
      return emitChild(ctx, k, component, 4)
    })
    .filter((s): s is string => s !== null)
  const trigInner = trigLines.length ? `\n${trigLines.join('\n')}\n      ` : '{trigger}'

  const surfLines = childrenOf(surface, component)
    .map((k) => {
      const ks = styleAttrsFor(ctx, k, facetStyle(k))
      const tag = tagFor(k)
      if (k.id === plan.titleId) return `            <${tag}${ks}>{title}</${tag}>`
      if (k.id === plan.contentId) return `            <${tag}${ks}>{children}</${tag}>`
      if (k.id === plan.closeId) {
        return `            <button${ks} onClick={() => change(false)} aria-label="Close">×</button>`
      }
      return emitChild(ctx, k, component, 6)
    })
    .filter((s): s is string => s !== null)
  const surfInner = surfLines.length ? `\n${surfLines.join('\n')}\n          ` : ''

  const surfStyle = styleAttrsFor(ctx, surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...facetStyle(surface),
  ])

  const backStyle = backdrop
    ? styleAttrsFor(ctx, backdrop, [...backdropDecls(plan.surfaceKind), ...facetStyle(backdrop)])
    : styleAttr(backdropDecls(plan.surfaceKind))
  const backDismiss = plan.dismissable ? ' onClick={() => change(false)}' : ''

  const trigAttr = styleAttrsFor(ctx, trigger, facetStyle(trigger))

  const propLines = [
    '  open?: boolean',
    '  defaultOpen?: boolean',
    '  onOpenChange?: (open: boolean) => void',
  ]
  if (plan.titleId) propLines.unshift('  title?: ReactNode')
  if (plan.triggerLabelId) propLines.unshift('  trigger?: ReactNode')
  propLines.splice(
    propLines.findIndex((l) => l.includes('open?')),
    0,
    '  children?: ReactNode',
  )

  const destructure = [
    plan.triggerLabelId ? 'trigger' : null,
    plan.titleId ? 'title' : null,
    'children',
    'open: openProp',
    'defaultOpen = false',
    'onOpenChange',
  ]
    .filter(Boolean)
    .join(', ')

  const dismissEffect = plan.dismissable
    ? [
        ``,
        `  useEffect(() => {`,
        `    if (!isOpen) return`,
        `    const onKey = (e: KeyboardEvent) => {`,
        `      if (e.key === 'Escape') { setOpen(false); onOpenChange?.(false) }`,
        `    }`,
        `    document.addEventListener('keydown', onKey)`,
        `    return () => document.removeEventListener('keydown', onKey)`,
        `  }, [isOpen, onOpenChange])`,
      ].join('\n')
    : ''

  const reactImport = plan.dismissable
    ? `import { useEffect, useState, type ReactNode } from 'react'`
    : `import { useState, type ReactNode } from 'react'`

  return [
    `'use client'`,
    ``,
    reactImport,
    `import { createPortal } from 'react-dom'`,
    ...stylesImport(ctx, name),
    ``,
    `export interface ${name}Props {`,
    ...propLines,
    `}`,
    ``,
    `export function ${name}({ ${destructure} }: ${name}Props) {`,
    `  const [open, setOpen] = useState(defaultOpen)`,
    `  const isOpen = openProp ?? open`,
    `  const change = (next: boolean) => { setOpen(next); onOpenChange?.(next) }`,
    dismissEffect,
    ``,
    `  return (`,
    rootIsTrigger ? `    <>` : `    <${rootTag}${rootStyle}>`,
    // The trigger announces the popup it owns and whether it is showing - the same pair
    // `planBehavior` gives the canvas for a modal disclosure.
    `      <${tagFor(trigger)}${trigAttr} aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => change(true)}>${trigInner}</${tagFor(trigger)}>`,
    `      {isOpen && createPortal(`,
    `        <>`,
    `          <div${backStyle}${backDismiss} />`,
    `          <div${surfStyle} role="dialog" aria-modal="true">${surfInner}</div>`,
    `        </>,`,
    `        document.body,`,
    `      )}`,
    rootIsTrigger ? `    </>` : `    </${rootTag}>`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

function emitSelect(ctx: EmitCtx, component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) =>
    n ? styleAttrsFor(ctx, n, nodeStyleDecls(ctx, n, tagFor(n))) : ''

  const root = nodes[component.structure.rootId]
  const trigger = node(plan.triggerId)!
  const value = node(plan.valueId)
  const indicator = node(plan.indicatorId)
  const surface = node(plan.surfaceId)!
  const option = node(plan.optionId)!
  const check = node(plan.optionCheckId)
  const label = node(plan.optionLabelId)

  const rootStyle = styleAttrsFor(ctx, root, [
    ...anchorDecls(plan.surfaceKind),
    ...nodeStyleDecls(ctx, root, 'div'),
  ])
  const surfStyle = styleAttrsFor(ctx, surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...nodeStyleDecls(ctx, surface, tagFor(surface)),
  ])

  const trigAttr = sa(trigger)
  const optionAttr = sa(option)

  const valueLine = value
    ? `        <${tagFor(value)}${sa(value)}>{selected ? selected.label : placeholder}</${tagFor(value)}>`
    : `        {selected ? selected.label : placeholder}`
  const indicatorLine = indicator ? `\n        ${iconSpan(ctx, indicator)}` : ''

  const checkLine = check
    ? `\n              ${iconSpan(ctx, check).replace(
        ' aria-hidden />',
        ` style={{ visibility: option.value === value ? undefined : 'hidden' }} aria-hidden />`,
      )}`
    : ''
  const labelLine = label
    ? `              <${tagFor(label)}${sa(label)}>{option.label}</${tagFor(label)}>`
    : `              {option.label}`

  return [
    `'use client'`,
    ``,
    `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'`,
    ...stylesImport(ctx, name),
    ``,
    `export interface ${name}Option {`,
    `  value: string`,
    `  label: ReactNode`,
    `}`,
    ``,
    `export interface ${name}Props {`,
    `  options: ${name}Option[]`,
    `  value?: string`,
    `  defaultValue?: string`,
    `  onValueChange?: (value: string) => void`,
    `  placeholder?: ReactNode`,
    `}`,
    ``,
    `export function ${name}({ options, value: valueProp, defaultValue, onValueChange, placeholder }: ${name}Props) {`,
    `  const [open, setOpen] = useState(false)`,
    `  const [internal, setInternal] = useState(defaultValue)`,
    `  const [active, setActive] = useState(-1)`,
    `  const value = valueProp ?? internal`,
    `  const selected = options.find((o) => o.value === value)`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const typeahead = useRef({ q: '', t: 0 })`,
    `  const choose = (next: string) => { setInternal(next); onValueChange?.(next); setOpen(false) }`,
    `  const openAtSelected = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true) }`,
    ``,
    `  useEffect(() => {`,
    `    if (!open) return`,
    `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
    `    document.addEventListener('mousedown', onDown)`,
    `    return () => document.removeEventListener('mousedown', onDown)`,
    `  }, [open])`,
    ``,
    `  // Listbox keyboard model: open/move with arrows, commit with Enter, close on`,
    `  // Escape, and jump to an option by typing its label (typeahead).`,
    `  const onKeyDown = (e: ReactKeyboardEvent) => {`,
    `    if (e.key === 'Escape') { setOpen(false); return }`,
    `    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openAtSelected(); else setActive((a) => Math.min(options.length - 1, a + 1)); return }`,
    `    if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) openAtSelected(); else setActive((a) => Math.max(0, a - 1)); return }`,
    `    if (e.key === 'Home') { if (open) { e.preventDefault(); setActive(0) } return }`,
    `    if (e.key === 'End') { if (open) { e.preventDefault(); setActive(options.length - 1) } return }`,
    `    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open && active >= 0) choose(options[active].value); else openAtSelected(); return }`,
    `    if (e.key.length === 1) {`,
    `      const now = Date.now()`,
    `      typeahead.current.q = now - typeahead.current.t > 600 ? e.key : typeahead.current.q + e.key`,
    `      typeahead.current.t = now`,
    `      const q = typeahead.current.q.toLowerCase()`,
    `      const i = options.findIndex((o) => String(o.label).toLowerCase().startsWith(q))`,
    `      if (i >= 0) { setOpen(true); setActive(i) }`,
    `    }`,
    `  }`,
    ``,
    `  return (`,
    `    <div ref={ref}${rootStyle} onKeyDown={onKeyDown}>`,
    `      <button${trigAttr} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>`,
    valueLine + indicatorLine,
    `      </button>`,
    `      {open && (`,
    `        <div${surfStyle} role="listbox">`,
    `          {options.map((option, i) => (`,
    `            <div key={option.value}${optionAttr} role="option" aria-selected={option.value === value} data-active={i === active ? '' : undefined} style={i === active ? { background: 'var(--ds-color-surface-sunken)' } : undefined} onMouseEnter={() => setActive(i)} onClick={() => choose(option.value)}>${checkLine}`,
    labelLine,
    `            </div>`,
    `          ))}`,
    `        </div>`,
    `      )}`,
    `    </div>`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

function emitCombobox(ctx: EmitCtx, component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) =>
    n ? styleAttrsFor(ctx, n, nodeStyleDecls(ctx, n, tagFor(n))) : ''

  const root = nodes[component.structure.rootId]
  const control = node(plan.triggerId)!
  const surface = node(plan.surfaceId)!
  const option = node(plan.optionId)!
  const label = node(plan.optionLabelId)
  const placeholder = (component.contract?.props ?? []).some((p) => p.name === 'placeholder')

  const rootStyle = styleAttrsFor(ctx, root, [
    ...anchorDecls(plan.surfaceKind),
    ...nodeStyleDecls(ctx, root, 'div'),
  ])
  const surfStyle = styleAttrsFor(ctx, surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...nodeStyleDecls(ctx, surface, tagFor(surface)),
  ])
  const controlAttr = sa(control)
  const optionAttr = sa(option)
  const surfTag = tagFor(surface)
  const optTag = tagFor(option)
  const labelLine = label
    ? `              <${tagFor(label)}${sa(label)}>{item.label}</${tagFor(label)}>`
    : `              {item.label}`

  return [
    `'use client'`,
    ``,
    `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'`,
    ...stylesImport(ctx, name),
    ``,
    `export interface ${name}Item {`,
    `  value: string`,
    `  label: ReactNode`,
    `}`,
    ``,
    `export interface ${name}Props {`,
    `  items: ${name}Item[]`,
    `  value?: string`,
    `  defaultValue?: string`,
    `  onValueChange?: (value: string) => void`,
    `  placeholder?: string`,
    `}`,
    ``,
    `export function ${name}({ items, value: valueProp, defaultValue, onValueChange${placeholder ? ', placeholder' : ''} }: ${name}Props) {`,
    `  const [open, setOpen] = useState(false)`,
    `  const [active, setActive] = useState(0)`,
    `  const initial = valueProp ?? defaultValue`,
    `  const [query, setQuery] = useState(() => String(items.find((i) => i.value === initial)?.label ?? initial ?? ''))`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const filtered = items.filter((i) => String(i.label).toLowerCase().includes(query.toLowerCase()))`,
    `  const commit = (item: ${name}Item) => { setQuery(String(item.label)); onValueChange?.(item.value); setOpen(false) }`,
    ``,
    `  useEffect(() => {`,
    `    if (!open) return`,
    `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
    `    document.addEventListener('mousedown', onDown)`,
    `    return () => document.removeEventListener('mousedown', onDown)`,
    `  }, [open])`,
    ``,
    `  const onKeyDown = (e: ReactKeyboardEvent) => {`,
    `    if (e.key === 'Escape') { setOpen(false); return }`,
    `    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(filtered.length - 1, a + 1)); return }`,
    `    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); return }`,
    `    if (e.key === 'Enter') { if (open && filtered[active]) { e.preventDefault(); commit(filtered[active]) } return }`,
    `  }`,
    ``,
    `  return (`,
    `    <div ref={ref}${rootStyle}>`,
    `      <input${controlAttr} type="text" role="combobox" aria-expanded={open} aria-autocomplete="list" value={query}${placeholder ? ' placeholder={placeholder}' : ''} onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0) }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />`,
    `      {open && filtered.length > 0 && (`,
    `        <${surfTag}${surfStyle} role="listbox">`,
    `          {filtered.map((item, i) => (`,
    `            <${optTag} key={item.value}${optionAttr} role="option" aria-selected={i === active} data-active={i === active ? '' : undefined} style={i === active ? { background: 'var(--ds-color-surface-sunken)' } : undefined} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(item)}>`,
    labelLine,
    `            </${optTag}>`,
    `          ))}`,
    `        </${surfTag}>`,
    `      )}`,
    `    </div>`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

// DatePicker view (proposal 0029). A thin renderer around the framework-agnostic
// calendar core (targets/behavior/calendar.ts, vendored beside the component as
// `./calendar`): all date math / grid / range logic lives there so every framework
// target computes an identical calendar. This function only wires React state,
// Intl labels, and per-anatomy styling, and converts between the calendar's
// canonical YMD and the project's date representation at the boundary (v1: isoDate).
function emitDatePicker(ctx: EmitCtx, component: ComponentIR, options: EmitOptions): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const root = nodes[component.structure.rootId]
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) =>
    n ? styleAttrsFor(ctx, n, nodeStyleDecls(ctx, n, tagFor(n))) : ''
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const byPart = (p: string) => Object.values(nodes).find((n) => leaf(n) === p)

  const cfg = root.calendar ?? { selectionMode: 'single' as const, weekStartsOn: 0 as const }
  const range = cfg.selectionMode === 'range'
  const weekStartsOn = cfg.weekStartsOn ?? 0
  const disabledWeekdays = cfg.disabledWeekdays ?? []

  const valueNode = byPart('value')
  const iconNode = byPart('icon')
  const surface = byPart('surface')
  const prev = byPart('prev')
  const titleNode = byPart('title')
  const next = byPart('next')
  const grid = byPart('grid')
  const dayNode = byPart('day')
  const labelNode = byPart('label')

  const rootStyle = styleAttrsFor(ctx, root, [
    ...anchorDecls('popover'),
    ...nodeStyleDecls(ctx, root, 'div'),
  ])
  const surfStyle = surface
    ? styleAttrsFor(ctx, surface, [
        ...surfacePositionDecls('popover'),
        ...SURFACE_BASE,
        ...nodeStyleDecls(ctx, surface, tagFor(surface)),
      ])
    : ''

  const triggerNode = byPart('trigger')
  const headerNode = byPart('header')
  const trigTag = triggerNode ? tagFor(triggerNode) : 'button'
  const surfTag = surface ? tagFor(surface) : 'div'
  const headerTag = headerNode ? tagFor(headerNode) : 'div'
  // Grid/day tags are FORCED regardless of anatomy role inference: the grid must be
  // a `div role="grid"` (its row/cell children are not <li>), and each day must be
  // an interactive, disable-able `<button>` (the `item` role would infer `<li>`,
  // which cannot legally carry type/disabled/onClick). Their authored styles still
  // apply via sa().
  const gridTag = 'div'
  const dayTag = 'button'
  const labelTag = labelNode ? tagFor(labelNode) : 'span'
  const valueTag = valueNode ? tagFor(valueNode) : 'span'
  const titleTag = titleNode ? tagFor(titleNode) : 'span'
  const prevTag = prev ? tagFor(prev) : 'button'
  const nextTag = next ? tagFor(next) : 'button'

  const iconLine = iconNode ? '\n        ' + iconSpan(ctx, iconNode) : ''
  const labelInner = labelNode
    ? '<' + labelTag + sa(labelNode) + '>{cell.date.day}</' + labelTag + '>'
    : '{cell.date.day}'

  // Date-value representation (proposal 0029 §4.1): a project-level choice covering
  // the ecosystem union. The component body is representation-agnostic - it uses
  // serialize (YMD -> boundary value) and deserialize (boundary value -> YMD); only
  // these helpers and the DateValue type differ. asDate (YMD -> native Date) is used
  // for Intl formatting and the escape-hatch predicates, independent of representation.
  const rep = options.dateRepresentation ?? 'isoDate'
  const rangeShape = options.dateRangeShape ?? 'object'

  const REP: Record<string, { type: string; decls: string[] }> = {
    isoDate: {
      type: 'string',
      decls: [
        `const pad = (n: number) => String(n).padStart(2, '0')`,
        `const serialize = (d: YMD): DateValue => d.year + '-' + pad(d.month) + '-' + pad(d.day)`,
        `const deserialize = (v?: DateValue | null): YMD | null => {`,
        `  if (!v) return null`,
        `  const [y, m, d] = v.split('-').map(Number)`,
        `  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? { year: y, month: m, day: d } : null`,
        `}`,
      ],
    },
    nativeDate: {
      type: 'Date',
      decls: [
        `const serialize = (d: YMD): DateValue => new Date(d.year, d.month - 1, d.day)`,
        `const deserialize = (v?: DateValue | null): YMD | null => (v ? { year: v.getFullYear(), month: v.getMonth() + 1, day: v.getDate() } : null)`,
      ],
    },
    epochMs: {
      type: 'number',
      decls: [
        `const serialize = (d: YMD): DateValue => new Date(d.year, d.month - 1, d.day).getTime()`,
        `const deserialize = (v?: DateValue | null): YMD | null => { if (v == null) return null; const d = new Date(v); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() } }`,
      ],
    },
    ymd: {
      type: '{ year: number; month: number; day: number }',
      decls: [
        `const serialize = (d: YMD): DateValue => ({ year: d.year, month: d.month, day: d.day })`,
        `const deserialize = (v?: DateValue | null): YMD | null => v ?? null`,
      ],
    },
  }
  const repDef = REP[rep]

  // Range value shape: object { start, end } (default) or positional tuple.
  const rangeType =
    rangeShape === 'tuple' ? `[DateValue, DateValue]` : `{ start: DateValue; end: DateValue }`
  const buildRange = (s: string, e: string) =>
    // The tuple literal needs a cast: TS widens `[a, b]` to `DateValue[]`, not the
    // `[DateValue, DateValue]` the value/state expect.
    rangeShape === 'tuple' ? `[${s}, ${e}] as [DateValue, DateValue]` : `{ start: ${s}, end: ${e} }`
  const readStart = (v: string) => (rangeShape === 'tuple' ? `${v}[0]` : `${v}.start`)
  const readEnd = (v: string) => (rangeShape === 'tuple' ? `${v}[1]` : `${v}.end`)

  const valueType = range ? rangeType : 'DateValue'
  const coreFrom =
    options.behaviorDelivery === 'package'
      ? options.behaviorPackage || BEHAVIOR_PACKAGE_DEFAULT
      : './calendar'
  const importCore = range
    ? `import { buildCalendar, compareYMD, type YMD } from '${coreFrom}'`
    : `import { buildCalendar, type YMD } from '${coreFrom}'`

  const lines: string[] = [
    `'use client'`,
    ``,
    `import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'`,
    importCore,
    ...stylesImport(ctx, name),
    ``,
    `// Date-value representation: ${rep}. Dates cross the boundary as this type; the`,
    `// calendar core always works in canonical { year, month, day } (1-12 month).`,
    `type DateValue = ${repDef.type}`,
    ...repDef.decls,
    `const asDate = (d: YMD): Date => new Date(d.year, d.month - 1, d.day)`,
    ``,
    `export interface ${name}Props {`,
    `  value?: ${valueType} | null`,
    `  defaultValue?: ${valueType} | null`,
    `  onValueChange?: (value: ${valueType} | null) => void`,
    `  min?: DateValue`,
    `  max?: DateValue`,
    `  locale?: string`,
    `  placeholder?: ReactNode`,
    `  isDateDisabled?: (date: Date) => boolean`,
    `  isDateHighlighted?: (date: Date) => boolean`,
    `}`,
    ``,
    `export function ${name}({ value: valueProp, defaultValue, onValueChange, min, max, locale, placeholder, isDateDisabled, isDateHighlighted }: ${name}Props) {`,
    `  const [open, setOpen] = useState(false)`,
    `  const [internal, setInternal] = useState<${valueType} | null | undefined>(defaultValue)`,
    `  const value = valueProp !== undefined ? valueProp : internal`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const today = useMemo(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() } }, [])`,
  ]

  if (range) {
    lines.push(
      `  const [draft, setDraft] = useState<{ start: YMD; end: YMD | null } | null>(() => (value ? { start: deserialize(${readStart(
        'value',
      )})!, end: deserialize(${readEnd('value')})! } : null))`,
      `  const [hover, setHover] = useState<YMD | null>(null)`,
      `  const [displayed, setDisplayed] = useState(() => { const anchor = draft ? draft.start : today; return { year: anchor.year, month: anchor.month } })`,
      `  const choose = (cell: YMD) => {`,
      `    if (!draft || draft.end != null) { setDraft({ start: cell, end: null }); return }`,
      `    const start = compareYMD(draft.start, cell) <= 0 ? draft.start : cell`,
      `    const end = compareYMD(draft.start, cell) <= 0 ? cell : draft.start`,
      `    setDraft({ start, end })`,
      `    const next = ${buildRange('serialize(start)', 'serialize(end)')}`,
      `    if (valueProp === undefined) setInternal(next)`,
      `    onValueChange?.(next)`,
      `    setOpen(false)`,
      `  }`,
    )
  } else {
    lines.push(
      `  const selected = deserialize(value)`,
      `  const [displayed, setDisplayed] = useState(() => { const anchor = selected ?? today; return { year: anchor.year, month: anchor.month } })`,
      `  const choose = (cell: YMD) => {`,
      `    const next = serialize(cell)`,
      `    if (valueProp === undefined) setInternal(next)`,
      `    onValueChange?.(next)`,
      `    setOpen(false)`,
      `  }`,
    )
  }

  lines.push(
    ``,
    `  useEffect(() => {`,
    `    if (!open) return`,
    `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
    `    document.addEventListener('mousedown', onDown)`,
    `    return () => document.removeEventListener('mousedown', onDown)`,
    `  }, [open])`,
    ``,
    `  const model = buildCalendar({`,
    `    displayedMonth: displayed,`,
    `    mode: '${cfg.selectionMode}',`,
    `    weekStartsOn: ${weekStartsOn},`,
    `    disabledWeekdays: ${JSON.stringify(disabledWeekdays)},`,
    range ? `    selection: draft,` : `    selection: selected,`,
    range ? `    hoverPreview: hover,` : ``,
    `    min: deserialize(min) ?? undefined,`,
    `    max: deserialize(max) ?? undefined,`,
    `    today,`,
    `    isDateDisabled: isDateDisabled ? (d) => isDateDisabled(asDate(d)) : undefined,`,
    `    isDateHighlighted: isDateHighlighted ? (d) => isDateHighlighted(asDate(d)) : undefined,`,
    `  })`,
    ``,
    `  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })`,
    `  const dowFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })`,
    `  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })`,
    `  const title = monthFmt.format(new Date(model.displayedMonth.year, model.displayedMonth.month - 1, 1))`,
    // 2023-01-01 is a Sunday, so index 0..6 maps to Sun..Sat weekday labels.
    `  const weekdayLabels = model.weekdayOrder.map((wd) => dowFmt.format(new Date(2023, 0, 1 + wd)))`,
    range
      ? `  const triggerLabel = draft && draft.end ? dateFmt.format(asDate(draft.start)) + ' - ' + dateFmt.format(asDate(draft.end)) : placeholder`
      : `  const triggerLabel = selected ? dateFmt.format(asDate(selected)) : placeholder`,
    ``,
    `  return (`,
    `    <div ref={ref}${rootStyle}>`,
    `      <${trigTag}${sa(triggerNode)} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>`,
    `        <${valueTag}${sa(valueNode)}>{triggerLabel}</${valueTag}>` + iconLine,
    `      </${trigTag}>`,
    `      {open && (`,
    `        <${surfTag}${surfStyle} role="dialog">`,
    `          <${headerTag}${sa(headerNode)}>`,
    `            <${prevTag}${sa(prev)} type="button" aria-label="Previous month" onClick={() => setDisplayed(model.prevMonth)}>{'\\u2039'}</${prevTag}>`,
    `            <${titleTag}${sa(titleNode)}>{title}</${titleTag}>`,
    `            <${nextTag}${sa(next)} type="button" aria-label="Next month" onClick={() => setDisplayed(model.nextMonth)}>{'\\u203a'}</${nextTag}>`,
    `          </${headerTag}>`,
    `          <${gridTag}${sa(grid)} role="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>`,
    `            <div role="row" style={{ display: 'contents' }}>`,
    `              {weekdayLabels.map((wl, i) => (<span key={i} role="columnheader" aria-hidden>{wl}</span>))}`,
    `            </div>`,
    `            {model.weeks.map((week, wi) => (`,
    `              <div key={wi} role="row" style={{ display: 'contents' }}>`,
    `                {week.map((cell) => (`,
    `                  <${dayTag}${sa(dayNode)}`,
    `                    key={cell.date.year + '-' + cell.date.month + '-' + cell.date.day}`,
    `                    type="button"`,
    `                    role="gridcell"`,
    `                    disabled={cell.states.disabled}`,
    `                    aria-disabled={cell.states.disabled || undefined}`,
    `                    aria-selected={cell.states.selected || undefined}`,
    `                    aria-current={cell.states.today ? 'date' : undefined}`,
    `                    data-today={cell.states.today ? '' : undefined}`,
    `                    data-selected={cell.states.selected ? '' : undefined}`,
    `                    data-outside={cell.states.outsideMonth ? '' : undefined}`,
    `                    data-range-start={cell.states.rangeStart ? '' : undefined}`,
    `                    data-range-end={cell.states.rangeEnd ? '' : undefined}`,
    `                    data-in-range={cell.states.inRange ? '' : undefined}`,
    `                    data-highlighted={cell.states.highlighted ? '' : undefined}`,
    range ? `                    onMouseEnter={() => setHover(cell.date)}` : ``,
    `                    onClick={() => choose(cell.date)}`,
    `                  >`,
    `                    ${labelInner}`,
    `                  </${dayTag}>`,
    `                ))}`,
    `              </div>`,
    `            ))}`,
    `          </${gridTag}>`,
    `        </${surfTag}>`,
    `      )}`,
    `    </div>`,
    `  )`,
    `}`,
    ``,
  )

  return lines.filter((l) => l !== '').join('\n') + '\n'
}

// TimePicker view (proposal 0029) - a thin renderer around the time behavior core
// (targets/behavior/timepicker.ts, vendored beside the component as `./timepicker`):
// slot generation lives there so every framework target computes an identical list.
// This wires React state, Intl labels, per-anatomy styling, and converts between the
// core's canonical { hour, minute } and the project's time representation (v1 default: isoTime).
function emitTimePicker(ctx: EmitCtx, component: ComponentIR, options: EmitOptions): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const root = nodes[component.structure.rootId]
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) =>
    n ? styleAttrsFor(ctx, n, nodeStyleDecls(ctx, n, tagFor(n))) : ''
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const byPart = (p: string) => Object.values(nodes).find((n) => leaf(n) === p)

  const cfg = root.timePicker ?? { step: 30, use24Hour: false }
  const rep = options.timeRepresentation ?? 'isoTime'

  const triggerNode = byPart('trigger')
  const valueNode = byPart('value')
  const iconNode = byPart('icon')
  const surface = byPart('surface')
  const optionNode = byPart('option')
  const labelNode = byPart('label')

  const trigTag = triggerNode ? tagFor(triggerNode) : 'button'
  const surfTag = surface ? tagFor(surface) : 'div'
  const valueTag = valueNode ? tagFor(valueNode) : 'span'
  const labelTag = labelNode ? tagFor(labelNode) : 'span'

  const rootStyle = styleAttrsFor(ctx, root, [
    ...anchorDecls('popover'),
    ...nodeStyleDecls(ctx, root, 'div'),
  ])
  const surfStyle = surface
    ? styleAttrsFor(ctx, surface, [
        ...surfacePositionDecls('popover'),
        ...SURFACE_BASE,
        ...nodeStyleDecls(ctx, surface, tagFor(surface)),
      ])
    : ''
  const iconLine = iconNode ? '\n        ' + iconSpan(ctx, iconNode) : ''
  const labelInner = labelNode
    ? '<' + labelTag + sa(labelNode) + '>{label}</' + labelTag + '>'
    : '{label}'

  const REP: Record<string, { type: string; decls: string[] }> = {
    isoTime: {
      type: 'string',
      decls: [
        `const pad = (n: number) => String(n).padStart(2, '0')`,
        `const serialize = (t: HM): TimeValue => pad(t.hour) + ':' + pad(t.minute)`,
        `const deserialize = (v?: TimeValue | null): HM | null => {`,
        `  if (!v) return null`,
        `  const [h, m] = v.split(':').map(Number)`,
        `  return Number.isFinite(h) && Number.isFinite(m) ? { hour: h, minute: m } : null`,
        `}`,
      ],
    },
    minutes: {
      type: 'number',
      decls: [
        `const serialize = (t: HM): TimeValue => t.hour * 60 + t.minute`,
        `const deserialize = (v?: TimeValue | null): HM | null => (v == null ? null : { hour: Math.floor(v / 60), minute: v % 60 })`,
      ],
    },
    hm: {
      type: '{ hour: number; minute: number }',
      decls: [
        `const serialize = (t: HM): TimeValue => ({ hour: t.hour, minute: t.minute })`,
        `const deserialize = (v?: TimeValue | null): HM | null => v ?? null`,
      ],
    },
  }
  const repDef = REP[rep]

  const lines: string[] = [
    `'use client'`,
    ``,
    `import { useEffect, useRef, useState, type ReactNode } from 'react'`,
    `import { buildTimeList, type HM } from '${options.behaviorDelivery === 'package' ? options.behaviorPackage || BEHAVIOR_PACKAGE_DEFAULT : './timepicker'}'`,
    ...stylesImport(ctx, name),
    ``,
    `// Time-value representation: ${rep}. The core works in canonical { hour, minute } (24h).`,
    `type TimeValue = ${repDef.type}`,
    ...repDef.decls,
    `const asDate = (t: HM): Date => new Date(2023, 0, 1, t.hour, t.minute)`,
    ``,
    `export interface ${name}Props {`,
    `  value?: TimeValue | null`,
    `  defaultValue?: TimeValue | null`,
    `  onValueChange?: (value: TimeValue | null) => void`,
    `  min?: TimeValue`,
    `  max?: TimeValue`,
    `  locale?: string`,
    `  placeholder?: ReactNode`,
    `  isTimeDisabled?: (time: Date) => boolean`,
    `}`,
    ``,
    `export function ${name}({ value: valueProp, defaultValue, onValueChange, min, max, locale, placeholder, isTimeDisabled }: ${name}Props) {`,
    `  const [open, setOpen] = useState(false)`,
    `  const [internal, setInternal] = useState<TimeValue | null | undefined>(defaultValue)`,
    `  const value = valueProp !== undefined ? valueProp : internal`,
    `  const selected = deserialize(value)`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const choose = (t: HM) => {`,
    `    const next = serialize(t)`,
    `    if (valueProp === undefined) setInternal(next)`,
    `    onValueChange?.(next)`,
    `    setOpen(false)`,
    `  }`,
    ``,
    `  useEffect(() => {`,
    `    if (!open) return`,
    `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
    `    document.addEventListener('mousedown', onDown)`,
    `    return () => document.removeEventListener('mousedown', onDown)`,
    `  }, [open])`,
    ``,
    `  const slots = buildTimeList({`,
    `    step: ${Math.max(1, Math.floor(cfg.step))},`,
    `    min: deserialize(min) ?? undefined,`,
    `    max: deserialize(max) ?? undefined,`,
    `    selection: selected,`,
    `    isTimeDisabled: isTimeDisabled ? (t) => isTimeDisabled(asDate(t)) : undefined,`,
    `  })`,
    `  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: ${cfg.use24Hour ? 'false' : 'true'} })`,
    `  const fmt = (t: HM) => timeFmt.format(asDate(t))`,
    `  const triggerLabel = selected ? fmt(selected) : placeholder`,
    ``,
    `  return (`,
    `    <div ref={ref}${rootStyle}>`,
    `      <${trigTag}${sa(triggerNode)} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>`,
    `        <${valueTag}${sa(valueNode)}>{triggerLabel}</${valueTag}>` + iconLine,
    `      </${trigTag}>`,
    `      {open && (`,
    `        <${surfTag}${surfStyle} role="listbox">`,
    `          {slots.map((slot) => {`,
    `            const label = fmt(slot.value)`,
    `            return (`,
    `              <${optionNode ? tagFor(optionNode) : 'div'}${sa(optionNode)}`,
    `                key={slot.value.hour + ':' + slot.value.minute}`,
    `                role="option"`,
    `                aria-selected={slot.states.selected || undefined}`,
    `                aria-disabled={slot.states.disabled || undefined}`,
    `                data-selected={slot.states.selected ? '' : undefined}`,
    `                data-disabled={slot.states.disabled ? '' : undefined}`,
    `                style={{ cursor: slot.states.disabled ? 'not-allowed' : 'pointer' }}`,
    `                onClick={() => { if (!slot.states.disabled) choose(slot.value) }}`,
    `              >`,
    `                ${labelInner}`,
    `              </${optionNode ? tagFor(optionNode) : 'div'}>`,
    `            )`,
    `          })}`,
    `        </${surfTag}>`,
    `      )}`,
    `    </div>`,
    `  )`,
    `}`,
    ``,
  ]

  return lines.filter((l) => l !== '').join('\n') + '\n'
}

// ColorPicker view (proposal 0029/0035) - a thin renderer around the shared color
// core (targets/behavior/color.ts, vendored beside the component as `./color`): all
// HSV/RGB/hex + OKLCH math and area/hue/alpha geometry live there, so every framework
// target computes an identical picker. This wires React state + pointer drag and
// reads node.colorPicker (0035) for the working space, editable format tabs, opacity,
// eyedropper, preset swatches, and popover-vs-inline layout. The emitted VALUE TYPE is
// a separate project/publish decision (options.colorRepresentation, 0015); we convert
// the canonical working color to it at the boundary.
function emitColorPicker(ctx: EmitCtx, component: ComponentIR, options: EmitOptions): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const root = nodes[component.structure.rootId]
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) =>
    n ? styleAttrsFor(ctx, n, nodeStyleDecls(ctx, n, tagFor(n))) : ''
  const leaf = (n: ComponentNode) => n.part?.split('.').pop()
  const byPart = (p: string) => Object.values(nodes).find((n) => leaf(n) === p)

  const cfg: ResolvedColorPicker = normalizeColorPicker(root.colorPicker)
  const isOklch = cfg.colorSpace === 'oklch'
  const withAlpha = cfg.alpha
  const inline = cfg.layout === 'inline'
  const formats = cfg.formats
  const multiFormat = formats.length > 1
  const rep = options.colorRepresentation ?? 'hex'

  const triggerNode = byPart('trigger')
  // Two parts share the leaf `swatch` (trigger.swatch and surface.swatches.swatch);
  // disambiguate by the full dotted path.
  const swatchNode = Object.values(nodes).find(
    (n) => leaf(n) === 'swatch' && n.part?.includes('trigger'),
  )
  const presetNode = Object.values(nodes).find(
    (n) => leaf(n) === 'swatch' && n.part?.includes('swatches'),
  )
  const valueNode = byPart('value')
  const surface = byPart('surface')
  const areaNode = byPart('area')
  const hueNode = byPart('hue')
  const alphaNode = byPart('alpha')
  const eyeNode = byPart('eyedropper')
  const swatchesNode = byPart('swatches')
  const inputNode = byPart('input')

  const trigTag = triggerNode ? tagFor(triggerNode) : 'button'
  const surfTag = surface ? tagFor(surface) : 'div'
  const valueTag = valueNode ? tagFor(valueNode) : 'span'
  const areaTag = areaNode ? tagFor(areaNode) : 'div'
  const hueTag = hueNode ? tagFor(hueNode) : 'div'
  const alphaTag = alphaNode ? tagFor(alphaNode) : 'div'
  // A plain div: the swatch children are <button>s, so a <ul> would be invalid markup.
  const swatchesTag = 'div'
  const inputSa = sa(inputNode)

  // Space adapter: canonical working form + the core functions to move to/from sRGB.
  const A = isOklch
    ? {
        W: 'OKLCH',
        build: 'buildOklch',
        toRgb: 'oklchToRgb',
        fromRgb: 'rgbToOklch',
        areaFrom: 'oklchFromArea',
        def: '{ l: 0.72, c: 0.15, h: 264 }',
      }
    : {
        W: 'HSV',
        build: 'buildColor',
        toRgb: 'hsvToRgb',
        fromRgb: 'rgbToHsv',
        areaFrom: 'hsvFromArea',
        def: '{ h: 264, s: 0.63, v: 0.96 }',
      }

  // Emitted value TYPE (project/publish choice), optionally carrying alpha.
  const repType =
    rep === 'rgb'
      ? withAlpha
        ? '{ r: number; g: number; b: number; a: number }'
        : '{ r: number; g: number; b: number }'
      : rep === 'hsl'
        ? withAlpha
          ? '{ h: number; s: number; l: number; a: number }'
          : '{ h: number; s: number; l: number }'
        : 'string'

  // Build the import set from what the generated body actually calls (no unused imports).
  const hasHexFormat = formats.includes('hex')
  const hasHslFormat = formats.includes('hsl')
  const hasHsbFormat = formats.includes('hsb')
  const imports = new Set<string>([A.build, A.areaFrom, 'hueFromTrack', A.toRgb, A.fromRgb])
  if (rep === 'hex' || hasHexFormat || cfg.eyedropper) imports.add('hexToRgba')
  if (rep === 'hex' && !withAlpha) imports.add('rgbToHex')
  if ((rep === 'hex' && withAlpha) || (withAlpha && hasHexFormat)) imports.add('rgbaToHex8')
  if (rep === 'hsl' || hasHslFormat) {
    imports.add('rgbToHsl')
    imports.add('hslToRgb')
  }
  if (hasHsbFormat) {
    imports.add('rgbToHsv')
    imports.add('hsvToRgb')
  }
  if (withAlpha) imports.add('alphaFromTrack')
  const coreImports = Array.from(imports).sort()

  // serialize / deserialize between the working color (+alpha) and the emitted value.
  const serializeBody =
    rep === 'hex'
      ? withAlpha
        ? `rgbaToHex8(${A.toRgb}(c), a)`
        : `rgbToHex(${A.toRgb}(c))`
      : rep === 'rgb'
        ? withAlpha
          ? `{ ...${A.toRgb}(c), a }`
          : `${A.toRgb}(c)`
        : withAlpha
          ? `{ ...rgbToHsl(${A.toRgb}(c)), a }`
          : `rgbToHsl(${A.toRgb}(c))`
  const deserializeBody =
    rep === 'hex'
      ? `const p = hexToRgba(v); return p ? { c: ${A.fromRgb}(p.rgb), a: p.a } : null`
      : rep === 'rgb'
        ? `return { c: ${A.fromRgb}(v), a: ${withAlpha ? 'v.a ?? 1' : '1'} }`
        : `return { c: ${A.fromRgb}(hslToRgb(v)), a: ${withAlpha ? 'v.a ?? 1' : '1'} }`

  // Backgrounds for the area + hue track (native oklch() gradients in OKLCH mode).
  const areaBg = isOklch
    ? "'linear-gradient(to top, oklch(0% 0 0), transparent, oklch(100% 0 0)), linear-gradient(to right, oklch(72% 0 ' + Math.round(model.oklch.h) + '), ' + model.hueCss + ')'"
    : "'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ' + model.hueCss + ')'"
  const hueBg = isOklch
    ? "'linear-gradient(to right, oklch(70% 0.2 0), oklch(70% 0.2 60), oklch(70% 0.2 120), oklch(70% 0.2 180), oklch(70% 0.2 240), oklch(70% 0.2 300), oklch(70% 0.2 360))'"
    : "'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'"

  const commitCall = (expr: string) => `commit(${expr}${withAlpha ? ', alpha' : ''})`

  // --- format input rows -------------------------------------------------------
  const num = (label: string, min: number, max: number, valueExpr: string, setExpr: string) =>
    `                <input${inputSa} type="number" min={${min}} max={${max}} value={${valueExpr}} aria-label="${label}" onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) ${setExpr} }} style={{ width: '3.25rem', textAlign: 'center' }} />`
  const alphaInput = `                <input${inputSa} type="number" min={0} max={100} value={Math.round(alpha * 100)} aria-label="Alpha %" onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) commit(c, Math.min(1, Math.max(0, n / 100))) }} style={{ width: '3.25rem', textAlign: 'center' }} />`

  function formatRow(fmt: ColorFormat): string {
    if (fmt === 'hex') {
      const val = withAlpha ? 'rgbaToHex8(model.rgb, alpha)' : 'model.hex'
      return `                <input${inputSa} type="text" value={${val}} aria-label="Hex color" spellCheck={false} onChange={(e) => { const p = hexToRgba(e.target.value); if (p) ${commitCall(`${A.fromRgb}(p.rgb)`)} }} style={{ flex: 1, minWidth: 0 }} />`
    }
    if (fmt === 'rgb') {
      const rows = [
        num('Red', 0, 255, 'model.rgb.r', commitCall(`${A.fromRgb}({ ...model.rgb, r: n })`)),
        num('Green', 0, 255, 'model.rgb.g', commitCall(`${A.fromRgb}({ ...model.rgb, g: n })`)),
        num('Blue', 0, 255, 'model.rgb.b', commitCall(`${A.fromRgb}({ ...model.rgb, b: n })`)),
      ]
      if (withAlpha) rows.push(alphaInput)
      return rows.join('\n')
    }
    if (fmt === 'hsl') {
      const rows = [
        num(
          'Hue',
          0,
          360,
          'Math.round(hsl.h)',
          commitCall(`${A.fromRgb}(hslToRgb({ ...hsl, h: n }))`),
        ),
        num(
          'Saturation',
          0,
          100,
          'Math.round(hsl.s * 100)',
          commitCall(`${A.fromRgb}(hslToRgb({ ...hsl, s: n / 100 }))`),
        ),
        num(
          'Lightness',
          0,
          100,
          'Math.round(hsl.l * 100)',
          commitCall(`${A.fromRgb}(hslToRgb({ ...hsl, l: n / 100 }))`),
        ),
      ]
      if (withAlpha) rows.push(alphaInput)
      return rows.join('\n')
    }
    // hsb (=== HSV channels)
    const rows = [
      num(
        'Hue',
        0,
        360,
        'Math.round(hsb.h)',
        commitCall(`${A.fromRgb}(hsvToRgb({ ...hsb, h: n }))`),
      ),
      num(
        'Saturation',
        0,
        100,
        'Math.round(hsb.s * 100)',
        commitCall(`${A.fromRgb}(hsvToRgb({ ...hsb, s: n / 100 }))`),
      ),
      num(
        'Brightness',
        0,
        100,
        'Math.round(hsb.v * 100)',
        commitCall(`${A.fromRgb}(hsvToRgb({ ...hsb, v: n / 100 }))`),
      ),
    ]
    if (withAlpha) rows.push(alphaInput)
    return rows.join('\n')
  }

  const inputBlockLines: string[] = []
  for (const fmt of formats) {
    const body = formatRow(fmt)
    if (multiFormat) {
      inputBlockLines.push(`            {format === '${fmt}' && (`)
      inputBlockLines.push(`              <div style={{ display: 'flex', gap: '4px' }}>`)
      inputBlockLines.push(body)
      inputBlockLines.push(`              </div>`)
      inputBlockLines.push(`            )}`)
    } else {
      inputBlockLines.push(`            <div style={{ display: 'flex', gap: '4px' }}>`)
      inputBlockLines.push(body)
      inputBlockLines.push(`            </div>`)
    }
  }

  const formatTabsLines = multiFormat
    ? [
        `            <div role="tablist" aria-label="Color format" style={{ display: 'flex', gap: '2px', marginBottom: '6px' }}>`,
        `              {(${JSON.stringify(formats)} as Format[]).map((f) => (`,
        `                <button key={f} type="button" role="tab" aria-selected={format === f} onClick={() => setFormat(f)} style={{ flex: 1, padding: '2px 4px', fontSize: '0.6875rem', textTransform: 'uppercase', cursor: 'pointer', background: format === f ? 'var(--ds-color-surface-sunken)' : 'transparent', border: 0, borderRadius: '4px' }}>{f}</button>`,
        `              ))}`,
        `            </div>`,
      ]
    : []

  // --- assemble the panel (area, hue, [alpha], format tabs+inputs, [eyedropper], [swatches]) ---
  const panel: string[] = []
  panel.push(
    `          <${areaTag}${sa(areaNode)} onPointerDown={dragArea} style={{ position: 'relative', width: '100%', height: '9rem', borderRadius: '6px', touchAction: 'none', cursor: 'crosshair', background: ${areaBg} }}>`,
    `            <span aria-hidden style={{ position: 'absolute', left: (model.area.x * 100) + '%', top: (model.area.y * 100) + '%', width: '12px', height: '12px', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }} />`,
    `          </${areaTag}>`,
    `          <${hueTag}${sa(hueNode)} onPointerDown={dragHue} style={{ position: 'relative', width: '100%', height: '0.75rem', marginTop: '0.5rem', borderRadius: '999px', touchAction: 'none', cursor: 'ew-resize', background: ${hueBg} }}>`,
    `            <span aria-hidden style={{ position: 'absolute', left: (model.hueX * 100) + '%', top: '50%', width: '14px', height: '14px', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', background: model.hueCss }} />`,
    `          </${hueTag}>`,
  )
  if (withAlpha) {
    panel.push(
      `          <${alphaTag}${sa(alphaNode)} onPointerDown={dragAlpha} style={{ position: 'relative', width: '100%', height: '0.75rem', marginTop: '0.5rem', borderRadius: '999px', touchAction: 'none', cursor: 'ew-resize', backgroundImage: 'linear-gradient(to right, transparent, ' + model.hex + '), repeating-conic-gradient(#c8c8c8 0% 25%, #fff 0% 50%)', backgroundSize: 'auto, 10px 10px' }}>`,
      `            <span aria-hidden style={{ position: 'absolute', left: (alpha * 100) + '%', top: '50%', width: '14px', height: '14px', transform: 'translate(-50%, -50%)', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }} />`,
      `          </${alphaTag}>`,
    )
  }
  // format tabs + input row(s), with an optional eyedropper button on the same line
  panel.push(`          <div style={{ marginTop: '0.5rem' }}>`)
  panel.push(...formatTabsLines)
  panel.push(`            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>`)
  panel.push(`              <div style={{ flex: 1, minWidth: 0 }}>`)
  panel.push(...inputBlockLines.map((l) => '  ' + l))
  panel.push(`              </div>`)
  if (cfg.eyedropper) {
    panel.push(
      `              <button type="button"${sa(eyeNode)} aria-label="Pick color from screen" onClick={pickEyedropper} style={{ flexShrink: 0, cursor: 'pointer' }}>`,
      `                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m2 22 1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L21 6l-2-2Z" /></svg>`,
      `              </button>`,
    )
  }
  panel.push(`            </div>`)
  panel.push(`          </div>`)
  if (cfg.swatches) {
    panel.push(
      `          {presets && presets.length > 0 && (`,
      `            <${swatchesTag}${sa(swatchesNode)}>`,
      `              {presets.map((p, i) => {`,
      `                const d = deserialize(p)`,
      `                return <button key={i} type="button"${sa(presetNode)} aria-label={'Preset ' + (i + 1)} onClick={() => { if (d) commit(d.c${withAlpha ? ', d.a' : ''}) }} style={{ cursor: 'pointer', background: d ? ${A.build}(d.c).hex : 'transparent' }} />`,
      `              })}`,
      `            </${swatchesTag}>`,
      `          )}`,
    )
  }

  // pre-render derived views used by the format inputs
  const derived: string[] = []
  if (hasHslFormat) derived.push(`  const hsl = rgbToHsl(model.rgb)`)
  if (hasHsbFormat) derived.push(`  const hsb = rgbToHsv(model.rgb)`)

  const lines: string[] = [
    `'use client'`,
    ``,
    `import { useEffect, ${inline ? '' : 'useRef, '}useState, type PointerEvent as ReactPointerEvent } from 'react'`,
    `import { ${coreImports.join(', ')}, type ${A.W} } from '${
      options.behaviorDelivery === 'package'
        ? options.behaviorPackage || BEHAVIOR_PACKAGE_DEFAULT
        : './color'
    }'`,
    ...stylesImport(ctx, name),
    ``,
    `type Working = ${A.W}`,
    multiFormat ? `type Format = ${formats.map((f) => `'${f}'`).join(' | ')}` : ``,
    `// Emitted value: ${rep}${withAlpha ? ' + alpha' : ''}. The core works in canonical ${A.W}.`,
    `export type ColorValue = ${repType}`,
    `const serialize = (c: Working, ${withAlpha ? 'a' : '_a'}: number): ColorValue => ${serializeBody.startsWith('{') ? `(${serializeBody})` : serializeBody}`,
    `const deserialize = (v?: ColorValue | null): { c: Working; a: number } | null => { if (v == null) return null; ${deserializeBody} }`,
    ``,
    `export interface ${name}Props {`,
    `  value?: ColorValue | null`,
    `  defaultValue?: ColorValue | null`,
    `  onValueChange?: (value: ColorValue) => void`,
    ...(cfg.swatches
      ? [`  /** Preset colors shown as clickable swatches. */`, `  presets?: ColorValue[]`]
      : []),
    `}`,
    ``,
    `export function ${name}({ value: valueProp, defaultValue, onValueChange${cfg.swatches ? ', presets' : ''} }: ${name}Props) {`,
    ...(inline ? [] : [`  const [open, setOpen] = useState(false)`]),
    `  const [internal, setInternal] = useState<ColorValue | null | undefined>(defaultValue)`,
    `  const value = valueProp !== undefined ? valueProp : internal`,
    `  const _init = deserialize(value)`,
    `  const [c, setC] = useState<Working>(() => _init?.c ?? ${A.def})`,
    ...(withAlpha ? [`  const [alpha, setAlpha] = useState<number>(() => _init?.a ?? 1)`] : []),
    ...(multiFormat
      ? [`  const [format, setFormat] = useState<Format>('${cfg.defaultFormat}')`]
      : []),
    ...(inline ? [] : [`  const ref = useRef<HTMLDivElement>(null)`]),
    `  const model = ${A.build}(c)`,
    ...derived,
    ``,
    `  const commit = (nc: Working${withAlpha ? ', na: number' : ''}) => {`,
    `    setC(nc)`,
    ...(withAlpha ? [`    setAlpha(na)`] : []),
    `    const out = serialize(nc, ${withAlpha ? 'na' : '1'})`,
    `    if (valueProp === undefined) setInternal(out)`,
    `    onValueChange?.(out)`,
    `  }`,
    ``,
    `  // Keep the working color in sync when a controlled value changes underneath us.`,
    `  useEffect(() => { if (valueProp !== undefined) { const d = deserialize(valueProp); if (d) { setC(d.c)${withAlpha ? '; setAlpha(d.a)' : ''} } } }, [valueProp])`,
    ...(inline
      ? []
      : [
          ``,
          `  useEffect(() => {`,
          `    if (!open) return`,
          `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
          `    document.addEventListener('mousedown', onDown)`,
          `    return () => document.removeEventListener('mousedown', onDown)`,
          `  }, [open])`,
        ]),
    ``,
    `  const dragArea = (e: ReactPointerEvent) => {`,
    `    const rect = e.currentTarget.getBoundingClientRect()`,
    `    const at = (cx: number, cy: number) => ${commitCall(`${A.areaFrom}(c.h, (cx - rect.left) / rect.width, (cy - rect.top) / rect.height)`)}`,
    `    at(e.clientX, e.clientY)`,
    `    const move = (ev: PointerEvent) => at(ev.clientX, ev.clientY)`,
    `    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }`,
    `    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)`,
    `  }`,
    `  const dragHue = (e: ReactPointerEvent) => {`,
    `    const rect = e.currentTarget.getBoundingClientRect()`,
    `    const at = (cx: number) => ${commitCall(`{ ...c, h: hueFromTrack((cx - rect.left) / rect.width) }`)}`,
    `    at(e.clientX)`,
    `    const move = (ev: PointerEvent) => at(ev.clientX)`,
    `    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }`,
    `    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)`,
    `  }`,
    ...(withAlpha
      ? [
          `  const dragAlpha = (e: ReactPointerEvent) => {`,
          `    const rect = e.currentTarget.getBoundingClientRect()`,
          `    const at = (cx: number) => commit(c, alphaFromTrack((cx - rect.left) / rect.width))`,
          `    at(e.clientX)`,
          `    const move = (ev: PointerEvent) => at(ev.clientX)`,
          `    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }`,
          `    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)`,
          `  }`,
        ]
      : []),
    ...(cfg.eyedropper
      ? [
          `  const pickEyedropper = async () => {`,
          `    const Ctor = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper : undefined`,
          `    if (!Ctor) return`,
          `    try { const r = await new Ctor().open(); const p = hexToRgba(r.sRGBHex); if (p) ${commitCall(`${A.fromRgb}(p.rgb)`)} } catch { /* user cancelled */ }`,
          `  }`,
        ]
      : []),
    ``,
    `  return (`,
    ...(inline
      ? [
          `    <${surfTag}${styleAttrsFor(ctx, surface ?? root, [...SURFACE_BASE, ...nodeStyleDecls(ctx, surface ?? root, surfTag)])} role="group" aria-label="Color picker">`,
          ...panel.map((l) => l.replace(/^ {8}/, '      ')),
          `    </${surfTag}>`,
        ]
      : [
          `    <div ref={ref}${styleAttrsFor(ctx, root, [...anchorDecls('popover'), ...nodeStyleDecls(ctx, root, 'div')])}>`,
          `      <${trigTag}${sa(triggerNode)} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>`,
          swatchNode
            ? `        <${tagFor(swatchNode)}${sa(swatchNode)} aria-hidden style={{ background: model.hex }} />`
            : `        <span aria-hidden style={{ width: '1em', height: '1em', borderRadius: '3px', background: model.hex }} />`,
          `        <${valueTag}${sa(valueNode)}>{model.hex}</${valueTag}>`,
          `      </${trigTag}>`,
          `      {open && (`,
          `        <${surfTag}${styleAttrsFor(ctx, surface ?? root, [...surfacePositionDecls('popover'), ...SURFACE_BASE, ...nodeStyleDecls(ctx, surface ?? root, surfTag)])} role="dialog">`,
          ...panel,
          `        </${surfTag}>`,
          `      )}`,
          `    </div>`,
        ]),
    `  )`,
    `}`,
    ``,
  ]

  return lines.filter((l) => l !== '').join('\n') + '\n'
}
function emitMenu(
  ctx: EmitCtx,
  component: ComponentIR,
  plan: DisclosurePlan,
  sharedTypes: SharedType[] = [],
): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const facetStyle = (n: ComponentNode) => nodeStyleDecls(ctx, n, tagFor(n))
  const sa = (n?: ComponentNode) => (n ? styleAttrsFor(ctx, n, facetStyle(n)) : '')

  const root = nodes[component.structure.rootId]
  const trigger = node(plan.triggerId)!
  const surface = node(plan.surfaceId)!
  const option = node(plan.optionId)!

  const src = option.repeat?.source
  const listExpr =
    src?.kind === 'static'
      ? JSON.stringify(src.items ?? [])
      : src?.kind === 'prop' && bindingExpr(src.propName)
        ? `${bindingExpr(src.propName)} ?? []`
        : '[]'
  // A seeded menu has no source yet, and a bare `const list = []` under `strict` is an implicit
  // `any[]` - which infects `list[active]`, `it.label` and the `.map` below with `noImplicitAny`
  // errors, so the emitted component does not compile. The annotation is the item shape
  // `activate` already takes; the sourced cases infer their own and must not be re-typed.
  const listDecl = listExpr === '[]' ? `list: { label: string; value: string }[]` : 'list'

  const selectEmit = Object.values(nodes)
    .flatMap((n) => n.emits ?? [])
    .find((e) => e.on === 'select' || e.on === 'activate')
  const selectEvent = selectEmit ? emissionEventName(ctx, selectEmit.eventId) : ''
  const activateCall = selectEmit
    ? `${eventHandlerName(selectEvent)}?.(${eventArg(ctx, selectEvent, selectEmit.payload ? 'item.value' : '')}); `
    : ''
  const hasDisabled = (component.contract?.props ?? []).some((p) => p.name === 'disabled')

  const rootStyle = styleAttrsFor(ctx, root, [...anchorDecls('menu'), ...facetStyle(root)])
  const surfStyle = styleAttrsFor(ctx, surface, [
    ...surfacePositionDecls('menu'),
    ...SURFACE_BASE,
    ...facetStyle(surface),
  ])
  const trigAttr = sa(trigger)
  const optionAttr = sa(option)

  const trigLines = childrenOf(trigger, component)
    .map((k) => emitChild(ctx, k, component, 4))
    .filter((s): s is string => s !== null)
  const trigInner = trigLines.length ? `\n${trigLines.join('\n')}\n      ` : ''

  const itemLines = childrenOf(option, component)
    .map((k) => emitChild(ctx, k, component, 7))
    .filter((s): s is string => s !== null)
  const itemInner = itemLines.length ? `\n${itemLines.join('\n')}\n            ` : ''

  const cprops = propTypeLines(ctx, component, sharedTypes)
  const names = propNames(component)
  const eventLines = eventPropLines(ctx, interfaceEventDefs(ctx, component), sharedTypes)
  const handlerNames = emittedHandlerNames(ctx, component)
  const interfaceLines = [...cprops, ...eventLines, `  children?: ReactNode`]

  const destructure = [...names.filter((n) => n !== 'open'), ...handlerNames, 'children'].join(', ')
  const seedsOpen = names.includes('open')

  return [
    `'use client'`,
    ``,
    `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'`,
    ...iconModuleImport(ctx),
    ...stylesImport(ctx, name),
    ``,
    `export interface ${name}Props {`,
    ...interfaceLines,
    `}`,
    ``,
    `export function ${name}({ ${destructure}${seedsOpen ? ', open: openProp' : ''} }: ${name}Props) {`,
    `  const [open, setOpen] = useState(${seedsOpen ? 'openProp ?? false' : 'false'})`,
    `  const [active, setActive] = useState(-1)`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const ${listDecl} = ${listExpr}`,
    `  const typeahead = useRef({ q: '', t: 0 })`,
    `  const activate = (item: { label: string; value: string }) => { ${activateCall}setOpen(false) }`,
    ``,
    `  useEffect(() => {`,
    `    if (!open) return`,
    `    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }`,
    `    document.addEventListener('mousedown', onDown)`,
    `    return () => document.removeEventListener('mousedown', onDown)`,
    `  }, [open])`,
    ``,
    `  const onKeyDown = (e: ReactKeyboardEvent) => {`,
    `    if (e.key === 'Escape') { setOpen(false); return }`,
    `    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); setActive(0) } else setActive((a) => Math.min(list.length - 1, a + 1)); return }`,
    `    if (e.key === 'ArrowUp') { e.preventDefault(); if (open) setActive((a) => Math.max(0, a - 1)); return }`,
    `    if (e.key === 'Home') { if (open) { e.preventDefault(); setActive(0) } return }`,
    `    if (e.key === 'End') { if (open) { e.preventDefault(); setActive(list.length - 1) } return }`,
    `    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open && active >= 0) activate(list[active]); else setOpen(true); return }`,
    `    if (open && e.key.length === 1) {`,
    `      const now = Date.now()`,
    `      typeahead.current.q = now - typeahead.current.t > 600 ? e.key : typeahead.current.q + e.key`,
    `      typeahead.current.t = now`,
    `      const q = typeahead.current.q.toLowerCase()`,
    `      const i = list.findIndex((it) => String(it.label).toLowerCase().startsWith(q))`,
    `      if (i >= 0) setActive(i)`,
    `    }`,
    `  }`,
    ``,
    `  return (`,
    `    <div ref={ref}${rootStyle} onKeyDown={onKeyDown}>`,
    `      <${tagFor(trigger)}${trigAttr} type="button" aria-haspopup="menu" aria-expanded={open}${hasDisabled ? ' disabled={disabled}' : ''} onClick={() => setOpen((o) => !o)}>${trigInner}</${tagFor(trigger)}>`,
    `      {open && (`,
    `        <${tagFor(surface)}${surfStyle} role="menu">`,
    `          {list.map((item, i) => (`,
    `            <${tagFor(option)} key={i}${optionAttr} role="menuitem" tabIndex={-1} data-active={i === active ? '' : undefined} style={i === active ? { background: 'var(--ds-color-surface-sunken)' } : undefined} onMouseEnter={() => setActive(i)} onClick={() => activate(item)}>${itemInner}</${tagFor(option)}>`,
    `          ))}`,
    `        </${tagFor(surface)}>`,
    `      )}`,
    `    </div>`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

function emitCompound(
  ctx: EmitCtx,
  component: ComponentIR,
  slots: SlotSurface[],
  options: EmitOptions,
  sharedTypes: SharedType[] = [],
): string {
  const name = componentName(component)
  const naming = options.naming === 'flat' ? 'flat' : 'dot'
  const nodes = component.structure.nodes
  const root = nodes[component.structure.rootId]
  const rootTag = resolveTag(root, component)
  const slotIds = new Set(slots.map((s) => s.nodeId))
  const plan = planCompound(component)
  const ctxName = `${name}Context`
  const vf = plan?.valueField ?? 'value'

  const inlineKids = (node: ComponentNode, depth: number): string => {
    const kids = childrenOf(node, component)
      .filter((c) => !slotIds.has(c.id))
      .map((k) => emitChild(ctx, k, component, depth))
      .filter((s): s is string => s !== null)
    return kids.length ? `\n${kids.join('\n')}\n      ` : ''
  }

  const rootStyleAttr =
    styleAttrsFor(ctx, root, nodeStyleDecls(ctx, root, rootTag)) + emissionHandlers(ctx, root)
  const selectionInterface = plan
    ? ['  value?: string', '  defaultValue?: string', '  onValueChange?: (value: string) => void']
    : []
  const interfaceLines = [
    ...propTypeLines(ctx, component, sharedTypes),
    ...eventPropLines(ctx, component.contract?.events, sharedTypes),
    ...selectionInterface,
    '  children?: ReactNode',
  ]
  const destructure = [
    ...propNames(component),
    ...(plan ? ['value: valueProp', 'defaultValue', 'onValueChange'] : []),
    'children',
  ].join(', ')
  const rootFn = `${name}Root`

  const subs: string[] = []
  const members: string[] = []
  const flatExports: string[] = []
  const seen = new Set<string>()
  for (const s of slots) {
    const node = nodes[s.nodeId]
    const member = pascalCase(s.name) || 'Slot'
    if (!node || seen.has(member)) continue
    seen.add(member)
    // A slot exposed on the ROOT part IS the root component - `Card.Root` and `Card`
    // render the same element, which is why the export below already reads
    // `Object.assign(RootFn, { Root: RootFn })`. Emitting a second function for it
    // declared the root's name twice, and the generated package did not compile.
    if (node.id === root.id) {
      members.push(`${member}: ${rootFn}`)
      continue
    }
    const tag = resolveTag(node, component)
    // A slot on some OTHER part that happens to be named `root` would collide with the
    // root function's name for the same reason, without being the same component.
    const fn = `${name}${member}` === rootFn ? `${name}${member}Slot` : `${name}${member}`
    const styleA = styleAttrsFor(ctx, node, nodeStyleDecls(ctx, node, tag))
    const inner = `${inlineKids(node, 3)}{children}`
    const isTrigger = Boolean(plan && s.slot.role === 'trigger')
    const isPanel = Boolean(plan && s.slot.role === 'panel')

    const subProps = node.contract?.props ?? []
    const subPropLines = subProps.map(
      (p) => `  ${camelCase(p.name)}${p.required ? '' : '?'}: ${tsType(ctx, p.type, sharedTypes)}`,
    )
    if (isTrigger || isPanel) subPropLines.unshift(`  ${vf}: string`)
    const subEventLines = eventPropLines(ctx, node.contract?.events, sharedTypes)
    const subDestructure = [
      ...(isTrigger || isPanel ? [vf] : []),
      ...subProps.map((p) => camelCase(p.name)),
      'children',
    ].join(', ')

    let fnBody: string[]
    if (isTrigger) {
      const handlerA = emissionHandlers(ctx, node, { onClick: [`ctx.setValue(${vf})`] })
      fnBody = [
        `function ${fn}({ ${subDestructure} }: ${fn}Props) {`,
        `  const ctx = useContext(${ctxName})`,
        `  return (`,
        `    <${tag}${styleA}${handlerA} data-active={ctx.value === ${vf} ? '' : undefined}>${inner}</${tag}>`,
        `  )`,
        `}`,
      ]
    } else if (isPanel) {
      const handlerA = emissionHandlers(ctx, node)
      fnBody = [
        `function ${fn}({ ${subDestructure} }: ${fn}Props) {`,
        `  const ctx = useContext(${ctxName})`,
        `  if (ctx.value !== ${vf}) return null`,
        `  return (`,
        `    <${tag}${styleA}${handlerA}>${inner}</${tag}>`,
        `  )`,
        `}`,
      ]
    } else {
      const handlerA = emissionHandlers(ctx, node)
      fnBody = [
        `function ${fn}({ ${subDestructure} }: ${fn}Props) {`,
        `  return (`,
        `    <${tag}${styleA}${handlerA}>${inner}</${tag}>`,
        `  )`,
        `}`,
      ]
    }
    subs.push(
      [
        `export interface ${fn}Props {`,
        ...subPropLines,
        ...subEventLines,
        `  children?: ReactNode`,
        `}`,
        ``,
        ...fnBody,
      ].join('\n'),
    )
    members.push(`${member}: ${fn}`)
    flatExports.push(fn)
  }

  const rootInner = `${inlineKids(root, 3)}{children}`
  const rootReturn = plan
    ? [
        `    <${ctxName}.Provider value={{ value: current, setValue: change }}>`,
        `      <${rootTag}${rootStyleAttr}>${rootInner}</${rootTag}>`,
        `    </${ctxName}.Provider>`,
      ]
    : [`    <${rootTag}${rootStyleAttr}>${rootInner}</${rootTag}>`]
  const rootState = plan
    ? [
        `  const [value, setValue] = useState(defaultValue)`,
        `  const current = valueProp ?? value`,
        `  const change = (next: string) => { setValue(next); onValueChange?.(next) }`,
      ]
    : []

  const out: string[] = [
    ...(plan ? [`'use client'`, ``] : []),
    plan
      ? `import { createContext, useContext, useState, type ReactNode } from 'react'`
      : `import type { ReactNode } from 'react'`,

    ...iconModuleImport(ctx),
    ...instanceImport(ctx),
    ...stylesImport(ctx, name),
    ...(plan
      ? [
          ``,
          `const ${ctxName} = createContext<{ value?: string; setValue: (value: string) => void }>({ setValue: () => {} })`,
        ]
      : []),
    ``,
    `export interface ${name}Props {`,
    ...interfaceLines,
    `}`,
    ``,
    `function ${rootFn}({ ${destructure} }: ${name}Props) {`,
    ...rootState,
    `  return (`,
    ...rootReturn,
    `  )`,
    `}`,
    ``,
    ...subs.flatMap((s) => [s, ``]),
  ]
  if (naming === 'dot') {
    out.push(`export const ${name} = Object.assign(${rootFn}, { ${members.join(', ')} })`, ``)
  } else {
    out.push(
      `export { ${rootFn} as ${name}${flatExports.length ? ', ' + flatExports.join(', ') : ''} }`,
      ``,
    )
  }
  return out.join('\n')
}

// Resolve an anchor node id (referenced by a rule's `ancestorStates`) to its node + tree
// depth, so the sheet can emit `.ancestor:state .self` and order multiple anchors from
// outermost to innermost. Only meaningful on the generic emission path, where the node
// tree maps 1:1 to DOM nesting. Depth = distance from the root (root = 0).
function buildAnchorResolver(
  component: ComponentIR,
): (nodeId: string) => { node: ComponentNode; depth: number } | undefined {
  const nodes = component.structure.nodes
  const depth = new Map<string, number>()
  const walk = (id: string, d: number) => {
    const node = nodes[id]
    if (!node) return
    depth.set(id, d)
    for (const childId of node.childrenIds ?? []) walk(childId, d + 1)
  }
  walk(component.structure.rootId, 0)
  return (nodeId) => {
    const node = nodes[nodeId]
    const d = depth.get(nodeId)
    return node && d !== undefined ? { node, depth: d } : undefined
  }
}

// For a node's self state, the nearest ANCESTOR that CONTROLS it (holds a stateBinding for that
// state) - so the sheet can re-scope a part's `onSelected`/`onChecked`/… rule under the controlling
// ancestor (`.root[data-selected] .indicator`) instead of emitting the dead self-scoped
// `.indicator[data-selected]`. Mirrors the preview, where the root's controlled state flows down to
// all parts (recipes.ts `controlled`). Walks strictly UPWARD, so the controlling node's OWN rule
// (root) stays self-scoped and the returned owner is always a genuine DOM ancestor.
function buildControlledStateAnchor(
  component: ComponentIR,
): (nodeId: string, state: StateName) => string | undefined {
  const nodes = component.structure.nodes
  const parent = new Map<string, string>()
  const walk = (id: string) => {
    for (const childId of nodes[id]?.childrenIds ?? []) {
      parent.set(childId, id)
      walk(childId)
    }
  }
  walk(component.structure.rootId)
  return (nodeId, state) => {
    let cur = parent.get(nodeId)
    while (cur) {
      if (nodes[cur]?.stateBindings?.some((b) => b.state === state)) return cur
      cur = parent.get(cur)
    }
    return undefined
  }
}

// The interface constraints (proposal 0052 §4.1) narrow whatever props interface the component's
// emitter wrote, so they are applied once here rather than in each of the archetype emitters. What
// a type cannot say comes back in `untyped`; a state rule the style sheet had no selector for comes
// back in `unrealized`. Both are for the target's `skipped` report.
function emitComponent(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): { tsx: string; css: string; untyped: string[]; unrealized: string[] } {
  const ctx = createEmitCtx(component, options)
  const name = componentName(component)
  const out = emitComponentBody(ctx, component, options, sharedTypes)
  const typed = applyInterfaceConstraints(
    out.tsx,
    component,
    name,
    camelCase,
    options.contextGroups,
  )
  return {
    ...out,
    tsx: typed.tsx,
    untyped: typed.skipped,
    unrealized: [
      ...ctx.sheet.skipped,
      ...ctx.deadConditions,
      ...unsetConditions(component, out.css, typed.tsx, ctx.deadConditions),
    ].map((s) => `${name}: ${s}`),
  }
}

// The backstop behind `condAttrs`: a `[data-cond-…]` selector in the sheet whose attribute the
// component never writes. Each archetype's render path has to remember to set the attribute, and
// the root and the custom toggles did not - so instead of trusting every path, compare what the
// sheet keys off with what the markup writes. A rule found here is one that can never apply.
function unsetConditions(
  component: ComponentIR,
  css: string,
  tsx: string,
  alreadyReported: readonly string[],
): string[] {
  const out: string[] = []
  for (const node of Object.values(component.structure.nodes)) {
    for (const rule of (node.states ?? []).filter(ruleNeedsDataCond)) {
      const attr = dataCondAttr(rule)
      if (!css.includes(`[${attr}]`) || tsx.includes(`${attr}=`)) continue
      const part = node.part?.split('.').pop() ?? node.name
      const note =
        `part "${part}": a condition combines a state or an ancestor the generated component ` +
        `cannot read at runtime, so the rule is never applied.`
      if (!alreadyReported.includes(note) && !out.includes(note)) out.push(note)
    }
  }
  return out
}

/** What a component's constraints could not become as types - for a target's `skipped` list. */
export function untypedConstraints(component: ComponentIR, options: EmitOptions = {}): string[] {
  return emitComponent(component, options, options.sharedTypes ?? []).untyped
}

function emitComponentBody(
  ctx: EmitCtx,
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): { tsx: string; css: string } {
  const name = componentName(component)
  const root = component.structure.nodes[component.structure.rootId]
  if (!root) return { tsx: `export function ${name}() {\n  return null\n}\n`, css: '' }

  // DatePicker has its own view over the shared calendar core (proposal 0029).
  if (component.archetype === 'DatePicker') {
    return { tsx: emitDatePicker(ctx, component, options), css: ctx.sheet.toCss() }
  }
  if (component.archetype === 'TimePicker') {
    return { tsx: emitTimePicker(ctx, component, options), css: ctx.sheet.toCss() }
  }
  if (component.archetype === 'ColorPicker') {
    return { tsx: emitColorPicker(ctx, component, options), css: ctx.sheet.toCss() }
  }

  const slots = collectSlots(component).filter((s) => !component.structure.nodes[s.nodeId]?.repeat)
  if (slots.length > 0 && (options.emitStyle ?? 'compound') !== 'props') {
    return {
      tsx: emitCompound(ctx, component, slots, options, sharedTypes),
      css: ctx.sheet.toCss(),
    }
  }

  const plan = planBehavior(component)
  // The vertical emitters cover activate-opened, trigger-owned popups. Plans the
  // preview realizes beyond that (hover tooltips, context menus, standalone menus,
  // inline disclosures) keep the generic emission path for now.
  if (plan?.kind === 'disclosure' && plan.openOn === 'activate' && !plan.standalone) {
    if (plan.surfaceKind === 'dialog')
      return { tsx: emitDisclosure(ctx, component, plan), css: ctx.sheet.toCss() }

    const triggerIsInput = component.structure.nodes[plan.triggerId ?? '']?.kind === 'input'
    if (
      (plan.surfaceKind === 'popover' || plan.surfaceKind === 'menu') &&
      plan.selectable &&
      plan.optionId
    ) {
      return {
        tsx: triggerIsInput ? emitCombobox(ctx, component, plan) : emitSelect(ctx, component, plan),
        css: ctx.sheet.toCss(),
      }
    }

    if (
      (plan.surfaceKind === 'menu' || plan.surfaceKind === 'popover') &&
      plan.optionId &&
      !triggerIsInput
    ) {
      return { tsx: emitMenu(ctx, component, plan, sharedTypes), css: ctx.sheet.toCss() }
    }
  }

  // Generic path only: node ancestry equals DOM ancestry here, so a rule's ancestorStates
  // can be emitted as descendant selectors under the referenced ancestor. (The compound/
  // overlay/menu/date emitters above returned already, leaving the resolver unset → self.)
  ctx.sheet.setAnchorResolver(buildAnchorResolver(component))
  // Re-scope a fixed part's rule keyed on a ROOT-controlled state under that root, so a toggle's
  // icon/label actually restyle when ON in the generated CSS (matching the preview cascade).
  ctx.sheet.setControlledStateAnchor(buildControlledStateAnchor(component))

  const tag = resolveTag(root, component)

  const togglePlan = tag === 'button' || tag === 'a' ? planToggle(ctx, component) : null
  const overlayPlan = planOverlays(component)

  // A toggle realizes its on-state as `data-<state>` + aria-pressed (see rootData below), not
  // the input pseudo `:checked`/`:active` - so rules keyed on that state must select the attr.
  ctx.sheet.setDataStates(togglePlan ? new Set([togglePlan.dataState]) : undefined)

  const hostsAnchoredOverlay = [...overlayPlan.surfaces.values()].some((o) => !o.modal)
  const rootAnchor = hostsAnchoredOverlay ? [{ prop: 'position', value: 'relative' }] : []
  const rootBind = ctx.sheet.register(root, [...rootAnchor, ...nodeStyleDecls(ctx, root, tag)])
  // A context-typed prop's attribute is set by `contextPropAttrs`, with the declared default as
  // its fallback; the variant attribute for the same prop would be a second `data-<prop>` on the
  // same element, which JSX rejects. The two spell the same attribute, so one is enough.
  const contextProps = new Set(
    (component.contract?.props ?? [])
      .filter((p) => p.type.kind === 'context' && ctx.contextGroups.has(p.type.group))
      .map((p) => p.name),
  )
  const variantData = rootBind.dataAttrs
    .filter((d) => !contextProps.has(d.prop))
    .map((d) => ` ${d.attr}={${bindingExpr(d.prop)}}`)
    .join('')
  const contextData = contextPropAttrs(ctx, component)
  // The root's own rich `when` rules (0032) need their data-cond attribute set here too: the
  // sheet keys them off it exactly as it does a child's, and without it they never applied.
  const rootData =
    (togglePlan
      ? `${variantData}${contextData} data-${togglePlan.dataState}={${togglePlan.stateVar} ? '' : undefined} aria-pressed={${togglePlan.stateVar}}`
      : variantData + contextData + stateBindingAttrs(root)) + condAttrs(ctx, root)
  // Secondary activation on the region presents a context menu (proposal 0032's
  // `openOn: 'context'`), which is the whole of how a ContextMenu is invoked - the same
  // handler the canvas installs in `applyDisclosure`.
  const rootContext = overlayPlan.triggers.get(root.id)
  const contextOpen =
    rootContext && rootContext.openOn === 'context'
      ? ` onContextMenu={(e) => { e.preventDefault(); ${rootContext.setter}(true) }}`
      : ''
  const rootHandlers =
    (togglePlan
      ? ` onClick={() => { const next = !${togglePlan.stateVar}; ${togglePlan.setter}(next); ${togglePlan.event ? `on${pascalCase(togglePlan.event)}?.(${togglePlan.eventArg})` : ''} }}`
      : emissionHandlers(ctx, root)) + contextOpen
  const overlays = overlayPlan

  ctx.selection = planSelection(ctx, component)

  ctx.stepper = planStepper(component)

  ctx.slider = planSlider(component)

  ctx.textEntry = ctx.stepper || ctx.slider ? null : planTextEntry(ctx, component)
  const kids = childrenJsx(ctx, root, component, 3, overlays)
  const inner = kids.length ? `\n${kids.join('\n')}\n    ` : ''

  const bodyUsesChildren = inner.includes('{children}')

  const overlayList = [...overlays.surfaces.values()]
  const hasOverlays = overlayList.length > 0
  const overlayRefs = overlayList
    .filter((o) => o.surfaceRef)
    .flatMap((o) => [
      `  const ${o.surfaceRef} = useRef<${surfaceRefType(component, o)}>(null)`,
      // Read from the DOM rather than from a list prop: the items are whatever the
      // author's repeat produced, and the roles are already on them.
      `  const _items${o.state.replace('open', '')} = () => Array.from(${o.surfaceRef}.current?.querySelectorAll<HTMLElement>('[role="${o.itemRole ?? 'menuitem'}"]') ?? [])`,
      `  const ${navName(o)} = (e: ReactKeyboardEvent) => {`,
      `    const items = _items${o.state.replace('open', '')}()`,
      `    if (!items.length) return`,
      `    const i = items.indexOf(document.activeElement as HTMLElement)`,
      `    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus() }`,
      `    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus() }`,
      `    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus() }`,
      `    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus() }`,
      `  }`,
    ])
  const overlayState = overlayList.map((o) => `  const [${o.state}, ${o.setter}] = useState(false)`)
  const overlayEffects = overlayList
    .filter((o) => o.dismissable)
    .flatMap((o) => [
      ``,
      `  useEffect(() => {`,
      `    if (!${o.state}) return`,
      `    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ${o.setter}(false) }`,
      `    document.addEventListener('keydown', onKey)`,
      ...(o.surfaceRef
        ? [
            // Opening lands the cursor on the first item, so the menu is usable without
            // ever touching the pointer that opened it.
            `    _items${o.state.replace('open', '')}()[0]?.focus()`,
            // A menu opened by right-click has no trigger to click again, so pointing
            // anywhere outside it is the only dismissal besides Escape. Bound on mousedown
            // rather than click so it settles before the browser's own menu logic runs.
            `    const onDown = (e: MouseEvent) => { if (${o.surfaceRef}.current && !${o.surfaceRef}.current.contains(e.target as Node)) ${o.setter}(false) }`,
            `    document.addEventListener('mousedown', onDown)`,
            `    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }`,
          ]
        : [`    return () => document.removeEventListener('keydown', onKey)`]),
      `  }, [${o.state}])`,
    ])

  const sel = ctx.selection

  const selNav = usesSelectionNav(ctx)
  const selState = sel
    ? [
        `  const [_selected, setSelValue] = useState(value)`,
        ...(selNav
          ? [
              `  const _moveSel = (dir: number) => {`,
              `    const _l = ${sel.itemsProp} ?? []`,
              `    if (!_l.length) return`,
              `    const _i = _l.findIndex((x) => x.${sel.field} === _selected)`,
              `    const _n = _l[(_i + dir + _l.length) % _l.length]`,
              `    setSelValue(_n.${sel.field})${sel.event ? `; on${pascalCase(sel.event)}?.(_n.${sel.field})` : ''}`,
              `  }`,
              `  const _onSelKey = (e: ReactKeyboardEvent) => {`,
              `    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); _moveSel(1) }`,
              `    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); _moveSel(-1) }`,
              `  }`,
            ]
          : []),
      ]
    : []

  const toggleState = togglePlan
    ? [
        `  const [${togglePlan.stateVar}, ${togglePlan.setter}] = useState(${togglePlan.prop} ?? false)`,
      ]
    : []

  const step = ctx.stepper
  const stepperState = step
    ? [
        `  const [_${step.prop}, _set${pascalCase(step.prop)}] = useState(${step.prop} ?? 0)`,
        `  const _${step.prop}Ref = useRef(${step.prop} ?? 0)`,
      ]
    : []

  const sl = ctx.slider
  const sliderState = sl
    ? [
        `  const [_${sl.prop}, _set${pascalCase(sl.prop)}] = useState(${sl.prop} ?? 0)`,
        `  const _pct = ((_${sl.prop} - ${sl.hasMin ? '(min ?? 0)' : '0'}) / (${sl.hasMax ? '(max ?? 100)' : '100'} - ${sl.hasMin ? '(min ?? 0)' : '0'})) * 100`,
      ]
    : []

  const te = ctx.textEntry
  const textState = te
    ? [`  const [_${te.prop}, _set${pascalCase(te.prop)}] = useState(${te.prop} ?? '')`]
    : []
  const needsUseId = ctx.a11y.needsUseId
  // A context-gated predicate (0032 phase 4) needs the MildaContext hook → 'use client'.
  const needsClient =
    hasOverlays ||
    needsUseId ||
    !!sel ||
    !!togglePlan ||
    !!step ||
    !!sl ||
    !!te ||
    ctx.usesMildaContext
  const reactHooks = [
    ...(hasOverlays || sel || togglePlan || step || sl || te ? ['useState'] : []),
    ...(overlayList.some((o) => o.dismissable) ? ['useEffect'] : []),
    ...(step || overlayRefs.length ? ['useRef'] : []),
    ...(needsUseId ? ['useId'] : []),
    ...(selNav || overlayRefs.length ? ['type KeyboardEvent as ReactKeyboardEvent'] : []),
  ]
  const runtimeImports = needsClient
    ? [
        `'use client'`,
        ``,
        ...(reactHooks.length ? [`import { ${reactHooks.join(', ')} } from 'react'`] : []),
        ...(overlayList.some((o) => o.modal) ? [`import { createPortal } from 'react-dom'`] : []),
        ``,
      ]
    : []
  const a11yState = needsUseId ? [`  const _aid = useId()`] : []
  const mildaCtxState = ctx.usesMildaContext ? [`  const _mildaCtx = useMildaContext()`] : []
  const bodyPrelude = needsClient
    ? [
        ...mildaCtxState,
        ...a11yState,
        ...overlayRefs,
        ...overlayState,
        ...selState,
        ...toggleState,
        ...stepperState,
        ...sliderState,
        ...textState,
        ...overlayEffects,
        ``,
      ]
    : []

  const cprops = propTypeLines(ctx, component, sharedTypes)
  const names = propNames(component)

  const eventLines = eventPropLines(ctx, interfaceEventDefs(ctx, component), sharedTypes)
  const hasProps = cprops.length > 0
  const usesReactNode = [...cprops, ...eventLines].some((l) => l.includes('ReactNode'))

  if (tag === 'button' || tag === 'a') {
    const dom = tag === 'button' ? 'ButtonHTMLAttributes' : 'AnchorHTMLAttributes'
    const el = tag === 'button' ? 'HTMLButtonElement' : 'HTMLAnchorElement'
    const surface = ctx.surface

    const exposesNativeEvents = surface.domEvents || surface.nativeAttrs
    const eventDecls = exposesNativeEvents
      ? customEventPropLines(ctx, interfaceEventDefs(ctx, component), sharedTypes)
      : eventPropLines(ctx, interfaceEventDefs(ctx, component), sharedTypes)

    const reactTypes = new Set<string>()
    if (usesReactNode || bodyUsesChildren) reactTypes.add('ReactNode')
    const extendsList: string[] = []
    if (surface.nativeAttrs) {
      extendsList.push(`${dom}<${el}>`)
      reactTypes.add(dom)
    } else {
      if (surface.aria) {
        extendsList.push('AriaAttributes')
        reactTypes.add('AriaAttributes')
      }
      if (surface.domEvents) {
        extendsList.push(`Omit<DOMAttributes<${el}>, 'children' | 'dangerouslySetInnerHTML'>`)
        reactTypes.add('DOMAttributes')
      }
    }

    const surfaceLines: string[] = []
    if (!surface.nativeAttrs) {
      if (surface.className) surfaceLines.push(`  className?: string`)
      if (surface.style) {
        surfaceLines.push(`  style?: CSSProperties`)
        reactTypes.add('CSSProperties')
      }

      if (surface.data)
        surfaceLines.push('  [key: `data-${string}`]: string | number | boolean | undefined')
    }
    const childLine = bodyUsesChildren ? ['  children?: ReactNode'] : []
    const extraLines = [...childLine, ...cprops, ...eventDecls, ...surfaceLines]

    const importLine = reactTypes.size
      ? `import type { ${[...reactTypes].sort().join(', ')} } from 'react'`
      : ''
    const ext = extendsList.length ? ` extends ${extendsList.join(', ')}` : ''
    const propsDecl =
      extendsList.length || extraLines.length
        ? `export interface ${name}Props${ext} {\n${extraLines.join('\n')}\n}`
        : `export type ${name}Props = Record<string, never>`

    const exposesClass = surface.className || surface.nativeAttrs
    const classExpr = exposesClass
      ? rootBind.className
        ? ` className={[styles.${rootBind.className}, className].filter(Boolean).join(' ')}`
        : ` className={className}`
      : rootBind.className
        ? ` className={styles.${rootBind.className}}`
        : ''
    const exposesStyle = surface.style || surface.nativeAttrs
    const styleExpr = exposesStyle ? ` style={style}` : ''

    const spread = surface.aria || surface.data || surface.domEvents || surface.nativeAttrs

    const nativeContractNames = names.filter((n) => NATIVE_PROP_NAMES.has(n))
    const customNames = names.filter((n) => !NATIVE_PROP_NAMES.has(n))
    const nativeApply = spread ? '' : nativeContractNames.map((n) => ` ${n}={${n}}`).join('')

    // Navigation destination: an <a> root lowers node.destination (static or prop-bound)
    // to the native href. Decoupled from prop names - the author declares the binding.
    const destExpr =
      tag === 'a' && root.destination ? ` href={${contentValueExpr(root.destination)}}` : ''

    const destructure = [
      ...(bodyUsesChildren ? ['children'] : []),
      ...(exposesClass ? ['className'] : []),
      ...(exposesStyle ? ['style'] : []),
      ...customNames,
      ...(spread ? [] : nativeContractNames),
      ...emittedHandlerNames(ctx, component),
      ...(spread ? ['...props'] : []),
    ].join(', ')

    return {
      tsx: [
        ...runtimeImports,
        ...(importLine ? [importLine] : []),
        ...iconModuleImport(ctx),
        ...mildaContextImport(ctx),
        ...instanceImport(ctx),
        ...stylesImport(ctx, name),
        ``,
        propsDecl,
        ``,
        `export function ${name}({ ${destructure} }: ${name}Props) {`,
        ...bodyPrelude,
        `  return (`,
        `    <${tag}${spread ? ' {...props}' : ''}${classExpr}${nativeApply}${destExpr}${rootData}${a11yLabelAttrs(ctx, root)}${a11yAttrs(ctx, root)}${rootHandlers}${styleExpr}>${inner}</${tag}>`,
        `  )`,
        `}`,
        ``,
      ].join('\n'),
      css: ctx.sheet.toCss(),
    }
  }

  // The container role lands on the node core's plan names, which is the root for a
  // ChoiceGroup/List but the `list` part for Tabs - a tablist must not enclose its panel.
  const selRootA = selectionContainerAttrs(ctx, root) + selectionPanelAttrs(ctx, root)
  const rootAttrs =
    (rootBind.className ? ` className={styles.${rootBind.className}}` : '') +
    rootData +
    selRootA +
    a11yLabelAttrs(ctx, root) +
    (isNameableControl(root) ? a11yAttrs(ctx, root) : '') +
    rootHandlers

  const childLines = bodyUsesChildren ? [`  children?: ReactNode`] : []
  const interfaceLines = [...cprops, ...eventLines, ...childLines]
  const needsReactNode = interfaceLines.some((l) => l.includes('ReactNode'))
  const destructure = [
    ...names,
    ...emittedHandlerNames(ctx, component),
    ...(bodyUsesChildren ? ['children'] : []),
  ].join(', ')
  return {
    tsx: [
      ...runtimeImports,
      ...(needsReactNode ? [`import type { ReactNode } from 'react'`] : []),
      ...iconModuleImport(ctx),
      ...mildaContextImport(ctx),
      ...instanceImport(ctx),
      ...stylesImport(ctx, name),
      ``,
      `export interface ${name}Props {`,
      ...interfaceLines,
      `}`,
      ``,
      `export function ${name}({ ${destructure} }: ${name}Props) {`,
      ...bodyPrelude,
      `  return (`,
      `    <${tag}${rootAttrs}>${inner}</${tag}>`,
      `  )`,
      `}`,
      ``,
    ].join('\n'),
    css: ctx.sheet.toCss(),
  }
}

export function toComponentSource(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): string {
  return emitComponent(
    component,
    options,
    sharedTypes.length ? sharedTypes : (options.sharedTypes ?? []),
  ).tsx
}

export function toComponentStyles(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): string {
  return emitComponent(component, options, sharedTypes).css
}

// `skipped` is everything this component's emission could not express, in the author's terms.
export function toComponentFiles(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): { tsx: string; css: string; skipped: string[] } {
  const { tsx, css, untyped, unrealized } = emitComponent(
    component,
    options,
    sharedTypes.length ? sharedTypes : (options.sharedTypes ?? []),
  )
  return { tsx, css, skipped: [...unrealized, ...untyped] }
}
