import {
  anchorDecls,
  backdropDecls,
  baselineDecls,
  collectSlots,
  cssVarRef,
  easingVarName,
  facetCssVar,
  facetDecls,
  iconifySvgUrl,
  layoutVarDecls,
  motionDecls,
  normalizeNodeContent,
  resolveIcon,
  planBehavior,
  planCompound,
  surfacePositionDecls,
  type ComponentIR,
  type ComponentNode,
  type ContentValue,
  type DisclosurePlan,
  type EventDef,
  type IconLibrary,
  type PropCondition,
  type PropType,
  type SharedType,
  type SlotSurface,
  type StyleDecl,
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
  CHECKBOX_ROOT_DECLS,
  CHECKBOX_INDICATOR_DECLS,
  CHECKBOX_GLYPH_DECLS,
  CHECKBOX_GLYPH_CHECKED_DECLS,
  CHECKBOX_FOCUS_DECLS,
  CHECKBOX_DISABLED_DECLS,
  SWITCH_TRACK_DECLS,
  SWITCH_THUMB_DECLS,
  SWITCH_THUMB_CHECKED_DECLS,
  CHECKBOX_INDICATOR_TRANSITION,
  CHECKBOX_GLYPH_TRANSITION,
  SWITCH_TRACK_TRANSITION,
  SWITCH_THUMB_TRANSITION,
  timingTransitionDecl,
  type ControlTransition,
  SR_ONLY_DECLS,
  BUILTIN_COLOR_ID,
  BUILTIN_ICON_NAME_ID,
  BUILTIN_DATE_ID,
  BUILTIN_FILE_ID,
  iconLabel,
  type Icon,
  type PropDef,
  type PropValue,
  type RepeatSource,
} from '@mildastudio/core'
import { StyleSheet } from '../css/sheet'

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
}

const ROOT_ELEMENT: Record<string, string> = {
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

export function resolveTag(node: ComponentNode, component: ComponentIR): string {
  if (node.parentId === null) {
    return rootElement(component)
  }
  if (node.tag === 'auto') return 'div'
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

function tsType(t: PropType, sharedTypes: SharedType[] = []): string {
  switch (t.kind) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'enum':
      return t.values.length ? t.values.map((v) => JSON.stringify(v)).join(' | ') : 'string'
    case 'union':
      return t.members.length ? t.members.map((m) => tsType(m, sharedTypes)).join(' | ') : 'unknown'
    case 'array': {
      const inner = tsType(t.item, sharedTypes)
      return t.item.kind === 'union' ? `(${inner})[]` : `${inner}[]`
    }
    case 'object':
      return `{ ${t.fields.map((f) => `${f.name}${f.required ? '' : '?'}: ${tsType(f.type, sharedTypes)}`).join('; ')} }`
    case 'component':
      return 'ReactNode'
    case 'ref': {
      if (t.ref === BUILTIN_ICON_NAME_ID) {
        if (!hasIconModule()) return 'string'
        usesIconNameType = true
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
          return arg ? tsType(arg, sharedTypes) : 'unknown'
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
      const ps = t.params.map((p) => `${p.name}: ${tsType(p.type, sharedTypes)}`).join(', ')
      return `(${ps}) => ${tsType(t.returnType, sharedTypes)}`
    }
    case 'record':
      return `Record<${tsType(t.key, sharedTypes)}, ${tsType(t.value, sharedTypes)}>`
    case 'intersection':
      return t.members.map((m) => tsType(m, sharedTypes)).join(' & ')
  }
}

function propTypeLines(component: ComponentIR, sharedTypes: SharedType[] = []): string[] {
  return (component.contract?.props ?? []).map(
    (p) => `  ${camelCase(p.name)}${p.required ? '' : '?'}: ${tsType(p.type, sharedTypes)}`,
  )
}

function propNames(component: ComponentIR): string[] {
  return (component.contract?.props ?? []).map((p) => camelCase(p.name))
}

function eventHandlerName(name: string): string {
  return `on${pascalCase(name)}`
}

function eventPropLines(events: EventDef[] = [], sharedTypes: SharedType[] = []): string[] {
  return events
    .filter((e) => e.name)
    .map((e) => {
      const sig = e.payload ? `(payload: ${tsType(e.payload, sharedTypes)}) => void` : `() => void`
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

function customEventPropLines(events: EventDef[] = [], sharedTypes: SharedType[] = []): string[] {
  return eventPropLines(events, sharedTypes).filter((line) => {
    const handler = line.trim().split('?:')[0]
    return !NATIVE_HANDLERS.has(handler)
  })
}

function emittedEventNames(component: ComponentIR): string[] {
  const names = new Set<string>()
  for (const n of Object.values(component.structure.nodes))
    for (const e of n.emits ?? []) names.add(emissionEventName(e.eventId))
  return [...names]
}
function emittedHandlerNames(component: ComponentIR): string[] {
  return emittedEventNames(component).map(eventHandlerName)
}

function interfaceEventDefs(component: ComponentIR): EventDef[] {
  const byName = new Map<string, EventDef>()
  for (const e of component.contract?.events ?? []) if (e.name) byName.set(e.name, e)
  const props = component.contract?.props ?? []
  for (const node of Object.values(component.structure.nodes)) {
    for (const em of node.emits ?? []) {
      const name = emissionEventName(em.eventId)
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

function contentValueExpr(value: ContentValue): string {
  return value.kind === 'text' ? JSON.stringify(value.text) : bindingExpr(value.propName)
}

function whenExpr(when: PropCondition): string {
  const parts = Object.entries(when).map(([k, v]) => `${bindingExpr(k)} === ${JSON.stringify(v)}`)
  return parts.length ? parts.join(' && ') : 'true'
}

function contentExpr(node: ComponentNode): string | null {
  if (node.slot?.default) return 'children'
  const c = normalizeNodeContent(node.content)
  if (!c) return null
  if (c.kind === 'static') return JSON.stringify(c.text)
  let expr = contentValueExpr(c.default)
  for (let i = c.rules.length - 1; i >= 0; i--) {
    expr = `${whenExpr(c.rules[i].when)} ? ${contentValueExpr(c.rules[i].value)} : ${expr}`
  }
  return expr
}

function textContent(node: ComponentNode): string {
  const expr = contentExpr(node)
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

function nodeStyleDecls(node: ComponentNode, tag: string): StyleDecl[] {
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
    ...layoutVarDecls(node.layout),
    ...facetDecls(node.facets, facetCssVar),

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

let activeSheet = new StyleSheet()

function staticIconName(node: ComponentNode): string | undefined {
  const c = node.content
  if (c?.kind === 'static') return c.text || undefined
  if (c?.kind === 'dynamic' && c.default.kind === 'text') return c.default.text || undefined
  return undefined
}

let usesIconComponent = false

let usesIconNameType = false

function hasIconModule(): boolean {
  return (activeIconLib?.icons.length ?? 0) > 0
}

let activeProps = new Map<string, PropDef>()

let activeIconLib: IconLibrary | undefined
let activeAssets: Record<string, { url?: string }> | undefined

let componentsById = new Map<string, ComponentIR>()
let activeInstances = new Set<string>()

let activeEventNames = new Map<string, string>()

function emissionEventName(eventId: string): string {
  return activeEventNames.get(eventId) ?? eventId
}

let activeSurface: ReactSurface = SEALED_SURFACE

let activeSelection: SelectionInfo | null = null

let activeSelectionCond: string | null = null

let activeStepper: StepperInfo | null = null

let activeSlider: SliderInfo | null = null

let activeTextEntry: TextEntryInfo | null = null

function instanceImport(): string[] {
  return [...activeInstances].sort().map((n) => `import { ${n} } from './${n}'`)
}

interface A11yPlan {
  labelId: Map<string, string>

  controlId: Map<string, string>

  labelFor: Map<string, string>

  needsUseId: boolean
}
let activeA11y: A11yPlan = {
  labelId: new Map(),
  controlId: new Map(),
  labelFor: new Map(),
  needsUseId: false,
}

function planA11y(component: ComponentIR): A11yPlan {
  const nodes = component.structure.nodes
  const labelId = new Map<string, string>()
  const controlId = new Map<string, string>()
  const labelFor = new Map<string, string>()
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
  return { labelId, controlId, labelFor, needsUseId: labelId.size > 0 || controlId.size > 0 }
}

function a11yAttrs(node: ComponentNode): string {
  const a = node.a11y
  if (!a) return ''
  let out = ''
  if (a.name) out += ` aria-label={${contentValueExpr(a.name)}}`
  const cid = activeA11y.controlId.get(node.id)
  if (cid) out += ` id={${cid}}`
  else if (a.labelledBy && activeA11y.labelId.has(a.labelledBy)) {
    out += ` aria-labelledby={${activeA11y.labelId.get(a.labelledBy)}}`
  }
  return out
}

function a11yLabelAttrs(node: ComponentNode): string {
  let out = ''
  const forExpr = activeA11y.labelFor.get(node.id)
  if (forExpr) out += ` htmlFor={${forExpr}}`
  const idExpr = activeA11y.labelId.get(node.id)
  if (idExpr) out += ` id={${idExpr}}`
  return out
}

function boundIconProp(node: ComponentNode): string | undefined {
  const c = node.content
  if (c?.kind === 'dynamic' && c.default.kind === 'bind') return c.default.propName
  return undefined
}

function iconModuleImport(): string[] {
  if (usesIconComponent) return [`import { Icon, type IconName } from './Icon'`]

  if (usesIconNameType) return [`import type { IconName } from './Icon'`]
  return []
}

function iconMaskUrl(glyph: string): string | undefined {
  const resolved = resolveIcon(glyph, activeIconLib, activeAssets)
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
        `// at runtime — re-pin them in the icon library to vendor their SVG offline:`,
        ...cdnBacked.map((n) => `//   • ${n}`),
        ``,
      ]
    : []
  return [
    `import type { CSSProperties } from 'react'`,
    ``,
    ...cdnNote,
    `// Every curated icon in the design system, keyed by its name. Generated from the`,
    `// icon library — each glyph delivers as a self-contained CSS mask, no third-party`,
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
    `  // default — hidden from assistive tech).`,
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

function iconMaskPaintDecls(url: string): StyleDecl[] {
  const u = `url("${url}")`
  return [
    { prop: 'backgroundColor', value: 'currentColor' },
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
  node: ComponentNode,
  depth: number,
  keyAttr: string,
  overlays?: OverlayPlan,
): string {
  const pad = '  '.repeat(depth)
  const key = keyAttr ? ` ${keyAttr}` : ''
  const triggerFor = overlays?.triggers.get(node.id)
  const handlerAttr = emissionHandlers(
    node,
    triggerFor ? { onClick: [`${triggerFor.setter}((o) => !o)`] } : undefined,
  )

  const glyph = staticIconName(node)
  if (glyph) {
    const url = iconMaskUrl(glyph)
    if (url) {
      const glyphRule = (node.states ?? []).find((r) => r.glyph)
      const selUrl = glyphRule?.glyph ? iconMaskUrl(glyphRule.glyph) : undefined

      if (glyphRule && activeSelectionCond && activeSelection?.itemRole === 'radio') {
        const cond = activeSelectionCond
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
      if (selUrl && activeSelectionCond) {
        const cond = activeSelectionCond
        const styleA = styleAttrsFor(node, [
          ...ICON_BOX_DECLS,
          ...nodeStyleDecls(node, 'span'),
          ...iconMaskPaintDecls(url),
        ])
        const mask = `${cond} ? 'url("${selUrl}")' : undefined`
        const ink = glyphRule!.facets?.ink
        const parts = [`WebkitMaskImage: ${mask}`, `maskImage: ${mask}`]
        if (ink) parts.push(`backgroundColor: ${cond} ? 'var(--ds-color-${ink})' : undefined`)
        return `${pad}<span${key}${styleA} style={{ ${parts.join(', ')} }}${handlerAttr} aria-hidden />`
      }
      const styleA = styleAttrsFor(node, [
        ...ICON_BOX_DECLS,
        ...nodeStyleDecls(node, 'span'),
        ...iconMaskPaintDecls(url),
      ])
      return `${pad}<span${key}${styleA}${handlerAttr} aria-hidden />`
    }
  }
  const boundProp = boundIconProp(node)
  if (boundProp) {
    const styleA = styleAttrsFor(node, [...ICON_BOX_DECLS, ...nodeStyleDecls(node, 'span')])

    if (!hasIconModule())
      return `${pad}{${boundProp} && <span${key}${styleA}${handlerAttr} aria-hidden />}`
    usesIconComponent = true

    const iconEl = `<Icon name={${boundProp} as IconName}${handlerAttr ? '' : key}${styleA} />`
    return handlerAttr
      ? `${pad}{${boundProp} && <span${key}${handlerAttr} style={{ display: 'inline-flex' }}>${iconEl}</span>}`
      : `${pad}{${boundProp} && ${iconEl}}`
  }

  const styleA = styleAttrsFor(node, [...ICON_BOX_DECLS, ...nodeStyleDecls(node, 'span')])
  return `${pad}<span${key}${styleA}${handlerAttr} aria-hidden />`
}

function iconSpan(node: ComponentNode): string {
  const glyph = staticIconName(node)
  if (glyph) {
    const url = iconMaskUrl(glyph)
    if (url) {
      const styleA = styleAttrsFor(node, [
        ...ICON_BOX_DECLS,
        ...nodeStyleDecls(node, 'span'),
        ...iconMaskPaintDecls(url),
      ])
      return `<span${styleA} aria-hidden />`
    }
  }
  const styleA = styleAttrsFor(node, [...ICON_BOX_DECLS, ...nodeStyleDecls(node, 'span')])
  return `<span${styleA} aria-hidden />`
}

function styleAttrsFor(node: ComponentNode, baseDecls: StyleDecl[]): string {
  const b = activeSheet.register(node, baseDecls)
  const cls = b.className ? ` className={styles.${b.className}}` : ''
  const data = b.dataAttrs.map((d) => ` ${d.attr}={${bindingExpr(d.prop)}}`).join('')
  return cls + data
}

function stylesImport(name: string): string[] {
  return activeSheet.isEmpty ? [] : [`import styles from './${name}.module.css'`]
}

function checkedRuleDecls(node: ComponentNode): StyleDecl[] {
  return (node.states ?? [])
    .filter((r) => Object.keys(r.props).length === 0 && r.states.includes('checked'))
    .flatMap((r) => [...layoutVarDecls(r.layout), ...facetDecls(r.facets, facetCssVar)])
}

const durationVarRef = (id?: string) => facetCssVar('duration', id)
const easingVarRef = (id?: string) => (id ? cssVarRef(easingVarName(id)) : undefined)

const controlTiming = (t: ControlTransition): StyleDecl[] => {
  const d = timingTransitionDecl(t.properties, t.duration, t.easing, durationVarRef, easingVarRef)
  return d ? [d] : []
}

function toggleChangeHandler(node: ComponentNode): string {
  const em = (node.emits ?? []).find((e) => e.on === 'change' || e.on === 'activate')
  const name = em ? emissionEventName(em.eventId) : ''
  return name ? ` onChange={(e) => on${pascalCase(name)}?.(e.target.checked)}` : ''
}

function emitCheckboxParts(
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
    ...layoutVarDecls(indicator.layout),
    ...facetDecls(indicator.facets, facetCssVar),
    ...controlTiming(CHECKBOX_INDICATOR_TRANSITION),
  ]

  const glyphName = glyph ? staticIconName(glyph) : undefined

  const glyphMaskUrl =
    (glyphName ? iconMaskUrl(glyphName) : iconMaskUrl('check')) ?? DEFAULT_CHECK_MASK_URL
  const glyphTiming = controlTiming(CHECKBOX_GLYPH_TRANSITION)
  const glyphDecls = [
    ...CHECKBOX_GLYPH_DECLS,
    ...(glyph ? [...layoutVarDecls(glyph.layout), ...facetDecls(glyph.facets, facetCssVar)] : []),
    ...glyphTiming,
    ...iconMaskPaintDecls(glyphMaskUrl),
  ]
  const cls = activeSheet.checkbox(root, {
    rootDecls: CHECKBOX_ROOT_DECLS,
    controlDecls: SR_ONLY_DECLS,
    indicatorBase,
    indicatorChecked: checkedRuleDecls(indicator),
    glyphDecls,
    glyphChecked: CHECKBOX_GLYPH_CHECKED_DECLS,
    focusDecls: CHECKBOX_FOCUS_DECLS,
    disabledDecls: CHECKBOX_DISABLED_DECLS,
  })
  const key = keyAttr ? ` ${keyAttr}` : ''
  const checkedA = bind ? ` defaultChecked={${bind}}` : ''
  const handlerAttr = toggleChangeHandler(root)

  const nameExpr = root.a11y?.name ? contentValueExpr(root.a11y.name) : null
  const ariaA = nameExpr
    ? a11yAttrs({ ...root, a11y: { ...root.a11y, name: undefined } })
    : a11yAttrs(root)
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
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  keyAttr: string,
): string {
  return emitCheckboxParts(
    node,
    node,
    checkboxGlyphChild(node, component.structure.nodes),
    depth,
    keyAttr,
  )
}

function emitMaterializedCheckbox(
  node: ComponentNode,
  indicator: ComponentNode,
  glyph: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  return emitCheckboxParts(node, indicator, glyph, depth, keyAttr)
}

function emitSwitchParts(
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
    ...layoutVarDecls(track.layout),
    ...facetDecls(track.facets, facetCssVar),
    ...controlTiming(SWITCH_TRACK_TRANSITION),
  ]

  const thumbDecls = [
    ...SWITCH_THUMB_DECLS,
    ...(thumb ? [...layoutVarDecls(thumb.layout), ...facetDecls(thumb.facets, facetCssVar)] : []),
    ...controlTiming(SWITCH_THUMB_TRANSITION),
  ]
  const thumbChecked = [...SWITCH_THUMB_CHECKED_DECLS, ...(thumb ? checkedRuleDecls(thumb) : [])]
  const cls = activeSheet.switchControl(root, {
    rootDecls: CHECKBOX_ROOT_DECLS,
    controlDecls: SR_ONLY_DECLS,
    trackBase,
    trackChecked: checkedRuleDecls(track),
    thumbDecls,
    thumbChecked,
    focusDecls: CHECKBOX_FOCUS_DECLS,
    disabledDecls: CHECKBOX_DISABLED_DECLS,
  })
  const key = keyAttr ? ` ${keyAttr}` : ''
  const checkedA = bind ? ` defaultChecked={${bind}}` : ''
  const handlerAttr = toggleChangeHandler(root)

  const nameExpr = root.a11y?.name ? contentValueExpr(root.a11y.name) : null
  const ariaA = nameExpr
    ? a11yAttrs({ ...root, a11y: { ...root.a11y, name: undefined } })
    : a11yAttrs(root)
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

function emitSwitch(node: ComponentNode, depth: number, keyAttr: string): string {
  return emitSwitchParts(node, node, undefined, depth, keyAttr)
}

function emitMaterializedSwitch(
  node: ComponentNode,
  track: ComponentNode,
  thumb: ComponentNode | undefined,
  depth: number,
  keyAttr: string,
): string {
  return emitSwitchParts(node, track, thumb, depth, keyAttr)
}

interface OverlayInfo {
  surfaceId: string
  state: string
  setter: string
  anchorId: string | null
  kind: 'popover' | 'menu' | 'dialog' | 'sheet'
  modal: boolean
  dismissable: boolean
}
interface OverlayPlan {
  surfaces: Map<string, OverlayInfo>
  triggers: Map<string, OverlayInfo>
}

function planOverlays(component: ComponentIR): OverlayPlan {
  const surfaces = new Map<string, OverlayInfo>()
  const triggers = new Map<string, OverlayInfo>()
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
    }
    surfaces.set(n.id, info)
    if (info.anchorId) triggers.set(info.anchorId, info)
  }

  const plan = planBehavior(component)
  if (plan?.kind === 'disclosure' && plan.surfaceId && !surfaces.has(plan.surfaceId)) {
    const idx = i++
    const info: OverlayInfo = {
      surfaceId: plan.surfaceId,
      state: `open${idx}`,
      setter: `setOpen${idx}`,
      anchorId: plan.triggerId ?? null,
      kind: plan.surfaceKind,
      modal: plan.surfaceKind === 'dialog' || plan.surfaceKind === 'sheet',
      dismissable: plan.dismissable ?? true,
    }
    surfaces.set(info.surfaceId, info)
    if (info.anchorId) triggers.set(info.anchorId, info)
  }
  return { surfaces, triggers }
}

interface SelectionInfo {
  itemNodeId: string
  alias: string
  field: string
  current: string
  setter: string
  containerRole?: string
  itemRole?: string
  checkedAttr?: string
  itemsProp?: string
  event?: string
}

const SELECTION_ROLES: Record<string, { container: string; item: string; checked: string }> = {
  ChoiceGroup: { container: 'radiogroup', item: 'radio', checked: 'aria-checked' },
  Tabs: { container: 'tablist', item: 'tab', checked: 'aria-selected' },
  List: { container: 'listbox', item: 'option', checked: 'aria-selected' },
}
function planSelection(component: ComponentIR): SelectionInfo | null {
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
    const roles = component.archetype ? SELECTION_ROLES[component.archetype] : undefined
    return {
      itemNodeId: n.id,
      alias,
      field: em.payload.propName.slice(alias.length + 1),
      current: '_selected',
      setter: 'setSelValue',
      containerRole: roles?.container,
      itemRole: roles?.item,
      checkedAttr: roles?.checked,
      itemsProp: n.repeat.source.kind === 'prop' ? camelCase(n.repeat.source.propName) : undefined,
      event: emissionEventName(em.eventId),
    }
  }
  return null
}

interface ToggleInfo {
  prop: string
  event?: string
  stateVar: string
  setter: string
  dataState: string
}
function planToggle(component: ComponentIR): ToggleInfo | null {
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
  return {
    prop: id,
    event: em ? emissionEventName(em.eventId) : undefined,
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
function planTextEntry(component: ComponentIR): TextEntryInfo | null {
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
    event: em ? emissionEventName(em.eventId) : undefined,
    clearId: clear?.id,
    clearEvent: clearEm ? emissionEventName(clearEm.eventId) : undefined,
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

const INTERACTION_HANDLER: Record<string, string> = {
  activate: 'onClick',
  change: 'onChange',
  input: 'onInput',
  focus: 'onFocus',
  blur: 'onBlur',
  select: 'onClick',
  open: 'onClick',
  close: 'onClick',
  dismiss: 'onClick',
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

function emissionHandlers(node: ComponentNode, extra?: Record<string, string[]>): string {
  const byHandler = new Map<string, { stmts: string[]; needsEvent: boolean }>()
  const add = (handler: string, stmt: string, needsEvent = false) => {
    const entry = byHandler.get(handler) ?? { stmts: [], needsEvent: false }
    entry.stmts.push(stmt)
    entry.needsEvent = entry.needsEvent || needsEvent
    byHandler.set(handler, entry)
  }
  if (extra) for (const [h, stmts] of Object.entries(extra)) for (const s of stmts) add(h, s)
  for (const e of node.emits ?? []) {
    const handler = INTERACTION_HANDLER[e.on] ?? 'onClick'
    const fn = `on${pascalCase(emissionEventName(e.eventId))}`
    let payload = e.payload ? contentValueExpr(e.payload) : ''

    if (e.payload?.kind === 'bind') {
      const p = activeProps.get(e.payload.propName)
      if (p && !p.required) {
        const fb = payloadFallback(p.type, p.default)
        if (fb !== null) payload = `${payload} ?? ${fb}`
      }
    }

    const reuseNative =
      (activeSurface.domEvents || activeSurface.nativeAttrs) && !payload && NATIVE_HANDLERS.has(fn)
    add(handler, `${fn}?.(${reuseNative ? 'e' : payload})`, reuseNative)
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
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  overlays?: OverlayPlan,
): string | null {
  if (!node.repeat) return emitElement(node, component, depth, '', overlays)

  const pad = '  '.repeat(depth)
  const alias = node.repeat.itemAlias || 'item'
  const idx = `${alias}I`

  const src = repeatItemsExpr(node.repeat.source)
  const el = emitElement(node, component, depth + 1, `key={${idx}}`, overlays)
  if (el === null) return null
  return `${pad}{${src}.map((${alias}, ${idx}) => (\n${el}\n${pad}))}`
}

function childrenJsx(
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
      const s = emitRepeatWithSeparator(c, sepNode!, component, depth, overlays)
      if (s) out.push(s)
      continue
    }
    const s = emitChild(c, component, depth, overlays)
    if (s !== null) out.push(s)
  }
  return out
}

function emitRepeatWithSeparator(
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
  const el = emitElement(node, component, depth + 1, `key={\`i\${${idx}}\`}`, overlays)
  const sepEl = emitElement(sep, component, depth + 1, `key={\`s\${${idx}}\`}`, overlays)
  if (el === null) return null
  return `${pad}{${src}.map((${alias}, ${idx}) => [\n${el},\n${pad}  ${idx} < ${src}.length - 1 ? (\n${sepEl}\n${pad}  ) : null,\n${pad}])}`
}

function emitElement(
  node: ComponentNode,
  component: ComponentIR,
  depth: number,
  keyAttr: string,
  overlays?: OverlayPlan,
): string | null {
  const pad = '  '.repeat(depth)
  const tag = resolveTag(node, component)

  const surface = overlays?.surfaces.get(node.id)
  if (surface && overlays) return emitOverlaySurface(node, component, depth, surface, overlays)

  if ((node.kind === 'icon' || node.kind === 'content') && !node.facets) return null

  if (node.kind === 'foreign') {
    const code = node.foreign?.code?.trim()
    return code ? `${pad}${code}` : null
  }

  if (node.kind === 'instance') {
    const ref = node.instance
    const target = ref ? componentsById.get(ref.componentId) : undefined
    if (!target) return null
    const name = componentName(target)
    activeInstances.add(name)
    const instKey = keyAttr ? ` ${keyAttr}` : ''
    const props = (ref!.props ?? [])
      .filter((p) => p.name)
      .map((p) => ` ${camelCase(p.name)}={${contentValueExpr(p.value)}}`)
      .join('')
    return `${pad}<${name}${instKey}${props} />`
  }

  const toggleVariant = customToggleVariant(node)
  if (toggleVariant === 'switch') return emitSwitch(node, depth, keyAttr)
  if (toggleVariant === 'checkbox') return emitCheckbox(node, component, depth, keyAttr)

  const parts = materializedToggleParts(node, component.structure.nodes)
  if (parts?.variant === 'switch' && parts.track)
    return emitMaterializedSwitch(node, parts.track, parts.thumb, depth, keyAttr)
  if (parts?.variant === 'checkbox' && parts.indicator)
    return emitMaterializedCheckbox(node, parts.indicator, parts.glyph, depth, keyAttr)

  if (node.kind === 'icon') return emitIcon(node, depth, keyAttr, overlays)

  const selItem = activeSelection && node.id === activeSelection.itemNodeId ? activeSelection : null

  const cursorDecl =
    selItem && tag !== 'button' && tag !== 'a' ? [{ prop: 'cursor', value: 'pointer' }] : []

  const srOnlyDecl = node.presentation === 'accessibleName' ? SR_ONLY_DECLS : []
  const styleA = styleAttrsFor(node, [...nodeStyleDecls(node, tag), ...cursorDecl, ...srOnlyDecl])
  const key = keyAttr ? ` ${keyAttr}` : ''

  const triggerFor = overlays?.triggers.get(node.id)
  const onClickExtra = [
    ...(triggerFor ? [`${triggerFor.setter}((o) => !o)`] : []),
    ...(selItem ? [`${selItem.setter}(${selItem.alias}.${selItem.field})`] : []),
  ]

  const stepBtn =
    activeStepper && (node.id === activeStepper.decId || node.id === activeStepper.incId)
      ? activeStepper
      : null

  const clearBtn = activeTextEntry && node.id === activeTextEntry.clearId ? activeTextEntry : null
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
    const clearEv = clearBtn.clearEvent ? `on${pascalCase(clearBtn.clearEvent)}?.()` : ''
    const valEv = clearBtn.event ? `on${pascalCase(clearBtn.event)}?.('')` : ''
    const calls = [`${setter}('')`, clearEv, valEv].filter(Boolean).join('; ')
    handlerAttr = ` type="button" onClick={() => { ${calls} }}`
  } else {
    handlerAttr = emissionHandlers(
      node,
      onClickExtra.length ? { onClick: onClickExtra } : undefined,
    )
  }
  const selCond = selItem ? `${selItem.current} === ${selItem.alias}.${selItem.field}` : ''
  const selA = selItem
    ? ` data-selected={${selCond} ? '' : undefined}` +
      (selItem.itemRole
        ? ` role="${selItem.itemRole}" ${selItem.checkedAttr}={${selCond}} tabIndex={${selCond} ? 0 : -1}`
        : '')
    : ''

  const labelA = a11yLabelAttrs(node)
  const ariaA = isNameableControl(node) ? a11yAttrs(node) : ''

  if (activeSlider) {
    const s = activeSlider
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
    const textTag = activeA11y.labelFor.has(node.id) ? 'label' : tag
    return `${pad}<${textTag}${key}${labelA}${styleA}${handlerAttr}>${textContent(node)}</${textTag}>`
  }
  if (node.kind === 'input') {
    if (activeStepper && node.id === activeStepper.inputId) {
      const sp = activeStepper
      const sv = `_${sp.prop}`
      const setter = `_set${pascalCase(sp.prop)}`
      const ev = sp.event ? `; on${pascalCase(sp.event)}?.(n)` : ''
      const mm = `${sp.hasMin ? ' min={min}' : ''}${sp.hasMax ? ' max={max}' : ''}${sp.hasStep ? ' step={step}' : ''}`
      return `${pad}<input${key}${ariaA}${styleA} type="number" value={${sv}} onChange={(e) => { const n = Number(e.target.value); _${sp.prop}Ref.current = n; ${setter}(n)${ev} }}${mm} />`
    }

    if (activeTextEntry && node.id === activeTextEntry.inputId) {
      const t = activeTextEntry
      const sv = `_${t.prop}`
      const setter = `_set${pascalCase(t.prop)}`
      const ev = t.event ? `; on${pascalCase(t.event)}?.(v)` : ''
      const phExpr = contentExpr(node)
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
      const phExpr = contentExpr(node)
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

    const phExpr = inputType === 'checkbox' ? null : contentExpr(node)
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
    const expr = bind ?? contentExpr(node)
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
      default:
        return `${pad}<img${key}${styleA}${handlerAttr} alt="" />`
    }
  }

  const prevSelCond = activeSelectionCond
  if (selItem) activeSelectionCond = `${selItem.current} === ${selItem.alias}.${selItem.field}`
  const kids = childrenJsx(node, component, depth + 1, overlays)
  activeSelectionCond = prevSelCond

  if (activeSlider && node.id === activeSlider.trackId) {
    const s = activeSlider
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
      const inline = node.content ? textContent(node) : ''
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

  const elTag = selItem?.itemRole && tag === 'li' ? 'div' : tag
  if (!kids.length) {
    const inline = node.content ? textContent(node) : ''
    if (inline)
      return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${styleA}${handlerAttr}>${inline}</${elTag}>`
    return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${styleA}${handlerAttr} />`
  }
  return `${pad}<${elTag}${key}${labelA}${ariaA}${selA}${styleA}${handlerAttr}>\n${kids.join('\n')}\n${pad}</${elTag}>`
}

function emitOverlaySurface(
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
    .map((k) => emitChild(k, component, depth + (info.modal ? 3 : 2), overlays))
    .filter((s): s is string => s !== null)
  const body = kids.length ? `\n${kids.join('\n')}\n` : ''

  const surfStyle = styleAttrsFor(node, [
    ...surfacePositionDecls(info.kind),
    ...nodeStyleDecls(node, tag),
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

  return `${pad}{${info.state} && (\n${innerPad}<${tag}${surfStyle}>${body}${body ? innerPad : ''}</${tag}>\n${pad})}`
}

function styleAttr(decls: StyleDecl[]): string {
  const body = styleLiteral(decls)
  return body ? ` style={{ ${body} }}` : ''
}

const SURFACE_BASE: StyleDecl[] = [
  { prop: 'display', value: 'flex' },
  { prop: 'flexDirection', value: 'column' },
]

function emitDisclosure(component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const facetStyle = (n: ComponentNode) => nodeStyleDecls(n, tagFor(n))

  const trigger = node(plan.triggerId)!
  const surface = node(plan.surfaceId)!
  const backdrop = node(plan.backdropId)

  const trigLines = childrenOf(trigger, component)
    .map((k) => {
      if (k.id === plan.triggerLabelId) {
        return `        <${tagFor(k)}${styleAttrsFor(k, facetStyle(k))}>{trigger}</${tagFor(k)}>`
      }
      return emitChild(k, component, 4)
    })
    .filter((s): s is string => s !== null)
  const trigInner = trigLines.length ? `\n${trigLines.join('\n')}\n      ` : '{trigger}'

  const surfLines = childrenOf(surface, component)
    .map((k) => {
      const ks = styleAttrsFor(k, facetStyle(k))
      const tag = tagFor(k)
      if (k.id === plan.titleId) return `            <${tag}${ks}>{title}</${tag}>`
      if (k.id === plan.contentId) return `            <${tag}${ks}>{children}</${tag}>`
      if (k.id === plan.closeId) {
        return `            <button${ks} onClick={() => change(false)} aria-label="Close">×</button>`
      }
      return emitChild(k, component, 6)
    })
    .filter((s): s is string => s !== null)
  const surfInner = surfLines.length ? `\n${surfLines.join('\n')}\n          ` : ''

  const surfStyle = styleAttrsFor(surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...facetStyle(surface),
  ])

  const backStyle = backdrop
    ? styleAttrsFor(backdrop, [...backdropDecls(plan.surfaceKind), ...facetStyle(backdrop)])
    : styleAttr(backdropDecls(plan.surfaceKind))
  const backDismiss = plan.dismissable ? ' onClick={() => change(false)}' : ''

  const trigAttr = styleAttrsFor(trigger, facetStyle(trigger))

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
    ...stylesImport(name),
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
    `    <>`,
    `      <${tagFor(trigger)}${trigAttr} onClick={() => change(true)}>${trigInner}</${tagFor(trigger)}>`,
    `      {isOpen && createPortal(`,
    `        <>`,
    `          <div${backStyle}${backDismiss} />`,
    `          <div${surfStyle}>${surfInner}</div>`,
    `        </>,`,
    `        document.body,`,
    `      )}`,
    `    </>`,
    `  )`,
    `}`,
    ``,
  ].join('\n')
}

function emitSelect(component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) => (n ? styleAttrsFor(n, nodeStyleDecls(n, tagFor(n))) : '')

  const root = nodes[component.structure.rootId]
  const trigger = node(plan.triggerId)!
  const value = node(plan.valueId)
  const indicator = node(plan.indicatorId)
  const surface = node(plan.surfaceId)!
  const option = node(plan.optionId)!
  const check = node(plan.optionCheckId)
  const label = node(plan.optionLabelId)

  const rootStyle = styleAttrsFor(root, [
    ...anchorDecls(plan.surfaceKind),
    ...nodeStyleDecls(root, 'div'),
  ])
  const surfStyle = styleAttrsFor(surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...nodeStyleDecls(surface, tagFor(surface)),
  ])

  const trigAttr = sa(trigger)
  const optionAttr = sa(option)

  const valueLine = value
    ? `        <${tagFor(value)}${sa(value)}>{selected ? selected.label : placeholder}</${tagFor(value)}>`
    : `        {selected ? selected.label : placeholder}`
  const indicatorLine = indicator ? `\n        ${iconSpan(indicator)}` : ''

  const checkLine = check
    ? `\n              ${iconSpan(check).replace(
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
    ...stylesImport(name),
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

function emitCombobox(component: ComponentIR, plan: DisclosurePlan): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const sa = (n?: ComponentNode) => (n ? styleAttrsFor(n, nodeStyleDecls(n, tagFor(n))) : '')

  const root = nodes[component.structure.rootId]
  const control = node(plan.triggerId)!
  const surface = node(plan.surfaceId)!
  const option = node(plan.optionId)!
  const label = node(plan.optionLabelId)
  const placeholder = (component.contract?.props ?? []).some((p) => p.name === 'placeholder')

  const rootStyle = styleAttrsFor(root, [
    ...anchorDecls(plan.surfaceKind),
    ...nodeStyleDecls(root, 'div'),
  ])
  const surfStyle = styleAttrsFor(surface, [
    ...surfacePositionDecls(plan.surfaceKind),
    ...SURFACE_BASE,
    ...nodeStyleDecls(surface, tagFor(surface)),
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
    ...stylesImport(name),
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

function emitMenu(
  component: ComponentIR,
  plan: DisclosurePlan,
  sharedTypes: SharedType[] = [],
): string {
  const name = componentName(component)
  const nodes = component.structure.nodes
  const node = (id?: string) => (id ? nodes[id] : undefined)
  const tagFor = (n: ComponentNode) => resolveTag(n, component)
  const facetStyle = (n: ComponentNode) => nodeStyleDecls(n, tagFor(n))
  const sa = (n?: ComponentNode) => (n ? styleAttrsFor(n, facetStyle(n)) : '')

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

  const selectEmit = Object.values(nodes)
    .flatMap((n) => n.emits ?? [])
    .find((e) => e.on === 'select' || e.on === 'activate')
  const activateCall = selectEmit
    ? `${eventHandlerName(emissionEventName(selectEmit.eventId))}?.(${selectEmit.payload ? 'item.value' : ''}); `
    : ''
  const hasDisabled = (component.contract?.props ?? []).some((p) => p.name === 'disabled')

  const rootStyle = styleAttrsFor(root, [...anchorDecls('menu'), ...facetStyle(root)])
  const surfStyle = styleAttrsFor(surface, [
    ...surfacePositionDecls('menu'),
    ...SURFACE_BASE,
    ...facetStyle(surface),
  ])
  const trigAttr = sa(trigger)
  const optionAttr = sa(option)

  const trigLines = childrenOf(trigger, component)
    .map((k) => emitChild(k, component, 4))
    .filter((s): s is string => s !== null)
  const trigInner = trigLines.length ? `\n${trigLines.join('\n')}\n      ` : ''

  const itemLines = childrenOf(option, component)
    .map((k) => emitChild(k, component, 7))
    .filter((s): s is string => s !== null)
  const itemInner = itemLines.length ? `\n${itemLines.join('\n')}\n            ` : ''

  const cprops = propTypeLines(component, sharedTypes)
  const names = propNames(component)
  const eventLines = eventPropLines(interfaceEventDefs(component), sharedTypes)
  const handlerNames = emittedHandlerNames(component)
  const interfaceLines = [...cprops, ...eventLines, `  children?: ReactNode`]

  const destructure = [...names.filter((n) => n !== 'open'), ...handlerNames, 'children'].join(', ')
  const seedsOpen = names.includes('open')

  return [
    `'use client'`,
    ``,
    `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'`,
    ...iconModuleImport(),
    ...stylesImport(name),
    ``,
    `export interface ${name}Props {`,
    ...interfaceLines,
    `}`,
    ``,
    `export function ${name}({ ${destructure}${seedsOpen ? ', open: openProp' : ''} }: ${name}Props) {`,
    `  const [open, setOpen] = useState(${seedsOpen ? 'openProp ?? false' : 'false'})`,
    `  const [active, setActive] = useState(-1)`,
    `  const ref = useRef<HTMLDivElement>(null)`,
    `  const list = ${listExpr}`,
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
      .map((k) => emitChild(k, component, depth))
      .filter((s): s is string => s !== null)
    return kids.length ? `\n${kids.join('\n')}\n      ` : ''
  }

  const rootStyleAttr = styleAttrsFor(root, nodeStyleDecls(root, rootTag)) + emissionHandlers(root)
  const selectionInterface = plan
    ? ['  value?: string', '  defaultValue?: string', '  onValueChange?: (value: string) => void']
    : []
  const interfaceLines = [
    ...propTypeLines(component, sharedTypes),
    ...eventPropLines(component.contract?.events, sharedTypes),
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
    const tag = resolveTag(node, component)
    const fn = `${name}${member}`
    const styleA = styleAttrsFor(node, nodeStyleDecls(node, tag))
    const inner = `${inlineKids(node, 3)}{children}`
    const isTrigger = Boolean(plan && s.slot.role === 'trigger')
    const isPanel = Boolean(plan && s.slot.role === 'panel')

    const subProps = node.contract?.props ?? []
    const subPropLines = subProps.map(
      (p) => `  ${camelCase(p.name)}${p.required ? '' : '?'}: ${tsType(p.type, sharedTypes)}`,
    )
    if (isTrigger || isPanel) subPropLines.unshift(`  ${vf}: string`)
    const subEventLines = eventPropLines(node.contract?.events, sharedTypes)
    const subDestructure = [
      ...(isTrigger || isPanel ? [vf] : []),
      ...subProps.map((p) => camelCase(p.name)),
      'children',
    ].join(', ')

    let fnBody: string[]
    if (isTrigger) {
      const handlerA = emissionHandlers(node, { onClick: [`ctx.setValue(${vf})`] })
      fnBody = [
        `function ${fn}({ ${subDestructure} }: ${fn}Props) {`,
        `  const ctx = useContext(${ctxName})`,
        `  return (`,
        `    <${tag}${styleA}${handlerA} data-active={ctx.value === ${vf} ? '' : undefined}>${inner}</${tag}>`,
        `  )`,
        `}`,
      ]
    } else if (isPanel) {
      const handlerA = emissionHandlers(node)
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
      const handlerA = emissionHandlers(node)
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

    ...iconModuleImport(),
    ...instanceImport(),
    ...stylesImport(name),
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

function emitComponent(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): { tsx: string; css: string } {
  activeSheet = new StyleSheet()
  usesIconComponent = false
  usesIconNameType = false
  activeInstances = new Set()
  activeProps = new Map((component.contract?.props ?? []).map((p) => [p.name, p]))
  activeEventNames = new Map((component.contract?.events ?? []).map((e) => [e.id, e.name]))
  activeSurface = resolveSurface(component, options)
  activeSelection = null
  activeSelectionCond = null
  activeStepper = null
  activeSlider = null
  activeTextEntry = null
  activeIconLib = options.icons
  activeAssets = options.assets
  componentsById = new Map(Object.entries(options.componentsById ?? {}))

  activeA11y = { labelId: new Map(), controlId: new Map(), labelFor: new Map(), needsUseId: false }
  const name = componentName(component)
  const root = component.structure.nodes[component.structure.rootId]
  if (!root) return { tsx: `export function ${name}() {\n  return null\n}\n`, css: '' }

  const slots = collectSlots(component).filter((s) => !component.structure.nodes[s.nodeId]?.repeat)
  if (slots.length > 0 && (options.emitStyle ?? 'compound') !== 'props') {
    return { tsx: emitCompound(component, slots, options, sharedTypes), css: activeSheet.toCss() }
  }

  const plan = planBehavior(component)
  if (plan?.kind === 'disclosure') {
    if (plan.surfaceKind === 'dialog')
      return { tsx: emitDisclosure(component, plan), css: activeSheet.toCss() }

    const triggerIsInput = component.structure.nodes[plan.triggerId ?? '']?.kind === 'input'
    if (
      (plan.surfaceKind === 'popover' || plan.surfaceKind === 'menu') &&
      plan.selectable &&
      plan.optionId
    ) {
      return {
        tsx: triggerIsInput ? emitCombobox(component, plan) : emitSelect(component, plan),
        css: activeSheet.toCss(),
      }
    }

    if (
      (plan.surfaceKind === 'menu' || plan.surfaceKind === 'popover') &&
      plan.optionId &&
      !triggerIsInput
    ) {
      return { tsx: emitMenu(component, plan, sharedTypes), css: activeSheet.toCss() }
    }
  }

  activeA11y = planA11y(component)

  const tag = resolveTag(root, component)

  const togglePlan = tag === 'button' || tag === 'a' ? planToggle(component) : null
  const overlayPlan = planOverlays(component)

  const hostsAnchoredOverlay = [...overlayPlan.surfaces.values()].some((o) => !o.modal)
  const rootAnchor = hostsAnchoredOverlay ? [{ prop: 'position', value: 'relative' }] : []
  const rootBind = activeSheet.register(root, [...rootAnchor, ...nodeStyleDecls(root, tag)])
  const variantData = rootBind.dataAttrs.map((d) => ` ${d.attr}={${bindingExpr(d.prop)}}`).join('')
  const rootData = togglePlan
    ? `${variantData} data-${togglePlan.dataState}={${togglePlan.stateVar} ? '' : undefined} aria-pressed={${togglePlan.stateVar}}`
    : variantData + stateBindingAttrs(root)
  const rootHandlers = togglePlan
    ? ` onClick={() => { const next = !${togglePlan.stateVar}; ${togglePlan.setter}(next); ${togglePlan.event ? `on${pascalCase(togglePlan.event)}?.(next)` : ''} }}`
    : emissionHandlers(root)
  const overlays = overlayPlan

  activeSelection = planSelection(component)

  activeStepper = planStepper(component)

  activeSlider = planSlider(component)

  activeTextEntry = activeStepper || activeSlider ? null : planTextEntry(component)
  const kids = childrenJsx(root, component, 3, overlays)
  const inner = kids.length ? `\n${kids.join('\n')}\n    ` : ''

  const bodyUsesChildren = inner.includes('{children}')

  const overlayList = [...overlays.surfaces.values()]
  const hasOverlays = overlayList.length > 0
  const overlayState = overlayList.map((o) => `  const [${o.state}, ${o.setter}] = useState(false)`)
  const overlayEffects = overlayList
    .filter((o) => o.dismissable)
    .flatMap((o) => [
      ``,
      `  useEffect(() => {`,
      `    if (!${o.state}) return`,
      `    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ${o.setter}(false) }`,
      `    document.addEventListener('keydown', onKey)`,
      `    return () => document.removeEventListener('keydown', onKey)`,
      `  }, [${o.state}])`,
    ])

  const sel = activeSelection

  const selNav = sel?.containerRole && sel.itemsProp
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

  const step = activeStepper
  const stepperState = step
    ? [
        `  const [_${step.prop}, _set${pascalCase(step.prop)}] = useState(${step.prop} ?? 0)`,
        `  const _${step.prop}Ref = useRef(${step.prop} ?? 0)`,
      ]
    : []

  const sl = activeSlider
  const sliderState = sl
    ? [
        `  const [_${sl.prop}, _set${pascalCase(sl.prop)}] = useState(${sl.prop} ?? 0)`,
        `  const _pct = ((_${sl.prop} - ${sl.hasMin ? '(min ?? 0)' : '0'}) / (${sl.hasMax ? '(max ?? 100)' : '100'} - ${sl.hasMin ? '(min ?? 0)' : '0'})) * 100`,
      ]
    : []

  const te = activeTextEntry
  const textState = te
    ? [`  const [_${te.prop}, _set${pascalCase(te.prop)}] = useState(${te.prop} ?? '')`]
    : []
  const needsUseId = activeA11y.needsUseId
  const needsClient = hasOverlays || needsUseId || !!sel || !!togglePlan || !!step || !!sl || !!te
  const reactHooks = [
    ...(hasOverlays || sel || togglePlan || step || sl || te ? ['useState'] : []),
    ...(overlayList.some((o) => o.dismissable) ? ['useEffect'] : []),
    ...(step ? ['useRef'] : []),
    ...(needsUseId ? ['useId'] : []),
    ...(selNav ? ['type KeyboardEvent as ReactKeyboardEvent'] : []),
  ]
  const runtimeImports = needsClient
    ? [
        `'use client'`,
        ``,
        `import { ${reactHooks.join(', ')} } from 'react'`,
        ...(overlayList.some((o) => o.modal) ? [`import { createPortal } from 'react-dom'`] : []),
        ``,
      ]
    : []
  const a11yState = needsUseId ? [`  const _aid = useId()`] : []
  const bodyPrelude = needsClient
    ? [
        ...a11yState,
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

  const cprops = propTypeLines(component, sharedTypes)
  const names = propNames(component)

  const eventLines = eventPropLines(interfaceEventDefs(component), sharedTypes)
  const hasProps = cprops.length > 0
  const usesReactNode = [...cprops, ...eventLines].some((l) => l.includes('ReactNode'))

  if (tag === 'button' || tag === 'a') {
    const dom = tag === 'button' ? 'ButtonHTMLAttributes' : 'AnchorHTMLAttributes'
    const el = tag === 'button' ? 'HTMLButtonElement' : 'HTMLAnchorElement'
    const surface = activeSurface

    const exposesNativeEvents = surface.domEvents || surface.nativeAttrs
    const eventDecls = exposesNativeEvents
      ? customEventPropLines(interfaceEventDefs(component), sharedTypes)
      : eventPropLines(interfaceEventDefs(component), sharedTypes)

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

    const destructure = [
      ...(bodyUsesChildren ? ['children'] : []),
      ...(exposesClass ? ['className'] : []),
      ...(exposesStyle ? ['style'] : []),
      ...customNames,
      ...(spread ? [] : nativeContractNames),
      ...emittedHandlerNames(component),
      ...(spread ? ['...props'] : []),
    ].join(', ')

    return {
      tsx: [
        ...runtimeImports,
        ...(importLine ? [importLine] : []),
        ...iconModuleImport(),
        ...instanceImport(),
        ...stylesImport(name),
        ``,
        propsDecl,
        ``,
        `export function ${name}({ ${destructure} }: ${name}Props) {`,
        ...bodyPrelude,
        `  return (`,
        `    <${tag}${spread ? ' {...props}' : ''}${classExpr}${nativeApply}${rootData}${a11yLabelAttrs(root)}${a11yAttrs(root)}${rootHandlers}${styleExpr}>${inner}</${tag}>`,
        `  )`,
        `}`,
        ``,
      ].join('\n'),
      css: activeSheet.toCss(),
    }
  }

  const selRootA = sel?.containerRole
    ? ` role="${sel.containerRole}"${selNav ? ' onKeyDown={_onSelKey}' : ''}`
    : ''
  const rootAttrs =
    (rootBind.className ? ` className={styles.${rootBind.className}}` : '') +
    rootData +
    selRootA +
    a11yLabelAttrs(root) +
    (isNameableControl(root) ? a11yAttrs(root) : '') +
    rootHandlers

  const childLines = bodyUsesChildren ? [`  children?: ReactNode`] : []
  const interfaceLines = [...cprops, ...eventLines, ...childLines]
  const needsReactNode = interfaceLines.some((l) => l.includes('ReactNode'))
  const destructure = [
    ...names,
    ...emittedHandlerNames(component),
    ...(bodyUsesChildren ? ['children'] : []),
  ].join(', ')
  return {
    tsx: [
      ...runtimeImports,
      ...(needsReactNode ? [`import type { ReactNode } from 'react'`] : []),
      ...iconModuleImport(),
      ...instanceImport(),
      ...stylesImport(name),
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
    css: activeSheet.toCss(),
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

export function toComponentFiles(
  component: ComponentIR,
  options: EmitOptions = {},
  sharedTypes: SharedType[] = [],
): { tsx: string; css: string } {
  return emitComponent(
    component,
    options,
    sharedTypes.length ? sharedTypes : (options.sharedTypes ?? []),
  )
}
