import type { ComponentNode } from '../structure/types'
import { effectiveValueType } from '../structure/types'
import type { StyleDecl } from '../facets/facets'

export function isCustomToggle(node: ComponentNode): boolean {
  return node.kind === 'input' && !node.part && effectiveValueType(node)?.kind === 'boolean'
}

export function customToggleVariant(node: ComponentNode): 'checkbox' | 'switch' | undefined {
  if (!isCustomToggle(node)) return undefined
  return node.control?.as ?? 'checkbox'
}

export const CHECKBOX_GLYPH_PART = 'glyph'

export function checkboxGlyphChild(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): ComponentNode | undefined {
  if (customToggleVariant(node) !== 'checkbox') return undefined
  for (const id of node.childrenIds) {
    const child = nodes[id]
    if (child?.kind === 'icon' && child.part === CHECKBOX_GLYPH_PART) return child
  }
  return undefined
}

export const CHECKBOX_INDICATOR_PART = 'indicator'
export const SWITCH_TRACK_PART = 'track'
export const SWITCH_THUMB_PART = 'thumb'

export const CHECKBOX_CONTROL_PART = 'control'

export interface MaterializedToggleParts {
  variant: 'checkbox' | 'switch'

  indicator?: ComponentNode
  glyph?: ComponentNode

  track?: ComponentNode
  thumb?: ComponentNode
}

export function materializedToggleParts(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): MaterializedToggleParts | undefined {
  if (node.kind !== 'container') return undefined
  if (effectiveValueType(node)?.kind !== 'boolean') return undefined
  const child = (part: string) =>
    node.childrenIds.map((id) => nodes[id]).find((c) => c?.part === part)
  const variant: 'checkbox' | 'switch' = node.control?.as ?? 'checkbox'
  if (variant === 'switch') {
    const track = child(SWITCH_TRACK_PART)
    if (!track) return undefined
    const thumb = track.childrenIds
      .map((id) => nodes[id])
      .find((c) => c?.part === SWITCH_THUMB_PART)
    return { variant, track, thumb }
  }
  const indicator = child(CHECKBOX_INDICATOR_PART)
  if (!indicator) return undefined
  const glyph = indicator.childrenIds
    .map((id) => nodes[id])
    .find((c): c is ComponentNode => !!c && c.kind === 'icon')
  return { variant, indicator, glyph }
}

export const CHECKBOX_ROOT_DECLS: StyleDecl[] = [
  { prop: 'display', value: 'inline-flex' },
  { prop: 'alignItems', value: 'center' },
  { prop: 'gap', value: '0.5em' },
  { prop: 'cursor', value: 'pointer' },
]

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

export const CHECKBOX_INDICATOR_DECLS: StyleDecl[] = [
  { prop: 'display', value: 'inline-flex' },
  { prop: 'alignItems', value: 'center' },
  { prop: 'justifyContent', value: 'center' },
  { prop: 'flex', value: 'none' },
  { prop: 'boxSizing', value: 'border-box' },
  { prop: 'width', value: '1.15em' },
  { prop: 'height', value: '1.15em' },
  { prop: 'border', value: '1px solid currentColor' },
  { prop: 'borderRadius', value: '0.25em' },
  { prop: 'color', value: 'inherit' },
]

export const CHECKBOX_GLYPH_DECLS: StyleDecl[] = [
  { prop: 'width', value: '0.85em' },
  { prop: 'height', value: '0.85em' },
  { prop: 'opacity', value: '0' },
  { prop: 'transform', value: 'scale(0.7)' },
]

export const CHECKBOX_GLYPH_CHECKED_DECLS: StyleDecl[] = [
  { prop: 'opacity', value: '1' },
  { prop: 'transform', value: 'none' },
]

export const CHECKBOX_FOCUS_DECLS: StyleDecl[] = [
  { prop: 'outline', value: '2px solid var(--ds-color-ring, currentColor)' },
  { prop: 'outlineOffset', value: '2px' },
]

export const CHECKBOX_DISABLED_DECLS: StyleDecl[] = [
  { prop: 'opacity', value: '0.5' },
  { prop: 'cursor', value: 'not-allowed' },
]

export const SWITCH_TRACK_DECLS: StyleDecl[] = [
  { prop: 'display', value: 'inline-flex' },
  { prop: 'alignItems', value: 'center' },
  { prop: 'flex', value: 'none' },
  { prop: 'boxSizing', value: 'border-box' },
  { prop: 'width', value: '40px' },
  { prop: 'height', value: '24px' },
  { prop: 'padding', value: '2px' },
  { prop: 'border', value: '1px solid currentColor' },
  { prop: 'borderRadius', value: '999px' },
  { prop: 'color', value: 'inherit' },
]

export const SWITCH_THUMB_DECLS: StyleDecl[] = [
  { prop: 'display', value: 'block' },
  { prop: 'flex', value: 'none' },
  { prop: 'width', value: '18px' },
  { prop: 'height', value: '18px' },
  { prop: 'borderRadius', value: '999px' },
  { prop: 'backgroundColor', value: 'currentColor' },
  { prop: 'transform', value: 'translateX(0)' },
]

export const SWITCH_THUMB_CHECKED_DECLS: StyleDecl[] = [
  { prop: 'transform', value: 'translateX(16px)' },
]

export interface ControlTransition {
  properties: string[]
  duration: string
  easing: string
}

export const CHECKBOX_INDICATOR_TRANSITION: ControlTransition = {
  properties: ['background-color', 'border-color'],
  duration: 'fast',
  easing: 'ease',
}
export const CHECKBOX_GLYPH_TRANSITION: ControlTransition = {
  properties: ['opacity', 'transform'],
  duration: 'fast',
  easing: 'ease',
}
export const SWITCH_TRACK_TRANSITION: ControlTransition = {
  properties: ['background-color', 'border-color'],
  duration: 'fast',
  easing: 'ease',
}
export const SWITCH_THUMB_TRANSITION: ControlTransition = {
  properties: ['transform', 'background-color'],
  duration: 'fast',
  easing: 'ease',
}
