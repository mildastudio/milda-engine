import { describe, expect, it } from 'vitest'
import {
  COLOR_KEYWORD_VALUES,
  colorToCss,
  colorToHex,
  compositeOver,
  contrastAgainst,
  contrastRatio,
  convertColor,
  inSrgbGamut,
  parseCssColor,
  toSrgb,
} from './color'
import { COLOR_KEYWORDS, type ColorValue } from '@mildastudio/milda'

const near = (got: number, want: number, digits = 3) => expect(got).toBeCloseTo(want, digits)

describe('parseCssColor', () => {
  it('parses hex in 3, 4, 6 and 8 digit forms', () => {
    expect(parseCssColor('#f00')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
    expect(parseCssColor('#ff0000')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
    expect(parseCssColor('#ff000080')?.alpha).toBeCloseTo(0.502, 2)
    expect(parseCssColor('#f00f')?.alpha).toBe(1)
  })

  it('parses rgb() in both spellings and normalises to 0..1', () => {
    expect(parseCssColor('rgb(255 0 0)')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
    expect(parseCssColor('rgb(100% 0% 0%)')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
    expect(parseCssColor('rgba(255, 0, 0, 0.5)')?.alpha).toBeCloseTo(0.5, 3)
    expect(parseCssColor('rgb(255 0 0 / 50%)')?.alpha).toBeCloseTo(0.5, 3)
  })

  it('keeps hsl in its own space with s/l as 0..1', () => {
    expect(parseCssColor('hsl(210 50% 40%)')).toEqual({ space: 'hsl', channels: [210, 0.5, 0.4] })
    expect(parseCssColor('hsl(210 0.5 0.4)')).toEqual({ space: 'hsl', channels: [210, 0.5, 0.4] })
  })

  it('accepts both oklch lightness forms and pins 100% chroma at 0.4', () => {
    expect(parseCssColor('oklch(0.62 0.19 268)')).toEqual({
      space: 'oklch',
      channels: [0.62, 0.19, 268],
    })
    near(parseCssColor('oklch(62% 0.19 268)')!.channels[0], 0.62)
    near(parseCssColor('oklch(0.62 100% 268)')!.channels[1], 0.4)
  })

  it('parses color(display-p3 …) and color(srgb …)', () => {
    expect(parseCssColor('color(display-p3 1 0.2 0.1)')).toEqual({
      space: 'display-p3',
      channels: [1, 0.2, 0.1],
    })
    expect(parseCssColor('color(srgb 1 0 0)')).toEqual({ space: 'srgb', channels: [1, 0, 0] })
  })

  it('returns null for things it genuinely cannot type', () => {
    expect(parseCssColor('rebeccapurple')).toBeNull()
    expect(parseCssColor('color-mix(in oklab, red, blue)')).toBeNull()
    expect(parseCssColor('color(rec2020 1 0 0)')).toBeNull()
    expect(parseCssColor('')).toBeNull()
  })

  // The keyword is a literal everywhere `couldBeLiteral` is asked, so a target that reads it
  // through here must get a colour back - zero alpha, which the Mac canvas paints as nothing.
  it('reads transparent as zero alpha', () => {
    expect(parseCssColor('transparent')).toEqual({ space: 'srgb', channels: [0, 0, 0], alpha: 0 })
    expect(toSrgb(parseCssColor('transparent')!)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('has a value for every colour keyword the language accepts', () => {
    for (const word of COLOR_KEYWORDS) expect(COLOR_KEYWORD_VALUES.has(word), word).toBe(true)
  })
})

describe('colorToCss', () => {
  it('serialises sRGB as hex and the rest in their own notation', () => {
    expect(colorToCss({ space: 'srgb', channels: [1, 0, 0] })).toBe('#ff0000')
    expect(colorToCss({ space: 'srgb', channels: [1, 0, 0], alpha: 0.5 })).toBe('#ff000080')
    expect(colorToCss({ space: 'hsl', channels: [210, 0.5, 0.4] })).toBe('hsl(210 50% 40%)')
    expect(colorToCss({ space: 'oklch', channels: [0.62, 0.19, 268] })).toBe('oklch(0.62 0.19 268)')
    expect(colorToCss({ space: 'display-p3', channels: [1, 0.2, 0.1] })).toBe(
      'color(display-p3 1 0.2 0.1)',
    )
  })

  it('round-trips through parse for every space it can spell', () => {
    const cases: ColorValue[] = [
      { space: 'srgb', channels: [0.2, 0.4, 0.6] },
      { space: 'srgb', channels: [0.2, 0.4, 0.6], alpha: 0.5 },
      { space: 'hsl', channels: [210, 0.5, 0.4] },
      { space: 'oklch', channels: [0.62, 0.19, 268] },
      { space: 'display-p3', channels: [0.5, 0.2, 0.1] },
    ]
    for (const c of cases) {
      const back = parseCssColor(colorToCss(c))
      expect(back?.space).toBe(c.space)
      back!.channels.forEach((n, i) => near(n, c.channels[i], 2))
      if (c.alpha != null) near(back!.alpha!, c.alpha, 2)
    }
  })
})

// Conversion correctness is checked against invariants rather than magic numbers:
// neutrals must stay neutral, primaries must land where they belong, and a round trip
// must return the original.
describe('convertColor', () => {
  it('is identity for the same space', () => {
    const c: ColorValue = { space: 'oklch', channels: [0.5, 0.1, 200] }
    expect(convertColor(c, 'oklch')).toBe(c)
  })

  it('keeps a neutral grey neutral through every space', () => {
    const grey: ColorValue = { space: 'srgb', channels: [0.5, 0.5, 0.5] }
    for (const space of ['display-p3', 'oklch', 'oklab', 'lab', 'lch', 'hsl'] as const) {
      const back = convertColor(convertColor(grey, space), 'srgb')
      near(back.channels[0], 0.5, 2)
      near(back.channels[1], 0.5, 2)
      near(back.channels[2], 0.5, 2)
    }
  })

  it('round-trips a saturated in-gamut colour through each space', () => {
    const teal: ColorValue = { space: 'srgb', channels: [0.1, 0.6, 0.55] }
    for (const space of ['display-p3', 'oklch', 'oklab', 'lab', 'lch', 'hsl'] as const) {
      const back = convertColor(convertColor(teal, space), 'srgb')
      near(back.channels[0], 0.1, 2)
      near(back.channels[1], 0.6, 2)
      near(back.channels[2], 0.55, 2)
    }
  })

  it('puts white at the expected coordinates per space', () => {
    const white: ColorValue = { space: 'srgb', channels: [1, 1, 1] }
    near(convertColor(white, 'oklch').channels[0], 1, 2) // L = 1
    near(convertColor(white, 'lab').channels[0], 100, 1) // L = 100
    near(convertColor(white, 'lab').channels[1], 0, 1) // a = 0
    near(convertColor(white, 'lch').channels[1], 0, 1) // C = 0
  })

  it('leaves an achromatic colour with hue 0 rather than float noise', () => {
    const grey: ColorValue = { space: 'srgb', channels: [0.5, 0.5, 0.5] }
    expect(convertColor(grey, 'oklch').channels[2]).toBe(0)
    expect(convertColor(grey, 'lch').channels[2]).toBe(0)
  })

  it('preserves alpha', () => {
    const c: ColorValue = { space: 'srgb', channels: [1, 0, 0], alpha: 0.25 }
    expect(convertColor(c, 'oklch').alpha).toBe(0.25)
  })
})

describe('gamut handling', () => {
  it('recognises in- and out-of-gamut colours', () => {
    expect(inSrgbGamut({ space: 'srgb', channels: [0.5, 0.5, 0.5] })).toBe(true)
    // P3 pure red is outside sRGB.
    expect(inSrgbGamut({ space: 'display-p3', channels: [1, 0, 0] })).toBe(false)
  })

  it('maps out-of-gamut colours by reducing chroma, preserving hue', () => {
    const p3Red: ColorValue = { space: 'display-p3', channels: [1, 0, 0] }
    const mapped = toSrgb(p3Red)
    // Still unmistakably red: red channel dominant, others low.
    expect(mapped.r).toBeGreaterThan(0.9)
    expect(mapped.g).toBeLessThan(0.35)
    expect(mapped.b).toBeLessThan(0.35)
    // And the hue survives the mapping rather than being clipped per channel.
    const hueBefore = convertColor(p3Red, 'oklch').channels[2]
    const hueAfter = convertColor(
      { space: 'srgb', channels: [mapped.r, mapped.g, mapped.b] },
      'oklch',
    ).channels[2]
    expect(Math.abs(hueBefore - hueAfter)).toBeLessThan(8)
  })

  it('leaves in-gamut colours untouched', () => {
    const c: ColorValue = { space: 'srgb', channels: [0.2, 0.4, 0.6] }
    const s = toSrgb(c)
    near(s.r, 0.2)
    near(s.g, 0.4)
    near(s.b, 0.6)
  })

  it('defaults alpha to 1 and clamps it', () => {
    expect(toSrgb({ space: 'srgb', channels: [0, 0, 0] }).a).toBe(1)
    expect(toSrgb({ space: 'srgb', channels: [0, 0, 0], alpha: 2 }).a).toBe(1)
    expect(toSrgb({ space: 'srgb', channels: [0, 0, 0], alpha: -1 }).a).toBe(0)
  })
})

describe('colorToHex', () => {
  it('gamut-maps on the way out', () => {
    expect(colorToHex({ space: 'srgb', channels: [1, 0, 0] })).toBe('#ff0000')
    expect(colorToHex({ space: 'hsl', channels: [210, 0.5, 0.4] })).toBe('#336699')
    expect(colorToHex({ space: 'display-p3', channels: [1, 1, 1] })).toBe('#ffffff')
    expect(colorToHex({ space: 'srgb', channels: [1, 0, 0], alpha: 0.5 })).toBe('#ff000080')
  })
})

describe('compositing a translucent foreground', () => {
  it('leaves an opaque colour alone', () => {
    expect(compositeOver('#8b5cf6', '#ffffff')).toBe('#8b5cf6')
  })

  it('blends 50% black over white to the midpoint', () => {
    const out = compositeOver('#00000080', '#ffffff')
    const c = parseCssColor(out)!
    const { r, g, b } = toSrgb(c)
    expect(r).toBeCloseTo(1 - 128 / 255, 2)
    expect(g).toBeCloseTo(1 - 128 / 255, 2)
    expect(b).toBeCloseTo(1 - 128 / 255, 2)
  })

  it('composites across colour spaces, not just hex', () => {
    // The foreground is authored in oklch with an alpha tail; the backdrop is a hex.
    const out = compositeOver('oklch(0 0 0 / 0.5)', '#ffffff')
    expect(parseCssColor(out)!.alpha ?? 1).toBe(1)
  })

  it('measures contrast on the blend, not on the authored value', () => {
    // Black at 20% over white is pale grey: nowhere near black's 21:1.
    const naive = contrastRatio('#00000033', '#ffffff')!
    const real = contrastAgainst('#00000033', '#ffffff')!
    expect(naive).toBeGreaterThan(15)
    expect(real).toBeLessThan(2)
  })

  it('reports the same number as contrastRatio when nothing is translucent', () => {
    expect(contrastAgainst('#000000', '#ffffff')).toBeCloseTo(
      contrastRatio('#000000', '#ffffff')!,
      6,
    )
  })
})
