import { describe, expect, it } from 'vitest'

import {
  buildColor,
  buildOklch,
  clampHsv,
  hexToOklch,
  hexToRgb,
  hexToRgba,
  hslToRgb,
  hsvFromArea,
  hsvToHex,
  hsvToHsl,
  hsvToRgb,
  hslToHsv,
  hueFromTrack,
  oklchFromArea,
  oklchInGamut,
  oklchToHex,
  oklchToRgb,
  OKLCH_MAX_CHROMA,
  rgbaToHex8,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
} from './color'

describe('hsv <-> rgb', () => {
  it('maps primaries correctly', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 })
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 })
    expect(hsvToRgb({ h: 0, s: 0, v: 1 })).toEqual({ r: 255, g: 255, b: 255 })
    expect(hsvToRgb({ h: 0, s: 0, v: 0 })).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('round-trips rgb -> hsv -> rgb', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 139, g: 92, b: 246 },
      { r: 18, g: 52, b: 86 },
      { r: 200, g: 200, b: 200 },
    ]) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb)
    }
  })
})

describe('hex', () => {
  it('formats + parses', () => {
    expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000')
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe('#010203')
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#8B5CF6')).toEqual({ r: 139, g: 92, b: 246 })
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000')
  })

  it('returns null for malformed hex', () => {
    expect(hexToRgb('#12')).toBeNull()
    expect(hexToRgb('#gggggg')).toBeNull()
    expect(hexToRgb('nope')).toBeNull()
  })
})

describe('hsl round-trip', () => {
  it('rgb -> hsl -> rgb', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 139, g: 92, b: 246 },
      { r: 128, g: 128, b: 128 },
    ]) {
      expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb)
    }
  })
})

describe('clampHsv', () => {
  it('wraps hue, clamps s/v', () => {
    expect(clampHsv({ h: 400, s: 1.5, v: -0.2 })).toEqual({ h: 40, s: 1, v: 0 })
    expect(clampHsv({ h: -30, s: 0.5, v: 0.5 })).toEqual({ h: 330, s: 0.5, v: 0.5 })
  })
})

describe('geometry + pointer', () => {
  it('buildColor derives thumbs + display values', () => {
    const m = buildColor({ h: 180, s: 0.5, v: 0.8 })
    expect(m.area).toEqual({ x: 0.5, y: 1 - 0.8 })
    expect(m.hueX).toBeCloseTo(0.5)
    expect(m.hueCss).toBe('hsl(180, 100%, 50%)')
    expect(m.hex).toBe(rgbToHex(hsvToRgb({ h: 180, s: 0.5, v: 0.8 })))
  })

  it('area/hue pointer maps clamp correctly', () => {
    expect(hsvFromArea(200, 0.3, 0.25)).toEqual({ h: 200, s: 0.3, v: 0.75 })
    expect(hsvFromArea(200, 1.4, -0.1)).toEqual({ h: 200, s: 1, v: 1 })
    expect(hueFromTrack(0.5)).toBe(180)
    expect(hueFromTrack(2)).toBe(360)
    expect(hueFromTrack(-1)).toBe(0)
  })
})

// --- proposal 0035 additions --------------------------------------------------

describe('hsl / hsb convenience', () => {
  it('hsv <-> hsl round-trips through rgb', () => {
    for (const hsv of [
      { h: 0, s: 1, v: 1 },
      { h: 264, s: 0.63, v: 0.96 },
      { h: 120, s: 0.4, v: 0.5 },
    ]) {
      const back = hslToHsv(hsvToHsl(hsv))
      const a = hsvToRgb(hsv)
      const b = hsvToRgb(back)
      expect(b).toEqual(a) // stable at the rgb boundary
    }
  })
})

describe('alpha-carrying hex', () => {
  it('formats #rrggbbaa', () => {
    expect(rgbaToHex8({ r: 255, g: 0, b: 0 }, 1)).toBe('#ff0000ff')
    expect(rgbaToHex8({ r: 0, g: 0, b: 0 }, 0)).toBe('#00000000')
    expect(rgbaToHex8({ r: 139, g: 92, b: 246 }, 0.5)).toBe('#8b5cf680')
  })

  it('parses 3/4/6/8-digit hex with optional alpha', () => {
    expect(hexToRgba('#ff0000')).toEqual({ rgb: { r: 255, g: 0, b: 0 }, a: 1 })
    expect(hexToRgba('#f00')).toEqual({ rgb: { r: 255, g: 0, b: 0 }, a: 1 })
    expect(hexToRgba('#ff000080')).toEqual({ rgb: { r: 255, g: 0, b: 0 }, a: 128 / 255 })
    expect(hexToRgba('#f008')).toEqual({ rgb: { r: 255, g: 0, b: 0 }, a: 0x88 / 255 })
    expect(hexToRgba('nope')).toBeNull()
    expect(hexToRgba('#12345')).toBeNull()
  })
})

describe('OKLCH', () => {
  it('rgb -> oklch -> rgb round-trips within 1 lsb', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 139, g: 92, b: 246 },
      { r: 18, g: 52, b: 86 },
      { r: 200, g: 200, b: 200 },
      { r: 0, g: 0, b: 0 },
    ]) {
      const back = oklchToRgb(rgbToOklch(rgb))
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1)
    }
  })

  it('gamut-clamps out-of-range chroma to a valid sRGB color', () => {
    // Absurd chroma for a mid lightness — must still resolve to a real hex.
    const hex = oklchToHex({ l: 0.6, c: 0.9, h: 30 })
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(oklchInGamut({ l: 0.6, c: 0.9, h: 30 })).toBe(false)
    expect(oklchInGamut({ l: 0.6, c: 0, h: 30 })).toBe(true)
  })

  it('hex -> oklch parses, buildOklch derives thumbs', () => {
    const o = hexToOklch('#8b5cf6')
    expect(o).not.toBeNull()
    const m = buildOklch(o!)
    expect(m.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(m.area.x).toBeGreaterThanOrEqual(0)
    expect(m.area.x).toBeLessThanOrEqual(1)
    expect(m.hueX).toBeCloseTo(o!.h / 360, 5)
  })

  it('oklchFromArea maps chroma/lightness, clamps to gamut ceiling', () => {
    expect(oklchFromArea(120, 0.5, 0.25)).toEqual({ h: 120, c: 0.5 * OKLCH_MAX_CHROMA, l: 0.75 })
    expect(oklchFromArea(120, 2, -1)).toEqual({ h: 120, c: OKLCH_MAX_CHROMA, l: 1 })
  })
})
