import { describe, expect, it } from 'vitest'
import { FACET_SLOTS, BORDER_SIDES, type FacetResolver } from '@mildastudio/core'
import { BORDER_SIDE_PROPS, WEB_COVERAGE, facetDecls } from './facets'

describe('facet CSS lowering', () => {
  it('emits a keyword facet as its own value, never as a token lookup', () => {
    expect(facetDecls({ slant: 'italic' })).toEqual([{ prop: 'fontStyle', value: 'italic' }])
  })

  // The types already make a missing side a compile error; this catches the other way a
  // split table rots - a property that no longer names a real CSS prefix for its edge.
  it('maps every border side core knows about to a CSS property prefix', () => {
    for (const { suffix } of BORDER_SIDES) {
      expect(BORDER_SIDE_PROPS[suffix]).toBeTruthy()
    }
  })

  // The types make a missing slot a compile error; this says the intent out loud - CSS renders
  // every neutral slot, so a `null` here is a claim, not a gap waiting to be filled in.
  it('renders every neutral slot, with nothing recorded as unsupported', () => {
    for (const slot of FACET_SLOTS) expect(WEB_COVERAGE[slot]).toBeNull()
  })

  // ─── The inset cases, now that core decides which edge a facet feeds (0048) ─
  // Written here rather than left to the corpus on purpose: the generator's tests only cover
  // what `docs/dsl/` reaches, and the mixed case below - a shorthand with one axis overriding
  // it - is exactly the shape a hand-authored document produces and the corpus does not.
  // A resolver that hands back whatever id it was given, so the assertions read as the authored
  // values rather than as `var(--ds-…)`.
  const raw: FacetResolver = (_scale, id) => id ?? ''

  it('keeps a uniform inset as the padding shorthand', () => {
    expect(facetDecls({ inset: '4px' }, raw)).toEqual([{ prop: 'padding', value: '4px' }])
  })

  // Proposal 0057: logical properties, so a start edge stays the start edge right to left. Not
  // `padding` plus overrides, which this emitted once and which only worked because a longhand
  // happened to follow the shorthand.
  it('uses the axis shorthands when each axis is symmetric', () => {
    expect(facetDecls({ inset: '4px', insetX: '8px' }, raw)).toEqual([
      { prop: 'paddingBlock', value: '4px' },
      { prop: 'paddingInline', value: '8px' },
    ])
  })

  it('emits only the axes it was given', () => {
    expect(facetDecls({ insetY: '2px' }, raw)).toEqual([{ prop: 'paddingBlock', value: '2px' }])
  })

  // A zero is a value: `inset: 4px, insetX: 0px` is a real request for no horizontal padding,
  // and `||` anywhere in the chain would silently give it 4px instead.
  it('honours a stated zero on one axis', () => {
    expect(facetDecls({ inset: '4px', insetX: '0px' }, raw)).toEqual([
      { prop: 'paddingBlock', value: '4px' },
      { prop: 'paddingInline', value: '0px' },
    ])
  })

  it('splits into the four logical longhands when one edge differs', () => {
    expect(facetDecls({ inset: '4px', 'inset.inline-start': '2px' }, raw)).toEqual([
      { prop: 'paddingBlockStart', value: '4px' },
      { prop: 'paddingBlockEnd', value: '4px' },
      { prop: 'paddingInlineStart', value: '2px' },
      { prop: 'paddingInlineEnd', value: '4px' },
    ])
  })

  it('emits a lone edge as its own longhand and nothing else', () => {
    expect(facetDecls({ 'inset.block-end': '6px' }, raw)).toEqual([
      { prop: 'paddingBlockEnd', value: '6px' },
    ])
  })

  // ─── 0049: a value is a token if one claims it, a literal if none does ─────
  // The resolver here answers nothing for every id, which is the "no such token" case. A bare
  // number used to vanish in it, because the syntactic guess ran first and a bare number looks
  // like neither a literal nor an id.
  const noTokens: FacetResolver = () => undefined

  it('falls back to a bare number as a literal when no token claims it', () => {
    expect(facetDecls({ 'text.weight': '600', opacity: '0.5' }, noTokens)).toEqual([
      { prop: 'opacity', value: '0.5' },
      { prop: 'fontWeight', value: '600' },
    ])
  })

  it('emits nothing for a value that is neither a token nor a plausible literal', () => {
    // A misspelled id. `background: acent-3` would be worse than no declaration at all.
    expect(facetDecls({ fill: 'acent-3' }, noTokens)).toEqual([])
  })

  it('prefers the token when one exists, even where the id looks like a value', () => {
    const resolver: FacetResolver = (_scale, id) =>
      id === '12px' ? 'var(--ds-space-2)' : undefined
    expect(facetDecls({ inset: '12px' }, resolver)).toEqual([
      { prop: 'padding', value: 'var(--ds-space-2)' },
    ])
  })

  it('gives a border stated by width alone a solid style and an ink-following colour', () => {
    expect(facetDecls({ 'border.width': '2px' }, raw)).toEqual([
      { prop: 'borderStyle', value: 'solid' },
      { prop: 'borderWidth', value: '2px' },
      { prop: 'borderColor', value: 'currentColor' },
    ])
  })
})
