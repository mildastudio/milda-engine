export type EasingCurve =
  | { kind: 'keyword'; keyword: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' }
  | { kind: 'cubicBezier'; points: [number, number, number, number] }
  | { kind: 'spring'; stiffness: number; damping: number; mass: number }

export interface EasingToken {
  id: string
  name: string
  curve: EasingCurve
}

export const DEFAULT_EASING_ID = 'standard'

export const EASINGS: EasingToken[] = [
  { id: 'standard', name: 'Standard', curve: { kind: 'cubicBezier', points: [0.2, 0, 0, 1] } },
  { id: 'decelerate', name: 'Decelerate', curve: { kind: 'cubicBezier', points: [0, 0, 0.2, 1] } },
  { id: 'accelerate', name: 'Accelerate', curve: { kind: 'cubicBezier', points: [0.4, 0, 1, 1] } },
  { id: 'linear', name: 'Linear', curve: { kind: 'keyword', keyword: 'linear' } },
  { id: 'ease', name: 'Ease', curve: { kind: 'keyword', keyword: 'ease' } },
  { id: 'ease-in-out', name: 'Ease in-out', curve: { kind: 'keyword', keyword: 'ease-in-out' } },
]

const BY_ID: Record<string, EasingToken> = Object.fromEntries(EASINGS.map((e) => [e.id, e]))

export function resolveEasing(id?: string): EasingCurve | undefined {
  return id ? BY_ID[id]?.curve : undefined
}

export function easingToCss(curve: EasingCurve | undefined): string | undefined {
  if (!curve) return undefined
  switch (curve.kind) {
    case 'keyword':
      return curve.keyword
    case 'cubicBezier':
      return `cubic-bezier(${curve.points.join(', ')})`
    case 'spring':
      return 'cubic-bezier(0.5, 1.5, 0.5, 1)'
  }
}

export function easingCss(id?: string): string | undefined {
  return easingToCss(resolveEasing(id))
}
