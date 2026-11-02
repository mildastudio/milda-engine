// ─── Control geometry: the numbers, without the CSS (proposal 0045 phase 2) ──
// A toggle's proportions are the DESIGN SYSTEM's, not the platform's - a Milda switch
// should look like a Milda switch on every target, with proposal 0015's per-target
// options as the override where a platform convention must win (an iOS switch is 51x31).
// So the measurements live here, as neutral `Length`s, and each target lowers them the
// way it lowers every other length. What left for `targets/web/_shared/control.ts` is
// the CSS: `display: inline-flex`, `boxSizing`, the `1px solid currentColor` shorthand,
// the property names.
//
// The reason this is a model and not a table of constants is the thumb's travel. It used
// to be the literal string `translateX(16px)`, which is not an independent fact:
//
//     track 40  -  border 2x1  -  padding 2x2  -  thumb 18  =  16
//
// Set the track to 44 and the thumb stopped short of the end, with nothing to catch it.
// `switchThumbTravel` is that arithmetic, so the relationship survives a change to any
// of the four numbers it reads.

import { type Length } from '../foundations/dimensions'

// ─── What varies between the two toggles ─────────────────────────────────────

export interface CheckboxGeometry {
  /** Between the indicator and the label. */
  gap: Length
  indicator: { size: Length; corner: Length; borderWidth: Length }
  /** The tick. `hiddenScale` is how small it starts before it grows into place. */
  glyph: { size: Length; hiddenScale: number }
}

export interface SwitchGeometry {
  track: { width: Length; height: Length; padding: Length; borderWidth: Length; corner: Length }
  thumb: { size: Length; corner: Length }
}

// The checkbox is sized in `em` and grows with its label; the switch is sized in fixed
// units and does not. That is an inconsistency nobody chose - it is what the two frozen
// CSS blocks happened to say - and it is preserved here deliberately, because changing it
// is a design decision rather than part of moving the numbers. Now that these are neutral
// lengths, making the switch text-relative is an edit to this table and nothing else.

export const CHECKBOX_GEOMETRY: CheckboxGeometry = {
  gap: { kind: 'em', value: 0.5 },
  indicator: {
    size: { kind: 'em', value: 1.15 },
    corner: { kind: 'em', value: 0.25 },
    borderWidth: { kind: 'fixed', value: 1 },
  },
  glyph: { size: { kind: 'em', value: 0.85 }, hiddenScale: 0.7 },
}

export const SWITCH_GEOMETRY: SwitchGeometry = {
  track: {
    width: { kind: 'fixed', value: 40 },
    height: { kind: 'fixed', value: 24 },
    padding: { kind: 'fixed', value: 2 },
    borderWidth: { kind: 'fixed', value: 1 },
    corner: { kind: 'pill' },
  },
  thumb: { size: { kind: 'fixed', value: 18 }, corner: { kind: 'pill' } },
}

// ─── The relationship, not a literal ─────────────────────────────────────────

/**
 * How far the thumb moves from the off position to the on position: the track's inner
 * width minus the thumb. Derived rather than stored, so the four numbers it reads cannot
 * drift out of agreement with it.
 *
 * The arithmetic needs one unit family, and the track is measured in fixed units all the
 * way down. A geometry mixing kinds cannot be resolved without a target's text metrics,
 * so it yields `0` here and the caller is expected to compute travel itself - which is
 * the honest answer, not a guess with an assumed root size baked in.
 */
export function switchThumbTravel(g: SwitchGeometry = SWITCH_GEOMETRY): Length {
  const { width, borderWidth, padding } = g.track
  const parts = [width, borderWidth, padding, g.thumb.size]
  if (parts.some((p) => p.kind !== 'fixed')) return { kind: 'fixed', value: 0 }
  const [w, b, p, thumb] = parts.map((x) => (x as { kind: 'fixed'; value: number }).value)
  return { kind: 'fixed', value: w - 2 * b - 2 * p - thumb }
}

// ─── Shared control states ───────────────────────────────────────────────────

/** A disabled control keeps its shape and loses its weight. */
export const CONTROL_DISABLED_OPACITY = 0.5

/**
 * The keyboard focus ring. The colour is the `ring` facet where the design system defines
 * one, and the control's own text colour where it does not - stated as intent here because
 * "fall back to the current text colour" is something every target can honour, while
 * `var(--ds-color-ring, currentColor)` is a browser sentence.
 */
export const CONTROL_FOCUS_RING: { width: Length; offset: Length } = {
  width: { kind: 'fixed', value: 2 },
  offset: { kind: 'fixed', value: 2 },
}

// ─── What animates ───────────────────────────────────────────────────────────
// The aspect being animated, named neutrally. `offset` is the thumb travelling and
// `scale` the glyph growing in; a web target maps both onto `transform`, an AppKit or
// Figma one would not. Duration and easing are TOKEN IDS - the design system's own
// motion scale answers "how fast", not a hardcoded millisecond count.

export type ControlAspect = 'fill' | 'border' | 'opacity' | 'scale' | 'offset'

export interface ControlTransition {
  aspects: ControlAspect[]
  duration: string
  easing: string
}

export const CHECKBOX_INDICATOR_TRANSITION: ControlTransition = {
  aspects: ['fill', 'border'],
  duration: 'fast',
  easing: 'ease',
}
export const CHECKBOX_GLYPH_TRANSITION: ControlTransition = {
  aspects: ['opacity', 'scale'],
  duration: 'fast',
  easing: 'ease',
}
export const SWITCH_TRACK_TRANSITION: ControlTransition = {
  aspects: ['fill', 'border'],
  duration: 'fast',
  easing: 'ease',
}
export const SWITCH_THUMB_TRANSITION: ControlTransition = {
  aspects: ['offset', 'fill'],
  duration: 'fast',
  easing: 'ease',
}
