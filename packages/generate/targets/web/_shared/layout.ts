// Tier 2 (web) - layout lowered to CSS declarations.
//
// The IR says `direction: row`, `align: center`, `width: fill`. Flexbox is one way to
// honour that and CSS is one place it holds: `display: flex`, `align-items: flex-start`,
// `fit-content`, `100%` are all browser facts. They lived in `packages/core/facets/layout.ts`
// until proposal 0045 phase 1. Core keeps the neutral vocabulary and, since proposal 0056, the
// one READING of a layout record (`resolveLayoutIntent`) and the closed list of things a target
// can fail to draw (`LAYOUT_SLOTS`); this file is the web's answer to each.
//
// What the web needs that a node alone does not have is its PARENT: whether `fill` is on the
// axis the siblings share (then it is `flex: 1 1 0%`, with `min-width: 0` so a long label cannot
// push a sibling out - PRELUDE §4's "fill truncation gotcha") or across it (then it is `100%`);
// whether the node sits in a `layers` stack (then it takes the stack's one grid cell); and the
// parent's inset, which is what a `bleed` cancels. Callers pass `{ layout, facets }` of the
// parent when they have one; without it, a node is lowered as a root is.

import {
  edgesToPhysical,
  resolveFacetIntent,
  resolveLayoutIntent,
  resolveScaleToken,
  mainAxisOf,
  type EdgeIntent,
  type FacetResolver,
  type LayoutCoverage,
  type LayoutIntent,
  type PhysicalEdge,
  type SizeResolver,
} from '@mildastudio/core'
import type { LogicalEdge } from '@mildastudio/milda'
import type { StyleDecl } from './decl'
import { facetCssVar } from './facets'
import { cssVarRef, scaleVarName } from './tokens'

/** Every neutral layout slot has a CSS spelling; nothing is approximated on the web. */
export const WEB_LAYOUT_COVERAGE: LayoutCoverage = {
  layers: null,
  baseline: null,
  evenly: null,
  wrapReverse: null,
  weight: null,
  ratio: null,
  clamp: null,
  overlay: null,
  pinned: null,
  bleed: null,
}

const ALIGN_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
}

const DISTRIBUTE_CSS: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

// In a `layers` stack the children do not share an axis, so `distribute` places each one
// horizontally in the cell and `align` vertically - the item properties, not the content ones.
// A distribution between items (`between`, `around`, `evenly`) has no meaning for a lone item
// in its cell and reads as `start`.
const ITEMS_CSS: Record<string, string> = {
  start: 'start',
  center: 'center',
  end: 'end',
  stretch: 'stretch',
  baseline: 'baseline',
  between: 'start',
  around: 'start',
  evenly: 'start',
}

const resolveSize: SizeResolver = (id) => resolveScaleToken('size', id)

const RAW_DIMENSION = /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|fr|pt|cm|mm|in)?$/

const sizeCssVar: SizeResolver = (id) =>
  RAW_DIMENSION.test(id) ? undefined : cssVarRef(scaleVarName('size', id))

/** The parent a node is laid out in, as far as this tier needs it. */
export interface LayoutParent {
  layout?: Record<string, string>
  facets?: Record<string, string>
}

export interface LayoutLoweringOptions {
  parent?: LayoutParent
  /** Resolves the parent's inset for a `bleed`; the generator's `var()` resolver by default. */
  facet?: FacetResolver
}

// The CSS logical margin a bleed sets per edge, and the edge of the parent's box whose inset it
// cancels. Logical on both sides, so the generated CSS reads right in RTL and a parent whose
// inset differs per edge (proposal 0057) is cancelled edge by edge.
type InsetSide = keyof EdgeIntent

const BLEED_EDGES: Record<LogicalEdge, { prop: string; side: InsetSide }[]> = {
  'block-start': [{ prop: 'marginBlockStart', side: 'blockStart' }],
  'block-end': [{ prop: 'marginBlockEnd', side: 'blockEnd' }],
  'inline-start': [{ prop: 'marginInlineStart', side: 'inlineStart' }],
  'inline-end': [{ prop: 'marginInlineEnd', side: 'inlineEnd' }],
  block: [
    { prop: 'marginBlockStart', side: 'blockStart' },
    { prop: 'marginBlockEnd', side: 'blockEnd' },
  ],
  inline: [
    { prop: 'marginInlineStart', side: 'inlineStart' },
    { prop: 'marginInlineEnd', side: 'inlineEnd' },
  ],
  all: [
    { prop: 'marginBlockStart', side: 'blockStart' },
    { prop: 'marginInlineEnd', side: 'inlineEnd' },
    { prop: 'marginBlockEnd', side: 'blockEnd' },
    { prop: 'marginInlineStart', side: 'inlineStart' },
  ],
}

const PIN_EDGES: Record<LogicalEdge, string[]> = {
  'block-start': ['insetBlockStart'],
  'block-end': ['insetBlockEnd'],
  'inline-start': ['insetInlineStart'],
  'inline-end': ['insetInlineEnd'],
  block: ['insetBlockStart', 'insetBlockEnd'],
  inline: ['insetInlineStart', 'insetInlineEnd'],
  all: ['inset'],
}

export function layoutDecls(
  layout: Record<string, string> | undefined,
  size: SizeResolver = resolveSize,
  options: LayoutLoweringOptions = {},
): StyleDecl[] {
  if (!layout) return []
  const intent = resolveLayoutIntent(layout)
  const parent = resolveLayoutIntent(options.parent?.layout)
  const out: StyleDecl[] = []
  const push = (prop: string, value?: string) => {
    if (value != null) out.push({ prop, value })
  }
  const length = (v: string) => size(v) ?? v

  // ── This node as a container ──
  if (intent.direction === 'layers') {
    // One grid cell that every child takes (`gridArea` below, from the child's side): the
    // children overlap and the stack sizes to the largest of them, which is what a z-stack is
    // and what absolute positioning cannot do. `relative` makes it the box an `overlay` child
    // is placed in.
    push('display', 'grid')
    push('position', 'relative')
    if (intent.align) push('alignItems', ITEMS_CSS[intent.align])
    if (intent.distribute) push('justifyItems', ITEMS_CSS[intent.distribute])
  } else if (intent.direction || intent.align || intent.distribute || intent.wrap) {
    push('display', 'flex')
    push('flexDirection', intent.direction ?? 'row')
    if (intent.wrap && intent.wrap !== 'nowrap') push('flexWrap', intent.wrap)
    if (intent.align) push('alignItems', ALIGN_CSS[intent.align])
    if (intent.distribute) push('justifyContent', DISTRIBUTE_CSS[intent.distribute])
  }

  // ── This node as a child ──
  const inLayers = parent.direction === 'layers'
  if (inLayers) push('gridArea', '1 / 1')

  const main = mainAxisOf(parent.direction)
  const wrapping = parent.wrap === 'wrap' || parent.wrap === 'wrap-reverse'
  const grows: { axis: 'width' | 'height'; weight: number }[] = []
  let ratio: string | undefined

  for (const axis of ['width', 'height'] as const) {
    const a = intent[axis]
    if (!a) continue
    switch (a.mode) {
      case 'fit':
        push(axis, 'fit-content')
        break
      case 'fill':
      case 'weight':
        // On the axis the siblings share, a share of the leftover; across it, the whole span.
        // `weight` across the main axis has nothing to weigh against, so it is a fill there.
        if (main === axis) grows.push({ axis, weight: a.mode === 'weight' ? a.weight : 1 })
        else push(axis, '100%')
        break
      case 'ratio':
        // The axis follows the other one; it gets no length of its own. Two ratio axes would
        // contradict each other, so the second is not emitted.
        ratio ??= `${a.w} / ${a.h}`
        break
      case 'fixed':
        push(axis, length(a.value))
        break
    }
  }
  for (const { axis, weight } of grows) {
    push('flexGrow', String(weight))
    push('flexShrink', '1')
    // In a wrapping parent the basis stays the content, so the line still breaks where it
    // should and the item grows into what its line has left.
    push('flexBasis', wrapping ? 'auto' : '0%')
    // PRELUDE §4's "fill truncation gotcha": a flex item's minimum is its content, so a long
    // label would push its siblings out instead of truncating. The author's own clamp wins.
    const minKey = axis === 'width' ? 'widthMin' : 'heightMin'
    if (!intent[minKey]) push(axis === 'width' ? 'minWidth' : 'minHeight', '0')
  }
  if (ratio) push('aspectRatio', ratio)
  if (intent.widthMin) push('minWidth', length(intent.widthMin))
  if (intent.widthMax) push('maxWidth', length(intent.widthMax))
  if (intent.heightMin) push('minHeight', length(intent.heightMin))
  if (intent.heightMax) push('maxHeight', length(intent.heightMax))

  // ── Position ──
  const position = intent.position
  if (position?.kind === 'overlay') {
    // Out of flow, into the box of its `layers` parent, which places it with the same
    // `align`/`distribute` it uses for in-flow children (an absolutely positioned child of a
    // grid is aligned in its area by the grid's item properties).
    push('position', 'absolute')
  } else if (position?.kind === 'pinned') {
    push('position', 'sticky')
    for (const prop of new Set(position.edges.flatMap((e) => PIN_EDGES[e]))) push(prop, '0')
  } else if (position?.kind === 'bleed') {
    const insets = resolveFacetIntent(options.parent?.facets).insets
    const facet = options.facet ?? facetCssVar
    const done = new Set<string>()
    for (const edge of position.edges) {
      for (const { prop, side } of BLEED_EDGES[edge]) {
        if (done.has(prop)) continue
        done.add(prop)
        const inset = insets[side]
        // Nothing to cancel on a parent without an inset there.
        if (!inset) continue
        const v = facet(inset.scale ?? 'spacing', inset.value)
        if (v) push(prop, `calc(-1 * ${v})`)
      }
    }
  }

  return out
}

export function layoutVarDecls(
  layout?: Record<string, string>,
  options: LayoutLoweringOptions = {},
): StyleDecl[] {
  return layoutDecls(layout, sizeCssVar, options)
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

/** The sides a bleed reaches, for callers that place rather than style (tests, reports). */
export function bleedSides(intent: LayoutIntent): PhysicalEdge[] {
  return intent.position?.kind === 'bleed' ? edgesToPhysical(intent.position.edges) : []
}
