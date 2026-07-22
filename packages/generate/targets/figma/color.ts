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

function fromRgbFn(input: string): Rgba | null {
  const m = input.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) return null
  const parts = m[1]
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 3) return null
  const channel = (p: string) => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p))
  const r = channel(parts[0])
  const g = channel(parts[1])
  const b = channel(parts[2])
  if ([r, g, b].some(Number.isNaN)) return null
  let a = 1
  if (parts[3] !== undefined) {
    a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    if (Number.isNaN(a)) a = 1
  }
  return {
    r: round(clamp01(r / 255)),
    g: round(clamp01(g / 255)),
    b: round(clamp01(b / 255)),
    a: round(clamp01(a)),
  }
}

// Percentage-or-bare-number component, per CSS Color 4 (oklch(70% 0.1 30) and
// oklch(0.7 0.1 30) are both valid). `scale` is what a bare number means (e.g.
// lightness's bare-number range is 0–1, so scale=1; hue's is degrees, scale=1).
function component(raw: string, percentOf: number): number {
  return raw.endsWith('%') ? (parseFloat(raw) / 100) * percentOf : parseFloat(raw)
}

// OKLCH → sRGB, via OKLab (Björn Ottosson's reference matrices) — needed because
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
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bLab
  const l = l_ ** 3
  const mm = m_ ** 3
  const s = s_ ** 3

  const rLin = 4.0767416621 * l - 3.3077115913 * mm + 0.230969929 * s
  const gLin = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s
  const bLin = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s

  const gamma = (c: number) => {
    const abs = Math.abs(c)
    const encoded = abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : 12.92 * abs
    return c < 0 ? -encoded : encoded
  }

  let alpha = 1
  if (alphaPart !== undefined) {
    alpha = alphaPart.endsWith('%') ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    if (Number.isNaN(alpha)) alpha = 1
  }

  return {
    r: round(clamp01(gamma(rLin))),
    g: round(clamp01(gamma(gLin))),
    b: round(clamp01(gamma(bLin))),
    a: round(clamp01(alpha)),
  }
}

export function parseColor(value: string): Rgba | null {
  const v = value.trim()
  if (v.startsWith('#')) return fromHex(v)
  if (/^rgba?\(/i.test(v)) return fromRgbFn(v)
  if (/^oklch\(/i.test(v)) return fromOklch(v)
  return null
}
