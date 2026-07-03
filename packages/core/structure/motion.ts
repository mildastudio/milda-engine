import type { NodeMotion } from './types'
import type { StyleDecl } from '../facets/facets'
import { DEFAULT_EASING_ID } from '../foundations/easing'

const FACET_TRANSITION_PROPS: Record<string, string[]> = {
  fill: ['background-color'],
  ink: ['color'],
  corner: ['border-radius'],
  inset: ['padding'],
  gap: ['gap'],
  opacity: ['opacity'],
  elevation: ['box-shadow'],
  ring: ['outline-color', 'outline-offset'],
  'border.color': ['border-color'],
  'border.width': ['border-width'],
  'text.size': ['font-size'],
  'text.weight': ['font-weight'],
}

function transitionProperties(facets?: string[]): string[] {
  if (!facets || facets.length === 0) return ['all']
  const out: string[] = []
  for (const f of facets) {
    for (const p of FACET_TRANSITION_PROPS[f] ?? []) {
      if (!out.includes(p)) out.push(p)
    }
  }
  return out.length ? out : ['all']
}

const layer = (prop: string, duration: string, easing?: string, delay?: string): string =>
  [prop, duration, easing, delay].filter(Boolean).join(' ')

export function motionDecls(
  motion: NodeMotion | undefined,
  resolveDuration: (id?: string) => string | undefined,
  resolveEasing: (id?: string) => string | undefined,
): StyleDecl[] {
  const transitions = motion?.transitions ?? []
  if (!transitions.length) return []

  const layers: string[] = []
  for (const t of transitions) {
    const duration = resolveDuration(t.duration)
    if (!duration) continue
    const easing = resolveEasing(t.easing ?? DEFAULT_EASING_ID)
    const delay = t.delay ? resolveDuration(t.delay) : undefined
    for (const prop of transitionProperties(t.facets)) {
      layers.push(layer(prop, duration, easing, delay))
    }
  }
  return layers.length ? [{ prop: 'transition', value: layers.join(', ') }] : []
}

export function timingTransitionDecl(
  properties: string[],
  durationId: string,
  easingId: string,
  resolveDuration: (id?: string) => string | undefined,
  resolveEasing: (id?: string) => string | undefined,
): StyleDecl | undefined {
  const duration = resolveDuration(durationId)
  if (!duration || properties.length === 0) return undefined
  const easing = resolveEasing(easingId)
  return { prop: 'transition', value: properties.map((p) => layer(p, duration, easing)).join(', ') }
}
