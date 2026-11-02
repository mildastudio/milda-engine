// Tier 2 (web) - facets lowered to CSS declarations.
//
// A facet is neutral: `fill` is "the surface's colour", and core owns what that resolves
// to. Turning it into `{ prop: 'background', value: … }` is a browser fact, and so is the
// notion that an absent facet still has a baseline (`background: transparent`). Both lived
// in `packages/core/facets/facets.ts` until proposal 0045 phase 1; core keeps the registry
// (`FACETS`, `KIND_FACETS`), the resolvers, and the neutral side identity of a border.
//
// `StyleDecl` itself is this tier's type, in `./decl` - it left core once phase 3 removed
// the last thing there that produced one.

import type { StyleDecl } from './decl'
import {
  FACETS,
  borderStyleKeyword,
  KIND_FACETS,
  RING_OFFSET,
  RING_WIDTH,
  canAcceptChildren,
  couldBeLiteral,
  insetsAreUniform,
  resolveFacet,
  resolveFacetIntent,
  type BorderSideSuffix,
  type ComponentNode,
  type FacetRef,
  type FacetResolver,
  type NodeKind,
  type SlotCoverage,
} from '@mildastudio/core'
import { colorVarName, cssVarRef, scaleVarName } from './tokens'
import { layoutBaselineDecls } from './layout'

// The CSS property prefix for each border side core knows about. Keyed by core's
// `suffix` and typed on it, so adding a side there without a property here - or a
// property for a side that does not exist - is a compile error rather than a silently
// missing edge.
export const BORDER_SIDE_PROPS: Record<BorderSideSuffix, string> = {
  '': 'border',
  '.top': 'borderTop',
  '.right': 'borderRight',
  '.bottom': 'borderBottom',
  '.left': 'borderLeft',
  '.inline-start': 'borderInlineStart',
  '.inline-end': 'borderInlineEnd',
  '.block-start': 'borderBlockStart',
  '.block-end': 'borderBlockEnd',
}

export const facetCssVar: FacetResolver = (scale, id) => {
  if (!id) return undefined
  return cssVarRef(scale === 'color' ? colorVarName(id) : scaleVarName(scale, id))
}

// The neutral inset slots, in the order CSS wants them, paired with their longhand. Reached
// only when the four edges disagree - a uniform inset stays the `padding` shorthand it always
// was, because that is what the baseline `FACET_DEFAULTS` override and everything downstream
// expects to see.
const EDGE_PROPS = [
  ['top', 'paddingTop'],
  ['right', 'paddingRight'],
  ['bottom', 'paddingBottom'],
  ['left', 'paddingLeft'],
] as const

/**
 * CSS can express every neutral slot, which is not a boast - it is why this tier was the one core
 * used to lower for, and why the other two had to route around it (proposal 0045). The record is
 * here anyway, and it earns its place the moment a slot is ADDED: this file stops compiling until
 * it says whether CSS can do the new thing, rather than silently emitting nothing for it.
 */
export const WEB_COVERAGE: SlotCoverage = {
  fill: null,
  ink: null,
  corner: null,
  insets: null,
  gap: null,
  opacity: null,
  elevation: null,
  border: null,
  borderPerEdge: null,
  ring: null,
  textSize: null,
  textWeight: null,
  textFamily: null,
  textSlant: null,
}

export function facetDecls(
  facets: Record<string, string> | undefined,
  resolve: FacetResolver = resolveFacet,
): StyleDecl[] {
  if (!facets) return []
  // WHICH facet feeds which slot is core's answer now (proposal 0048): the inset axes beating
  // the shorthand, a border existing because any one of its parts was stated, a ring with no
  // colour of its own. This tier is left with the part that is genuinely a browser fact - the
  // property names, and what an absent value looks like in CSS.
  const intent = resolveFacetIntent(facets)
  const out: StyleDecl[] = []
  const push = (prop: string, value?: string) => {
    if (value != null) out.push({ prop, value })
  }

  // Token FIRST, literal second (proposal 0049). It used to guess by looking at the string, which
  // is why a bare number never worked: `600` and `0` are indistinguishable from a token id by
  // eye, so they were looked up, found nothing, and vanished. Asking the foundations first means
  // a value only falls back to being a literal once we know no token claims it.
  const v = (r: FacetRef | undefined) => {
    if (!r) return undefined
    // No scale = a keyword facet (or an unregistered key): the value is already the value,
    // so it passes through rather than being looked up as a token id.
    if (!r.scale) return r.value
    const resolved = resolve(r.scale, r.value)
    if (resolved != null) return resolved
    return couldBeLiteral(r.value) ? r.value : undefined
  }

  push('background', v(intent.fill))
  push('color', v(intent.ink))
  push('borderRadius', v(intent.corner))

  const { insets } = intent
  if (insetsAreUniform(insets)) {
    push('padding', v(insets.top))
  } else {
    for (const [edge, prop] of EDGE_PROPS) push(prop, v(insets[edge]))
  }

  push('gap', v(intent.gap))
  push('opacity', v(intent.opacity))
  push('boxShadow', v(intent.elevation))
  if (intent.ring) {
    push('outline', `${RING_WIDTH}px solid ${v(intent.ring.color) ?? 'currentColor'}`)
    push('outlineOffset', `${RING_OFFSET}px`)
  }
  for (const border of intent.borders) {
    const prop = BORDER_SIDE_PROPS[border.side]
    push(`${prop}Style`, borderStyleKeyword(border)) // a keyword, emitted as-is
    push(`${prop}Width`, v(border.width) ?? '1px')
    // "Follow the ink" is `currentColor` here; the same flag means the inherited RGBA on the
    // Mac canvas and an ink binding in Figma.
    push(`${prop}Color`, border.colorFollowsInk ? 'currentColor' : v(border.color))
  }
  push('fontSize', v(intent.text.size))
  push('fontWeight', v(intent.text.weight))
  push('fontFamily', v(intent.text.family))
  // font-style is an enum keyword (normal|italic|oblique), not a token - emit as-is.
  push('fontStyle', intent.text.slant?.value)
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
  font: [{ prop: 'fontFamily', value: 'inherit' }],
  slant: [{ prop: 'fontStyle', value: 'normal' }],
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
