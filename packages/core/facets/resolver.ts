import type {
  DocumentFoundations,
  GradientValue,
  Layer,
  Slot,
  TextStyleValue,
  Token,
  TokenType,
  TokenValue,
} from '../foundations/document'
import { fontFamilyStack } from '../foundations/typography'
import { easingToCss } from '../foundations/easing'

export interface TokenResolverContext {
  contextSelections: Record<string, string>
}

export function findToken(f: DocumentFoundations, id: string, type?: TokenType): Token | undefined {
  const layers = [...f.layers].sort((a, b) => a.order - b.order)
  for (const layer of layers) {
    const t = layer.tokens.find((t) => t.id === id && (type === undefined || t.type === type))
    if (t) return t
  }
  return undefined
}

function activeSlot(v: TokenValue, context?: TokenResolverContext): Slot | undefined {
  if (v.kind === 'fixed') return v.slot
  const selected = context?.contextSelections[v.by]
  const fromSelected = selected !== undefined ? v.slots[selected] : undefined
  return fromSelected ?? v.slots.default ?? Object.values(v.slots)[0]
}

export function tokenVaries(token: Token): boolean {
  return token.value.kind === 'byContext'
}

export function slotsEqual(a: Slot, b: Slot): boolean {
  if ('raw' in a && 'raw' in b) return a.raw === b.raw
  if ('ref' in a && 'ref' in b) return a.ref === b.ref
  if ('gradient' in a && 'gradient' in b) return gradientsEqual(a.gradient, b.gradient)
  if ('textStyle' in a && 'textStyle' in b) return textStylesEqual(a.textStyle, b.textStyle)
  if ('easing' in a && 'easing' in b) return easingToCss(a.easing) === easingToCss(b.easing)
  return false
}

function gradientsEqual(a: GradientValue, b: GradientValue): boolean {
  return (
    a.kind === b.kind &&
    (a.angle ?? 0) === (b.angle ?? 0) &&
    a.stops.length === b.stops.length &&
    a.stops.every(
      (s, i) => s.position === b.stops[i].position && slotsEqual(s.color, b.stops[i].color),
    )
  )
}

function textStylesEqual(a: TextStyleValue, b: TextStyleValue): boolean {
  return (
    a.family === b.family &&
    slotsEqual(a.size, b.size) &&
    slotsEqual(a.weight, b.weight) &&
    slotsEqual(a.lineHeight, b.lineHeight) &&
    slotsEqual(a.letterSpacing, b.letterSpacing)
  )
}

export function setTokenSlot(
  token: Token,
  byGroupId: string,
  contextIds: string[],
  editContextId: string,
  slot: Slot,
): TokenValue {
  const cur = token.value
  const base: Record<string, Slot> = {}
  if (cur.kind === 'byContext' && cur.by === byGroupId) {
    for (const c of contextIds) base[c] = cur.slots[c] ?? cur.slots.default ?? slot
  } else {
    const fixed =
      cur.kind === 'fixed' ? cur.slot : (cur.slots.default ?? Object.values(cur.slots)[0] ?? slot)
    for (const c of contextIds) base[c] = fixed
  }
  base[editContextId] = slot

  const first = base[contextIds[0]]
  if (first && contextIds.every((c) => slotsEqual(base[c], first))) {
    return { kind: 'fixed', slot }
  }
  return { kind: 'byContext', by: byGroupId, slots: { ...base, default: base[contextIds[0]] } }
}

export function resolveToken(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
  seen: Set<string> = new Set(),
): string | undefined {
  if (!id) return undefined
  const key = `${type ?? ''}:${id}`
  if (seen.has(key)) return undefined
  seen.add(key)

  const token = findToken(f, id, type)
  if (!token) return undefined

  const slot = activeSlot(token.value, context)
  if (!slot) return undefined

  if ('raw' in slot) return slot.raw
  if ('ref' in slot) return resolveToken(slot.ref, f, context, token.type, seen)

  if ('gradient' in slot) return resolveGradient(slot.gradient, f, context)

  if ('easing' in slot) return easingToCss(slot.easing)

  return undefined
}

export function resolveGradient(
  g: GradientValue,
  f: DocumentFoundations,
  context?: TokenResolverContext,
): string {
  const colorOf = (s: Slot): string | undefined =>
    'raw' in s ? s.raw : 'ref' in s ? resolveToken(s.ref, f, context, 'color') : undefined
  const stops = g.stops
    .map((s) => {
      const color = colorOf(s.color)
      return color ? `${color} ${s.position}%` : null
    })
    .filter((s): s is string => s !== null)
  if (stops.length === 0) return 'none'
  if (g.kind === 'linear') return `linear-gradient(${g.angle ?? 180}deg, ${stops.join(', ')})`
  if (g.kind === 'radial') return `radial-gradient(circle, ${stops.join(', ')})`
  return `conic-gradient(from ${g.angle ?? 0}deg, ${stops.join(', ')})`
}

export interface ResolvedTextStyle {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  letterSpacing?: string
}

export function resolveTextStyle(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
): ResolvedTextStyle | undefined {
  if (!id) return undefined
  const token = findToken(f, id, 'textStyle')
  if (!token) return undefined
  const slot = activeSlot(token.value, context)
  if (!slot || !('textStyle' in slot)) return undefined
  const ts = slot.textStyle
  const leaf = (s: Slot, type: TokenType) =>
    'raw' in s ? s.raw : 'ref' in s ? resolveToken(s.ref, f, context, type) : undefined
  const fam = f.fonts?.find((font) => font.id === ts.family)
  return {
    fontFamily: fam ? fontFamilyStack(fam) : undefined,
    fontSize: leaf(ts.size, 'fontSize'),
    fontWeight: leaf(ts.weight, 'fontWeight'),
    lineHeight: leaf(ts.lineHeight, 'lineHeight'),
    letterSpacing: leaf(ts.letterSpacing, 'letterSpacing'),
  }
}

export function makeContextResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
) {
  return (id?: string): string | undefined => resolveToken(id, f, context, type)
}

export function defaultContextSelections(f: DocumentFoundations): Record<string, string> {
  const selections: Record<string, string> = {}
  for (const group of f.contextGroups) {
    if (group.contexts.length > 0) selections[group.id] = group.contexts[0].id
  }
  return selections
}

export interface TokenLayerGroup {
  layer: Layer
  tokens: Token[]
}

export function tokensByType(f: DocumentFoundations, type: TokenType): TokenLayerGroup[] {
  return [...f.layers]
    .sort((a, b) => a.order - b.order)
    .map((layer) => ({ layer, tokens: layer.tokens.filter((t) => t.type === type) }))
    .filter((g) => g.tokens.length > 0)
}
