export type FontCategory = 'sans-serif' | 'serif' | 'monospace'

export type FontSource =
  | { kind: 'system'; stack: string }
  | { kind: 'google'; family: string; weights: number[]; italic: boolean; license: string }
  | { kind: 'custom'; faces: { weight: number; italic: boolean; assetId: string }[] }

export interface FontFamily {
  id: string
  name: string
  source: FontSource
  fallback: FontCategory
}

export interface SystemStack {
  label: string
  stack: string
  fallback: FontCategory
}
export const SYSTEM_STACKS: SystemStack[] = [
  {
    label: 'System Sans',
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fallback: 'sans-serif',
  },
  {
    label: 'System Serif',
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
    fallback: 'serif',
  },
  {
    label: 'System Mono',
    stack: 'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", Menlo, Consolas, monospace',
    fallback: 'monospace',
  },
]

export interface GoogleFont {
  family: string
  category: FontCategory
  weights: number[]
  license: string
}
export const GOOGLE_FONTS: GoogleFont[] = [
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700], license: 'OFL-1.1' },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700], license: 'Apache-2.0' },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 600, 700], license: 'OFL-1.1' },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700], license: 'OFL-1.1' },
  {
    family: 'Montserrat',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    license: 'OFL-1.1',
  },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700], license: 'OFL-1.1' },
  { family: 'Nunito', category: 'sans-serif', weights: [400, 600, 700], license: 'OFL-1.1' },
  { family: 'Work Sans', category: 'sans-serif', weights: [400, 500, 600], license: 'OFL-1.1' },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700], license: 'OFL-1.1' },
  { family: 'Manrope', category: 'sans-serif', weights: [400, 500, 600, 700], license: 'OFL-1.1' },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 500, 600, 700], license: 'OFL-1.1' },
  { family: 'IBM Plex Sans', category: 'sans-serif', weights: [400, 500, 600], license: 'OFL-1.1' },
  { family: 'Source Sans 3', category: 'sans-serif', weights: [400, 600, 700], license: 'OFL-1.1' },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 700], license: 'OFL-1.1' },
  { family: 'Merriweather', category: 'serif', weights: [400, 700], license: 'OFL-1.1' },
  { family: 'Playfair Display', category: 'serif', weights: [400, 600, 700], license: 'OFL-1.1' },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600], license: 'OFL-1.1' },
  { family: 'JetBrains Mono', category: 'monospace', weights: [400, 500, 700], license: 'OFL-1.1' },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [400, 500, 600], license: 'OFL-1.1' },
  { family: 'Roboto Mono', category: 'monospace', weights: [400, 500, 700], license: 'Apache-2.0' },
]

export function fontFamilyStack(fam: FontFamily): string {
  if (fam.source.kind === 'system') return fam.source.stack
  const name = fam.source.kind === 'google' ? fam.source.family : fam.name
  return `"${name}", ${fam.fallback}`
}

export function googleFontsCssUrl(family: string, weights: number[], italic: boolean): string {
  const fam = family.replace(/ /g, '+')
  const ws = [...new Set(weights)].sort((a, b) => a - b)
  const axis = italic
    ? `:ital,wght@${ws.map((w) => `0,${w}`).join(';')};${ws.map((w) => `1,${w}`).join(';')}`
    : `:wght@${ws.join(';')}`
  return `https://fonts.googleapis.com/css2?family=${fam}${axis}&display=swap`
}

export interface FontProvider {
  provider: 'Google Fonts'
  family: string
  license: string
}
export function fontProviders(fonts: FontFamily[] | undefined): FontProvider[] {
  const out: FontProvider[] = []
  const seen = new Set<string>()
  for (const f of fonts ?? []) {
    if (f.source.kind === 'google' && !seen.has(f.source.family)) {
      seen.add(f.source.family)
      out.push({ provider: 'Google Fonts', family: f.source.family, license: f.source.license })
    }
  }
  return out
}
