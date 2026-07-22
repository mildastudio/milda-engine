// Color behavior core (proposal 0029, Tier 1 - sibling of calendar.ts / timepicker.ts).
//
// Pure TypeScript: no DOM, no JSX, no framework, no i18n. Single source of truth for
// ColorPicker math (HSV <-> RGB <-> hex <-> HSL) + the saturation/value area and hue
// slider geometry, vendored beside the component so every framework target computes an
// identical picker. Canonical working form is HSV (hue 0-360, sat/val 0-1) - the
// natural space for a 2D area + hue slider. The thin view converts to/from the
// project's chosen representation (hex | rgb | hsl) at the boundary.

/** Hue 0-360, saturation 0-1, value 0-1. */
export interface HSV {
  h: number
  s: number
  v: number
}
/** Red/green/blue, each 0-255 (integers). */
export interface RGB {
  r: number
  g: number
  b: number
}
/** Hue 0-360, saturation 0-1, lightness 0-1. */
export interface HSL {
  h: number
  s: number
  l: number
}

const clampN = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)
const round = (n: number): number => Math.round(n)

/** Clamp an HSV into range (hue wraps 0-360, s/v clamp 0-1). */
export function clampHsv(c: HSV): HSV {
  return { h: ((c.h % 360) + 360) % 360, s: clampN(c.s, 0, 1), v: clampN(c.v, 0, 1) }
}

// hp = hue/60 sector; (r1,g1,b1) before adding the achromatic offset. Shared by HSV/HSL.
function sector(hp: number, chroma: number, x: number): [number, number, number] {
  if (hp < 1) return [chroma, x, 0]
  if (hp < 2) return [x, chroma, 0]
  if (hp < 3) return [0, chroma, x]
  if (hp < 4) return [0, x, chroma]
  if (hp < 5) return [x, 0, chroma]
  return [chroma, 0, x]
}

export function hsvToRgb(c: HSV): RGB {
  const { h, s, v } = clampHsv(c)
  const chroma = v * s
  const hp = h / 60
  const x = chroma * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = sector(hp, chroma, x)
  const m = v - chroma
  return { r: round((r1 + m) * 255), g: round((g1 + m) * 255), b: round((b1 + m) * 255) }
}

export function rgbToHsv(c: RGB): HSV {
  const r = clampN(c.r, 0, 255) / 255
  const g = clampN(c.g, 0, 255) / 255
  const b = clampN(c.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

const hex2 = (n: number): string => clampN(round(n), 0, 255).toString(16).padStart(2, '0')

export function rgbToHex(c: RGB): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
}

/** Parse #rgb / #rrggbb (with or without leading #). Returns null if malformed. */
export function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

export function hsvToHex(c: HSV): string {
  return rgbToHex(hsvToRgb(c))
}

export function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHsv(rgb) : null
}

export function rgbToHsl(c: RGB): HSL {
  const { h } = rgbToHsv(c)
  const r = clampN(c.r, 0, 255) / 255
  const g = clampN(c.g, 0, 255) / 255
  const b = clampN(c.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s, l }
}

export function hslToRgb(c: HSL): RGB {
  const h = ((c.h % 360) + 360) % 360
  const s = clampN(c.s, 0, 1)
  const l = clampN(c.l, 0, 1)
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = chroma * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = sector(hp, chroma, x)
  const m = l - chroma / 2
  return { r: round((r1 + m) * 255), g: round((g1 + m) * 255), b: round((b1 + m) * 255) }
}

// --- picker geometry -----------------------------------------------------------

export interface ColorModel {
  hsv: HSV
  rgb: RGB
  hex: string
  /** Saturation-value area thumb, normalized 0-1 (origin top-left: x=saturation, y=1-value). */
  area: { x: number; y: number }
  /** Hue slider thumb position, normalized 0-1 along the track. */
  hueX: number
  /** The pure hue as a CSS color, for painting the area's base (e.g. `hsl(h, 100%, 50%)`). */
  hueCss: string
}

/** Derive display values + thumb positions from an HSV color. */
export function buildColor(input: HSV): ColorModel {
  const hsv = clampHsv(input)
  const rgb = hsvToRgb(hsv)
  return {
    hsv,
    rgb,
    hex: rgbToHex(rgb),
    area: { x: hsv.s, y: 1 - hsv.v },
    hueX: hsv.h / 360,
    hueCss: `hsl(${round(hsv.h)}, 100%, 50%)`,
  }
}

/** New HSV from a pointer position on the saturation-value area (x,y normalized 0-1). */
export function hsvFromArea(hue: number, x: number, y: number): HSV {
  return { h: hue, s: clampN(x, 0, 1), v: 1 - clampN(y, 0, 1) }
}

/** New hue (0-360) from a pointer position along the hue track (x normalized 0-1). */
export function hueFromTrack(x: number): number {
  return clampN(x, 0, 1) * 360
}
