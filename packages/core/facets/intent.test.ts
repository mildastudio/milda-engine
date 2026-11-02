import { describe, expect, it } from 'vitest'
import {
  borderStyleKeyword,
  facetReach,
  insetAxesAreSymmetric,
  insetsAreUniform,
  insetsPhysical,
  overlayFacets,
  resolveFacetIntent,
} from './intent'

// ─── 0048 slice 1 ────────────────────────────────────────────────────────────
// These assert the decisions that used to live three times over. Each one is written from the
// authored facet map inwards, because that is the only input the three targets share - and the
// reason they drifted is that nothing ever stated the rules apart from a renderer.

describe('insets', () => {
  const edges = (facets: Record<string, string>) => {
    const { insets } = resolveFacetIntent(facets)
    return [insets.blockStart, insets.blockEnd, insets.inlineStart, insets.inlineEnd].map(
      (r) => r?.value,
    )
  }

  it('spreads the shorthand to all four edges', () => {
    expect(edges({ inset: 'space-2' })).toEqual(['space-2', 'space-2', 'space-2', 'space-2'])
  })

  it('lets an axis override the shorthand on its own edges only', () => {
    expect(edges({ inset: 'space-4', insetY: 'space-1' })).toEqual([
      'space-1',
      'space-1',
      'space-4',
      'space-4',
    ])
  })

  // The `??` vs `||` trap that has its own comment in kernel/render.ts: a deliberate zero is a
  // value. Written as a raw '0' because that is what an author who wants no padding produces.
  it('treats a stated zero as a value, not as absence', () => {
    expect(edges({ inset: 'space-4', insetX: '0' })).toEqual(['space-4', 'space-4', '0', '0'])
  })

  // Proposal 0057 §4.4: an edge's own key, then its axis, then the shorthand.
  it('lets one edge override its axis and the shorthand', () => {
    expect(edges({ inset: 'a', insetX: 'b', 'inset.inline-start': 'c' })).toEqual([
      'a',
      'a',
      'c',
      'b',
    ])
    expect(edges({ 'inset.block-end': '0' })).toEqual([undefined, '0', undefined, undefined])
  })

  it('says when the four edges agree, so a shorthand can be used', () => {
    expect(insetsAreUniform(resolveFacetIntent({ inset: 'space-2' }).insets)).toBe(true)
    expect(insetsAreUniform(resolveFacetIntent({ inset: 'a', insetY: 'b' }).insets)).toBe(false)
    expect(insetsAreUniform(resolveFacetIntent({}).insets)).toBe(true) // all absent
  })

  it('says when each axis is symmetric, so the axis shorthands can be used', () => {
    const sym = (f: Record<string, string>) => insetAxesAreSymmetric(resolveFacetIntent(f).insets)
    expect(sym({ insetX: 'a', insetY: 'b' })).toBe(true)
    expect(sym({ insetX: 'a' })).toBe(true)
    expect(sym({ insetX: 'a', 'inset.inline-end': 'b' })).toBe(false)
  })

  it('maps the logical edges to physical sides left to right, for the non-web targets', () => {
    const sides = insetsPhysical(
      resolveFacetIntent({ 'inset.inline-start': 's', 'inset.block-end': 'e' }).insets,
    )
    expect(sides.left?.value).toBe('s')
    expect(sides.bottom?.value).toBe('e')
    expect(sides.right).toBeUndefined()
    expect(sides.top).toBeUndefined()
  })

  it('carries the scale each edge reads on, so a target need not look it up', () => {
    const { insets } = resolveFacetIntent({ insetX: 'space-2', 'inset.block-start': 'space-1' })
    expect(insets.inlineStart?.scale).toBe('spacing')
    expect(insets.blockStart?.scale).toBe('spacing')
  })
})

// ─── 0057 §4.5: a later layer wins per edge, not per key ─────────────────────
// The browser's answer, which the generated React already gets by emitting each rule into its
// own selector. `overlayFacets` is what the Studio preview, the Mac canvas and the Figma scene go
// through (via `resolveNodeFacets`), so these are the cases on which they used to disagree.
describe('overlayFacets', () => {
  const hovered = (base: Record<string, string>, rule: Record<string, string>) => {
    const { insets } = resolveFacetIntent(overlayFacets(base, rule))
    return [insets.blockStart, insets.blockEnd, insets.inlineStart, insets.inlineEnd].map(
      (r) => r?.value,
    )
  }

  it('a rule shorthand overrides a base axis (the measured 2026-11-02 case)', () => {
    expect(hovered({ insetX: '4px' }, { inset: '8px' })).toEqual(['8px', '8px', '8px', '8px'])
  })

  it('a rule axis overrides a base edge on that axis', () => {
    expect(hovered({ 'inset.inline-start': '2px' }, { insetX: '4px' })).toEqual([
      undefined,
      undefined,
      '4px',
      '4px',
    ])
  })

  it('a rule edge leaves the rest of a base axis alone', () => {
    expect(hovered({ insetX: '4px' }, { 'inset.inline-start': '8px' })).toEqual([
      undefined,
      undefined,
      '8px',
      '4px',
    ])
  })

  it('a rule axis leaves the other axis of the base shorthand alone', () => {
    expect(hovered({ inset: '2px', insetX: '4px' }, { insetY: '8px' })).toEqual([
      '8px',
      '8px',
      '4px',
      '4px',
    ])
  })

  it('a rule border overrides a base side border on the same part of the border', () => {
    const merged = overlayFacets(
      { 'border.top.width': '4px', 'border.top.color': 'red' },
      { 'border.width': '1px' },
    )
    expect(merged['border.top.width']).toBeUndefined()
    expect(merged['border.top.color']).toBe('red') // the colour was not restated
    expect(merged['border.width']).toBe('1px')
  })

  it('a physical and a logical side reaching the same edge shadow each other', () => {
    const merged = overlayFacets(
      { 'border.block-start.width': '4px' },
      { 'border.top.width': '1px' },
    )
    expect(merged).toEqual({ 'border.top.width': '1px' })
  })

  it('keys with no edges are simply replaced', () => {
    expect(overlayFacets({ fill: 'a', inset: 'x' }, { fill: 'b' })).toEqual({
      fill: 'b',
      inset: 'x',
    })
  })

  it('reports the reach of each key it shadows by', () => {
    expect(facetReach('insetX')).toEqual({ group: 'inset', edges: ['inline-start', 'inline-end'] })
    expect(facetReach('border.left.color')?.edges).toEqual(['inline-start'])
    expect(facetReach('fill')).toBeUndefined()
  })
})

describe('borders', () => {
  it('exists as soon as any one of width, colour or style is stated', () => {
    expect(resolveFacetIntent({ 'border.width': 'w-1' }).borders).toHaveLength(1)
    expect(resolveFacetIntent({ 'border.color': 'grey-6' }).borders).toHaveLength(1)
    expect(resolveFacetIntent({ 'border.style': 'dashed' }).borders).toHaveLength(1)
    expect(resolveFacetIntent({}).borders).toHaveLength(0)
  })

  it('defaults the style to solid, and keeps a stated one as the keyword it is', () => {
    expect(borderStyleKeyword(resolveFacetIntent({ 'border.width': 'w-1' }).borders[0])).toBe(
      'solid',
    )
    expect(borderStyleKeyword(resolveFacetIntent({ 'border.style': 'dotted' }).borders[0])).toBe(
      'dotted',
    )
    // A keyword facet has no scale to read: the value IS the value.
    expect(resolveFacetIntent({ 'border.style': 'dotted' }).borders[0].color).toBeUndefined()
  })

  // Every target says this in its own words - `currentColor`, the inherited ink RGBA, the ink
  // binding. Saying it once is the whole point of the intent.
  it('flags a border whose colour should follow the ink', () => {
    expect(resolveFacetIntent({ 'border.width': 'w-1' }).borders[0].colorFollowsInk).toBe(true)
    const stated = resolveFacetIntent({ 'border.width': 'w-1', 'border.color': 'grey-6' })
    expect(stated.borders[0].colorFollowsInk).toBe(false)
    expect(stated.borders[0].color?.value).toBe('grey-6')
  })

  it('keeps per-side borders apart, identified by the neutral side suffix', () => {
    const intent = resolveFacetIntent({
      'border.width': 'w-1',
      'border.top.color': 'grey-6',
      'border.inline-start.width': 'w-2',
    })
    expect(intent.borders.map((b) => b.side)).toEqual(['', '.top', '.inline-start'])
    expect(intent.borders.find((b) => b.side === '.top')?.colorFollowsInk).toBe(false)
    expect(intent.borders.find((b) => b.side === '.inline-start')?.width?.value).toBe('w-2')
  })
})

describe('the rest of the slots', () => {
  it('maps the plain colour and scalar facets straight through', () => {
    const intent = resolveFacetIntent({
      fill: 'accent-3',
      ink: 'grey-12',
      corner: 'radius-2',
      gap: 'space-1',
      opacity: 'o-50',
      elevation: 'shadow-2',
    })
    expect(intent.fill?.value).toBe('accent-3')
    expect(intent.fill?.scale).toBe('color')
    expect(intent.corner?.scale).toBe('radius')
    expect(intent.elevation?.scale).toBe('elevation')
    expect(intent.opacity?.value).toBe('o-50')
  })

  // The ring facet IS its colour, so "a ring with no colour" is not a state to model. An empty
  // value means absent, here as for every other facet: clearing one in the editor removes the
  // key, so an empty string is not something anybody can author on purpose. A colour that fails
  // to RESOLVE is a different matter, and falling back to the ink is the reader's job.
  it('is a ring only when a colour was actually stated', () => {
    expect(resolveFacetIntent({}).ring).toBeUndefined()
    expect(resolveFacetIntent({ ring: '' }).ring).toBeUndefined()
    expect(resolveFacetIntent({ ring: 'accent-8' }).ring?.color.value).toBe('accent-8')
  })

  it('groups the typography facets, keeping slant as a keyword', () => {
    const { text } = resolveFacetIntent({
      'text.size': 'fs-3',
      'text.weight': 'fw-600',
      font: 'sans',
      slant: 'italic',
    })
    expect(text.size?.scale).toBe('fontSize')
    expect(text.weight?.scale).toBe('fontWeight')
    expect(text.family?.scale).toBe('fontFamily')
    expect(text.slant?.value).toBe('italic')
  })

  it('is total over an absent map rather than throwing', () => {
    const intent = resolveFacetIntent(undefined)
    expect(intent.borders).toEqual([])
    expect(intent.insets).toEqual({
      top: undefined,
      right: undefined,
      bottom: undefined,
      left: undefined,
    })
    expect(intent.text.slant).toBeUndefined()
  })

  // An unregistered key must not become a slot with a bogus scale - the reader would then look
  // it up on the wrong scale and quietly find nothing.
  it('carries no scale for a facet the registry does not know', () => {
    const intent = resolveFacetIntent({ fill: 'accent-3', 'not.a.facet': 'x' })
    expect(intent.fill?.scale).toBe('color')
    expect(Object.values(intent).some((v) => v && (v as { id?: string }).id === 'x')).toBe(false)
  })
})
