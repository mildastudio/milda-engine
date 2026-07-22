import {
  canonicalLength,
  defaultContextSelections,
  easingToCss,
  findToken,
  isLengthType,
  resolveGradient,
  resolveTextStyle,
  type DocumentFoundations,
  type Layer,
  type Slot,
  type Token,
  type TokenType,
} from '@mildastudio/core'
import { parseColor, type Rgba } from './color'

export interface ExportMode {
  id: string
  name: string
}

export interface ExportRef {
  collection: string
  name: string
}

export type ExportValue =
  | { kind: 'color'; rgba: Rgba; hex: string }
  | { kind: 'number'; value: number; css: string }
  | { kind: 'string'; value: string }
  | { kind: 'alias'; ref: ExportRef }
  | { kind: 'composite'; dtcgType: 'gradient' | 'typography'; dtcgValue: unknown; css: string }

export type FigmaVarType = 'COLOR' | 'FLOAT' | 'STRING'

export interface ExportVariable {
  name: string
  tokenId: string
  tokenType: TokenType

  figmaType: FigmaVarType | null
  dtcgType: string
  byMode: Record<string, ExportValue>
  description?: string
}

export interface ExportCollection {
  id: string
  name: string
  variables: ExportVariable[]
}

export interface TokenExport {
  modes: ExportMode[]

  modeGroupId: string | null
  collections: ExportCollection[]

  skipped: { name: string; reason: string }[]
}

export function variableName(token: Token): string {
  return `${token.type}/${token.id}`
}

function dtcgType(type: TokenType): string {
  if (type === 'color') return 'color'
  if (type === 'gradient') return 'gradient'
  if (type === 'textStyle') return 'typography'
  if (type === 'fontWeight') return 'fontWeight'
  if (type === 'lineHeight' || type === 'opacity') return 'number'
  if (type === 'elevation') return 'shadow'
  if (isLengthType(type)) return 'dimension'
  return 'number'
}

function figmaType(type: TokenType): FigmaVarType | null {
  if (type === 'color') return 'COLOR'
  if (type === 'gradient' || type === 'textStyle') return null
  // Both resolve to a raw CSS string (box-shadow / cubic-bezier(...)), never a
  // number — declaring them FLOAT (the catch-all below) made the plugin's
  // setValueForMode reject the string value as a resolved-type mismatch.
  if (type === 'elevation' || type === 'easing') return 'STRING'
  return 'FLOAT'
}

function layerOfToken(
  foundations: DocumentFoundations,
  id: string,
  type: TokenType,
  fallback: string,
): string {
  for (const layer of foundations.layers) {
    if (layer.tokens.some((t) => t.id === id && t.type === type)) return layer.id
  }
  return fallback
}

function slotToValue(
  slot: Slot,
  token: Token,
  foundations: DocumentFoundations,
  collectionId: string,
  context: { contextSelections: Record<string, string> },
): ExportValue | null {
  if ('ref' in slot) {
    const targetCollection = layerOfToken(foundations, slot.ref, token.type, collectionId)
    return {
      kind: 'alias',
      ref: { collection: targetCollection, name: `${token.type}/${slot.ref}` },
    }
  }
  if ('gradient' in slot) {
    const css = resolveGradient(slot.gradient, foundations, context)
    return { kind: 'composite', dtcgType: 'gradient', dtcgValue: slot.gradient, css }
  }
  if ('textStyle' in slot) {
    const ts = resolveTextStyle(token.id, foundations, context)
    return {
      kind: 'composite',
      dtcgType: 'typography',
      dtcgValue: ts ?? {},
      css: ts?.fontFamily ?? '',
    }
  }
  if ('easing' in slot) {
    return { kind: 'string', value: easingToCss(slot.easing) ?? '' }
  }

  const raw = slot.raw
  if (token.type === 'color') {
    const rgba = parseColor(raw)
    if (!rgba) return null
    return { kind: 'color', rgba, hex: raw }
  }
  if (token.type === 'elevation') return { kind: 'string', value: raw }
  if (isLengthType(token.type)) {
    const dp = canonicalLength(raw)
    const n = parseFloat(dp)
    if (Number.isNaN(n)) return { kind: 'string', value: raw }
    return { kind: 'number', value: n, css: `${n}px` }
  }
  const n = parseFloat(raw)
  if (Number.isNaN(n)) return { kind: 'string', value: raw }
  return { kind: 'number', value: n, css: raw }
}

function slotForMode(token: Token, modeGroupId: string | null, modeId: string): Slot {
  const v = token.value
  if (v.kind === 'fixed') return v.slot
  if (modeGroupId && v.by === modeGroupId) {
    return v.slots[modeId] ?? v.slots.default ?? Object.values(v.slots)[0]
  }
  return v.slots.default ?? Object.values(v.slots)[0]
}

export function buildTokenExport(foundations: DocumentFoundations): TokenExport {
  const skipped: { name: string; reason: string }[] = []

  const primaryGroup = foundations.contextGroups[0]
  const modes: ExportMode[] = primaryGroup
    ? primaryGroup.contexts.map((c) => ({ id: c.id, name: c.name }))
    : [{ id: 'default', name: 'Mode 1' }]
  const modeGroupId = primaryGroup?.id ?? null

  for (const group of foundations.contextGroups.slice(1)) {
    skipped.push({
      name: group.name,
      reason: `Figma collections have a single mode axis; "${primaryGroup!.name}" became the modes, so this dimension was flattened to its default context.`,
    })
  }

  const defaultSel = defaultContextSelections(foundations)

  const collections: ExportCollection[] = [...foundations.layers]
    .sort((a, b) => a.order - b.order)
    .map((layer: Layer) => {
      const variables: ExportVariable[] = []
      for (const token of layer.tokens) {
        const ftype = figmaType(token.type)
        const byMode: Record<string, ExportValue> = {}
        let usable = true
        for (const mode of modes) {
          const slot = slotForMode(token, modeGroupId, mode.id)

          const ctx = {
            contextSelections: {
              ...defaultSel,
              ...(modeGroupId ? { [modeGroupId]: mode.id } : {}),
            },
          }
          const value = slotToValue(slot, token, foundations, layer.id, ctx)
          if (!value) {
            usable = false
            break
          }
          byMode[mode.id] = value
        }
        if (!usable) {
          skipped.push({
            name: variableName(token),
            reason: 'Color value could not be parsed to RGBA.',
          })
          continue
        }
        variables.push({
          name: variableName(token),
          tokenId: token.id,
          tokenType: token.type,
          figmaType: ftype,
          dtcgType: dtcgType(token.type),
          byMode,
          description: token.description,
        })
        if (ftype === null) {
          skipped.push({
            name: variableName(token),
            reason: `${token.type} has no flat Figma variable type — exported to DTCG only.`,
          })
        }
      }
      return { id: layer.id, name: layer.name, variables }
    })
    .filter((c) => c.variables.length > 0)

  return { modes, modeGroupId, collections, skipped }
}
