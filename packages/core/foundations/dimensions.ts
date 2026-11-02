// ─── Lengths: one neutral model, per-target lowering (proposal 0038) ─────────
// A length in the IR is NOT a CSS string. It is one of a small set of neutral kinds,
// and each target lowers it its own way:
//
//   fixed   a density-independent length. CSS px, Android dp, iOS pt, Figma px.
//   scaled  a multiple of the USER'S TEXT SIZE. CSS rem, Android sp, iOS Dynamic Type.
//   percent / em  relative to the parent box / the element's own text size.
//   pill    "fully rounded" - an intent, not a measurement (CSS 9999px, SwiftUI
//           Capsule, Compose CircleShape, a clamped corner radius in Figma).
//   relative  the escape hatch: anything irreducibly platform-shaped (vw, calc(), auto).
//
// This file used to flatten every length into a bare density-independent number,
// multiplying `rem` by an assumed 16px root. That destroyed the fixed/scaled distinction
// on load and, because a bare number re-parsed as `rem`, multiplied fixed lengths by 16
// on every `.milda` round trip. The conversion still exists - a numeric target like
// Figma cannot express "scales with the user's text size" - but it now happens at the
// TARGET boundary, explicitly, instead of silently inside the IR.

import type { DimensionValue, LengthValue } from '@mildastudio/milda'
import type { TokenType } from './document'

const LENGTH_TYPES = new Set<TokenType>(['radius', 'spacing', 'borderWidth', 'fontSize', 'size'])
export function isLengthType(type: TokenType | string): boolean {
  return LENGTH_TYPES.has(type as TokenType)
}

/**
 * The root text size assumed when a text-scaled length has to collapse to a number.
 * Only numeric targets (Figma) and the `rem` web unit policy may use it; nothing in the
 * IR is allowed to bake it in.
 */
export const ASSUMED_ROOT_PX = 16

/** What a pill lowers to where only a number is accepted (CSS and Figma both clamp). */
const PILL_DP = 9999

export type Length =
  | { kind: 'fixed'; value: number }
  | { kind: 'scaled'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'em'; value: number }
  | { kind: 'pill' }
  | { kind: 'relative'; css: string }

const round = (n: number): number => +n.toFixed(4)

// Every spelling the reader accepts. `px`/`dp` are the same unit and `rem`/`sp` are the
// same unit; a bare number is read as `fixed`, which is what every value stored by the
// old unit-stripping normalisation meant.
const UNIT_RE = /^(-?\d*\.?\d+)\s*(px|dp|rem|sp|em|%)?$/i
const SCALED_FN_RE = /^scaled\(\s*(-?\d*\.?\d+)\s*\)$/i

export function parseLength(raw: string | undefined): Length {
  const s = (raw ?? '').trim()
  if (s === '') return { kind: 'fixed', value: 0 }
  if (s.toLowerCase() === 'pill') return { kind: 'pill' }

  const fn = SCALED_FN_RE.exec(s)
  if (fn) return { kind: 'scaled', value: parseFloat(fn[1]) }

  const m = UNIT_RE.exec(s)
  if (m) {
    const n = parseFloat(m[1])
    switch ((m[2] ?? '').toLowerCase()) {
      case 'rem':
      case 'sp':
        return { kind: 'scaled', value: n }
      case 'em':
        return { kind: 'em', value: n }
      case '%':
        return { kind: 'percent', value: n }
      default:
        return { kind: 'fixed', value: n }
    }
  }

  return { kind: 'relative', css: s }
}

/** A length as its canonical spelling - what the DSL emitter and the IR both store. */
export function formatLength(length: Length): string {
  switch (length.kind) {
    case 'fixed':
      return `${round(length.value)}px`
    case 'scaled':
      return `scaled(${round(length.value)})`
    case 'percent':
      return `${round(length.value)}%`
    case 'em':
      return `${round(length.value)}em`
    case 'pill':
      return 'pill'
    case 'relative':
      return length.css
  }
}

/** Any accepted spelling → the canonical one (`0.75rem` → `scaled(0.75)`). */
export function canonicalLength(raw: string | undefined): string {
  return formatLength(parseLength(raw))
}

/** A typed IR length value → the neutral model. */
export function lengthOf(value: LengthValue): Length {
  if ('keyword' in value) return { kind: 'pill' }
  switch (value.unit) {
    case 'scaled':
      return { kind: 'scaled', value: value.value }
    case 'percent':
      return { kind: 'percent', value: value.value }
    case 'em':
      return { kind: 'em', value: value.value }
    default:
      return { kind: 'fixed', value: value.value }
  }
}

/**
 * The neutral model → a typed IR length value, or null when the length has no typed
 * representation (a viewport unit, a calc()) and must stay a raw slot.
 */
export function lengthValue(length: Length): LengthValue | null {
  switch (length.kind) {
    case 'pill':
      return { keyword: 'pill' }
    case 'fixed':
      return { value: round(length.value), unit: 'fixed' } satisfies DimensionValue
    case 'scaled':
      return { value: round(length.value), unit: 'scaled' } satisfies DimensionValue
    case 'percent':
      return { value: round(length.value), unit: 'percent' } satisfies DimensionValue
    case 'em':
      return { value: round(length.value), unit: 'em' } satisfies DimensionValue
    case 'relative':
      return null
  }
}

/** True when a length is not a plain measurement the dp editor can drive. */
export function isRelativeLength(raw: string | undefined): boolean {
  const kind = parseLength(raw).kind
  return kind === 'relative' || kind === 'percent' || kind === 'em'
}

export interface WebUnitPolicy {
  /** The unit a FIXED length is written in. A scaled length is always `rem`. */
  unit: 'px' | 'rem'
  rootPx: number
}
export const DEFAULT_WEB_UNITS: WebUnitPolicy = { unit: 'px', rootPx: ASSUMED_ROOT_PX }

export function lengthToCss(
  value: string | Length | undefined,
  policy: WebUnitPolicy = DEFAULT_WEB_UNITS,
): string {
  const p = typeof value === 'object' && value != null ? value : parseLength(value)
  switch (p.kind) {
    case 'relative':
      return p.css
    // The web spelling of "fully rounded". Every UA clamps a corner radius to half the
    // box, so a large length is the idiom rather than a hack we could improve on.
    case 'pill':
      return `${PILL_DP}px`
    case 'percent':
      return `${round(p.value)}%`
    case 'em':
      return `${round(p.value)}em`
    // A text-scaled length IS `rem` on the web, whatever the fixed-length policy is:
    // that is the only web unit that tracks the user's text size.
    case 'scaled':
      return p.value === 0 ? '0' : `${round(p.value)}rem`
    case 'fixed':
      if (p.value === 0) return '0'
      return policy.unit === 'rem' ? `${round(p.value / policy.rootPx)}rem` : `${round(p.value)}px`
  }
}

/**
 * A length as a plain number, for targets that accept nothing else (Figma variables,
 * and eventually native). Returns null where the target has no equivalent, so the
 * caller can keep the original string rather than invent a number.
 *
 * A text-scaled length collapses here, using `rootPx` - this is THE documented lossy
 * step, and it lives at the target boundary on purpose.
 *
 * `em` is relative to the ELEMENT'S OWN text size, which this function cannot know, so it
 * stays null unless the caller supplies `emPx`. Supplying it is a statement about the
 * element being measured ("this schematic is drawn at a 16px text size"), not a global
 * assumption, which is why it is a separate option from `rootPx`.
 */
export function lengthToDp(
  value: string | Length | undefined,
  opts: { rootPx?: number; emPx?: number } = {},
): number | null {
  const p = typeof value === 'object' && value != null ? value : parseLength(value)
  switch (p.kind) {
    case 'fixed':
      return round(p.value)
    case 'scaled':
      return round(p.value * (opts.rootPx ?? ASSUMED_ROOT_PX))
    case 'em':
      return opts.emPx == null ? null : round(p.value * opts.emPx)
    case 'pill':
      return PILL_DP
    case 'percent':
    case 'relative':
      return null
  }
}
