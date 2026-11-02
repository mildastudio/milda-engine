export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

function fromHex(hex: string): Rgba | null {
  let h = hex.slice(1)
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 && h.length !== 8) return null
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16)
  const r = n(0)
  const g = n(2)
  const b = n(4)
  if ([r, g, b].some(Number.isNaN)) return null
  const a = h.length === 8 ? n(6) / 255 : 1
  return { r: round(r / 255), g: round(g / 255), b: round(b / 255), a: round(clamp01(a)) }
}

// Handles BOTH CSS spellings: the legacy comma form `rgb(255, 0, 0)` / `rgba(…, 0.5)`
// and the modern space form `rgb(255 0 0 / 50%)`. The old split-on-`[,/]` only ever
// matched the comma form, so a space-separated rgb() token was dropped from the export.
function fromRgbFn(input: string): Rgba | null {
  const m = input.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) return null
  const { parts, alpha: slashAlpha } = splitBody(m[1])
  if (parts.length < 3) return null
  const channel = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
  const r = channel(parts[0])
  const g = channel(parts[1])
  const b = channel(parts[2])
  if ([r, g, b].some(Number.isNaN)) return null
  // The legacy form carries alpha as a fourth comma-separated channel.
  let a = slashAlpha
  if (parts[3] !== undefined) {
    const fourth = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    if (!Number.isNaN(fourth)) a = fourth
  }
  return rgba(r / 255, g / 255, b / 255, a)
}

// Percentage-or-bare-number component, per CSS Color 4 (oklch(70% 0.1 30) and
// oklch(0.7 0.1 30) are both valid). `scale` is what a bare number means (e.g.
// lightness's bare-number range is 0–1, so scale=1; hue's is degrees, scale=1).
function component(raw: string, percentOf: number): number {
  return raw.endsWith('%') ? (parseFloat(raw) / 100) * percentOf : parseFloat(raw)
}

// sRGB transfer function and its inverse, shared by every space that encodes with it
// (sRGB itself and display-p3).
function encodeGamma(c: number): number {
  const abs = Math.abs(c)
  const encoded = abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : 12.92 * abs
  return c < 0 ? -encoded : encoded
}

function decodeGamma(c: number): number {
  const abs = Math.abs(c)
  const linear = abs > 0.04045 ? ((abs + 0.055) / 1.055) ** 2.4 : abs / 12.92
  return c < 0 ? -linear : linear
}

// Split the `a b c [/ alpha]` body shared by every CSS colour function.
function splitBody(body: string): { parts: string[]; alpha: number } {
  const [main, alphaPart] = body.split('/').map((s) => s.trim())
  const parts = main.split(/[\s,]+/).filter(Boolean)
  let alpha = 1
  if (alphaPart !== undefined) {
    const a = alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    if (!Number.isNaN(a)) alpha = a
  }
  return { parts, alpha }
}

function rgba(r: number, g: number, b: number, a: number): Rgba {
  return { r: round(clamp01(r)), g: round(clamp01(g)), b: round(clamp01(b)), a: round(clamp01(a)) }
}

// hsl(H S% L%) → sRGB. Previously unsupported, which meant every HSL token was
// dropped from the Figma export with no diagnostic.
function fromHslFn(input: string): Rgba | null {
  const m = input.match(/^hsla?\(([^)]+)\)$/i)
  if (!m) return null
  const { parts, alpha } = splitBody(m[1])
  if (parts.length < 3) return null
  const h = parseFloat(parts[0].replace(/deg$/i, ''))
  // s/l accept `50%` or a bare 0..1 (the form Milda's own ColorValue stores).
  const frac = (p: string) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p))
  const s = frac(parts[1])
  const l = frac(parts[2])
  if ([h, s, l].some(Number.isNaN)) return null

  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
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
  const m0 = l - c / 2
  return rgba(r1 + m0, g1 + m0, b1 + m0, alpha)
}

// color(display-p3 r g b) → sRGB. P3 encodes with the sRGB transfer function, so the
// path is decode → P3-linear→sRGB-linear matrix → re-encode. Out-of-sRGB-gamut P3
// colours clamp (Figma COLOR variables are sRGB only); the caller reports the loss.
function fromP3Fn(input: string): Rgba | null {
  const m = input.match(/^color\(\s*display-p3\s+([^)]+)\)$/i)
  if (!m) return null
  const { parts, alpha } = splitBody(m[1])
  if (parts.length < 3) return null
  const chan = (p: string) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p))
  const [r, g, b] = [chan(parts[0]), chan(parts[1]), chan(parts[2])]
  if ([r, g, b].some(Number.isNaN)) return null

  const rl = decodeGamma(r)
  const gl = decodeGamma(g)
  const bl = decodeGamma(b)
  // Display-P3 → sRGB, both linear (D65, via XYZ, pre-multiplied).
  const rLin = 1.2249401762805566 * rl - 0.2249401762805563 * gl
  const gLin = -0.04205697339879597 * rl + 1.0420569733987959 * gl
  const bLin = -0.019637081008389134 * rl - 0.07863145834272432 * gl + 1.0982685393511135 * bl
  return rgba(encodeGamma(rLin), encodeGamma(gLin), encodeGamma(bLin), alpha)
}

// OKLCH → sRGB, via OKLab (Björn Ottosson's reference matrices) - needed because
// modern design-token sources (Radix, Tailwind v4, etc.) default to OKLCH, which
// Figma's Variables API has no native concept of (COLOR variables are sRGB only).
function fromOklch(input: string): Rgba | null {
  const m = input.match(/^oklch\(([^)]+)\)$/i)
  if (!m) return null
  const [main, alphaPart] = m[1].split('/').map((s) => s.trim())
  const parts = main.split(/\s+/).filter(Boolean)
  if (parts.length !== 3) return null

  const L = component(parts[0], 1)
  const C = component(parts[1], 0.4) // CSS Color 4: 100% chroma ≈ 0.4
  const hDeg = parseFloat(parts[2].replace(/deg$/i, ''))
  if ([L, C, hDeg].some(Number.isNaN)) return null

  const hRad = (hDeg * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const bLab = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * bLab
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bLab
  const s_ = L - 0.0894841775 * a - 1.291485548 * bLab
  const l = l_ ** 3
  const mm = m_ ** 3
  const s = s_ ** 3

  const rLin = 4.0767416621 * l - 3.3077115913 * mm + 0.230969929 * s
  const gLin = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s
  const bLin = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s

  let alpha = 1
  if (alphaPart !== undefined) {
    alpha = alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    if (Number.isNaN(alpha)) alpha = 1
  }

  return rgba(encodeGamma(rLin), encodeGamma(gLin), encodeGamma(bLin), alpha)
}

export function parseColor(value: string): Rgba | null {
  const v = value.trim()
  if (v.startsWith('#')) return fromHex(v)
  if (/^rgba?\(/i.test(v)) return fromRgbFn(v)
  if (/^oklch\(/i.test(v)) return fromOklch(v)
  if (/^hsla?\(/i.test(v)) return fromHslFn(v)
  if (/^color\(\s*display-p3/i.test(v)) return fromP3Fn(v)
  return null
}
