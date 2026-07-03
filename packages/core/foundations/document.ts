import { COLOR_TOKENS, COLOR_GROUPS } from './colorTokens'
import { SCALES, type ScaleName } from './scales'
import { EASINGS, type EasingCurve } from './easing'
import type { NamingConvention } from './naming'
import { canonicalLength, isLengthType } from './dimensions'
import { SYSTEM_STACKS, type FontFamily } from './typography'
import { ICON_SETS, type IconLibrary } from './icons'

export type TokenType = 'color' | ScaleName | 'gradient' | 'textStyle' | 'easing'

export const COMPOSITE_TYPES = ['gradient', 'textStyle', 'easing'] as const
export function isCompositeType(
  type: TokenType | string,
): type is 'gradient' | 'textStyle' | 'easing' {
  return type === 'gradient' || type === 'textStyle' || type === 'easing'
}

export type Slot =
  | { raw: string }
  | { ref: string }
  | { gradient: GradientValue }
  | { textStyle: TextStyleValue }
  | { easing: EasingValue }

export type GradientKind = 'linear' | 'radial' | 'conic'

export interface GradientStop {
  color: Slot
  position: number
}
export interface GradientValue {
  kind: GradientKind
  angle?: number
  stops: GradientStop[]
}

export interface TextStyleValue {
  family: string
  size: Slot
  weight: Slot
  lineHeight: Slot
  letterSpacing: Slot
}

export type EasingValue = EasingCurve

export type TokenValue =
  | { kind: 'fixed'; slot: Slot }
  | { kind: 'byContext'; by: string; slots: Record<string, Slot> }

export interface Token {
  id: string
  name: string
  type: TokenType
  value: TokenValue
  description?: string
  group?: string | null
  order?: number
}

export function defaultSlotForType(type: TokenType, rawDefault: string, fontId?: string): Slot {
  if (type === 'gradient') {
    return {
      gradient: {
        kind: 'linear',
        angle: 90,
        stops: [
          { color: { raw: '#7c3aed' }, position: 0 },
          { color: { raw: '#2563eb' }, position: 100 },
        ],
      },
    }
  }
  if (type === 'textStyle') {
    return {
      textStyle: {
        family: fontId ?? '',
        size: { raw: '16' },
        weight: { raw: '400' },
        lineHeight: { raw: '1.5' },
        letterSpacing: { raw: '0' },
      },
    }
  }
  if (type === 'easing') {
    return { easing: { kind: 'cubicBezier', points: [0.2, 0, 0, 1] } }
  }
  return { raw: rawDefault }
}

export interface Context {
  id: string
  name: string
}

export interface ContextGroup {
  id: string
  name: string
  contexts: Context[]
}

export interface TokenGroup {
  id: string
  name: string
  parent: string | null
  order: number
  type?: TokenType
}

export interface Layer {
  id: string
  name: string
  order: number
  tokens: Token[]
  groups: TokenGroup[]
}

export interface DocumentFoundations {
  contextGroups: ContextGroup[]
  layers: Layer[]
  naming?: NamingConvention
  fonts?: FontFamily[]
  icons?: IconLibrary
}

const raw = (value: string): TokenValue => ({ kind: 'fixed', slot: { raw: value } })
const ref = (id: string): TokenValue => ({ kind: 'fixed', slot: { ref: id } })
const byScheme = (light: string, dark: string): TokenValue => ({
  kind: 'byContext',
  by: 'ColorScheme',
  slots: { light: { ref: light }, dark: { ref: dark }, default: { ref: light } },
})

const easingVal = (curve: EasingCurve): TokenValue => ({ kind: 'fixed', slot: { easing: curve } })

const withOrder = (tokens: Omit<Token, 'group' | 'order'>[]): Token[] =>
  tokens.map((t, i) => ({ ...t, group: null, order: i }))

function easingSeedTokens(): Omit<Token, 'group' | 'order'>[] {
  return EASINGS.map((e) => ({
    id: e.id,
    name: e.name,
    type: 'easing' as const,
    value: easingVal(e.curve),
  }))
}
function durationSeedTokens(): Omit<Token, 'group' | 'order'>[] {
  return SCALES.duration.map((t) => ({
    id: t.id,
    name: t.name,
    type: 'duration' as const,
    value: raw(t.value),
  }))
}

function backfillMotionTokens(f: DocumentFoundations): DocumentFoundations {
  const has = (type: TokenType) => f.layers.some((l) => l.tokens.some((t) => t.type === type))
  const seed: Omit<Token, 'group' | 'order'>[] = [
    ...(has('duration') ? [] : durationSeedTokens()),
    ...(has('easing') ? [] : easingSeedTokens()),
  ]
  if (seed.length === 0 || f.layers.length === 0) return f

  const sorted = [...f.layers].sort((a, b) => a.order - b.order)
  const isScale = (t: Token) => !isCompositeType(t.type) && t.type !== 'color'
  const target =
    sorted.find((l) => l.tokens.some(isScale)) ??
    sorted.find((l) => l.id === 'semantic') ??
    sorted[sorted.length - 1]

  const startOrder = target.tokens.reduce((m, t) => Math.max(m, t.order ?? 0), -1) + 1
  const added: Token[] = seed.map((t, i) => ({ ...t, group: null, order: startOrder + i }))
  return {
    ...f,
    layers: f.layers.map((l) =>
      l.id === target.id ? { ...l, tokens: [...l.tokens, ...added] } : l,
    ),
  }
}

function buildBaseColors(): { tokens: Token[]; groups: TokenGroup[] } {
  const perParent: Record<string, number> = {}
  const groups: TokenGroup[] = COLOR_GROUPS.map((g) => {
    const key = g.parent ?? '__root'
    const order = ((perParent[key] ??= 0), perParent[key]++)
    return { id: g.id, name: g.name, parent: g.parent, order, type: 'color' as const }
  })

  const perGroup: Record<string, number> = {}
  const tokens: Token[] = COLOR_TOKENS.filter((t) => t.layer === 'primitive').map((t) => {
    const group = t.group ?? null
    const order = ((perGroup[group ?? '__root'] ??= 0), perGroup[group ?? '__root']++)
    return { id: t.id, name: t.name, type: 'color' as const, value: raw(t.value), group, order }
  })

  return { tokens, groups }
}

const colorSchemeGroup = (): ContextGroup => ({
  id: 'ColorScheme',
  name: 'Color scheme',
  contexts: [
    { id: 'light', name: 'Light' },
    { id: 'dark', name: 'Dark' },
  ],
})

export function defaultFoundations(): DocumentFoundations {
  const base = buildBaseColors()

  const semanticColors: Omit<Token, 'group' | 'order'>[] = [
    { id: 'accent', name: 'Accent', type: 'color', value: raw('#3F4A6B') },
    {
      id: 'accent-strong',
      name: 'Accent strong',
      type: 'color',
      value: byScheme('violet-600', 'violet-300'),
    },
    {
      id: 'accent-subtle',
      name: 'Accent subtle',
      type: 'color',
      value: byScheme('violet-50', 'violet-900'),
    },
    { id: 'on-accent', name: 'On accent', type: 'color', value: ref('white') },

    { id: 'background', name: 'Background', type: 'color', value: byScheme('gray-50', 'gray-950') },
    { id: 'surface', name: 'Surface', type: 'color', value: byScheme('white', 'gray-900') },
    {
      id: 'surface-raised',
      name: 'Surface raised',
      type: 'color',
      value: byScheme('white', 'gray-800'),
    },
    {
      id: 'surface-sunken',
      name: 'Surface sunken',
      type: 'color',
      value: byScheme('gray-100', 'gray-950'),
    },

    { id: 'text', name: 'Text', type: 'color', value: byScheme('gray-900', 'gray-50') },
    {
      id: 'text-muted',
      name: 'Text muted',
      type: 'color',
      value: byScheme('gray-500', 'gray-400'),
    },
    {
      id: 'text-subtle',
      name: 'Text subtle',
      type: 'color',
      value: byScheme('gray-400', 'gray-500'),
    },

    { id: 'border', name: 'Border', type: 'color', value: byScheme('gray-200', 'gray-800') },
    {
      id: 'border-strong',
      name: 'Border strong',
      type: 'color',
      value: byScheme('gray-300', 'gray-700'),
    },
    { id: 'ring', name: 'Ring', type: 'color', value: ref('violet-500') },

    { id: 'success', name: 'Success', type: 'color', value: ref('green-500') },
    { id: 'on-success', name: 'On success', type: 'color', value: ref('white') },
    {
      id: 'success-subtle',
      name: 'Success subtle',
      type: 'color',
      value: byScheme('green-50', 'green-900'),
    },

    { id: 'warning', name: 'Warning', type: 'color', value: ref('amber-500') },
    { id: 'on-warning', name: 'On warning', type: 'color', value: ref('gray-900') },
    {
      id: 'warning-subtle',
      name: 'Warning subtle',
      type: 'color',
      value: byScheme('amber-50', 'amber-900'),
    },

    { id: 'danger', name: 'Danger', type: 'color', value: ref('red-500') },
    { id: 'on-danger', name: 'On danger', type: 'color', value: ref('white') },
    {
      id: 'danger-subtle',
      name: 'Danger subtle',
      type: 'color',
      value: byScheme('red-50', 'red-900'),
    },

    { id: 'info', name: 'Info', type: 'color', value: ref('blue-500') },
    { id: 'on-info', name: 'On info', type: 'color', value: ref('white') },
    {
      id: 'info-subtle',
      name: 'Info subtle',
      type: 'color',
      value: byScheme('blue-50', 'blue-900'),
    },
  ]

  const scaleTokens: Omit<Token, 'group' | 'order'>[] = (
    Object.keys(SCALES) as ScaleName[]
  ).flatMap((scale) =>
    SCALES[scale].map((t) => ({
      id: t.id,
      name: t.name,
      type: scale,
      value: raw(isLengthType(scale) ? canonicalLength(t.value) : t.value),
    })),
  )

  return {
    contextGroups: [colorSchemeGroup()],
    layers: [
      { id: 'base', name: 'Base', order: 0, tokens: base.tokens, groups: base.groups },
      {
        id: 'semantic',
        name: 'Semantic',
        order: 1,
        tokens: withOrder([...semanticColors, ...scaleTokens, ...easingSeedTokens()]),
        groups: [],
      },
      { id: 'component', name: 'Component', order: 2, tokens: [], groups: [] },
    ],
    fonts: [
      {
        id: 'body',
        name: 'Body',
        source: { kind: 'system', stack: SYSTEM_STACKS[0].stack },
        fallback: 'sans-serif',
      },
    ],
    icons: { sets: [{ id: 'lucide', ...ICON_SETS[0] }], icons: [] },
  }
}

export function emptyFoundations(): DocumentFoundations {
  return { contextGroups: [], layers: [], fonts: [], icons: { sets: [], icons: [] } }
}

interface LegacyColorToken {
  id: string
  name: string
  value: string
  layer?: 'semantic' | 'primitive'
  alias?: string
}

function normalizeValue(v: unknown): TokenValue {
  const val = v as {
    kind?: string
    value?: string
    by?: string
    refs?: Record<string, string>
    slot?: Slot
    slots?: Record<string, Slot>
  }
  if (val && (val.kind === 'fixed' || val.kind === 'byContext')) return val as TokenValue
  if (val && val.kind === 'alias' && val.refs) {
    const slots: Record<string, Slot> = {}
    for (const [ctx, refId] of Object.entries(val.refs)) slots[ctx] = { ref: refId }
    return { kind: 'byContext', by: val.by ?? 'ColorScheme', slots }
  }

  return { kind: 'fixed', slot: { raw: val?.value ?? '' } }
}

function canonicalizeValue(type: TokenType, v: TokenValue): TokenValue {
  if (!isLengthType(type)) return v
  if (v.kind === 'fixed') {
    return 'raw' in v.slot ? { kind: 'fixed', slot: { raw: canonicalLength(v.slot.raw) } } : v
  }
  const slots: Record<string, Slot> = {}
  for (const [k, slot] of Object.entries(v.slots)) {
    slots[k] = 'raw' in slot ? { raw: canonicalLength(slot.raw) } : slot
  }
  return { kind: 'byContext', by: v.by, slots }
}

function normalizeLayer(layer: Layer): Layer {
  return {
    id: layer.id,
    name: layer.name,
    order: layer.order,
    groups: Array.isArray(layer.groups) ? layer.groups : [],
    tokens: (layer.tokens ?? []).map((t, i) => ({
      ...t,
      value: canonicalizeValue(t.type, normalizeValue(t.value)),
      group: t.group ?? null,
      order: typeof t.order === 'number' ? t.order : i,
    })),
  }
}

export function migrateFoundations(f: unknown): DocumentFoundations {
  const any = f as Partial<DocumentFoundations> & {
    colors?: LegacyColorToken[]
    scales?: Record<string, { id: string; name: string; value: string }[]>
  }

  if (any && Array.isArray(any.layers)) {
    return backfillMotionTokens({
      contextGroups: Array.isArray(any.contextGroups) ? any.contextGroups : [],
      layers: any.layers.map(normalizeLayer),
      naming: any.naming,
      fonts: Array.isArray(any.fonts) ? any.fonts : [],
      icons: any.icons && Array.isArray(any.icons.sets) ? any.icons : { sets: [], icons: [] },
    })
  }

  if (!any || (!any.colors && !any.scales)) return defaultFoundations()

  const colors = any.colors ?? []
  const seed = defaultFoundations()

  const seedBase = seed.layers.find((l) => l.id === 'base')?.tokens ?? []
  const baseById = new Map<string, Token>(seedBase.map((t) => [t.id, { ...t }]))
  for (const t of colors.filter((t) => t.layer === 'primitive')) {
    baseById.set(t.id, { id: t.id, name: t.name, type: 'color', value: raw(t.value) })
  }
  const base = withOrder(
    [...baseById.values()].map(({ id, name, type, value }) => ({ id, name, type, value })),
  )

  const seedSemantic = new Map<string, TokenValue>()
  for (const layer of seed.layers) {
    for (const tok of layer.tokens) {
      if (tok.type === 'color' && tok.value.kind === 'byContext')
        seedSemantic.set(tok.id, tok.value)
    }
  }

  const semantics: Omit<Token, 'group' | 'order'>[] = colors
    .filter((t) => t.layer !== 'primitive')
    .map((t) => {
      const known = seedSemantic.get(t.id)
      return {
        id: t.id,
        name: t.name,
        type: 'color' as const,
        value: known ? known : t.alias ? ref(t.alias) : raw(t.value),
      }
    })

  const scaleTokens: Omit<Token, 'group' | 'order'>[] = Object.entries(any.scales ?? {}).flatMap(
    ([scale, tokens]) =>
      (tokens ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        type: scale as TokenType,
        value: raw(isLengthType(scale as TokenType) ? canonicalLength(t.value) : t.value),
      })),
  )

  return {
    contextGroups: [colorSchemeGroup()],
    layers: [
      { id: 'base', name: 'Base', order: 0, tokens: base, groups: [] },
      {
        id: 'semantic',
        name: 'Semantic',
        order: 1,
        tokens: withOrder([...semantics, ...scaleTokens]),
        groups: [],
      },
      { id: 'component', name: 'Component', order: 2, tokens: [], groups: [] },
    ],
    fonts: [
      {
        id: 'body',
        name: 'Body',
        source: { kind: 'system', stack: SYSTEM_STACKS[0].stack },
        fallback: 'sans-serif',
      },
    ],
    icons: { sets: [{ id: 'lucide', ...ICON_SETS[0] }], icons: [] },
  }
}
