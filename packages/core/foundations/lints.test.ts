import { describe, expect, it } from 'vitest'
import { foundationsLints } from './lints'
import { defaultFoundations, type DocumentFoundations, type Token } from './document'
import { collectEdges } from './references'

const tok = (id: string, value: Token['value'], role?: Token['role']): Token => ({
  id,
  name: id,
  type: 'color',
  value,
  group: null,
  order: 0,
  ...(role ? { role } : {}),
})

// prim(0) -> brand(1) -> dec(2)
function doc(over: { prim?: Token[]; brand?: Token[]; dec?: Token[] }): DocumentFoundations {
  return {
    contextGroups: [],
    layers: [
      { id: 'prim', name: 'Primitives', order: 0, groups: [], tokens: over.prim ?? [] },
      { id: 'brand', name: 'Brand', order: 1, groups: [], tokens: over.brand ?? [] },
      { id: 'dec', name: 'Decisions', order: 2, groups: [], tokens: over.dec ?? [] },
    ],
  }
}

// There is no `unreferenced` lint, on purpose - see the note in lints.ts. This asserts the
// measurement that ruled it out, so the reasoning cannot quietly rot: the seeded system's
// primitives are overwhelmingly unreferenced BY DESIGN, because a ramp is shipped complete.
describe('why there is no unused-token lint', () => {
  it('would flag almost every primitive in the seeded system', () => {
    const f = defaultFoundations()
    const referenced = new Set(collectEdges(f).map((e) => e.to))
    const base = f.layers.find((l) => l.order === 0)!
    const unreferenced = base.tokens.filter((t) => !referenced.has(t.id))
    // Not an assertion about the exact number, but about the ORDER of it: most of the palette.
    expect(unreferenced.length).toBeGreaterThan(base.tokens.length * 0.5)
  })
})

describe('bypassed', () => {
  it('flags a reference that skips a layer which already decides that value', () => {
    const f = doc({
      prim: [tok('violet-50', { base: { raw: '#efedfd' } })],
      brand: [tok('brand-tint', { base: { ref: 'violet-50' } })],
      dec: [tok('accent-subtle', { base: { ref: 'violet-50' } })],
    })
    const { bypassed } = foundationsLints(f)
    expect(bypassed.map((x) => x.token.id)).toEqual(['accent-subtle'])
    expect(bypassed[0].detail).toContain('brand-tint')
  })

  it('does NOT flag a reference whose skipped layer has no decision for it', () => {
    // A neutral skipping the Brand layer is correct - Brand holds brand hues, not greys.
    const f = doc({
      prim: [
        tok('slate-50', { base: { raw: '#f8fafc' } }),
        tok('violet-50', { base: { raw: '#efedfd' } }),
      ],
      brand: [tok('brand-tint', { base: { ref: 'violet-50' } })],
      dec: [tok('surface', { base: { ref: 'slate-50' } })],
    })
    expect(foundationsLints(f).bypassed.map((x) => x.token.id)).toEqual([])
  })

  it('does NOT flag a reference to the layer immediately below', () => {
    const f = doc({
      prim: [tok('violet-50', { base: { raw: '#efedfd' } })],
      brand: [tok('brand-tint', { base: { ref: 'violet-50' } })],
      dec: [tok('accent-subtle', { base: { ref: 'brand-tint' } })],
    })
    expect(foundationsLints(f).bypassed).toEqual([])
  })
})

describe('lowContrast', () => {
  it('flags a foreground role that fails AA against the surface role', () => {
    const f = doc({
      dec: [
        tok('surface', { base: { raw: '#ffffff' } }, 'surface'),
        tok('text', { base: { raw: '#bbbbbb' } }, 'textPrimary'),
      ],
    })
    const { lowContrast } = foundationsLints(f)
    expect(lowContrast.map((x) => x.token.id)).toEqual(['text'])
    expect(lowContrast[0].detail).toContain('below AA')
  })

  it('passes a foreground role that meets AA', () => {
    const f = doc({
      dec: [
        tok('surface', { base: { raw: '#ffffff' } }, 'surface'),
        tok('text', { base: { raw: '#111111' } }, 'textPrimary'),
      ],
    })
    expect(foundationsLints(f).lowContrast).toEqual([])
  })

  it('judges nothing when no token claims the surface role, rather than guessing', () => {
    const f = doc({ dec: [tok('text', { base: { raw: '#bbbbbb' } }, 'textPrimary')] })
    expect(foundationsLints(f).lowContrast).toEqual([])
  })

  it('ignores a colour that claims no foreground role', () => {
    const f = doc({
      dec: [
        tok('surface', { base: { raw: '#ffffff' } }, 'surface'),
        tok('decoration', { base: { raw: '#eeeeee' } }),
      ],
    })
    expect(foundationsLints(f).lowContrast).toEqual([])
  })
})

describe('dangling and cyclic', () => {
  it('flags a reference to a token that is gone', () => {
    const f = doc({ dec: [tok('accent', { base: { ref: 'deleted' } })] })
    expect(foundationsLints(f).dangling.map((x) => x.token.id)).toEqual(['accent'])
  })

  it('flags a cycle once, at its entry point', () => {
    // findCycles reports one token per cycle, not every member - enough to take you there.
    const f = doc({ dec: [tok('a', { base: { ref: 'b' } }), tok('b', { base: { ref: 'a' } })] })
    expect(foundationsLints(f).cyclic.map((x) => x.token.id)).toEqual(['a'])
  })
})

describe('the seeded system', () => {
  it('is clean on every lint that judges it', () => {
    const lints = foundationsLints(defaultFoundations())
    expect(lints.bypassed).toEqual([])
    expect(lints.dangling).toEqual([])
    expect(lints.cyclic).toEqual([])
  })

  // A REAL finding about our own starter system, kept as an assertion rather than silenced:
  // `text-subtle` claims the textSubtle role, so it says it is text, and 2.56:1 fails AA.
  // Either the colour moves or the role does; the lint is right either way.
  it('reports that the seeded text-subtle fails AA on the surface', () => {
    const findings = foundationsLints(defaultFoundations()).lowContrast
    expect(findings.map((f) => f.token.id)).toEqual(['text-subtle'])
  })

  // on-accent sits on the ACCENT. Comparing it to the page surface produced a meaningless
  // 1.00:1 (white on white) that read as a defect.
  it('compares on-accent against the accent, not the surface', () => {
    const findings = foundationsLints(defaultFoundations()).lowContrast
    expect(findings.map((f) => f.token.id)).not.toContain('on-accent')
  })
})
