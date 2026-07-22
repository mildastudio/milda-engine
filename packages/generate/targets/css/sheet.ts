import {
  facetCssVar,
  facetDecls,
  layoutVarDecls,
  representablePredicate,
  dataCondAttr,
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
  // Calendar/time cell states (proposal 0029) - match the data-* attrs the
  // DatePicker/TimePicker emitters put on each day/option cell.
  today: '[data-today]',
  'outside-month': '[data-outside]',
  'range-start': '[data-range-start]',
  'range-end': '[data-range-end]',
  'in-range': '[data-in-range]',
  highlighted: '[data-highlighted]',
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

function propsSuffix(props: StateRule['props']): string {
  return Object.entries(props)
    .map(([k, v]) => `[${variantDataAttr(k)}="${String(v)}"]`)
    .join('')
}

// A state's selector, honoring per-component DATA realization: a toggle button drives its
// `checked`/`pressed`/`selected` on-state via `data-<state>` (+ aria-pressed), NOT the input
// pseudo `:checked`/`:active` (which never matches a <button>). When the state is data-realized
// for this component, key off `[data-<state>]` so the rule actually matches the emitted attr.
function stateSel(s: StateName, dataStates?: ReadonlySet<string>): string {
  return dataStates?.has(s) ? `[data-${s}]` : STATE_SELECTOR[s]
}

function statesSuffix(states: readonly StateName[], dataStates?: ReadonlySet<string>): string {
  return states.map((s) => stateSel(s, dataStates)).join('')
}

function ruleSuffix(rule: StateRule, dataStates?: ReadonlySet<string>): string {
  return `${propsSuffix(rule.props)}${statesSuffix(rule.states, dataStates)}`
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
  // Resolves an anchor node (referenced by a rule's `ancestorStates`) to its node + tree
  // depth, so a descendant rule can be emitted as a descendant selector under that ancestor
  // (`.button:hover .icon`). The emitter sets this ONLY for the generic tree-mapped path,
  // where node ancestry equals DOM ancestry; the compound/overlay emitters restructure the
  // DOM and leave it unset — an anchored rule then falls back to self-scoped (safe).
  private anchorResolver:
    | ((nodeId: string) => { node: ComponentNode; depth: number } | undefined)
    | undefined

  setAnchorResolver(
    fn: ((nodeId: string) => { node: ComponentNode; depth: number } | undefined) | undefined,
  ): void {
    this.anchorResolver = fn
  }

  // States this component realizes as `data-<state>` rather than a native pseudo — e.g. a
  // toggle button's `checked`/`pressed`/`selected` (driven by aria-pressed + data-<state>),
  // which `:checked`/`:active` would never match. Set per-component by the emitter.
  private dataStates: ReadonlySet<string> | undefined
  setDataStates(states: ReadonlySet<string> | undefined): void {
    this.dataStates = states
  }

  // Resolves, for a node's self state, the nearest ANCESTOR node that CONTROLS that state (holds
  // a stateBinding for it) — or undefined. A toggle's `selected` lives as `data-selected` on the
  // ROOT only, never on a fixed part, so a part's `onSelected` rule emitted self-scoped
  // (`.indicator[data-selected]`) is dead in the generated CSS even though the preview restyles it
  // (activeUIStates flows to all parts). When set, `ruleSelector` folds such a self state into an
  // implicit ancestorState so it emits `.root[data-selected] .indicator` — the generated mirror of
  // that cascade. Set (with the anchor resolver) ONLY on the generic tree-mapped path.
  private controlledAnchor: ((nodeId: string, state: StateName) => string | undefined) | undefined
  setControlledStateAnchor(fn: ((nodeId: string, state: StateName) => string | undefined) | undefined): void {
    this.controlledAnchor = fn
  }

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

  // Build a rule's selector. A rule's own props/states stay on the node (`.icon:hover`);
  // its `ancestorStates` become a descendant selector under each referenced ancestor
  // (`.button:hover .icon`) so the child restyles when that ancestor enters the state,
  // matching the editor. Multiple anchors nest outermost-first by tree depth. If no
  // anchor resolves (unset resolver / unknown id), the rule falls back to self-scoped.
  private ruleSelector(name: string, nodeId: string, rule: StateRule): string {
    // Rich `when` predicate (0032): a representable one decomposes back to the props/states/
    // ancestorStates selector path below; anything richer keys off a computed `[data-cond-<id>]`
    // attribute the React generator sets (so OR/NOT/operators still restyle).
    if (rule.when) {
      const rep = representablePredicate(rule.when)
      if (rep === null) return `.${name}[${dataCondAttr(rule)}]`
      rule = { ...rule, when: undefined, props: rep.props, states: rep.states, ancestorStates: rep.ancestorStates }
    }
    // Fold any self state that's controlled on an ANCESTOR into an implicit ancestorState (only
    // when we can actually emit the anchor — anchorResolver present), so `.part[data-selected]`
    // (dead: the part never gets data-selected) becomes `.root[data-selected] .part`.
    let eff = rule
    if (this.anchorResolver && this.controlledAnchor && rule.states.length) {
      const synth: { nodeId: string; state: StateName }[] = []
      const selfStates: StateName[] = []
      for (const s of rule.states) {
        const owner = this.controlledAnchor(nodeId, s)
        if (owner) synth.push({ nodeId: owner, state: s })
        else selfStates.push(s)
      }
      if (synth.length) {
        eff = { ...rule, states: selfStates, ancestorStates: [...(rule.ancestorStates ?? []), ...synth] }
      }
    }

    const selfSel = `.${name}${ruleSuffix(eff, this.dataStates)}`
    const conds = eff.ancestorStates ?? []
    if (conds.length === 0 || !this.anchorResolver) return selfSel

    const byNode = new Map<string, { node: ComponentNode; depth: number; states: StateName[] }>()
    for (const c of conds) {
      const resolved = this.anchorResolver(c.nodeId)
      if (!resolved) continue
      const entry = byNode.get(c.nodeId) ?? { ...resolved, states: [] }
      entry.states.push(c.state)
      byNode.set(c.nodeId, entry)
    }
    if (byNode.size === 0) return selfSel

    const chain = [...byNode.values()]
      .sort((a, b) => a.depth - b.depth)
      .map((a) => `.${this.allocate(a.node)}${statesSuffix(a.states, this.dataStates)}`)
      .join(' ')
    return `${chain} ${selfSel}`
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
      for (const rule of rules) this.serialize(this.ruleSelector(name, node.id, rule), ruleDecls(rule))
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
