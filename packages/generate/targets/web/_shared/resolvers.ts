import {
  findToken,
  isLengthType,
  lengthToCss,
  resolveToken,
  type DocumentFoundations,
  type FacetResolver,
  type TokenType,
  type SizeResolver,
  type TokenResolverContext,
} from '@mildastudio/core'
import { facetCssVar } from './facets'

// Tier 2 (web) - token resolvers that answer in CSS.
//
// These two lived in `packages/core/facets/` and handed out units: a spacing token came back as
// `"8px"`, from the package whose entire rule is that it owns a design system's NUMBERS and never
// a unit or a property name (invariant 2). Proposal 0045 evicted the rest of the web lowering and
// missed them, for a legible reason - their only caller is the Studio's live preview, which is
// React and wants CSS, so nothing ever noticed that core was the one producing it.
//
// The split that matters: core resolves a token to a neutral value (`resolveToken`, which is where
// the layer chain, the context selections and the reference cycles are handled), and this file
// decides what a length LOOKS like in a browser. Every other target composes the same
// `resolveToken` with its own last mile - points for AppKit, a Variable binding for Figma.

/**
 * A facet resolver bound to a document's editable foundations, answering in CSS. The preview path:
 * editing a token on the Foundations page repaints the canvas through this.
 */
export function makeFacetResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
): FacetResolver {
  return (scale, id) => {
    const v = resolveToken(id, f, context, scale)
    return v != null && isLengthType(scale) ? lengthToCss(v) : v
  }
}

/** The same, for the `size` scale that layout widths and heights read. */
export function makeSizeResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
): SizeResolver {
  return (id) => {
    const v = resolveToken(id, f, context, 'size')
    return v != null ? lengthToCss(v) : v
  }
}

/**
 * The generator's resolver: a token's `var()` reference, but only for a token the foundations
 * declare - which is exactly the set `theme.css` writes a custom property for.
 *
 * `facetCssVar` alone answers for EVERY id, so the literal gate behind it (proposal 0049) was
 * unreachable from the generated package: `transparent` shipped as `var(--ds-color-transparent)`,
 * `50%` as `var(--ds-radius-50%)`, and each of those is a property the browser drops. Asking the
 * foundations first is the same order the preview's `makeFacetResolver` already reads in, so the
 * canvas and the shipped CSS now fall through to a literal for the same words.
 */
export function makeFacetVarResolver(f: DocumentFoundations): FacetResolver {
  return (scale, id) =>
    id && findToken(f, id, scale as TokenType) ? facetCssVar(scale, id) : undefined
}
