// Tier 2 (web) - the `--ds-*` custom-property naming scheme.
//
// This is the CSS binding of the token model, not the token model: `--ds-color-accent`
// is a browser fact, while "the token `accent` on the color scale" is the IR's. It lived
// in `packages/core` until proposal 0045 phase 1, where it made milda-engine claim a
// platform it does not have; every non-web target had to route around it.
//
// The names are a contract with emitted CSS - `theme.css` declares them and every
// component stylesheet references them - so they are shared across web frameworks
// rather than owned by `react/`.

import type { ScaleName } from '@mildastudio/core'

export function colorVarName(id: string): string {
  return `--ds-color-${id}`
}

export function scaleVarName(scale: ScaleName, id: string): string {
  return `--ds-${scale}-${id}`
}

export function gradientVarName(id: string): string {
  return `--ds-gradient-${id}`
}
export function textStyleVarName(id: string, field: string): string {
  return `--ds-text-${id}-${field}`
}

export function easingVarName(id: string): string {
  return `--ds-easing-${id}`
}

export function cssVarRef(name: string): string {
  return `var(${name})`
}
