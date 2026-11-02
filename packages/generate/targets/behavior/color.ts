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
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
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

/** New alpha (0-1) from a pointer position along the alpha track (x normalized 0-1). */
export function alphaFromTrack(x: number): number {
  return clampN(x, 0, 1)
}

// --- HSL / HSB convenience (proposal 0035) -------------------------------------
// HSB is identical to HSV (Brightness === Value); it exists only as a display label,
// so the view reads sat/val straight off the canonical HSV. HSL is a separate model.

export function hsvToHsl(c: HSV): HSL {
  return rgbToHsl(hsvToRgb(c))
}
export function hslToHsv(c: HSL): HSV {
  return rgbToHsv(hslToRgb(c))
}

// --- alpha-carrying serializations (proposal 0035) -----------------------------
// The picker's canonical working form stays alpha-free (HSV / OKLCH); alpha rides
// alongside as a separate 0-1 channel and is fused only at the output boundary.

const clamp01 = (n: number): number => clampN(n, 0, 1)

/** #rrggbbaa. Alpha 0-1 -> a trailing hex pair. */
export function rgbaToHex8(c: RGB, a: number): string {
  return `${rgbToHex(c)}${hex2(round(clamp01(a) * 255))}`
}

/** Parse #rgb / #rgba / #rrggbb / #rrggbbaa. Returns rgb + alpha (1 when absent). */
export function hexToRgba(hex: string): { rgb: RGB; a: number } | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3 || h.length === 4)
    h = h
      .split('')
      .map((ch) => ch + ch)
      .join('')
  if ((h.length !== 6 && h.length !== 8) || /[^0-9a-fA-F]/.test(h)) return null
  const rgb = {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return { rgb, a }
}

/** `rgb(r g b)` or `rgb(r g b / a)` CSS string. */
export function rgbToCss(c: RGB, a = 1): string {
  const rgb = {
    r: round(clampN(c.r, 0, 255)),
    g: round(clampN(c.g, 0, 255)),
    b: round(clampN(c.b, 0, 255)),
  }
  return a < 1
    ? `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${+clamp01(a).toFixed(3)})`
    : `rgb(${rgb.r} ${rgb.g} ${rgb.b})`
}

/** `hsl(h s% l%)` or `hsl(h s% l% / a)` CSS string. */
export function hslToCss(c: HSL, a = 1): string {
  const h = round(((c.h % 360) + 360) % 360)
  const s = round(clamp01(c.s) * 100)
  const l = round(clamp01(c.l) * 100)
  return a < 1 ? `hsl(${h} ${s}% ${l}% / ${+clamp01(a).toFixed(3)})` : `hsl(${h} ${s}% ${l}%)`
}

// --- OKLCH color space (proposal 0035) -----------------------------------------
// Perceptual working space (Björn Ottosson's Oklab). Canonical form is OKLCH
// (L 0-1, C 0-~0.4, H 0-360); the 2D area maps x=chroma, y=1-lightness, the slider
// maps hue. sRGB conversion goes through linear light + Oklab. Painting the area/hue
// can use native CSS `oklch()` gradients; JS conversion here drives the swatch, the
// hex/rgb/hsl output, and gamut clamping.

/** Chroma ceiling used to normalize the 2D area's x-axis (sRGB-reachable max ~0.37). */
export const OKLCH_MAX_CHROMA = 0.37

/** Hue 0-360, chroma 0-~0.4, lightness 0-1. */
export interface OKLCH {
  l: number
  c: number
  h: number
}

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
const cbrt = (n: number): number => Math.cbrt(n)

export function rgbToOklch(c: RGB): OKLCH {
  const r = srgbToLinear(clampN(c.r, 0, 255) / 255)
  const g = srgbToLinear(clampN(c.g, 0, 255) / 255)
  const b = srgbToLinear(clampN(c.b, 0, 255) / 255)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = cbrt(l),
    m_ = cbrt(m),
    s_ = cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const chroma = Math.sqrt(A * A + B * B)
  let hue = (Math.atan2(B, A) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { l: L, c: chroma, h: hue }
}

/** Oklab -> linear-sRGB (unclamped; may fall outside 0-1 when out of gamut). */
function oklchToLinearRgb(c: OKLCH): { r: number; g: number; b: number } {
  const hr = (c.h * Math.PI) / 180
  const A = c.c * Math.cos(hr)
  const B = c.c * Math.sin(hr)
  const l_ = c.l + 0.3963377774 * A + 0.2158037573 * B
  const m_ = c.l - 0.1055613458 * A - 0.0638541728 * B
  const s_ = c.l - 0.0894841775 * A - 1.291485548 * B
  const l = l_ * l_ * l_,
    m = m_ * m_ * m_,
    s = s_ * s_ * s_
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

/** True when this OKLCH resolves inside the sRGB gamut (small tolerance). */
export function oklchInGamut(c: OKLCH): boolean {
  const lin = oklchToLinearRgb(c)
  const eps = 1e-4
  return (
    lin.r >= -eps &&
    lin.r <= 1 + eps &&
    lin.g >= -eps &&
    lin.g <= 1 + eps &&
    lin.b >= -eps &&
    lin.b <= 1 + eps
  )
}

/** OKLCH -> sRGB, reducing chroma (bisection) until in gamut, then clamping. */
export function oklchToRgb(input: OKLCH): RGB {
  const base = { l: clamp01(input.l), c: Math.max(0, input.c), h: ((input.h % 360) + 360) % 360 }
  let c = base.c
  if (!oklchInGamut(base)) {
    let lo = 0,
      hi = base.c
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (oklchInGamut({ ...base, c: mid })) lo = mid
      else hi = mid
    }
    c = lo
  }
  const lin = oklchToLinearRgb({ ...base, c })
  return {
    r: round(clamp01(linearToSrgb(clamp01(lin.r))) * 255),
    g: round(clamp01(linearToSrgb(clamp01(lin.g))) * 255),
    b: round(clamp01(linearToSrgb(clamp01(lin.b))) * 255),
  }
}

export function oklchToHex(c: OKLCH): string {
  return rgbToHex(oklchToRgb(c))
}
export function hexToOklch(hex: string): OKLCH | null {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToOklch(rgb) : null
}

/** `oklch(L C H)` or `oklch(L C H / a)` CSS string (L as a percentage). */
export function oklchToCss(c: OKLCH, a = 1): string {
  const L = +(clamp01(c.l) * 100).toFixed(2)
  const C = +Math.max(0, c.c).toFixed(4)
  const H = +(((c.h % 360) + 360) % 360).toFixed(2)
  return a < 1 ? `oklch(${L}% ${C} ${H} / ${+clamp01(a).toFixed(3)})` : `oklch(${L}% ${C} ${H})`
}

export interface OklchModel {
  oklch: OKLCH
  rgb: RGB
  hex: string
  /** Area thumb, normalized 0-1 (x = chroma / OKLCH_MAX_CHROMA, y = 1 - lightness). */
  area: { x: number; y: number }
  /** Hue slider thumb position, normalized 0-1. */
  hueX: number
  /** Pure-hue CSS for painting the area base (full chroma, mid lightness). */
  hueCss: string
}

export function buildOklch(input: OKLCH): OklchModel {
  const oklch = {
    l: clamp01(input.l),
    c: clampN(input.c, 0, OKLCH_MAX_CHROMA),
    h: ((input.h % 360) + 360) % 360,
  }
  return {
    oklch,
    rgb: oklchToRgb(oklch),
    hex: oklchToHex(oklch),
    area: { x: oklch.c / OKLCH_MAX_CHROMA, y: 1 - oklch.l },
    hueX: oklch.h / 360,
    hueCss: oklchToCss({ l: 0.7, c: OKLCH_MAX_CHROMA, h: oklch.h }),
  }
}

/** New OKLCH from a pointer position on the area (x=chroma, y=lightness, both 0-1). */
export function oklchFromArea(hue: number, x: number, y: number): OKLCH {
  return { h: hue, c: clamp01(x) * OKLCH_MAX_CHROMA, l: 1 - clamp01(y) }
}
