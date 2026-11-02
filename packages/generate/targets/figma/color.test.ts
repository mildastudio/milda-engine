import { describe, expect, it } from 'vitest'
import { parseColor } from './color'

// Figma COLOR variables are sRGB-only, so every authored space has to convert here or
// the token is dropped from the export. hsl() and color(display-p3 …) previously
// returned null and were skipped.
describe('figma parseColor - spaces', () => {
  const near = (got: number, want: number) => expect(got).toBeCloseTo(want, 2)

  it('parses hex, with and without alpha', () => {
    expect(parseColor('#ff0000')).toMatchObject({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('#00000080')?.a).toBeCloseTo(0.502, 2)
    expect(parseColor('#f00')).toMatchObject({ r: 1, g: 0, b: 0 })
  })

  it('parses rgb() in both bare and percentage forms', () => {
    expect(parseColor('rgb(255 0 0)')).toMatchObject({ r: 1, g: 0, b: 0 })
    expect(parseColor('rgb(100% 0% 0%)')).toMatchObject({ r: 1, g: 0, b: 0 })
    expect(parseColor('rgba(255 0 0 / 0.5)')?.a).toBeCloseTo(0.5, 2)
  })

  it('parses oklch() in both bare and percentage lightness forms', () => {
    const bare = parseColor('oklch(0.628 0.2577 29.23)')
    const pct = parseColor('oklch(62.8% 0.2577 29.23)')
    // Both are sRGB red to within gamut-clamping tolerance.
    near(bare!.r, 1)
    near(bare!.g, 0)
    near(pct!.r, bare!.r)
    near(pct!.g, bare!.g)
  })

  it('converts hsl() (previously dropped from the export)', () => {
    expect(parseColor('hsl(0 100% 50%)')).toMatchObject({ r: 1, g: 0, b: 0 })
    expect(parseColor('hsl(120 100% 50%)')).toMatchObject({ r: 0, g: 1, b: 0 })
    // hsl(210 50% 40%) is the classic #336699.
    const c = parseColor('hsl(210 50% 40%)')!
    near(c.r, 0.2)
    near(c.g, 0.4)
    near(c.b, 0.6)
  })

  it('accepts hsl with bare 0..1 saturation/lightness (the form ColorValue stores)', () => {
    const pct = parseColor('hsl(210 50% 40%)')!
    const bare = parseColor('hsl(210 0.5 0.4)')!
    near(bare.r, pct.r)
    near(bare.g, pct.g)
    near(bare.b, pct.b)
  })

  it('converts display-p3 (previously dropped from the export)', () => {
    // A neutral grey is identical in both spaces - the strongest check that the
    // decode -> matrix -> encode chain is not skewing anything.
    const grey = parseColor('color(display-p3 0.5 0.5 0.5)')!
    near(grey.r, 0.5)
    near(grey.g, 0.5)
    near(grey.b, 0.5)

    // P3 pure red is outside sRGB, so it clamps to sRGB red rather than vanishing.
    const red = parseColor('color(display-p3 1 0 0)')!
    expect(red).toMatchObject({ r: 1, g: 0, b: 0 })

    // White stays white.
    const white = parseColor('color(display-p3 1 1 1)')!
    near(white.r, 1)
    near(white.g, 1)
    near(white.b, 1)
  })

  it('carries alpha through hsl and display-p3', () => {
    expect(parseColor('hsl(210 50% 40% / 0.25)')?.a).toBeCloseTo(0.25, 2)
    expect(parseColor('color(display-p3 0.5 0.5 0.5 / 40%)')?.a).toBeCloseTo(0.4, 2)
  })

  it('returns null for genuinely unparseable input so the caller can report it', () => {
    expect(parseColor('rebeccapurple')).toBeNull()
    expect(parseColor('lch(50% 40 30)')).toBeNull()
    expect(parseColor('')).toBeNull()
  })
})
