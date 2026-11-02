import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { hasDslLine } from './testkit'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── One axis is a whole size statement ───────────────────────────────────────
// `size` took two axes positionally and demanded both, so a node sized on one axis only had no
// spelling and the printer filled the gap with `fit`. That is not a notational nicety: an absent
// axis emits no CSS length at all, while `fit` emits `fit-content`. Every archetype default that
// sizes a width and leaves the height to its content came back with a height it never had - the
// menu surface is where it was found, via a seeded part carrying that default.

const wrap = (layout: string) => `
foundations {
  token md : size = 240px
}

component Panel {
  part root {
    layout { ${layout} }
  }
}
`

function roundTrip(layout: string) {
  const parsed = parseMildaDocument(wrap(layout), {})
  expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
  const ir = documentToIr(parsed.document)
  const node = Object.values(ir.components[0]?.structure?.nodes ?? {})[0]
  const dsl = documentToDsl({
    components: ir.components,
    foundations: ir.foundations,
    sharedTypes: ir.sharedTypes,
  })
  return { layout: node?.layout ?? {}, dsl }
}

describe('the size statement', () => {
  it('reads and writes both axes', () => {
    const { layout, dsl } = roundTrip('size fit fill')
    expect(layout).toMatchObject({ width: 'fit', height: 'fill' })
    expect(hasDslLine(dsl, 'layout { size fit fill }')).toBe(true)
  })

  it('reads one axis as the width, and does not invent a height', () => {
    const { layout, dsl } = roundTrip('size fill')
    expect(layout.width).toBe('fill')
    expect(layout.height).toBeUndefined()
    expect(hasDslLine(dsl, 'layout { size fill }')).toBe(true)
  })

  it('names the axis when only the height is set', () => {
    // The positional pair cannot express height-only, and filling the width with `fit` would add
    // a declaration the author never wrote - so the printer switches to the named form.
    const { layout, dsl } = roundTrip('size height fill')
    expect(layout.height).toBe('fill')
    expect(layout.width).toBeUndefined()
    expect(hasDslLine(dsl, 'layout { size height fill }')).toBe(true)
  })

  it('takes both axes named, in either order', () => {
    expect(roundTrip('size height fill width fit').layout).toMatchObject({
      width: 'fit',
      height: 'fill',
    })
  })

  it('keeps a fixed axis pointing at its token', () => {
    const { layout, dsl } = roundTrip('size fixed(md) fit')
    expect(layout).toMatchObject({ width: 'md', height: 'fit' })
    expect(hasDslLine(dsl, 'layout { size fixed(md) fit }')).toBe(true)
  })
})
