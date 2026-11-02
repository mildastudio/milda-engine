import { ROLE_LABELS, type RoleKey, type Slot, type Token, type Layer } from './document'
import { colorToCss, contrastRatio, parseCssColor, toSrgb } from './color'

// ─── Set-level authoring (proposal 0042 §5) ───────────────────────────────────
// The actions an EMPTY layer offers instead of "+ Token". Nobody enters eighty primitives one
// at a time, so the primary gesture in an empty palette is a whole ramp, and in an empty
// decisions layer a whole role set.
//
// Both produce ordinary tokens - nothing downstream knows they were generated, and the author
// can edit any of them afterwards. That is the point: this is a way to START, not a managed
// object that fights you later. (A persistent, re-runnable recipe is its own proposal.)

/** The eleven steps every ramp gets, matching the seeded palette's shape. */
export const RAMP_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

// Perceptual lightness per stop, and a chroma envelope that peaks mid-ramp. Both are in OKLCH,
// which is why the ramp reads as one family rather than eleven unrelated colours: equal steps
// in L are equal steps to the eye, and holding chroma flat would make the pale and dark ends
// look muddy.
const RAMP_L = [0.972, 0.944, 0.891, 0.825, 0.751, 0.671, 0.591, 0.507, 0.423, 0.333, 0.261]
const RAMP_C = [0.13, 0.26, 0.5, 0.72, 0.9, 1, 0.98, 0.9, 0.78, 0.62, 0.5]

/**
 * A colour ramp from one anchor hue.
 *
 * Values are stored as TYPED oklch colours (0036), not hex: the perceptual intent is the
 * reason the ramp is usable, so flattening it to sRGB on the way in would throw away exactly
 * what was interesting. Targets lower it at their own boundary.
 */
export function colorRamp(
  name: string,
  hue: number,
  chroma = 0.16,
): Omit<Token, 'group' | 'order'>[] {
  return RAMP_STOPS.map((stop, i) => ({
    id: `${name}-${stop}`,
    name: `${name}-${stop}`,
    type: 'color' as const,
    value: {
      base: {
        color: { space: 'oklch' as const, channels: [RAMP_L[i], chroma * RAMP_C[i], hue] },
      } satisfies Slot,
    },
  }))
}

/** The roles a fresh decisions layer gets, in the order they are usually reasoned about. */
export const STANDARD_ROLES: RoleKey[] = [
  'surface',
  'surfaceRaised',
  'textPrimary',
  'textSecondary',
  'border',
  'accent',
  'onAccent',
]

/** A slug for a role, so `textPrimary` becomes the token id `text-primary`. */
export function roleTokenId(role: RoleKey): string {
  return role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

interface Candidate {
  id: string
  css: string
  luminance: number
  chroma: number
}

/**
 * The standard roles, each referencing a token from `from` chosen by measurement.
 *
 * The choices are deliberately crude and deliberately explainable: lightest for a surface,
 * darkest for primary text, most chromatic for the accent. It is a STARTING POINT that puts a
 * working, themeable system on screen in one action - not an attempt to have taste. Every one
 * is a normal reference the author can repoint.
 *
 * Returns [] when `from` has too few colours to choose between, rather than inventing values.
 */
export function standardRoles(
  from: Layer,
  resolve: (id: string) => string | undefined,
): Omit<Token, 'group' | 'order'>[] {
  const candidates: Candidate[] = []
  for (const token of from.tokens) {
    if (token.type !== 'color') continue
    const css = resolve(token.id)
    if (!css) continue
    let srgb: { r: number; g: number; b: number }
    try {
      srgb = toSrgbOf(css)
    } catch {
      continue
    }
    const luminance = relLum(srgb)
    const chroma = Math.max(srgb.r, srgb.g, srgb.b) - Math.min(srgb.r, srgb.g, srgb.b)
    candidates.push({ id: token.id, css, luminance, chroma })
  }
  if (candidates.length < 4) return []

  const byChroma = [...candidates].sort((a, b) => b.chroma - a.chroma)
  const accent = byChroma[0]

  // The STRUCTURAL roles come from the least chromatic half of the palette, ranked by
  // lightness. Ranking all candidates by lightness alone picks whatever sits at that position -
  // which on a palette containing one saturated outlier made `border` bright red. Chroma is the
  // accent's job; a surface, a text and a border want neutrals, and saying so is cheaper than
  // hoping the palette is tidy.
  const neutralPool = [...candidates].sort((a, b) => a.chroma - b.chroma)
  const neutrals = neutralPool.slice(0, Math.max(4, Math.ceil(neutralPool.length / 2)))
  const byLight = neutrals.sort((a, b) => b.luminance - a.luminance)
  const at = (fraction: number) =>
    byLight[Math.min(byLight.length - 1, Math.round(fraction * (byLight.length - 1)))]
  // Whichever of the ramp's extremes reads better ON the accent, which is the only one of
  // these that has a correctness criterion rather than a convention.
  const onAccent =
    (contrastRatio(byLight[0].css, accent.css) ?? 0) >=
    (contrastRatio(byLight[byLight.length - 1].css, accent.css) ?? 0)
      ? byLight[0]
      : byLight[byLight.length - 1]

  const pick: Record<RoleKey, Candidate | undefined> = {
    surface: byLight[0],
    surfaceRaised: at(0.08),
    textPrimary: byLight[byLight.length - 1],
    textSecondary: at(0.72),
    border: at(0.25),
    accent,
    onAccent,
  } as Record<RoleKey, Candidate | undefined>

  return STANDARD_ROLES.filter((role) => pick[role]).map((role) => ({
    id: roleTokenId(role),
    name: ROLE_LABELS[role],
    type: 'color' as const,
    value: { base: { ref: pick[role]!.id } },
    role,
  }))
}

function toSrgbOf(css: string): { r: number; g: number; b: number } {
  const parsed = parseCssColor(css)
  if (!parsed) throw new Error('unparseable')
  const { r, g, b } = toSrgb(parsed)
  return { r, g, b }
}

function relLum({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = [r, g, b].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

/** The CSS a generated ramp step resolves to, for previews that have no foundations yet. */
export function rampStepCss(hue: number, chroma: number, index: number): string {
  return colorToCss({ space: 'oklch', channels: [RAMP_L[index], chroma * RAMP_C[index], hue] })
}
