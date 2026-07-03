export type ScaleName =
  | 'radius'
  | 'spacing'
  | 'borderWidth'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'opacity'
  | 'elevation'
  | 'size'
  | 'duration'

export interface ScaleToken {
  id: string
  name: string
  value: string
}

const SHADOW = {
  sm: '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.12)',
  md: '0 4px 6px -1px rgba(0,0,0,0.12), 0 2px 4px -2px rgba(0,0,0,0.12)',
  lg: '0 12px 28px -8px rgba(0,0,0,0.28)',
}

export const SCALES: Record<ScaleName, ScaleToken[]> = {
  radius: [
    { id: 'none', name: 'None', value: '0' },
    { id: 'sm', name: 'Small', value: '4px' },
    { id: 'md', name: 'Medium', value: '8px' },
    { id: 'lg', name: 'Large', value: '12px' },
    { id: 'xl', name: 'X-Large', value: '16px' },
    { id: 'pill', name: 'Pill', value: '9999px' },
  ],
  spacing: [
    { id: 'none', name: 'None', value: '0' },
    { id: 'xs', name: 'XS', value: '4px' },
    { id: 'sm', name: 'SM', value: '8px' },
    { id: 'md', name: 'MD', value: '12px' },
    { id: 'lg', name: 'LG', value: '16px' },
    { id: 'xl', name: 'XL', value: '24px' },
    { id: '2xl', name: '2XL', value: '32px' },
  ],
  borderWidth: [
    { id: 'none', name: 'None', value: '0' },
    { id: 'hairline', name: 'Hairline', value: '1px' },
    { id: 'thin', name: 'Thin', value: '1.5px' },
    { id: 'thick', name: 'Thick', value: '3px' },
  ],
  fontSize: [
    { id: 'xs', name: 'XS', value: '12px' },
    { id: 'sm', name: 'SM', value: '13px' },
    { id: 'md', name: 'MD', value: '14px' },
    { id: 'lg', name: 'LG', value: '16px' },
    { id: 'xl', name: 'XL', value: '20px' },
    { id: '2xl', name: '2XL', value: '26px' },
  ],
  fontWeight: [
    { id: 'regular', name: 'Regular', value: '400' },
    { id: 'medium', name: 'Medium', value: '500' },
    { id: 'semibold', name: 'Semibold', value: '600' },
    { id: 'bold', name: 'Bold', value: '700' },
  ],

  lineHeight: [
    { id: 'none', name: 'None', value: '1' },
    { id: 'tight', name: 'Tight', value: '1.2' },
    { id: 'snug', name: 'Snug', value: '1.35' },
    { id: 'normal', name: 'Normal', value: '1.5' },
    { id: 'relaxed', name: 'Relaxed', value: '1.7' },
  ],

  letterSpacing: [
    { id: 'tighter', name: 'Tighter', value: '-0.02em' },
    { id: 'tight', name: 'Tight', value: '-0.01em' },
    { id: 'normal', name: 'Normal', value: '0' },
    { id: 'wide', name: 'Wide', value: '0.02em' },
    { id: 'wider', name: 'Wider', value: '0.05em' },
  ],
  opacity: [
    { id: 'full', name: '100%', value: '1' },
    { id: '90', name: '90%', value: '0.9' },
    { id: '75', name: '75%', value: '0.75' },
    { id: '50', name: '50%', value: '0.5' },
    { id: '25', name: '25%', value: '0.25' },
  ],
  elevation: [
    { id: 'none', name: 'None', value: 'none' },
    { id: 'sm', name: 'Small', value: SHADOW.sm },
    { id: 'md', name: 'Medium', value: SHADOW.md },
    { id: 'lg', name: 'Large', value: SHADOW.lg },
  ],

  size: [
    { id: 'xs', name: 'XS', value: '96px' },
    { id: 'sm', name: 'SM', value: '160px' },
    { id: 'md', name: 'MD', value: '240px' },
    { id: 'lg', name: 'LG', value: '320px' },
    { id: 'xl', name: 'XL', value: '480px' },
    { id: '2xl', name: '2XL', value: '640px' },
  ],

  duration: [
    { id: 'instant', name: 'Instant', value: '0ms' },
    { id: 'fast', name: 'Fast', value: '120ms' },
    { id: 'base', name: 'Base', value: '180ms' },
    { id: 'slow', name: 'Slow', value: '280ms' },
    { id: 'slower', name: 'Slower', value: '420ms' },
  ],
}

const BY_ID: Record<ScaleName, Record<string, string>> = Object.fromEntries(
  (Object.keys(SCALES) as ScaleName[]).map((scale) => [
    scale,
    Object.fromEntries(SCALES[scale].map((t) => [t.id, t.value])),
  ]),
) as Record<ScaleName, Record<string, string>>

export function resolveScaleToken(scale: ScaleName, id?: string): string | undefined {
  return id ? BY_ID[scale]?.[id] : undefined
}
