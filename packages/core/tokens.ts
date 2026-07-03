import type { ScaleName } from './foundations/scales'

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
