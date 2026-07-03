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

export function parseColor(value: string): Rgba | null {
  const v = value.trim()
  if (v.startsWith('#')) return fromHex(v)
  if (/^rgba?\(/i.test(v)) return fromRgbFn(v)
  return null
}
