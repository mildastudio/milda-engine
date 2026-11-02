import { describe, expect, it } from 'vitest'
import { LAYOUT_SLOTS } from '@mildastudio/core'
import { WEB_LAYOUT_COVERAGE, layoutDecls } from './layout'

// ─── The web column of proposal 0056 §3.4 ────────────────────────────────────
// A resolver that hands back the id, so the assertions read as the authored values.
const raw = (id: string) => id
const decls = (
  layout: Record<string, string>,
  parent?: Record<string, string>,
  facets?: Record<string, string>,
) =>
  layoutDecls(layout, raw, {
    parent: parent || facets ? { layout: parent, facets } : undefined,
    facet: (_scale, id) => id,
  })
const prop = (list: { prop: string; value: string }[], p: string) =>
  list.find((d) => d.prop === p)?.value

describe('the web draws every layout slot', () => {
  it('records nothing as unsupported, as a claim rather than a gap', () => {
    for (const slot of LAYOUT_SLOTS) expect(WEB_LAYOUT_COVERAGE[slot]).toBeNull()
  })
})

describe('a container', () => {
  it('is a flex row or column, with the two words the web tier used to drop', () => {
    const d = decls({
      direction: 'row',
      align: 'baseline',
      distribute: 'evenly',
      wrap: 'wrap-reverse',
    })
    expect(prop(d, 'display')).toBe('flex')
    expect(prop(d, 'alignItems')).toBe('baseline')
    expect(prop(d, 'justifyContent')).toBe('space-evenly')
    expect(prop(d, 'flexWrap')).toBe('wrap-reverse')
  })

  it('is a one-cell grid for layers, placing items with the same two words', () => {
    const d = decls({ direction: 'layers', align: 'center', distribute: 'end' })
    expect(prop(d, 'display')).toBe('grid')
    expect(prop(d, 'position')).toBe('relative')
    expect(prop(d, 'alignItems')).toBe('center')
    expect(prop(d, 'justifyItems')).toBe('end')
    expect(d.some((x) => x.prop === 'flexDirection')).toBe(false)
  })

  it('puts every child of a layers stack in the one cell', () => {
    expect(prop(decls({ width: 'fit' }, { direction: 'layers' }), 'gridArea')).toBe('1 / 1')
    expect(prop(decls({ width: 'fit' }, { direction: 'row' }), 'gridArea')).toBeUndefined()
  })
})

describe('fill and weight', () => {
  it('on the shared axis share the leftover and never push a sibling out', () => {
    const d = decls({ width: 'fill' }, { direction: 'row' })
    expect(prop(d, 'flexGrow')).toBe('1')
    expect(prop(d, 'flexBasis')).toBe('0%')
    expect(prop(d, 'minWidth')).toBe('0')
    expect(prop(d, 'width')).toBeUndefined()
    expect(prop(decls({ width: 'weight(3)' }, { direction: 'row' }), 'flexGrow')).toBe('3')
    expect(prop(decls({ height: 'fill' }, { direction: 'column' }), 'minHeight')).toBe('0')
  })

  it('across the axis, on a root, or in a layers stack take the whole span', () => {
    expect(prop(decls({ width: 'fill' }, { direction: 'column' }), 'width')).toBe('100%')
    expect(prop(decls({ width: 'fill' }), 'width')).toBe('100%')
    expect(prop(decls({ width: 'weight(2)' }, { direction: 'layers' }), 'width')).toBe('100%')
    expect(prop(decls({ width: 'fill' }, { direction: 'column' }), 'flexGrow')).toBeUndefined()
  })

  it('in a wrapping parent keep the content as the basis so lines still break', () => {
    expect(prop(decls({ width: 'fill' }, { direction: 'row', wrap: 'wrap' }), 'flexBasis')).toBe(
      'auto',
    )
  })

  it('leave the minimum to the author when a clamp states one', () => {
    const d = decls({ width: 'fill', widthMin: 'sm' }, { direction: 'row' })
    expect(d.filter((x) => x.prop === 'minWidth').map((x) => x.value)).toEqual(['sm'])
  })
})

describe('fixed, ratio and clamps', () => {
  it('resolve a fixed size and the clamps through the size resolver', () => {
    const d = layoutDecls({ width: 'md', widthMax: 'lg', heightMin: '12px' }, (id) => `var(${id})`)
    expect(prop(d, 'width')).toBe('var(md)')
    expect(prop(d, 'maxWidth')).toBe('var(lg)')
    expect(prop(d, 'minHeight')).toBe('var(12px)')
  })

  it('let a ratio axis follow the other with no length of its own', () => {
    const d = decls({ width: 'fill', height: 'ratio(16:9)' })
    expect(prop(d, 'aspectRatio')).toBe('16 / 9')
    expect(prop(d, 'height')).toBeUndefined()
    // Two ratio axes contradict each other; the first wins and the second is not emitted.
    expect(
      decls({ width: 'ratio(1:1)', height: 'ratio(2:1)' }).filter((x) => x.prop === 'aspectRatio'),
    ).toHaveLength(1)
  })
})

describe('position', () => {
  it('overlay is absolute, placed by its layers parent', () => {
    expect(prop(decls({ position: 'overlay' }, { direction: 'layers' }), 'position')).toBe(
      'absolute',
    )
  })

  it('pinned is sticky on logical insets', () => {
    const d = decls({ position: 'pinned block-start' })
    expect(prop(d, 'position')).toBe('sticky')
    expect(prop(d, 'insetBlockStart')).toBe('0')
    expect(prop(decls({ position: 'pinned all' }), 'inset')).toBe('0')
    const both = decls({ position: 'pinned inline' })
    expect(prop(both, 'insetInlineStart')).toBe('0')
    expect(prop(both, 'insetInlineEnd')).toBe('0')
  })

  it('bleed cancels the parent inset on its edges with a logical negative margin', () => {
    const d = decls(
      { position: 'bleed inline' },
      { direction: 'column' },
      { inset: 'space-4', insetX: 'space-2' },
    )
    expect(prop(d, 'marginInlineStart')).toBe('calc(-1 * space-2)')
    expect(prop(d, 'marginInlineEnd')).toBe('calc(-1 * space-2)')
    expect(prop(d, 'marginBlockStart')).toBeUndefined()
    // Nothing to cancel on a parent without an inset.
    expect(
      decls({ position: 'bleed all' }, { direction: 'row' }).some((x) =>
        x.prop.startsWith('margin'),
      ),
    ).toBe(false)
  })

  it('flow stores nothing and emits nothing', () => {
    expect(decls({ position: 'flow' })).toEqual([])
  })
})
