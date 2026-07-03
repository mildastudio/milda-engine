import { resolveColorToken } from '../foundations/colorTokens'
import { resolveScaleToken, type ScaleName } from '../foundations/scales'
import type { DocumentFoundations } from '../foundations/document'
import { resolveToken, type TokenResolverContext } from './resolver'
import { colorVarName, cssVarRef, scaleVarName } from '../tokens'
import { isLengthType, lengthToCss } from '../foundations/dimensions'
import { canAcceptChildren, type ComponentNode, type NodeKind } from '../structure/types'
import { layoutBaselineDecls } from './layout'

export type FacetScale = 'color' | ScaleName

export interface FacetDef {
  key: string
  label: string
  scale: FacetScale
}

export const FACETS: Record<string, FacetDef> = {
  fill: { key: 'fill', label: 'Fill', scale: 'color' },
  ink: { key: 'ink', label: 'Ink', scale: 'color' },
  corner: { key: 'corner', label: 'Corner', scale: 'radius' },
  inset: { key: 'inset', label: 'Inset', scale: 'spacing' },

  insetX: { key: 'insetX', label: 'Inset X', scale: 'spacing' },
  insetY: { key: 'insetY', label: 'Inset Y', scale: 'spacing' },
  gap: { key: 'gap', label: 'Gap', scale: 'spacing' },
  'border.width': { key: 'border.width', label: 'Border width', scale: 'borderWidth' },
  'border.color': { key: 'border.color', label: 'Border color', scale: 'color' },
  'text.size': { key: 'text.size', label: 'Text size', scale: 'fontSize' },
  'text.weight': { key: 'text.weight', label: 'Weight', scale: 'fontWeight' },
  elevation: { key: 'elevation', label: 'Elevation', scale: 'elevation' },
  opacity: { key: 'opacity', label: 'Opacity', scale: 'opacity' },

  ring: { key: 'ring', label: 'Focus ring', scale: 'color' },
}

export const KIND_FACETS: Record<NodeKind, string[]> = {
  container: [
    'fill',
    'corner',
    'inset',
    'insetX',
    'insetY',
    'gap',
    'border.width',
    'border.color',
    'elevation',
    'opacity',
    'ring',
  ],
  item: ['fill', 'ink', 'corner', 'inset', 'insetX', 'insetY', 'gap', 'ring'],
  control: [
    'fill',
    'ink',
    'corner',
    'inset',
    'insetX',
    'insetY',
    'border.width',
    'border.color',
    'text.weight',
    'elevation',
    'ring',
  ],
  input: [
    'fill',
    'ink',
    'corner',
    'inset',
    'insetX',
    'insetY',
    'border.width',
    'border.color',
    'text.size',
    'ring',
  ],
  output: ['fill', 'ink', 'corner', 'inset', 'text.size'],
  text: ['ink', 'text.size', 'text.weight'],
  icon: ['fill', 'corner'],
  content: ['corner', 'opacity'],

  fragment: [],
  foreign: [],
  instance: [],
  table: ['fill', 'corner', 'border.width', 'border.color'],
  row: ['fill', 'ink', 'border.width', 'border.color'],
  cell: ['fill', 'ink', 'inset', 'border.width', 'border.color', 'text.size', 'text.weight'],
}

export interface StyleDecl {
  prop: string
  value: string
}

export type FacetResolver = (scale: FacetScale, id?: string) => string | undefined

export function isRawValue(v: string): boolean {
  return (
    /^#/.test(v) || /[(.%]/.test(v) || /\d(px|rem|em|vh|vw|vmin|vmax|ch|ex|fr|deg|ms|s)$/.test(v)
  )
}

export const resolveFacet: FacetResolver = (scale, id) => {
  if (!id) return undefined
  return scale === 'color' ? resolveColorToken(id) : resolveScaleToken(scale, id)
}

export const facetCssVar: FacetResolver = (scale, id) => {
  if (!id) return undefined
  return cssVarRef(scale === 'color' ? colorVarName(id) : scaleVarName(scale, id))
}

export function makeFacetResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
): FacetResolver {
  return (scale, id) => {
    const v = resolveToken(id, f, context, scale)
    return v != null && isLengthType(scale) ? lengthToCss(v) : v
  }
}

export function facetDecls(
  facets: Record<string, string> | undefined,
  resolve: FacetResolver = resolveFacet,
): StyleDecl[] {
  if (!facets) return []
  const out: StyleDecl[] = []
  const push = (prop: string, value?: string) => {
    if (value != null) out.push({ prop, value })
  }

  const v = (key: string) => {
    const id = facets[key]
    if (id == null) return undefined
    return isRawValue(id) ? id : resolve(FACETS[key].scale, id)
  }

  if (facets.fill) push('background', v('fill'))
  if (facets.ink) push('color', v('ink'))
  if (facets.corner) push('borderRadius', v('corner'))
  if (facets.inset) push('padding', v('inset'))

  if (facets.insetX) {
    push('paddingLeft', v('insetX'))
    push('paddingRight', v('insetX'))
  }
  if (facets.insetY) {
    push('paddingTop', v('insetY'))
    push('paddingBottom', v('insetY'))
  }
  if (facets.gap) push('gap', v('gap'))
  if (facets.opacity) push('opacity', v('opacity'))
  if (facets.elevation) push('boxShadow', v('elevation'))
  if (facets.ring) {
    push('outline', `2px solid ${v('ring') ?? 'currentColor'}`)
    push('outlineOffset', '2px')
  }
  if (facets['border.color'] || facets['border.width']) {
    push('borderStyle', 'solid')
    push('borderWidth', v('border.width') ?? '1px')
    push('borderColor', v('border.color') ?? 'currentColor')
  }
  if (facets['text.size']) push('fontSize', v('text.size'))
  if (facets['text.weight']) push('fontWeight', v('text.weight'))
  return out
}

export const FACET_DEFAULTS: Record<string, StyleDecl[]> = {
  fill: [{ prop: 'background', value: 'transparent' }],
  ink: [{ prop: 'color', value: 'inherit' }],
  corner: [{ prop: 'borderRadius', value: '0' }],
  inset: [{ prop: 'padding', value: '0' }],
  insetX: [
    { prop: 'paddingLeft', value: '0' },
    { prop: 'paddingRight', value: '0' },
  ],
  insetY: [
    { prop: 'paddingTop', value: '0' },
    { prop: 'paddingBottom', value: '0' },
  ],
  gap: [{ prop: 'gap', value: '0' }],

  'border.width': [
    { prop: 'borderStyle', value: 'solid' },
    { prop: 'borderWidth', value: '0' },
    { prop: 'borderColor', value: 'currentColor' },
  ],
  'border.color': [
    { prop: 'borderStyle', value: 'solid' },
    { prop: 'borderWidth', value: '0' },
    { prop: 'borderColor', value: 'currentColor' },
  ],
  'text.size': [{ prop: 'fontSize', value: 'inherit' }],
  'text.weight': [{ prop: 'fontWeight', value: 'inherit' }],
  elevation: [{ prop: 'boxShadow', value: 'none' }],
  opacity: [{ prop: 'opacity', value: '1' }],
  ring: [{ prop: 'outline', value: 'none' }],
}

export function facetDefaultValue(key: string): string | undefined {
  const decls = FACET_DEFAULTS[key]
  return decls?.[0]?.value
}

const COVERED_BY_SHORTHAND: Record<string, string> = {
  paddingLeft: 'padding',
  paddingRight: 'padding',
  paddingTop: 'padding',
  paddingBottom: 'padding',
}

export function facetBaselineDecls(kind: NodeKind): StyleDecl[] {
  const out: StyleDecl[] = []
  const seen = new Set<string>()
  for (const key of KIND_FACETS[kind] ?? []) {
    for (const d of FACET_DEFAULTS[key] ?? []) {
      if (seen.has(d.prop)) continue
      const covering = COVERED_BY_SHORTHAND[d.prop]
      if (covering && seen.has(covering)) continue
      seen.add(d.prop)
      out.push(d)
    }
  }
  return out
}

const TABLE_DISPLAY: Partial<Record<NodeKind, string>> = {
  table: 'table',
  row: 'table-row',
  cell: 'table-cell',
}

export function baselineDecls(node: ComponentNode): StyleDecl[] {
  const tableDisplay = TABLE_DISPLAY[node.kind]
  const layout = tableDisplay
    ? [
        { prop: 'display', value: tableDisplay },
        { prop: 'width', value: 'auto' },
        { prop: 'height', value: 'auto' },
      ]
    : canAcceptChildren(node)
      ? layoutBaselineDecls()
      : []
  return [...layout, ...facetBaselineDecls(node.kind)]
}
