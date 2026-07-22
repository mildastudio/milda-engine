import { describe, expect, it } from 'vitest'

import {
  buildColor,
  clampHsv,
  hexToRgb,
  hslToRgb,
  hsvFromArea,
  hsvToHex,
  hsvToRgb,
  hueFromTrack,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
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
