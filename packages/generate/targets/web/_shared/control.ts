// Tier 2 (web) - toggle controls lowered to CSS (proposal 0045 phase 2).
//
// Everything here is a browser fact: that a row of things is `display: inline-flex`, that
// a border is a three-part shorthand, that a fully-rounded corner is spelled `999px`, that
// moving a box sideways is a `transform`. The measurements themselves are NOT a browser
// fact and live in `core/behavior/controlGeometry.ts`, which is why this file computes its
// declarations from that model instead of restating it - including the switch thumb's
// travel, which used to be the literal `translateX(16px)` and is now the arithmetic that
// produced it.
//
// The lists are built once at module load, exactly as they were when they were constants,
// so nothing here is on a per-render path.

import type { StyleDecl } from './decl'
import {
  CHECKBOX_GEOMETRY,
  CONTROL_DISABLED_OPACITY,
  CONTROL_FOCUS_RING,
  SWITCH_GEOMETRY,
  switchThumbTravel,
  type CheckboxGeometry,
  type ControlAspect,
  type Length,
  type SwitchGeometry,
} from '@mildastudio/core'

// ─── Lengths → CSS ───────────────────────────────────────────────────────────
// `pill` is an intent ("fully rounded"), and 999px is the browser's idiom for it: any
// radius past half the shorter side is clamped, so an over-large number is the portable
// way to say it. `scaled` is rem by the same policy the rest of the web tier uses.

const PILL_CSS = '999px'

export function lengthCss(l: Length): string {
  switch (l.kind) {
    case 'fixed':
      return `${l.value}px`
    case 'scaled':
      return `${l.value}rem`
    case 'em':
      return `${l.value}em`
    case 'percent':
      return `${l.value}%`
    case 'pill':
      return PILL_CSS
    case 'relative':
      return l.css
  }
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

function checkboxDecls(g: CheckboxGeometry) {
  const size = lengthCss(g.indicator.size)
  const glyph = lengthCss(g.glyph.size)
  return {
    root: [
      { prop: 'display', value: 'inline-flex' },
      { prop: 'alignItems', value: 'center' },
      { prop: 'gap', value: lengthCss(g.gap) },
      { prop: 'cursor', value: 'pointer' },
    ] satisfies StyleDecl[],
    indicator: [
      { prop: 'display', value: 'inline-flex' },
      { prop: 'alignItems', value: 'center' },
      { prop: 'justifyContent', value: 'center' },
      { prop: 'flex', value: 'none' },
      { prop: 'boxSizing', value: 'border-box' },
      { prop: 'width', value: size },
      { prop: 'height', value: size },
      { prop: 'border', value: `${lengthCss(g.indicator.borderWidth)} solid currentColor` },
      { prop: 'borderRadius', value: lengthCss(g.indicator.corner) },
      { prop: 'color', value: 'inherit' },
    ] satisfies StyleDecl[],
    glyph: [
      { prop: 'width', value: glyph },
      { prop: 'height', value: glyph },
      { prop: 'opacity', value: '0' },
      { prop: 'transform', value: `scale(${g.glyph.hiddenScale})` },
    ] satisfies StyleDecl[],
  }
}

const CHECKBOX = checkboxDecls(CHECKBOX_GEOMETRY)

export const CHECKBOX_ROOT_DECLS: StyleDecl[] = CHECKBOX.root
export const CHECKBOX_INDICATOR_DECLS: StyleDecl[] = CHECKBOX.indicator
export const CHECKBOX_GLYPH_DECLS: StyleDecl[] = CHECKBOX.glyph

/** The tick at rest: full strength, no scaling left to undo. */
export const CHECKBOX_GLYPH_CHECKED_DECLS: StyleDecl[] = [
  { prop: 'opacity', value: '1' },
  { prop: 'transform', value: 'none' },
]

// ─── Switch ──────────────────────────────────────────────────────────────────

function switchDecls(g: SwitchGeometry) {
  const thumb = lengthCss(g.thumb.size)
  return {
    track: [
      { prop: 'display', value: 'inline-flex' },
      { prop: 'alignItems', value: 'center' },
      { prop: 'flex', value: 'none' },
      { prop: 'boxSizing', value: 'border-box' },
      { prop: 'width', value: lengthCss(g.track.width) },
      { prop: 'height', value: lengthCss(g.track.height) },
      { prop: 'padding', value: lengthCss(g.track.padding) },
      { prop: 'border', value: `${lengthCss(g.track.borderWidth)} solid currentColor` },
      { prop: 'borderRadius', value: lengthCss(g.track.corner) },
      { prop: 'color', value: 'inherit' },
    ] satisfies StyleDecl[],
    thumb: [
      { prop: 'display', value: 'block' },
      { prop: 'flex', value: 'none' },
      { prop: 'width', value: thumb },
      { prop: 'height', value: thumb },
      { prop: 'borderRadius', value: lengthCss(g.thumb.corner) },
      { prop: 'backgroundColor', value: 'currentColor' },
      { prop: 'transform', value: 'translateX(0)' },
    ] satisfies StyleDecl[],
    thumbChecked: [
      { prop: 'transform', value: `translateX(${lengthCss(switchThumbTravel(g))})` },
    ] satisfies StyleDecl[],
  }
}

const SWITCH = switchDecls(SWITCH_GEOMETRY)

export const SWITCH_TRACK_DECLS: StyleDecl[] = SWITCH.track
export const SWITCH_THUMB_DECLS: StyleDecl[] = SWITCH.thumb
export const SWITCH_THUMB_CHECKED_DECLS: StyleDecl[] = SWITCH.thumbChecked

// ─── States shared by both ───────────────────────────────────────────────────

// `var(--ds-color-ring, currentColor)` is core's "the ring facet, or the control's own
// text colour where the system defines none" in the one spelling CSS has for a fallback.
export const CHECKBOX_FOCUS_DECLS: StyleDecl[] = [
  {
    prop: 'outline',
    value: `${lengthCss(CONTROL_FOCUS_RING.width)} solid var(--ds-color-ring, currentColor)`,
  },
  { prop: 'outlineOffset', value: lengthCss(CONTROL_FOCUS_RING.offset) },
]

export const CHECKBOX_DISABLED_DECLS: StyleDecl[] = [
  { prop: 'opacity', value: String(CONTROL_DISABLED_OPACITY) },
  { prop: 'cursor', value: 'not-allowed' },
]

// The visually-hidden native control. Pure plumbing - there is no neutral content in it at
// all, because "off-screen but still in the accessibility tree" is a browser problem that
// only a browser has. A native target hands the platform its own control instead.
export const SR_ONLY_DECLS: StyleDecl[] = [
  { prop: 'position', value: 'absolute' },
  { prop: 'width', value: '1px' },
  { prop: 'height', value: '1px' },
  { prop: 'padding', value: '0' },
  { prop: 'margin', value: '0' },
  { prop: 'overflow', value: 'hidden' },
  { prop: 'clipPath', value: 'inset(50%)' },
  { prop: 'whiteSpace', value: 'nowrap' },
  { prop: 'border', value: '0' },
]

// ─── Animated aspects → CSS property names ───────────────────────────────────
// `offset` and `scale` both land on `transform`, which is why this is a mapping and not a
// rename: two neutral aspects can share one CSS property, and the duplicate must collapse
// or the shorthand names `transform` twice.

const ASPECT_PROPS: Record<ControlAspect, string> = {
  fill: 'background-color',
  border: 'border-color',
  opacity: 'opacity',
  scale: 'transform',
  offset: 'transform',
}

export function controlTransitionProps(aspects: ControlAspect[]): string[] {
  const out: string[] = []
  for (const a of aspects) {
    const prop = ASPECT_PROPS[a]
    if (!out.includes(prop)) out.push(prop)
  }
  return out
}
