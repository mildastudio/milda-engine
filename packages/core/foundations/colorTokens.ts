export type ColorLayer = 'semantic' | 'primitive'

export interface ColorToken {
  id: string
  name: string
  value: string
  layer: ColorLayer
  group?: string
  alias?: string
}

export const COLOR_GROUPS: { id: string; name: string; parent: string | null }[] = [
  { id: 'neutral', name: 'Neutral', parent: null },
  { id: 'violet', name: 'Violet', parent: null },
  { id: 'teal', name: 'Teal', parent: null },
  { id: 'status', name: 'Status', parent: null },
  { id: 'green', name: 'Green', parent: 'status' },
  { id: 'amber', name: 'Amber', parent: 'status' },
  { id: 'red', name: 'Red', parent: 'status' },
  { id: 'blue', name: 'Blue', parent: 'status' },
]

type Ramp = { group: string; prefix: string; steps: [string, string][] }

const RAMPS: Ramp[] = [
  {
    group: 'neutral',
    prefix: 'gray',
    steps: [
      ['50', '#f8fafc'],
      ['100', '#f1f5f9'],
      ['200', '#e2e8f0'],
      ['300', '#cbd5e1'],
      ['400', '#94a3b8'],
      ['500', '#64748b'],
      ['600', '#475569'],
      ['700', '#334155'],
      ['800', '#1e293b'],
      ['900', '#0f172a'],
      ['950', '#020617'],
    ],
  },
  {
    group: 'violet',
    prefix: 'violet',
    steps: [
      ['50', '#f5f3ff'],
      ['100', '#ede9fe'],
      ['200', '#ddd6fe'],
      ['300', '#c4b5fd'],
      ['400', '#a78bfa'],
      ['500', '#7c3aed'],
      ['600', '#6d28d9'],
      ['700', '#5b21b6'],
      ['800', '#4c1d95'],
      ['900', '#3b1772'],
      ['950', '#2e1065'],
    ],
  },
  {
    group: 'teal',
    prefix: 'teal',
    steps: [
      ['50', '#f0fdfa'],
      ['100', '#ccfbf1'],
      ['200', '#99f6e4'],
      ['300', '#5eead4'],
      ['400', '#2dd4bf'],
      ['500', '#14b8a6'],
      ['600', '#0d9488'],
      ['700', '#0f766e'],
      ['800', '#115e59'],
      ['900', '#134e4a'],
      ['950', '#042f2e'],
    ],
  },
  {
    group: 'green',
    prefix: 'green',
    steps: [
      ['50', '#f0fdf4'],
      ['100', '#dcfce7'],
      ['200', '#bbf7d0'],
      ['300', '#86efac'],
      ['400', '#4ade80'],
      ['500', '#16a34a'],
      ['600', '#15803d'],
      ['700', '#166534'],
      ['800', '#14532d'],
      ['900', '#0f3d23'],
      ['950', '#052e16'],
    ],
  },
  {
    group: 'amber',
    prefix: 'amber',
    steps: [
      ['50', '#fffbeb'],
      ['100', '#fef3c7'],
      ['200', '#fde68a'],
      ['300', '#fcd34d'],
      ['400', '#fbbf24'],
      ['500', '#f59e0b'],
      ['600', '#d97706'],
      ['700', '#b45309'],
      ['800', '#92400e'],
      ['900', '#78350f'],
      ['950', '#451a03'],
    ],
  },
  {
    group: 'red',
    prefix: 'red',
    steps: [
      ['50', '#fef2f2'],
      ['100', '#fee2e2'],
      ['200', '#fecaca'],
      ['300', '#fca5a5'],
      ['400', '#f87171'],
      ['500', '#dc2626'],
      ['600', '#b91c1c'],
      ['700', '#991b1b'],
      ['800', '#7f1d1d'],
      ['900', '#671818'],
      ['950', '#450a0a'],
    ],
  },
  {
    group: 'blue',
    prefix: 'blue',
    steps: [
      ['50', '#eff6ff'],
      ['100', '#dbeafe'],
      ['200', '#bfdbfe'],
      ['300', '#93c5fd'],
      ['400', '#60a5fa'],
      ['500', '#3b82f6'],
      ['600', '#2563eb'],
      ['700', '#1d4ed8'],
      ['800', '#1e40af'],
      ['900', '#1e3a8a'],
      ['950', '#172554'],
    ],
  },
]

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const PRIMITIVE: ColorToken[] = [
  { id: 'white', name: 'White', value: '#ffffff', layer: 'primitive', group: 'neutral' },
  ...RAMPS.flatMap((ramp) =>
    ramp.steps.map(([step, value]) => ({
      id: `${ramp.prefix}-${step}`,
      name: `${titleCase(ramp.prefix)} ${step}`,
      value,
      layer: 'primitive' as const,
      group: ramp.group,
    })),
  ),
  { id: 'black', name: 'Black', value: '#000000', layer: 'primitive', group: 'neutral' },
]

const P: Record<string, string> = Object.fromEntries(PRIMITIVE.map((t) => [t.id, t.value]))

const sem = (id: string, name: string, alias: string): ColorToken => ({
  id,
  name,
  value: P[alias],
  layer: 'semantic',
  alias,
})

const SEMANTIC: ColorToken[] = [
  sem('accent', 'Accent', 'violet-500'),
  sem('accent-strong', 'Accent strong', 'violet-600'),
  sem('accent-subtle', 'Accent subtle', 'violet-50'),
  sem('on-accent', 'On accent', 'white'),

  sem('background', 'Background', 'gray-50'),
  sem('surface', 'Surface', 'white'),
  sem('surface-raised', 'Surface raised', 'white'),
  sem('surface-sunken', 'Surface sunken', 'gray-100'),

  sem('text', 'Text', 'gray-900'),
  sem('text-muted', 'Text muted', 'gray-500'),
  sem('text-subtle', 'Text subtle', 'gray-400'),

  sem('border', 'Border', 'gray-200'),
  sem('border-strong', 'Border strong', 'gray-300'),
  sem('ring', 'Ring', 'violet-500'),

  sem('success', 'Success', 'green-500'),
  sem('on-success', 'On success', 'white'),
  sem('success-subtle', 'Success subtle', 'green-50'),

  sem('warning', 'Warning', 'amber-500'),
  sem('on-warning', 'On warning', 'gray-900'),
  sem('warning-subtle', 'Warning subtle', 'amber-50'),

  sem('danger', 'Danger', 'red-500'),
  sem('on-danger', 'On danger', 'white'),
  sem('danger-subtle', 'Danger subtle', 'red-50'),

  sem('info', 'Info', 'blue-500'),
  sem('on-info', 'On info', 'white'),
  sem('info-subtle', 'Info subtle', 'blue-50'),
]

export const COLOR_TOKENS: ColorToken[] = [...SEMANTIC, ...PRIMITIVE]

const BY_ID: Record<string, ColorToken> = Object.fromEntries(COLOR_TOKENS.map((t) => [t.id, t]))

export const COLOR_TOKEN_LAYERS: { layer: ColorLayer; label: string; tokens: ColorToken[] }[] = [
  { layer: 'semantic', label: 'Semantic', tokens: SEMANTIC },
  { layer: 'primitive', label: 'Primitive', tokens: PRIMITIVE },
]

export function resolveColorToken(id?: string): string | undefined {
  return id ? BY_ID[id]?.value : undefined
}

export function colorTokenName(id?: string): string | undefined {
  return id ? BY_ID[id]?.name : undefined
}
