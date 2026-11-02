// The neutral layout vocabulary. What these words mean in a browser - flexbox, `fit-content`,
// `100%` - is the web tier's; see `generate/targets/web/_shared/layout.ts` (proposal 0045 §6).
//
// The words themselves are the LANGUAGE's (proposal 0056 §3.1): one list in
// `@mildastudio/milda`'s vocabulary, read by the parser, the printer, the LSP and - through
// these re-exports - every target and the Inspector. Core used to keep its own, shorter copies
// (`row | column`, four alignments, three size modes), which is how the spec promised `layers`,
// `baseline`, `weight(n)` and `ratio(w:h)` while nothing below the parser could hold them.
import {
  AXIS_INTENTS,
  LAYOUT_ALIGNS,
  LAYOUT_DIRECTIONS,
  LAYOUT_DISTRIBUTES,
  LAYOUT_WRAPS,
  LOGICAL_EDGES,
  POSITION_KINDS,
} from '@mildastudio/milda'

export const DIRECTIONS = LAYOUT_DIRECTIONS
export const ALIGNS = LAYOUT_ALIGNS
export const DISTRIBUTES = LAYOUT_DISTRIBUTES
export const WRAPS = LAYOUT_WRAPS
/** The axis intents. A `width`/`height` value is one of these words, or - for `fixed` - a size
 *  token or a length, spelled as the surface spells it (`weight(2)`, `ratio(16:9)`). */
export const SIZE_MODES = AXIS_INTENTS
export const POSITIONS = POSITION_KINDS
export const EDGES = LOGICAL_EDGES

export type SizeResolver = (id: string) => string | undefined

// `makeSizeResolver` was here for the same reason and left for the same one: it resolved a size
// token and lowered it with `lengthToCss`. See `generate/targets/web/_shared/resolvers.ts`.

export const LAYOUT_DEFAULT_VALUES: Record<string, string> = {
  direction: 'row',
  align: 'stretch',
  distribute: 'start',
  wrap: 'nowrap',
  width: 'auto',
  height: 'auto',
  position: 'flow',
}
