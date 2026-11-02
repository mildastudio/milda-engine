import { describe, expect, it } from 'vitest'
import {
  defaultFoundations,
  type ComponentIR,
  type ComponentNode,
  type DocumentFoundations,
} from '@mildastudio/core'
import { facetBaselineDecls, facetDecls } from '../_shared/facets'
import { toComponentStyles } from './emit'
import { readCss } from './testkit'

// ─── The facet combinations the corpus cannot reach ───────────────────────────
// `compile.test.ts` and `document-roundtrip.test.ts` both run on `docs/dsl/`, which is a real
// design system rather than a coverage instrument. Counted over its IR, it states thirteen of
// the registry's facet keys and never states these:
//
//   inset (the shorthand)   every corpus node writes the two-axis form
//   border.width            all-sides borders in the corpus are colour-only
//   opacity                 nowhere
//   seven of the eight border SIDES (only `border.inline-start` appears, once)
//
// The combination that bit on 2026-08-11 is in that gap and is the reason this file exists:
// `inset` together with `insetX` is a NEW shape for the lowering (the axis beats the shorthand
// per edge, so four edges carry two values), and CSS cannot say that with the `padding`
// shorthand the uniform case uses. Proposal 0048 §6 states the rule; nothing was checking that
// the web tier still obeyed it, because no fixture anywhere had both keys on one node.
//
// It was not a corpus fixture because the `.milda` surface could not spell it until proposal
// 0057 gave it `inset.inline` / `inset.block` and the four `inset.<edge>` forms. The corpus is
// also the round trip's contract, so the shapes stay pinned here, against the lowering directly.
// Since 0057 the lowering is LOGICAL: `padding-block` / `padding-inline` when each axis is
// symmetric, the four `padding-*-start/end` longhands when it is not.
//
// Values are deliberately unresolvable token ids, so `v()` falls through to the literal gate
// (proposal 0049) and each declaration shows the AUTHORED id. A test about which slot a facet
// feeds should not also depend on what a token resolves to.

const decls = (facets: Record<string, string>) =>
  Object.fromEntries(facetDecls(facets, () => undefined).map((d) => [d.prop, d.value]))

// The props in emission order, which is load-bearing for the inset pair: a `padding` shorthand
// emitted AFTER a `padding-left` longhand would silently erase it.
const props = (facets: Record<string, string>) =>
  facetDecls(facets, () => undefined).map((d) => d.prop)

describe('inset: the more specific key beats the shorthand, per edge', () => {
  it('a lone inset stays the shorthand', () => {
    expect(decls({ inset: '8px' })).toEqual({ padding: '8px' })
  })

  it('inset + insetX: the axis inline, the shorthand on the block axis', () => {
    expect(decls({ inset: '8px', insetX: '16px' })).toEqual({
      paddingBlock: '8px',
      paddingInline: '16px',
    })
  })

  it('inset + insetY splits the other way', () => {
    expect(decls({ inset: '8px', insetY: '2px' })).toEqual({
      paddingBlock: '2px',
      paddingInline: '8px',
    })
  })

  it('never emits the shorthand next to the declarations it would overwrite', () => {
    expect(props({ inset: '8px', insetX: '16px' })).not.toContain('padding')
    expect(props({ inset: '8px', 'inset.inline-end': '2px' })).not.toContain('padding')
  })

  // An unstated edge stays unstated: the baseline (`padding: 0` on the container) already says
  // what an unstated edge is, and pushing `0` here would beat a `padding` a state rule sets.
  it('a lone insetX touches only the inline axis', () => {
    expect(decls({ insetX: '16px' })).toEqual({ paddingInline: '16px' })
  })

  it('two axes carrying the same value collapse back to the shorthand', () => {
    expect(decls({ insetX: '4px', insetY: '4px' })).toEqual({ padding: '4px' })
  })

  it('two axes carrying different values are the two axis shorthands', () => {
    expect(decls({ insetX: '16px', insetY: '8px' })).toEqual({
      paddingBlock: '8px',
      paddingInline: '16px',
    })
  })

  // `0` is a stated value, not a falsy nothing - the distinction proposal 0048 §6 calls out,
  // and the one an `??` chain gets wrong.
  it('a stated zero overrides the shorthand rather than reading as absent', () => {
    expect(decls({ inset: '8px', insetY: '0px' })).toEqual({
      paddingBlock: '0px',
      paddingInline: '8px',
    })
  })

  // Proposal 0057: the leading-icon button, tighter on the start edge.
  it('one edge beats its axis and the shorthand, and the rest stay as stated', () => {
    expect(decls({ inset: '8px', insetX: '16px', 'inset.inline-start': '12px' })).toEqual({
      paddingBlockStart: '8px',
      paddingBlockEnd: '8px',
      paddingInlineStart: '12px',
      paddingInlineEnd: '16px',
    })
  })

  it('a lone edge is its own longhand', () => {
    expect(decls({ 'inset.inline-start': '24px' })).toEqual({ paddingInlineStart: '24px' })
  })
})

describe('borders: existence, sides, and the colour that follows the ink', () => {
  it('a width-only border still gets a style and a colour', () => {
    expect(decls({ 'border.width': '2px' })).toEqual({
      borderStyle: 'solid',
      borderWidth: '2px',
      borderColor: 'currentColor',
    })
  })

  it('a colour-only border still gets a width, which is why the edge is visible', () => {
    expect(decls({ 'border.color': '#f00' })).toEqual({
      borderStyle: 'solid',
      borderWidth: '1px',
      borderColor: '#f00',
    })
  })

  // A colour that was STATED but resolves to nothing is not the same as an absent one:
  // `colorFollowsInk` is false (the author did name a colour), so the border keeps its width
  // and simply carries no colour declaration - it inherits rather than being forced to the ink.
  it('a stated border colour that resolves to nothing leaves the colour unset', () => {
    expect(decls({ 'border.color': 'nope' })).toEqual({
      borderStyle: 'solid',
      borderWidth: '1px',
    })
  })

  it('a style-only border exists too', () => {
    expect(decls({ 'border.style': 'dashed' })).toEqual({
      borderStyle: 'dashed',
      borderWidth: '1px',
      borderColor: 'currentColor',
    })
  })

  // Every side core knows about has to reach a CSS property. `BORDER_SIDE_PROPS` is typed on
  // core's `BorderSideSuffix` so a MISSING one is a compile error - what this covers is the
  // other direction, that each entry names the property it claims to.
  it.each([
    ['.top', 'borderTop'],
    ['.right', 'borderRight'],
    ['.bottom', 'borderBottom'],
    ['.left', 'borderLeft'],
    ['.inline-start', 'borderInlineStart'],
    ['.inline-end', 'borderInlineEnd'],
    ['.block-start', 'borderBlockStart'],
    ['.block-end', 'borderBlockEnd'],
  ])('border%s lowers to %s*', (side, prop) => {
    expect(decls({ [`border${side}.width`]: '3px' })).toEqual({
      [`${prop}Style`]: 'solid',
      [`${prop}Width`]: '3px',
      [`${prop}Color`]: 'currentColor',
    })
  })

  // An all-sides border and a per-side override on one node: both are emitted, and the side
  // has to come SECOND or the shorthand would win in the cascade.
  it('an all-sides border and a per-side override coexist, side last', () => {
    const facets = { 'border.width': '1px', 'border.bottom.width': '4px' }
    expect(decls(facets)).toMatchObject({ borderWidth: '1px', borderBottomWidth: '4px' })
    expect(props(facets).indexOf('borderBottomWidth')).toBeGreaterThan(
      props(facets).indexOf('borderWidth'),
    )
  })
})

describe('the facets no corpus node states', () => {
  it('opacity', () => {
    expect(decls({ opacity: '0.5' })).toEqual({ opacity: '0.5' })
  })

  // The ring is geometry plus a colour: two declarations from one facet, and a facet whose
  // absence is not "no colour" but "no ring at all".
  it('a ring is an outline with an offset', () => {
    expect(decls({ ring: '#00f' })).toEqual({ outline: '2px solid #00f', outlineOffset: '2px' })
  })

  it('a ring whose colour resolves to nothing falls back to the ink', () => {
    expect(facetDecls({ ring: 'nope' }, () => undefined)[0]).toEqual({
      prop: 'outline',
      value: '2px solid currentColor',
    })
  })
})

// Token first, literal second (proposal 0049). The corpus is a fully-tokenized system, so the
// fallback leg - what happens when the foundations have never heard of this value - runs only
// here.
describe('an unresolved facet value', () => {
  const resolve = (_scale: string, id?: string) => (id === 'known' ? 'var(--ds-x)' : undefined)

  it('prefers the token when one exists', () => {
    expect(facetDecls({ fill: 'known' }, resolve)).toEqual([
      { prop: 'background', value: 'var(--ds-x)' },
    ])
  })

  it('falls back to a literal that looks like one', () => {
    expect(facetDecls({ fill: '#ff0000' }, resolve)).toEqual([
      { prop: 'background', value: '#ff0000' },
    ])
  })

  it('takes a bare number at face value once the foundations have said no', () => {
    expect(facetDecls({ 'text.weight': '600' }, resolve)).toEqual([
      { prop: 'fontWeight', value: '600' },
    ])
  })

  // The point of keeping a gate at all: a misspelled id emits NOTHING rather than
  // `background: acent-3`, which the browser would drop anyway and no one would find.
  it('drops a value that is neither a token nor a plausible literal', () => {
    expect(facetDecls({ fill: 'acent-3' }, resolve)).toEqual([])
  })

  // The language's colour keyword (`COLOR_KEYWORDS`): a word, so only the fallback can tell it
  // from a token id, and the same fallback the Mac canvas and the Figma scene take.
  it('takes the colour keyword transparent at face value', () => {
    expect(facetDecls({ 'border.color': 'transparent' }, resolve)).toEqual([
      { prop: 'borderStyle', value: 'solid' },
      { prop: 'borderWidth', value: '1px' },
      { prop: 'borderColor', value: 'transparent' },
    ])
  })
})

// The corpus only ever produces container / item / text nodes, so eight of the twelve node
// kinds have never had their baseline emitted. The baseline is what an UNSET facet looks like,
// which is what a designer sees when they clear one.
describe('every node kind has a baseline', () => {
  it.each([
    'container',
    'item',
    'control',
    'input',
    'output',
    'text',
    'icon',
    'content',
    'table',
    'row',
    'cell',
  ] as const)('%s', (kind) => {
    const baseline = facetBaselineDecls(kind)
    expect(baseline.length).toBeGreaterThan(0)
    // One property, one baseline: a duplicate would mean two answers for the same unset facet.
    expect(new Set(baseline.map((d) => d.prop)).size).toBe(baseline.length)
  })

  it('the kinds with no facets at all get no baseline', () => {
    for (const kind of ['fragment', 'foreign', 'instance'] as const) {
      expect(facetBaselineDecls(kind)).toEqual([])
    }
  })

  // A kind that offers `inset` AND the two axes would otherwise emit `padding: 0` plus four
  // longhands, all zero and all redundant. The shorthand wins and the axes are suppressed -
  // which is also why a mixed inset above must not re-emit `padding`.
  it('the inset baseline is the shorthand alone, not the shorthand plus its longhands', () => {
    const padding = facetBaselineDecls('container').filter((d) => /^padding/.test(d.prop))
    expect(padding).toEqual([{ prop: 'padding', value: '0' }])
  })
})

// ─── …and the same thing where it actually ships ──────────────────────────────
// The unit assertions above are about `facetDecls`. This one is about the STYLESHEET, because
// the baseline and the facets meet in one rule there and the order between them decides
// whether a mixed inset survives.

function mixedInsetComponent(): ComponentIR {
  const root = {
    id: 'root',
    name: 'root',
    kind: 'container',
    tag: 'auto',
    origin: 'root',
    locked: false,
    parentId: null,
    childrenIds: [],
    // Token ids rather than literals: the emitted stylesheet is meant to stay themeable, so
    // what has to survive the split is the `var()` reference, not a frozen length.
    facets: { inset: 'space-2', insetX: 'space-4' },
  } as unknown as ComponentNode
  return {
    name: 'Padded',
    archetype: null,
    structure: { rootId: 'root', nodes: { root } },
    contract: { props: [], events: [] },
  } as ComponentIR
}

describe('a mixed inset in the emitted stylesheet', () => {
  const css = readCss(toComponentStyles(mixedInsetComponent()))
  const selector = css.selectors[0]!
  const rule = [...(css.rules.get(selector)?.keys() ?? [])]

  it('emits the two axis shorthands', () => {
    expect(css.decl(selector, 'padding-block')).toBe('var(--ds-spacing-space-2)')
    expect(css.decl(selector, 'padding-inline')).toBe('var(--ds-spacing-space-4)')
  })

  // The container baseline opens with `padding: 0`. If the shorthand landed after the axis
  // declarations the node would ship with no padding at all - a silent, total loss of the
  // authored value, and the exact shape a `toContain('padding-inline')` assertion cannot see.
  it('the baseline shorthand comes before the declarations it must not overwrite', () => {
    expect(rule.indexOf('padding')).toBeLessThan(rule.indexOf('padding-inline'))
  })
})

// ─── A literal in the shipped stylesheet ─────────────────────────────────────
// The unit tests above hand `facetDecls` a resolver that says no. The emitter used to hand it
// `facetCssVar`, which never says no, so the literal gate was unreachable from a generated
// package: the flagship demo's tab shipped `border-color: var(--ds-color-transparent)`, a custom
// property no theme declares, which the browser reads as `currentColor` - a visible border on
// every resting tab. Given the foundations, the emitter now asks them first.

function restingTab(): ComponentIR {
  const tab = {
    id: 'tab',
    name: 'tab',
    kind: 'container',
    tag: 'auto',
    origin: 'root',
    locked: false,
    parentId: null,
    childrenIds: [],
    // The demo's own seed (`core/defaults.ts`, Tabs.tab): a hairline whose colour is the keyword
    // at rest and a token once selected.
    facets: { 'border.width': 'hairline', 'border.color': 'transparent', corner: '50%' },
    states: [{ id: 's', props: {}, states: ['selected'], facets: { 'border.color': 'accent' } }],
  } as unknown as ComponentNode
  return {
    name: 'Tab',
    archetype: null,
    structure: { rootId: 'tab', nodes: { tab } },
    contract: { props: [], events: [] },
  } as ComponentIR
}

function withColorToken(id: string): DocumentFoundations {
  const f = structuredClone(defaultFoundations())
  f.layers[0]!.tokens.push({ id, name: id, type: 'color', value: { base: { raw: '#000' } } })
  return f
}

describe('a literal in the emitted stylesheet', () => {
  const tabCss = (foundations: DocumentFoundations) => {
    const css = readCss(toComponentStyles(restingTab(), { foundations }))
    return { css, base: css.selectors[0]!, selected: css.selectors[1]! }
  }

  it('ships transparent as transparent, not as a variable no theme declares', () => {
    const { css, base } = tabCss(defaultFoundations())
    expect(css.decl(base, 'border-color')).toBe('transparent')
  })

  it('still ships a declared token as its variable, in the base rule and the state rule alike', () => {
    const { css, base, selected } = tabCss(defaultFoundations())
    expect(css.decl(base, 'border-width')).toBe('var(--ds-borderWidth-hairline)')
    expect(css.decl(selected, 'border-color')).toBe('var(--ds-color-accent)')
  })

  it('reads every literal through the same gate, not only the colour keyword', () => {
    const { css, base } = tabCss(defaultFoundations())
    expect(css.decl(base, 'border-radius')).toBe('50%')
  })

  // Token first (proposal 0049): a design system that names a colour `transparent` gets its own.
  it('prefers a token that claims the word', () => {
    const { css, base } = tabCss(withColorToken('transparent'))
    expect(css.decl(base, 'border-color')).toBe('var(--ds-color-transparent)')
  })

  // `generate()` and the release always pass the foundations; a bare `emit()` without them keeps
  // reading every value as a token id, since it cannot know which theme it will ship beside.
  it('without foundations, every value is still taken for a token id', () => {
    const css = readCss(toComponentStyles(restingTab()))
    expect(css.decl(css.selectors[0]!, 'border-color')).toBe('var(--ds-color-transparent)')
  })
})
