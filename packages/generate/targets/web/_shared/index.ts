// Tier 2 - web conventions shared across web framework targets (proposal 0029).
//
// Helpers common to every web framework view (React, and future Vue/Angular):
// ARIA role names, keyboard-interaction semantics, and `data-*` state attribute
// naming, so each framework view under ./<framework> renders consistent markup
// instead of each reinventing its own conventions. Unlike ../../behavior (Tier 1),
// this tier may reference web/DOM concepts, but stays framework-agnostic.
//
// It is also where the CSS lowering of the IR lives, evicted from `packages/core`
// by proposal 0045: the `--ds-*` custom-property scheme, facets and layout as
// `StyleDecl`s, and motion as the `transition` shorthand (phase 1), the toggle
// controls' declarations (phase 2) and overlay positioning (phase 3).
//
// Core keeps the measurements and the relationships; this tier owns every CSS word.
// If you are adding something here, check first that its neutral half is in core -
// a number belongs there, its property name belongs here.

export {
  colorVarName,
  scaleVarName,
  gradientVarName,
  textStyleVarName,
  easingVarName,
  cssVarRef,
} from './tokens'

export {
  BORDER_SIDE_PROPS,
  FACET_DEFAULTS,
  WEB_COVERAGE,
  baselineDecls,
  facetBaselineDecls,
  facetCssVar,
  facetDecls,
  facetDefaultValue,
} from './facets'

export {
  LAYOUT_DEFAULTS,
  WEB_LAYOUT_COVERAGE,
  bleedSides,
  layoutBaselineDecls,
  layoutDecls,
  layoutVarDecls,
  type LayoutLoweringOptions,
  type LayoutParent,
} from './layout'

// The resolvers that answer in CSS. The first two were in core until it turned out core was the
// one producing the units (see resolvers.ts).
export { makeFacetResolver, makeFacetVarResolver, makeSizeResolver } from './resolvers'

export { motionDecls, timingTransitionDecl } from './motion'

export {
  CHECKBOX_DISABLED_DECLS,
  CHECKBOX_FOCUS_DECLS,
  CHECKBOX_GLYPH_CHECKED_DECLS,
  CHECKBOX_GLYPH_DECLS,
  CHECKBOX_INDICATOR_DECLS,
  CHECKBOX_ROOT_DECLS,
  SR_ONLY_DECLS,
  SWITCH_THUMB_CHECKED_DECLS,
  SWITCH_THUMB_DECLS,
  SWITCH_TRACK_DECLS,
  controlTransitionProps,
  lengthCss,
} from './control'

export { anchorDecls, backdropDecls, surfacePositionDecls, type Anchoring } from './overlay'

export { INTERACTION_DOM_EVENT } from './interaction'

export { contextDataAttr, contextValue } from './context'

export type { StyleDecl } from './decl'
