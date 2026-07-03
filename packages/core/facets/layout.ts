import { resolveScaleToken } from '../foundations/scales'
import { lengthToCss } from '../foundations/dimensions'
import type { DocumentFoundations } from '../foundations/document'
import { resolveToken, type TokenResolverContext } from './resolver'
import { cssVarRef, scaleVarName } from '../tokens'
import type { StyleDecl } from './facets'

export const DIRECTIONS = ['row', 'column'] as const
export const ALIGNS = ['start', 'center', 'end', 'stretch'] as const
export const DISTRIBUTES = ['start', 'center', 'end', 'between', 'around'] as const
export const SIZE_MODES = ['fit', 'fill', 'fixed'] as const

const ALIGN_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}

const DISTRIBUTE_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
}

export type SizeResolver = (id: string) => string | undefined

const resolveSize: SizeResolver = (id) => resolveScaleToken('size', id)

const RAW_DIMENSION = /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|fr|pt|cm|mm|in)?$/

const sizeCssVar: SizeResolver = (id) =>
  RAW_DIMENSION.test(id) ? undefined : cssVarRef(scaleVarName('size', id))

export function makeSizeResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
): SizeResolver {
  return (id) => {
    const v = resolveToken(id, f, context, 'size')
    return v != null ? lengthToCss(v) : v
  }
}

function dimension(v: string | undefined, size: SizeResolver): string | undefined {
  if (!v) return undefined
  if (v === 'fit') return 'fit-content'
  if (v === 'fill') return '100%'
  return size(v) ?? v
}

export function layoutDecls(
  layout: Record<string, string> | undefined,
  size: SizeResolver = resolveSize,
): StyleDecl[] {
  if (!layout) return []
  const out: StyleDecl[] = []
  const push = (prop: string, value?: string) => {
    if (value != null) out.push({ prop, value })
  }

  if (layout.direction || layout.align || layout.distribute || layout.wrap) {
    push('display', 'flex')
    push('flexDirection', layout.direction ?? 'row')
  }
  if (layout.wrap === 'wrap') push('flexWrap', 'wrap')
  if (layout.align) push('alignItems', ALIGN_CSS[layout.align])
  if (layout.distribute) push('justifyContent', DISTRIBUTE_CSS[layout.distribute])
  push('width', dimension(layout.width, size))
  push('height', dimension(layout.height, size))

  return out
}

export function layoutVarDecls(layout?: Record<string, string>): StyleDecl[] {
  return layoutDecls(layout, sizeCssVar)
}

export const LAYOUT_DEFAULTS: StyleDecl[] = [
  { prop: 'display', value: 'flex' },
  { prop: 'flexDirection', value: 'row' },
  { prop: 'alignItems', value: 'stretch' },
  { prop: 'justifyContent', value: 'flex-start' },
  { prop: 'flexWrap', value: 'nowrap' },
  { prop: 'width', value: 'auto' },
  { prop: 'height', value: 'auto' },
]

export function layoutBaselineDecls(): StyleDecl[] {
  return LAYOUT_DEFAULTS
}

export const LAYOUT_DEFAULT_VALUES: Record<string, string> = {
  direction: 'row',
  align: 'stretch',
  distribute: 'start',
  wrap: 'nowrap',
  width: 'auto',
  height: 'auto',
}
