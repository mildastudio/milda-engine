import { COLOR_KEYWORDS, type InsetEdge } from '@mildastudio/milda'
import { resolveColorToken } from '../foundations/colorTokens'
import { resolveScaleToken, type ScaleName } from '../foundations/scales'
import type { NodeKind } from '../structure/types'

export type FacetScale = 'color' | ScaleName

export interface FacetDef {
  key: string
  label: string
  // A facet is either TOKENIZED - its value is a token id on this scale - or a KEYWORD enum,
  // where the value IS the value (font-style has nothing to point a token at). Exactly one of
  // `scale`/`keywords` is set; `facetRegistryProblems` holds that invariant.
  scale?: FacetScale
  keywords?: string[]
}

// Border applies to all sides (`border`) or a single edge - physical (top/right/…) or
// logical (inline-start/…). Each carries width + color + style. `suffix` is the facet
// key tail (empty for all-sides), `label` is how the editor names the edge; both are
// neutral. The CSS property each side maps to is the web tier's - see
// `generate/targets/web/_shared/facets.ts`, whose `BORDER_SIDE_PROPS` is keyed on
// `BorderSideSuffix` so the two lists cannot drift (proposal 0045 §6).
export const BORDER_SIDES = [
  { suffix: '', label: '' },
  { suffix: '.top', label: 'top' },
  { suffix: '.right', label: 'right' },
  { suffix: '.bottom', label: 'bottom' },
  { suffix: '.left', label: 'left' },
  { suffix: '.inline-start', label: 'inline-start' },
  { suffix: '.inline-end', label: 'inline-end' },
  { suffix: '.block-start', label: 'block-start' },
  { suffix: '.block-end', label: 'block-end' },
] as const satisfies readonly { suffix: string; label: string }[]

export type BorderSideSuffix = (typeof BORDER_SIDES)[number]['suffix']

// ─── Inset keys (proposal 0057) ───
// An inset is stated on all four edges, on one axis, or on one edge, and the more specific key
// wins edge by edge (`resolveFacetIntent`). The axes keep the names they were stored under
// before the edges existed - `insetX` is the inline axis, `insetY` the block axis - because
// renaming a stored key is a migration plus a change in what an old client's mutation writes
// (invariant 7), and it buys nothing. The surface spells them `inset.inline` / `inset.block`;
// `INSET_SURFACE_KEYS` is the one table between the two spellings.
export const INSET_EDGE_KEYS = [
  'inset.block-start',
  'inset.block-end',
  'inset.inline-start',
  'inset.inline-end',
] as const

/** Every facet key that states an inset, least specific first. */
export const INSET_KEYS = ['inset', 'insetX', 'insetY', ...INSET_EDGE_KEYS] as const

export type InsetKey = (typeof INSET_KEYS)[number]

/** The surface's dotted inset names (`inset.<edge>`) to the IR keys they are stored under. */
export const INSET_SURFACE_KEYS: Record<InsetEdge, InsetKey> = {
  block: 'insetY',
  inline: 'insetX',
  'block-start': 'inset.block-start',
  'block-end': 'inset.block-end',
  'inline-start': 'inset.inline-start',
  'inline-end': 'inset.inline-end',
}

export function isInsetKey(key: string): key is InsetKey {
  return (INSET_KEYS as readonly string[]).includes(key)
}

export const FACETS: Record<string, FacetDef> = {
  fill: { key: 'fill', label: 'Fill', scale: 'color' },
  ink: { key: 'ink', label: 'Ink', scale: 'color' },
  corner: { key: 'corner', label: 'Corner', scale: 'radius' },
  inset: { key: 'inset', label: 'Inset', scale: 'spacing' },
  insetX: { key: 'insetX', label: 'Inset inline', scale: 'spacing' },
  insetY: { key: 'insetY', label: 'Inset block', scale: 'spacing' },
  'inset.block-start': { key: 'inset.block-start', label: 'Inset block start', scale: 'spacing' },
  'inset.block-end': { key: 'inset.block-end', label: 'Inset block end', scale: 'spacing' },
  'inset.inline-start': {
    key: 'inset.inline-start',
    label: 'Inset inline start',
    scale: 'spacing',
  },
  'inset.inline-end': { key: 'inset.inline-end', label: 'Inset inline end', scale: 'spacing' },
  gap: { key: 'gap', label: 'Gap', scale: 'spacing' },
  'border.width': { key: 'border.width', label: 'Border width', scale: 'borderWidth' },
  'border.color': { key: 'border.color', label: 'Border color', scale: 'color' },
  'text.size': { key: 'text.size', label: 'Text size', scale: 'fontSize' },
  'text.weight': { key: 'text.weight', label: 'Weight', scale: 'fontWeight' },
  font: { key: 'font', label: 'Font', scale: 'fontFamily' },
  elevation: { key: 'elevation', label: 'Elevation', scale: 'elevation' },
  opacity: { key: 'opacity', label: 'Opacity', scale: 'opacity' },

  // font-style: the typography axis that has no scale to tokenize (0035 §3). Listed in
  // `KIND_FACETS` for every text-bearing kind, so it MUST be registered here - the editor
  // reads this registry to label and render each offered facet.
  slant: { key: 'slant', label: 'Slant', keywords: ['normal', 'italic', 'oblique'] },

  ring: { key: 'ring', label: 'Focus ring', scale: 'color' },
}

// Register per-side border width/color facets (the all-sides `border.width`/`border.color`
// are in the literal above). Style is emitted directly as a keyword, so it needs no scale.
for (const { suffix, label } of BORDER_SIDES) {
  if (!suffix) continue
  FACETS[`border${suffix}.width`] = {
    key: `border${suffix}.width`,
    label: `Border ${label} width`,
    scale: 'borderWidth',
  }
  FACETS[`border${suffix}.color`] = {
    key: `border${suffix}.color`,
    label: `Border ${label} color`,
    scale: 'color',
  }
}

export const KIND_FACETS: Record<NodeKind, string[]> = {
  container: [
    'fill',
    'corner',
    ...INSET_KEYS,
    'gap',
    'border.width',
    'border.color',
    'elevation',
    'opacity',
    'ring',
  ],
  item: ['fill', 'ink', 'corner', ...INSET_KEYS, 'gap', 'ring'],
  control: [
    'fill',
    'ink',
    'corner',
    ...INSET_KEYS,
    'border.width',
    'border.color',
    'text.weight',
    'font',
    'slant',
    'elevation',
    'ring',
  ],
  input: [
    'fill',
    'ink',
    'corner',
    ...INSET_KEYS,
    'border.width',
    'border.color',
    'text.size',
    'ring',
  ],
  output: ['fill', 'ink', 'corner', ...INSET_KEYS, 'text.size', 'text.weight', 'font', 'slant'],
  text: ['ink', 'text.size', 'text.weight', 'font', 'slant'],
  icon: ['fill', 'corner'],
  content: ['corner', 'opacity'],

  fragment: [],
  foreign: [],
  instance: [],
  table: ['fill', 'corner', 'border.width', 'border.color'],
  row: ['fill', 'ink', 'border.width', 'border.color'],
  cell: [
    'fill',
    'ink',
    ...INSET_KEYS,
    'border.width',
    'border.color',
    'text.size',
    'text.weight',
    'font',
    'slant',
  ],
}

// The registry's own invariants, as data so a test can hold them: every facet a kind OFFERS
// must be registered (the editor labels and renders each offered facet from `FACETS`, so a
// missing entry is a crash, not a degraded row), and every entry must say how it is valued -
// a token scale or a keyword enum, never neither and never both.
export function facetRegistryProblems(): string[] {
  const problems: string[] = []
  for (const [kind, keys] of Object.entries(KIND_FACETS)) {
    for (const key of keys) {
      if (!FACETS[key])
        problems.push(`KIND_FACETS.${kind} offers "${key}", which FACETS does not define`)
    }
  }
  for (const [key, def] of Object.entries(FACETS)) {
    if (!def.scale && !def.keywords)
      problems.push(`FACETS."${key}" has neither a scale nor keywords`)
    if (def.scale && def.keywords) problems.push(`FACETS."${key}" has both a scale and keywords`)
  }
  return problems
}

export type FacetResolver = (scale: FacetScale, id?: string) => string | undefined

export function isRawValue(v: string): boolean {
  return (
    /^#/.test(v) || /[(.%]/.test(v) || /\d(px|rem|em|vh|vw|vmin|vmax|ch|ex|fr|deg|ms|s)$/.test(v)
  )
}

/**
 * Could this be a literal, if no token by that name exists? (proposal 0049)
 *
 * `isRawValue` answers a DIFFERENT question - "does this look like a literal rather than a token
 * id" - and it is the DSL's rule as much as the IR's, so it stays untouched: the emitter and the
 * parser agree on it, and what a `.milda` file means depends on that agreement.
 *
 * This one is the fallback gate for a reader that has already asked the foundations and been told
 * no. That order is what lets a bare number work at last: `600` and `0` cannot be told from a
 * token id by looking, but a reader that looked it up first knows there is no such token, and can
 * then take the value at face value. Widening `isRawValue` instead would have made
 * `text.weight: 600` stop meaning "the token named 600" in documents that have one - and a
 * Tailwind import produces exactly that.
 *
 * A misspelled id (`acent-3`) is still nothing rather than a literal, which is the point of
 * keeping a gate at all: emitting `background: acent-3` would be worse than emitting nothing.
 *
 * The language's colour keywords (`transparent`) pass too, and for the same reason the bare
 * number does: a word cannot be told from a token id by looking, so it is a literal only once no
 * token claims it. The list is the language's (`COLOR_KEYWORDS`), so the validator that accepts
 * the word and the targets that render it cannot disagree about which words those are. Each
 * target then needs a value for the word - `parseCssColor` is core's.
 */
export function couldBeLiteral(v: string): boolean {
  return isRawValue(v) || /^-?\d+(\.\d+)?$/.test(v) || colorKeywords.has(v)
}

const colorKeywords: ReadonlySet<string> = new Set(COLOR_KEYWORDS)

export const resolveFacet: FacetResolver = (scale, id) => {
  if (!id) return undefined
  return scale === 'color' ? resolveColorToken(id) : resolveScaleToken(scale, id)
}

// `makeFacetResolver` used to be here, and it handed out CSS: it ran a token through
// `lengthToCss`, so core answered "8px" - a unit, from the package whose whole rule is that it
// owns a design system's numbers and never a unit or a property name (invariant 2). Proposal 0045
// evicted the rest of the web lowering and missed this one because its only caller is the
// Studio's preview, which wants CSS and so never complained. It lives in
// `generate/targets/web/_shared/resolvers.ts` now, next to every other CSS word.
