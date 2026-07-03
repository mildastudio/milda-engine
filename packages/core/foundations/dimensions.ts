import type { TokenType } from './document'

const LENGTH_TYPES = new Set<TokenType>(['radius', 'spacing', 'borderWidth', 'fontSize', 'size'])
export function isLengthType(type: TokenType | string): boolean {
  return LENGTH_TYPES.has(type as TokenType)
}

const ASSUMED_REM_PX = 16

export type Length = { kind: 'dp'; value: number } | { kind: 'relative'; css: string }

export function parseLength(raw: string | undefined): Length {
  const s = (raw ?? '').trim()
  if (s === '') return { kind: 'dp', value: 0 }
  const m = s.match(/^(-?\d*\.?\d+)\s*(px|dp|rem)?$/i)
  if (m) {
    const n = parseFloat(m[1])
    const unit = (m[2] ?? '').toLowerCase()
    return { kind: 'dp', value: unit === 'rem' ? n * ASSUMED_REM_PX : n }
  }

  return { kind: 'relative', css: s }
}

export function isRelativeLength(raw: string | undefined): boolean {
  return parseLength(raw).kind === 'relative'
}

export function canonicalLength(raw: string | undefined): string {
  const p = parseLength(raw)
  return p.kind === 'relative' ? p.css : String(+p.value.toFixed(4))
}

export interface WebUnitPolicy {
  unit: 'px' | 'rem'
  rootPx: number
}
export const DEFAULT_WEB_UNITS: WebUnitPolicy = { unit: 'px', rootPx: 16 }

export function lengthToCss(
  raw: string | undefined,
  policy: WebUnitPolicy = DEFAULT_WEB_UNITS,
): string {
  const p = parseLength(raw)
  if (p.kind === 'relative') return p.css
  if (p.value === 0) return '0'
  if (policy.unit === 'rem') return `${+(p.value / policy.rootPx).toFixed(4)}rem`
  return `${+p.value.toFixed(4)}px`
}
