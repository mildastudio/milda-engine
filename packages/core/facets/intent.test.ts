import { describe, expect, it } from 'vitest'
import { borderStyleKeyword, insetsAreUniform, resolveFacetIntent } from './intent'

// ─── 0048 slice 1 ────────────────────────────────────────────────────────────
// These assert the decisions that used to live three times over. Each one is written from the
// authored facet map inwards, because that is the only input the three targets share - and the
// reason they drifted is that nothing ever stated the rules apart from a renderer.

describe('insets', () => {
  it('spreads the shorthand to all four edges', () => {
    const { insets } = resolveFacetIntent({ inset: 'space-2' })
    expect([insets.top, insets.right, insets.bottom, insets.left].map((r) => r?.value)).toEqual([
      'space-2',
      'space-2',
      'space-2',
      'space-2',
    ])
  })

  it('lets an axis override the shorthand on its own edges only', () => {
    const { insets } = resolveFacetIntent({ inset: 'space-4', insetY: 'space-1' })
    expect(insets.left?.value).toBe('space-4')
    expect(insets.right?.value).toBe('space-4')
    expect(insets.top?.value).toBe('space-1')
    expect(insets.bottom?.value).toBe('space-1')
  })

  // The `??` vs `||` trap that has its own comment in kernel/render.ts: a deliberate zero is a
  // value. Written as a raw '0' because that is what an author who wants no padding produces.
  it('treats a stated zero as a value, not as absence', () => {
    const { insets } = resolveFacetIntent({ inset: 'space-4', insetX: '0' })
    expect(insets.left?.value).toBe('0')
    expect(insets.right?.value).toBe('0')
    expect(insets.top?.value).toBe('space-4')
  })

  it('says when the four edges agree, so a shorthand can be used', () => {
    expect(insetsAreUniform(resolveFacetIntent({ inset: 'space-2' }).insets)).toBe(true)
    expect(insetsAreUniform(resolveFacetIntent({ inset: 'a', insetY: 'b' }).insets)).toBe(false)
    expect(insetsAreUniform(resolveFacetIntent({}).insets)).toBe(true) // all absent
  })

  it('carries the scale each edge reads on, so a target need not look it up', () => {
    const { insets } = resolveFacetIntent({ insetX: 'space-2' })
    expect(insets.left?.scale).toBe('spacing')
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
