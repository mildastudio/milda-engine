import { describe, expect, it } from 'vitest'
import { RAMP_STOPS, colorRamp, roleTokenId, standardRoles, STANDARD_ROLES } from './generate'
import { contrastRatio } from './color'
import { resolveToken } from '../facets/resolver'
import type { DocumentFoundations, Layer } from './document'

describe('colorRamp', () => {
  const ramp = colorRamp('violet', 265)

  it('produces one token per stop, named for it', () => {
    expect(ramp).toHaveLength(RAMP_STOPS.length)
    expect(ramp.map((t) => t.id)).toEqual(RAMP_STOPS.map((s) => `violet-${s}`))
  })

  it('stores TYPED oklch, not hex - the perceptual intent is the point', () => {
    const slot = ramp[0].value.base
    expect(slot).toHaveProperty('color')
    expect('color' in slot && slot.color.space).toBe('oklch')
  })

  it('keeps one hue across the whole ramp', () => {
    const hues = ramp.map((t) => ('color' in t.value.base ? t.value.base.color.channels[2] : null))
    expect(new Set(hues)).toEqual(new Set([265]))
  })

  it('descends in lightness monotonically', () => {
    const ls = ramp.map((t) => ('color' in t.value.base ? t.value.base.color.channels[0] : 0))
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1])
  })

  it('peaks chroma mid-ramp rather than holding it flat', () => {
    const cs = ramp.map((t) => ('color' in t.value.base ? t.value.base.color.channels[1] : 0))
    const max = Math.max(...cs)
    expect(cs.indexOf(max)).toBeGreaterThan(2)
    expect(cs.indexOf(max)).toBeLessThan(cs.length - 2)
    expect(cs[0]).toBeLessThan(max)
    expect(cs[cs.length - 1]).toBeLessThan(max)
  })

  it('gives the ends enough range to carry text on the pale end', () => {
    const f = docWith(ramp)
    const lightest = resolveToken('violet-50', f, undefined, 'color')!
    const darkest = resolveToken('violet-950', f, undefined, 'color')!
    expect(contrastRatio(darkest, lightest)!).toBeGreaterThan(7)
  })
})

function docWith(tokens: ReturnType<typeof colorRamp>): DocumentFoundations {
  return {
    contextGroups: [],
    layers: [
      {
        id: 'prim',
        name: 'Primitives',
        order: 0,
        groups: [],
        tokens: tokens.map((t, i) => ({ ...t, group: null, order: i })),
      },
    ],
  }
}

describe('standardRoles', () => {
  const ramp = colorRamp('violet', 265)
  const f = docWith(ramp)
  const layer: Layer = f.layers[0]
  const resolve = (id: string) => resolveToken(id, f, undefined, 'color')
  const roles = standardRoles(layer, resolve)

  it('creates one token per standard role, each a reference', () => {
    expect(roles.map((r) => r.role)).toEqual(STANDARD_ROLES)
    expect(roles.every((r) => 'ref' in r.value.base)).toBe(true)
  })

  it('ids are slugs of the role, so textPrimary becomes text-primary', () => {
    expect(roleTokenId('textPrimary')).toBe('text-primary')
    expect(roles.find((r) => r.role === 'textPrimary')?.id).toBe('text-primary')
  })

  it('picks the lightest for a surface and the darkest for primary text', () => {
    const surface = roles.find((r) => r.role === 'surface')!
    const text = roles.find((r) => r.role === 'textPrimary')!
    expect('ref' in surface.value.base && surface.value.base.ref).toBe('violet-50')
    expect('ref' in text.value.base && text.value.base.ref).toBe('violet-950')
  })

  it('produces a surface/text pairing that already passes AA', () => {
    // The whole promise of the action: one click and the system works, not one click and a
    // contrast lint immediately fires.
    const withRoles: DocumentFoundations = {
      ...f,
      layers: [
        f.layers[0],
        {
          id: 'dec',
          name: 'Decisions',
          order: 1,
          groups: [],
          tokens: roles.map((r, i) => ({ ...r, group: null, order: i })),
        },
      ],
    }
    const fg = resolveToken('text-primary', withRoles, undefined, 'color')!
    const bg = resolveToken('surface', withRoles, undefined, 'color')!
    expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(4.5)
  })

  it('chooses on-accent by measuring against the accent, not by convention', () => {
    const accent = roles.find((r) => r.role === 'accent')!
    const onAccent = roles.find((r) => r.role === 'onAccent')!
    const withRoles: DocumentFoundations = {
      ...f,
      layers: [
        f.layers[0],
        {
          id: 'dec',
          name: 'Decisions',
          order: 1,
          groups: [],
          tokens: roles.map((r, i) => ({ ...r, group: null, order: i })),
        },
      ],
    }
    const a = resolveToken(accent.id, withRoles, undefined, 'color')!
    const o = resolveToken(onAccent.id, withRoles, undefined, 'color')!
    expect(contrastRatio(o, a)!).toBeGreaterThanOrEqual(4.5)
  })

  it('returns nothing rather than inventing values when there is too little to choose from', () => {
    const thin: Layer = {
      id: 'p',
      name: 'P',
      order: 0,
      groups: [],
      tokens: ramp.slice(0, 2).map((t, i) => ({ ...t, group: null, order: i })),
    }
    expect(standardRoles(thin, resolve)).toEqual([])
  })
})

describe('standardRoles on a palette that is not tidy', () => {
  // A ramp plus one saturated outlier - the shape of a real Base layer that happens to hold a
  // brand red, and the shape of our own dev fixture.
  const ramp = colorRamp('slate', 265, 0.02)
  const withOutlier: DocumentFoundations = {
    contextGroups: [],
    layers: [
      {
        id: 'prim',
        name: 'Primitives',
        order: 0,
        groups: [],
        tokens: [
          ...ramp.map((t, i) => ({ ...t, group: null, order: i })),
          {
            id: 'p3-red',
            name: 'p3-red',
            type: 'color' as const,
            value: { base: { raw: '#ff0000' } },
            group: null,
            order: 99,
          },
        ],
      },
    ],
  }
  const roles = standardRoles(withOutlier.layers[0], (id) =>
    resolveToken(id, withOutlier, undefined, 'color'),
  )
  const refOf = (role: string) => {
    const t = roles.find((r) => r.role === role)!
    return 'ref' in t.value.base ? t.value.base.ref : ''
  }

  it('does not hand a saturated outlier to a structural role', () => {
    // The bug this test exists for: ranking every candidate by lightness alone made `border`
    // bright red, because the outlier happened to sit at that position.
    for (const role of ['surface', 'surfaceRaised', 'textPrimary', 'textSecondary', 'border']) {
      expect(refOf(role)).not.toBe('p3-red')
    }
  })

  it('still gives the accent the most chromatic colour there is', () => {
    expect(refOf('accent')).toBe('p3-red')
  })
})
