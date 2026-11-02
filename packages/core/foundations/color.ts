// ─── The token engine's colour core ──────────────────────────────────────────
// One place for colour parsing, serialisation and conversion, so the IR resolver, the
// generators and Studio all agree. Before this there were four hand-maintained copies
// of the OKLCH↔sRGB matrices and only one of them (generate/targets/behavior/color.ts)
// did real gamut mapping - and that one exists to be VENDORED into users' generated
// components, not to serve the token engine.
//
// `ColorValue` (from @mildastudio/milda) is the authored value: a space tag plus
// channels in that space's own units, with alpha kept separate. This module never
// changes an authored value's space behind the author's back; conversion is explicit,
// because "what the author meant" and "what this target can render" are different
// questions (see proposal 0036).
//
// Channel units, matching the DSL parser's percentage-reference table:
//   srgb / display-p3 : r, g, b in 0..1
//   hsl               : h in degrees, s, l in 0..1
//   oklch             : L in 0..1, C in 0..~0.4, h in degrees
//   oklab / lab       : L, a, b  (lab's L is 0..100, oklab's is 0..1)
//   lch               : L in 0..100, C, h in degrees

import type { ColorSpace, ColorValue } from '@mildastudio/milda'

/** Spaces this module can convert through, beyond the four the DSL can spell. */
export type WorkingSpace = ColorSpace | 'oklab' | 'lab' | 'lch'

export interface Rgb {
  r: number
  g: number
  b: number
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6
const norm360 = (deg: number): number => ((deg % 360) + 360) % 360

// ─── Transfer functions ───────────────────────────────────────────────────────
// sRGB and Display-P3 share the same transfer curve; only their primaries differ.
const decodeGamma = (c: number): number => {
  const a = Math.abs(c)
  const linear = a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4
  return c < 0 ? -linear : linear
}
const encodeGamma = (c: number): number => {
  const a = Math.abs(c)
  const encoded = a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055
  return c < 0 ? -encoded : encoded
}

// ─── sRGB ↔ Oklab/OKLCH (Björn Ottosson's reference matrices) ────────────────
function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ]
}

function oklabToLinearRgb(L: number, A: number, B: number): [number, number, number] {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B
  const s_ = L - 0.0894841775 * A - 1.291485548 * B
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.230969929 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// ─── sRGB ↔ CIE XYZ (D65) and CIE Lab ────────────────────────────────────────
function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4123907993 * r + 0.3575843394 * g + 0.1804807884 * b,
    0.2126390059 * r + 0.7151686788 * g + 0.0721923154 * b,
    0.0193308187 * r + 0.119194778 * g + 0.9505321522 * b,
  ]
}

function xyzToLinearRgb(x: number, y: number, z: number): [number, number, number] {
  return [
    3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z,
    -0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z,
    0.0556300797 * x - 0.203976959 * y + 1.0569715142 * z,
  ]
}

// D65 white point, 2-degree observer.
const WHITE: [number, number, number] = [0.9504559271, 1, 1.0890577508]
const LAB_E = 216 / 24389
const LAB_K = 24389 / 27

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const f = (t: number): number => (t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116)
  const fx = f(x / WHITE[0])
  const fy = f(y / WHITE[1])
  const fz = f(z / WHITE[2])
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t: number): number => (t ** 3 > LAB_E ? t ** 3 : (116 * t - 16) / LAB_K)
  const yr = L > LAB_K * LAB_E ? ((L + 16) / 116) ** 3 : L / LAB_K
  return [inv(fx) * WHITE[0], yr * WHITE[1], inv(fz) * WHITE[2]]
}

// ─── Display-P3 ↔ linear sRGB ────────────────────────────────────────────────
// Pre-multiplied D65 matrices (P3 primaries → XYZ → sRGB primaries).
function p3LinearToSrgbLinear(r: number, g: number, b: number): [number, number, number] {
  return [
    1.2249401762805566 * r - 0.2249401762805563 * g,
    -0.04205697339879597 * r + 1.0420569733987959 * g,
    -0.019637081008389134 * r - 0.07863145834272432 * g + 1.0982685393511135 * b,
  ]
}

function srgbLinearToP3Linear(r: number, g: number, b: number): [number, number, number] {
  return [
    0.8224621 * r + 0.177538 * g,
    0.0331941 * r + 0.9668058 * g,
    0.0170827 * r + 0.0723974 * g + 0.9105199 * b,
  ]
}

// ─── Cylindrical helpers ─────────────────────────────────────────────────────
function toPolar(a: number, b: number): { c: number; h: number } {
  const c = Math.sqrt(a * a + b * b)
  // A near-achromatic colour has no meaningful hue; keep it at 0 rather than letting
  // floating-point noise pick one, so round-trips stay stable.
  const h = c < 1e-6 ? 0 : norm360((Math.atan2(b, a) * 180) / Math.PI)
  return { c, h }
}

function fromPolar(c: number, hDeg: number): { a: number; b: number } {
  const hr = (norm360(hDeg) * Math.PI) / 180
  return { a: c * Math.cos(hr), b: c * Math.sin(hr) }
}

function hslToSrgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = norm360(h) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = l - c / 2
  return { r: r1 + m, g: g1 + m, b: b1 + m }
}

function srgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-9) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? 60 * (((g - b) / d) % 6)
      : max === g
        ? 60 * ((b - r) / d + 2)
        : 60 * ((r - g) / d + 4)
  return { h: norm360(h), s, l }
}

// ─── The hub: everything converts through linear sRGB ─────────────────────────
/** A ColorValue's channels as LINEAR sRGB (unclamped: may be out of gamut). */
function toLinearSrgb(
  value: ColorValue | { space: WorkingSpace; channels: number[] },
): [number, number, number] {
  const [a, b, c] = [value.channels[0] ?? 0, value.channels[1] ?? 0, value.channels[2] ?? 0]
  switch (value.space) {
    case 'srgb':
      return [decodeGamma(a), decodeGamma(b), decodeGamma(c)]
    case 'display-p3':
      return p3LinearToSrgbLinear(decodeGamma(a), decodeGamma(b), decodeGamma(c))
    case 'hsl': {
      const rgb = hslToSrgb(a, b, c)
      return [decodeGamma(rgb.r), decodeGamma(rgb.g), decodeGamma(rgb.b)]
    }
    case 'oklch': {
      const { a: A, b: B } = fromPolar(b, c)
      return oklabToLinearRgb(a, A, B)
    }
    case 'oklab':
      return oklabToLinearRgb(a, b, c)
    case 'lab': {
      const [x, y, z] = labToXyz(a, b, c)
      return xyzToLinearRgb(x, y, z)
    }
    case 'lch': {
      const { a: A, b: B } = fromPolar(b, c)
      const [x, y, z] = labToXyz(a, A, B)
      return xyzToLinearRgb(x, y, z)
    }
  }
}

/** Linear sRGB → a target space's channels (no gamut mapping). */
function fromLinearSrgb(space: WorkingSpace, lr: number, lg: number, lb: number): number[] {
  switch (space) {
    case 'srgb':
      return [encodeGamma(lr), encodeGamma(lg), encodeGamma(lb)]
    case 'display-p3': {
      const [pr, pg, pb] = srgbLinearToP3Linear(lr, lg, lb)
      return [encodeGamma(pr), encodeGamma(pg), encodeGamma(pb)]
    }
    case 'hsl': {
      const { h, s, l } = srgbToHsl(encodeGamma(lr), encodeGamma(lg), encodeGamma(lb))
      return [h, s, l]
    }
    case 'oklab':
      return linearRgbToOklab(lr, lg, lb)
    case 'oklch': {
      const [L, A, B] = linearRgbToOklab(lr, lg, lb)
      const { c, h } = toPolar(A, B)
      return [L, c, h]
    }
    case 'lab': {
      const [x, y, z] = linearRgbToXyz(lr, lg, lb)
      return xyzToLab(x, y, z)
    }
    case 'lch': {
      const [x, y, z] = linearRgbToXyz(lr, lg, lb)
      const [L, A, B] = xyzToLab(x, y, z)
      const { c, h } = toPolar(A, B)
      return [L, c, h]
    }
  }
}

/** Convert to another space, preserving alpha. Channels are NOT gamut-mapped. */
export function convertColor(value: ColorValue, to: WorkingSpace): ColorValue {
  if (value.space === to) return value
  const [lr, lg, lb] = toLinearSrgb(value)
  const out: ColorValue = {
    space: to as ColorSpace,
    channels: fromLinearSrgb(to, lr, lg, lb).map(round6),
  }
  if (value.alpha != null) out.alpha = value.alpha
  return out
}

/** True when this colour lands inside sRGB (small tolerance). */
export function inSrgbGamut(value: ColorValue): boolean {
  const [r, g, b] = toLinearSrgb(value)
  const eps = 1e-4
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
}

/**
 * sRGB channels (0..1) for a target that can only render sRGB, reducing chroma by
 * bisection first so an out-of-gamut colour keeps its hue and lightness instead of
 * being clipped per-channel (which shifts the hue).
 */
export function toSrgb(value: ColorValue): { r: number; g: number; b: number; a: number } {
  const alpha = value.alpha == null ? 1 : clamp01(value.alpha)
  if (inSrgbGamut(value)) {
    const [lr, lg, lb] = toLinearSrgb(value)
    return {
      r: round6(clamp01(encodeGamma(lr))),
      g: round6(clamp01(encodeGamma(lg))),
      b: round6(clamp01(encodeGamma(lb))),
      a: round6(alpha),
    }
  }
  // Work in OKLCH so "same colour, less saturated" is perceptually what happens.
  const ok = convertColor({ ...value, alpha: undefined }, 'oklch')
  const [L, C, H] = [ok.channels[0] ?? 0, ok.channels[1] ?? 0, ok.channels[2] ?? 0]
  let lo = 0
  let hi = C
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (inSrgbGamut({ space: 'oklch', channels: [L, mid, H] })) lo = mid
    else hi = mid
  }
  const [lr, lg, lb] = toLinearSrgb({ space: 'oklch', channels: [L, lo, H] })
  return {
    r: round6(clamp01(encodeGamma(lr))),
    g: round6(clamp01(encodeGamma(lg))),
    b: round6(clamp01(encodeGamma(lb))),
    a: round6(alpha),
  }
}

// ─── CSS serialisation ────────────────────────────────────────────────────────
const hex2 = (n: number): string =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0')

/**
 * A ColorValue as a CSS colour string. sRGB serialises as hex (what the ecosystem
 * expects and what every consumer already parses); the wide/perceptual spaces keep
 * their own notation so no precision or gamut is thrown away.
 */
export function colorToCss(value: ColorValue): string {
  const [a, b, c] = [value.channels[0] ?? 0, value.channels[1] ?? 0, value.channels[2] ?? 0]
  const alpha = value.alpha
  const hasAlpha = alpha != null && alpha < 1
  const pct = (n: number): string => `${round6(n * 100)}%`

  switch (value.space) {
    case 'srgb':
      return hasAlpha
        ? `#${hex2(a)}${hex2(b)}${hex2(c)}${hex2(alpha!)}`
        : `#${hex2(a)}${hex2(b)}${hex2(c)}`
    case 'hsl':
      return `hsl(${round6(a)} ${pct(b)} ${pct(c)}${hasAlpha ? ` / ${round6(alpha!)}` : ''})`
    case 'oklch':
      return `oklch(${round6(a)} ${round6(b)} ${round6(c)}${hasAlpha ? ` / ${round6(alpha!)}` : ''})`
    case 'display-p3':
      return `color(display-p3 ${round6(a)} ${round6(b)} ${round6(c)}${hasAlpha ? ` / ${round6(alpha!)}` : ''})`
  }
}

// ─── CSS parsing ──────────────────────────────────────────────────────────────
function splitBody(body: string): { parts: string[]; alpha?: number } {
  const [main, alphaPart] = body.split('/').map((s) => s.trim())
  const parts = main.split(/[\s,]+/).filter(Boolean)
  if (alphaPart === undefined) return { parts }
  const a = alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
  return { parts, alpha: Number.isNaN(a) ? undefined : a }
}

const num = (raw: string, pctRef: number | null): number | null => {
  const w = raw.replace(/deg$/i, '')
  if (w.endsWith('%')) {
    const n = parseFloat(w.slice(0, -1))
    if (Number.isNaN(n)) return null
    return pctRef == null ? n : (n / 100) * pctRef
  }
  const n = parseFloat(w)
  return Number.isNaN(n) ? null : n
}

// What each of the language's colour keywords (`COLOR_KEYWORDS` in @mildastudio/milda) is as a
// colour. `transparent` is zero alpha, which every target can paint: an RGBA for the Mac canvas,
// an invisible paint for Figma. Keyed by the vocabulary's own words, and `color.test.ts` fails a
// keyword the language accepts but this table cannot value.
export const COLOR_KEYWORD_VALUES: ReadonlyMap<string, ColorValue> = new Map([
  ['transparent', { space: 'srgb', channels: [0, 0, 0], alpha: 0 }],
])

/**
 * Parse a CSS colour string into a typed ColorValue, keeping the authored space.
 *
 * This is the bridge that lets the IR hold typed colour without a migration: an
 * existing `{ raw: '#3b82f6' }` slot can be read as a ColorValue on demand. Returns
 * null for anything unrecognised (named colours, `color-mix()`, …) so callers can fall
 * back to treating the string as opaque. The language's colour keywords are the exception to
 * "named colours are unrecognised": they are words the DSL accepts as values, so each has one here.
 */
export function parseCssColor(input: string): ColorValue | null {
  const v = input.trim()

  const keyword = COLOR_KEYWORD_VALUES.get(v)
  if (keyword) return { ...keyword, channels: [...keyword.channels] }

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(v)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4)
      h = h
        .split('')
        .map((ch) => ch + ch)
        .join('')
    if (h.length !== 6 && h.length !== 8) return null
    const byte = (i: number): number => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255
    const out: ColorValue = { space: 'srgb', channels: [byte(0), byte(1), byte(2)].map(round6) }
    if (h.length === 8) out.alpha = round6(byte(3))
    return out
  }

  const fn = /^([a-z-]+)\(([^)]*)\)$/i.exec(v)
  if (!fn) return null
  const name = fn[1].toLowerCase()
  const { parts, alpha } = splitBody(fn[2])
  const withAlpha = (value: ColorValue): ColorValue =>
    alpha == null ? value : { ...value, alpha: round6(alpha) }

  if (name === 'rgb' || name === 'rgba') {
    const ch = parts.slice(0, 3).map((p) => num(p, 255))
    if (ch.length < 3 || ch.some((n) => n == null)) return null
    // A legacy fourth comma channel is alpha.
    const legacy = parts[3] !== undefined ? num(parts[3], 1) : null
    const out: ColorValue = { space: 'srgb', channels: ch.map((n) => round6(clamp01(n! / 255))) }
    const a = legacy ?? alpha
    return a == null ? out : { ...out, alpha: round6(a) }
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = num(parts[0] ?? '', null)
    const s = num(parts[1] ?? '', 1)
    const l = num(parts[2] ?? '', 1)
    if (h == null || s == null || l == null) return null
    const legacy = parts[3] !== undefined ? num(parts[3], 1) : null
    const out: ColorValue = { space: 'hsl', channels: [round6(h), round6(s), round6(l)] }
    const a = legacy ?? alpha
    return a == null ? out : { ...out, alpha: round6(a) }
  }
  if (name === 'oklch') {
    const L = num(parts[0] ?? '', 1)
    const C = num(parts[1] ?? '', 0.4) // CSS Color 4 pins 100% chroma at 0.4
    const H = num(parts[2] ?? '', null)
    if (L == null || C == null || H == null) return null
    return withAlpha({ space: 'oklch', channels: [round6(L), round6(C), round6(H)] })
  }
  if (name === 'color') {
    const space = parts[0]?.toLowerCase()
    const ch = parts.slice(1, 4).map((p) => num(p, 1))
    if (ch.length < 3 || ch.some((n) => n == null)) return null
    if (space === 'display-p3') {
      return withAlpha({ space: 'display-p3', channels: ch.map((n) => round6(n!)) })
    }
    if (space === 'srgb') {
      return withAlpha({ space: 'srgb', channels: ch.map((n) => round6(n!)) })
    }
    return null
  }
  return null
}

/** Convenience for consumers that only speak hex (Figma paints, DTCG, legacy props). */
export function colorToHex(value: ColorValue): string {
  const { r, g, b, a } = toSrgb(value)
  return a < 1 ? `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

// ─── Computed colour: the operations ──────────────────────────────────────────
// The maths half of proposal 0036's computed colour. Deliberately pure: `mix` takes an
// already-resolved colour, so this module never needs to know about Slots or the
// document. The resolver does the resolving and calls in here.
//
// Amounts are RELATIVE, not absolute: lighten(0.2) closes 20% of the distance to white
// rather than adding 0.2 to the lightness channel. That keeps every op monotonic and
// in-range whatever the starting colour, so "20% lighter" behaves the same on a
// near-white and a near-black base -- and lighten(1) is exactly white.

/** An operation with its operands already resolved to concrete colours. */
export type ResolvedColorOp =
  | { op: 'lighten' | 'darken' | 'saturate' | 'desaturate'; amount: number }
  | { op: 'rotate'; degrees: number }
  | { op: 'alpha'; amount: number }
  | { op: 'mix'; with: ColorValue; amount: number }

/** Which channel indices carry lightness / chroma / hue, per space. */
const CHANNEL_ROLES: Record<WorkingSpace, { l?: number; c?: number; h?: number; lMax: number }> = {
  oklch: { l: 0, c: 1, h: 2, lMax: 1 },
  lch: { l: 0, c: 1, h: 2, lMax: 100 },
  hsl: { h: 0, c: 1, l: 2, lMax: 1 },
  lab: { l: 0, lMax: 100 },
  oklab: { l: 0, lMax: 1 },
  srgb: { lMax: 1 },
  'display-p3': { lMax: 1 },
}

/**
 * Apply `ops` in order, doing the maths in `space`.
 *
 * The result comes back in the space it was computed in, not the base's space: an
 * author who asked to lighten in OKLCH wants an OKLCH result, and converting back would
 * throw away precision (and possibly gamut) for no reason. Serialisation decides what
 * each target sees.
 */
export function applyColorOps(
  base: ColorValue,
  ops: readonly ResolvedColorOp[],
  space: WorkingSpace = 'oklch',
): ColorValue {
  // Lightness/chroma/hue are only addressable in a space that has them; a request to
  // lighten in sRGB is done in OKLCH instead, which is what the author meant.
  const roles = CHANNEL_ROLES[space]
  const mathSpace: WorkingSpace = roles.l === undefined ? 'oklch' : space
  let current = convertColor(base, mathSpace)

  for (const op of ops) {
    current = applyOne(current, op, mathSpace)
  }
  return { ...current, channels: current.channels.map(round6) }
}

function applyOne(value: ColorValue, op: ResolvedColorOp, space: WorkingSpace): ColorValue {
  const roles = CHANNEL_ROLES[space]
  const channels = [...value.channels]
  const alpha = value.alpha

  switch (op.op) {
    case 'lighten':
    case 'darken': {
      const i = roles.l
      if (i === undefined) return value
      const t = clamp01(op.amount)
      const max = roles.lMax
      const l = channels[i] ?? 0
      // Close a fraction of the gap to white (or to black), so the op stays in range.
      channels[i] = op.op === 'lighten' ? l + (max - l) * t : l * (1 - t)
      return { ...value, channels, ...(alpha == null ? {} : { alpha }) }
    }
    case 'saturate':
    case 'desaturate': {
      const i = roles.c
      if (i === undefined) return value
      const t = Math.max(0, op.amount)
      const c = channels[i] ?? 0
      // HSL saturation is bounded at 1; OKLCH/LCH chroma is open-ended, so scaling is
      // the only sane reading of "more saturated" there.
      const scaled = op.op === 'saturate' ? c * (1 + t) : c * (1 - clamp01(t))
      channels[i] = space === 'hsl' ? clamp01(scaled) : Math.max(0, scaled)
      return { ...value, channels, ...(alpha == null ? {} : { alpha }) }
    }
    case 'rotate': {
      const i = roles.h
      if (i === undefined) return value
      channels[i] = norm360((channels[i] ?? 0) + op.degrees)
      return { ...value, channels, ...(alpha == null ? {} : { alpha }) }
    }
    case 'alpha':
      return { ...value, channels, alpha: clamp01(op.amount) }
    case 'mix': {
      const t = clamp01(op.amount)
      const other = convertColor(op.with, space)
      const mixed = channels.map((n, i) => {
        const b = other.channels[i] ?? 0
        // Hue is an angle: interpolate along the shorter arc, or mixing 350° with 10°
        // would travel the long way round through the whole wheel.
        if (i === roles.h) {
          let delta = ((b - n + 540) % 360) - 180
          return norm360(n + delta * t)
        }
        return n + (b - n) * t
      })
      const aA = alpha == null ? 1 : alpha
      const aB = op.with.alpha == null ? 1 : op.with.alpha
      const mixedAlpha = aA + (aB - aA) * t
      return {
        ...value,
        channels: mixed,
        ...(mixedAlpha < 1
          ? { alpha: mixedAlpha }
          : alpha == null && op.with.alpha == null
            ? {}
            : { alpha: mixedAlpha }),
      }
    }
  }
}

/**
 * WCAG 2 relative luminance of any colour we can parse.
 *
 * Built on parseCssColor + toSrgb rather than on hex arithmetic, so a caller can hand it a
 * resolved token value in whatever spelling it has - since 0036 that is legitimately
 * `oklch(…)` or `color(display-p3 …)` - without converting to hex first. Converting first is
 * what ValuePreview does, and it works, but it costs the out-of-gamut precision that toSrgb
 * preserves.
 */
export function relativeLuminance(css: string): number | null {
  const parsed = parseCssColor(css)
  if (!parsed) return null
  const { r, g, b } = toSrgb(parsed)
  const lin = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** The WCAG 2 contrast ratio between two colours, or null if either cannot be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la == null || lb == null) return null
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * `fg` composited over `bg`, in sRGB, as a CSS string. Returns `fg` unchanged when it is
 * opaque or unparseable.
 *
 * Needed because `contrastRatio` is symmetric and therefore cannot know which of its two
 * arguments is in front. A translucent colour has no contrast ratio of its own: what the eye
 * receives is the blend, so measuring the authored value would report a number the screen
 * never shows. Callers that know the direction (a foreground role against the surface it
 * sits on) composite first.
 */
export function compositeOver(fg: string, bg: string): string {
  const top = parseCssColor(fg)
  if (!top || top.alpha == null || top.alpha >= 1) return fg
  const back = parseCssColor(bg)
  if (!back) return fg
  const a = clamp01(top.alpha)
  const t = toSrgb(top)
  const b = toSrgb(back)
  // Straight (non-premultiplied) alpha over an assumed-opaque backdrop, which is what a
  // resolved surface token is: if the surface is itself translucent, the caller has a
  // deeper question than this function answers.
  const mix = (x: number, y: number) => round6(x * a + y * (1 - a))
  return colorToCss({ space: 'srgb', channels: [mix(t.r, b.r), mix(t.g, b.g), mix(t.b, b.b)] })
}

/**
 * The contrast of a foreground against a background, compositing the foreground first.
 * This is the one to reach for whenever the two colours have a front and a back.
 */
export function contrastAgainst(fg: string, bg: string): number | null {
  return contrastRatio(compositeOver(fg, bg), bg)
}
