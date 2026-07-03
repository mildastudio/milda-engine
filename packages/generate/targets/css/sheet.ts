import {
  facetCssVar,
  facetDecls,
  layoutVarDecls,
  type ComponentNode,
  type PropCondition,
  type StateName,
  type StateRule,
  type StyleDecl,
} from '@mildastudio/core'

export const STATE_SELECTOR: Record<StateName, string> = {
  hovered: ':hover',
  pressed: ':active',
  focused: ':focus',
  'focus-visible': ':focus-visible',
  active: '[data-active]',
  selected: '[data-selected]',
  checked: ':checked',
  indeterminate: ':indeterminate',
  expanded: '[data-expanded]',
  open: '[data-open]',
  disabled: ':disabled',
  readonly: ':read-only',
  loading: '[data-loading]',
  error: '[data-error]',
  success: '[data-success]',
  first: ':first-child',
  last: ':last-child',
  odd: ':nth-child(odd)',
  even: ':nth-child(even)',
}

function cssProp(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

function sanitizeIdent(base: string): string {
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (parts.length === 0) return 'el'
  const head = parts[0].toLowerCase()
  const rest = parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
  const ident = [head, ...rest].join('')
  return /^[A-Za-z]/.test(ident) ? ident : `el${ident}`
}

export function variantDataAttr(prop: string): string {
  const kebab = prop
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
  return `data-${kebab}`
}

const leafOf = (node: ComponentNode): string | undefined => node.part?.split('.').pop()

function ruleSuffix(rule: StateRule): string {
  const propParts = Object.entries(rule.props).map(
    ([k, v]) => `[${variantDataAttr(k)}="${String(v)}"]`,
  )
  const stateParts = rule.states.map((s) => STATE_SELECTOR[s])
  return [...propParts, ...stateParts].join('')
}

export function variantProps(node: ComponentNode): string[] {
  const seen = new Set<string>()
  for (const rule of node.states ?? []) {
    for (const k of Object.keys(rule.props)) seen.add(k)
  }
  return [...seen]
}

function ruleDecls(rule: StateRule): StyleDecl[] {
  const decls = [...layoutVarDecls(rule.layout), ...facetDecls(rule.facets, facetCssVar)]
  if (rule.states.includes('disabled')) decls.push({ prop: 'pointer-events', value: 'none' })
  return decls
}

export interface NodeStyleBinding {
  className: string | null

  dataAttrs: { attr: string; prop: string }[]
}

export class StyleSheet {
  private names = new Map<string, string>()
  private used = new Map<string, number>()
  private done = new Set<string>()
  private blocks: string[] = []

  private allocate(node: ComponentNode): string {
    const cached = this.names.get(node.id)
    if (cached) return cached
    const base = sanitizeIdent(leafOf(node) ?? node.name ?? node.kind)
    const n = this.used.get(base) ?? 0
    this.used.set(base, n + 1)
    const name = n === 0 ? base : `${base}${n + 1}`
    this.names.set(node.id, name)
    return name
  }

  private serialize(selector: string, decls: StyleDecl[]): void {
    if (!decls.length) return
    const body = decls.map((d) => `  ${cssProp(d.prop)}: ${d.value};`).join('\n')
    this.blocks.push(`${selector} {\n${body}\n}`)
  }

  register(node: ComponentNode, baseDecls: StyleDecl[]): NodeStyleBinding {
    const rules = node.states ?? []
    const hasBase = baseDecls.length > 0
    const hasRules = rules.length > 0
    if (!hasBase && !hasRules) return { className: null, dataAttrs: [] }

    const name = this.allocate(node)
    if (!this.done.has(node.id)) {
      this.done.add(node.id)
      if (hasBase) this.serialize(`.${name}`, baseDecls)
      for (const rule of rules) this.serialize(`.${name}${ruleSuffix(rule)}`, ruleDecls(rule))
    }
    return {
      className: name,
      dataAttrs: variantProps(node).map((prop) => ({ attr: variantDataAttr(prop), prop })),
    }
  }

  checkbox(
    node: ComponentNode,
    parts: {
      rootDecls: StyleDecl[]
      controlDecls: StyleDecl[]
      indicatorBase: StyleDecl[]
      indicatorChecked: StyleDecl[]
      glyphDecls: StyleDecl[]
      glyphChecked: StyleDecl[]
      focusDecls: StyleDecl[]
      disabledDecls: StyleDecl[]
    },
  ): { root: string; control: string; indicator: string; glyph: string } {
    const base = this.allocate(node)
    const root = base
    const control = `${base}Control`
    const indicator = `${base}Indicator`
    const glyph = `${base}Glyph`
    if (!this.done.has(node.id)) {
      this.done.add(node.id)
      this.serialize(`.${root}`, parts.rootDecls)
      this.serialize(`.${control}`, parts.controlDecls)
      this.serialize(`.${indicator}`, parts.indicatorBase)
      this.serialize(`.${glyph}`, parts.glyphDecls)
      this.serialize(`.${control}:checked ~ .${indicator}`, parts.indicatorChecked)
      this.serialize(`.${control}:checked ~ .${indicator} .${glyph}`, parts.glyphChecked)
      this.serialize(`.${control}:focus-visible ~ .${indicator}`, parts.focusDecls)
      this.serialize(`.${control}:disabled ~ .${indicator}`, parts.disabledDecls)
    }
    return { root, control, indicator, glyph }
  }

  switchControl(
    node: ComponentNode,
    parts: {
      rootDecls: StyleDecl[]
      controlDecls: StyleDecl[]
      trackBase: StyleDecl[]
      trackChecked: StyleDecl[]
      thumbDecls: StyleDecl[]
      thumbChecked: StyleDecl[]
      focusDecls: StyleDecl[]
      disabledDecls: StyleDecl[]
    },
  ): { root: string; control: string; track: string; thumb: string } {
    const base = this.allocate(node)
    const root = base
    const control = `${base}Control`
    const track = `${base}Track`
    const thumb = `${base}Thumb`
    if (!this.done.has(node.id)) {
      this.done.add(node.id)
      this.serialize(`.${root}`, parts.rootDecls)
      this.serialize(`.${control}`, parts.controlDecls)
      this.serialize(`.${track}`, parts.trackBase)
      this.serialize(`.${thumb}`, parts.thumbDecls)
      this.serialize(`.${control}:checked ~ .${track}`, parts.trackChecked)
      this.serialize(`.${control}:checked ~ .${track} .${thumb}`, parts.thumbChecked)
      this.serialize(`.${control}:focus-visible ~ .${track}`, parts.focusDecls)
      this.serialize(`.${control}:disabled ~ .${track}`, parts.disabledDecls)
    }
    return { root, control, track, thumb }
  }

  get isEmpty(): boolean {
    return this.blocks.length === 0
  }

  toCss(): string {
    return this.blocks.join('\n\n') + (this.blocks.length ? '\n' : '')
  }
}
