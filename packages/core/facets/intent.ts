import { BORDER_SIDES, FACETS, isInsetKey, type BorderSideSuffix, type FacetScale } from './facets'

// ─── Facet intent: what a facet map MEANS, once (proposal 0048 slice 1) ──────
// Three targets decided independently that `insetX` feeds left and right, that a border exists
// as soon as either its width or its colour is stated, and that an unstated border colour
// follows the ink. They agreed only because someone kept them agreeing - `facetDecls` in the web
// tier, the `read.*` block in `kernel/render.ts`, and `applyFacets` in the Figma plugin. That is
// invariant 3 inverted: the semantics were duplicated and the view was not.
//
// This module holds those decisions once. What it deliberately does NOT hold is a VALUE:
//
//   The web target emits `var(--ds-space-2)` rather than `8px`, because a reference is what
//   makes the generated CSS themeable. The kernel needs 8 points. The Figma plugin needs a
//   Variable binding with a literal fallback. A shared "resolve a facet to a value" layer
//   cannot serve all three, and pretending otherwise produces a mode flag that pleases nobody.
//
// So an intent's leaves are REFERENCES - which facet key feeds this slot, and on which scale to
// read it - and each target keeps its own reader. The slot names are neutral: no property name,
// no unit, nothing a browser or AppKit would recognize (invariant 2).

/**
 * One filled slot: which facet fills it, and with what.
 *
 * Generic over the leaf, because two callers hold different things under the same facet keys.
 * The web tier and the kernel hold the authored string - a token id or a raw value, a
 * distinction that is the reader's business (`isRawValue`) rather than the intent's. The Figma
 * plugin holds a Variable BINDING, and has to: its `applyStyle` is reached from a re-theme path
 * that rebuilds the record out of refs stored in the user's own Figma file, so its leaves were
 * never ids to begin with. One resolver over both beats a second copy of the rules for bindings.
 */
export interface FacetSlot<T> {
  /** The facet key this came from, so a target can report or debug against the authored name. */
  key: string
  value: T
  /** The scale to read `value` on, or undefined for a keyword facet whose value IS the value. */
  scale?: FacetScale
}

/** The string instantiation: what the web tier and the kernel read. */
export type FacetRef = FacetSlot<string>

export interface BorderIntent<T = string> {
  side: BorderSideSuffix
  width?: FacetSlot<T>
  color?: FacetSlot<T>
  /**
   * The style facet, when stated. A keyword rather than a token, so a string caller reads
   * `borderStyleKeyword(border)` to get it with `solid` filled in; the Figma plugin has no
   * stroke style to set and ignores it.
   */
  style?: FacetSlot<T>
  /**
   * True when the border was stated by width/colour/style but has no colour of its own. Every
   * target resolves that the same way in words - "follow the ink" - and differently in code:
   * `currentColor`, the inherited `ink` RGBA, the ink binding. Saying it here means none of them
   * has to remember it.
   */
  colorFollowsInk: boolean
}

/**
 * The four inset edges, LOGICAL (proposal 0057 §4.4): a design system reads the same in a
 * right-to-left locale. The web tier spells them as logical CSS properties; a target that only
 * has physical sides asks `insetsPhysical`.
 */
export interface EdgeIntent<T = string> {
  blockStart?: FacetSlot<T>
  blockEnd?: FacetSlot<T>
  inlineStart?: FacetSlot<T>
  inlineEnd?: FacetSlot<T>
}

/** The four edges as physical sides, for a target that has no logical ones. */
export interface PhysicalEdgeIntent<T = string> {
  top?: FacetSlot<T>
  right?: FacetSlot<T>
  bottom?: FacetSlot<T>
  left?: FacetSlot<T>
}

export interface TextIntent<T = string> {
  size?: FacetSlot<T>
  weight?: FacetSlot<T>
  family?: FacetSlot<T>
  /** `normal | italic | oblique`, a keyword facet: the value is the value. */
  slant?: FacetSlot<T>
}

export interface FacetIntent<T = string> {
  fill?: FacetSlot<T>
  ink?: FacetSlot<T>
  corner?: FacetSlot<T>
  insets: EdgeIntent<T>
  gap?: FacetSlot<T>
  opacity?: FacetSlot<T>
  elevation?: FacetSlot<T>
  borders: BorderIntent<T>[]
  /**
   * Present when a focus ring was asked for. The ring facet IS its colour, so there is no
   * "ring without a colour" to express here - a colour that fails to RESOLVE falls back to the
   * ink, and that is the reader's business rather than the intent's.
   */
  ring?: { color: FacetSlot<T> }
  text: TextIntent<T>
}

/** The ring's geometry, in neutral units. Both numbers were `2px` inlined in the web tier. */
export const RING_WIDTH = 2
export const RING_OFFSET = 2

/**
 * Is this leaf a stated value? The default answers for the authored-string case: an empty value
 * is absent, not "stated as nothing", because clearing a facet in the editor removes the key
 * entirely. A caller whose leaves are richer (a Figma binding is an object) passes its own.
 */
export type FacetPresence<T> = (value: T) => boolean

const statedString: FacetPresence<unknown> = (v) => v != null && v !== ''

/**
 * The facet map as slots. Pure, and total: an absent facet is an absent slot rather than a
 * baseline value, because "what does absent look like" is the target's answer (`transparent`,
 * `inherit`, or simply not setting the property) and it differs.
 */
export function resolveFacetIntent<T>(
  facets: Record<string, T> | undefined,
  isStated: FacetPresence<T> = statedString as FacetPresence<T>,
): FacetIntent<T> {
  const f: Record<string, T> = facets ?? {}

  const ref = (key: string): FacetSlot<T> | undefined => {
    const value = f[key]
    if (value === undefined || !isStated(value)) return undefined
    return { key, value, scale: FACETS[key]?.scale }
  }

  // The most specific key wins, per edge (proposal 0057 §4.4): an edge's own key, then its
  // axis, then the shorthand. So `inset: 4, insetY: 0` is four edges with two values, and
  // `inset: 4, inset.inline-start: 2` is four edges of which one differs. A stated zero is a
  // value rather than a falsy nothing.
  const inset = ref('inset')
  const inline = ref('insetX') ?? inset
  const block = ref('insetY') ?? inset
  const insets: EdgeIntent<T> = {
    blockStart: ref('inset.block-start') ?? block,
    blockEnd: ref('inset.block-end') ?? block,
    inlineStart: ref('inset.inline-start') ?? inline,
    inlineEnd: ref('inset.inline-end') ?? inline,
  }

  const borders: BorderIntent<T>[] = []
  for (const { suffix } of BORDER_SIDES) {
    const width = ref(`border${suffix}.width`)
    const color = ref(`border${suffix}.color`)
    // The style is a KEYWORD facet, so its leaf is the keyword itself for a string caller and a
    // binding for the plugin - `styleSlot.value` is only spelled as a string where a string is
    // what the caller put in (see `borderStyleKeyword`).
    const style = ref(`border${suffix}.style`)
    // Presence, in one place: any of the three states a border. This is why a component with
    // only `border.color` still gets a visible edge - the width defaults, it is not skipped.
    if (!width && !color && !style) continue
    borders.push({
      side: suffix,
      width,
      color,
      style,
      colorFollowsInk: !color,
    })
  }

  const ring = ref('ring')

  return {
    fill: ref('fill'),
    ink: ref('ink'),
    corner: ref('corner'),
    insets,
    gap: ref('gap'),
    opacity: ref('opacity'),
    elevation: ref('elevation'),
    borders,
    ...(ring ? { ring: { color: ring } } : {}),
    text: {
      size: ref('text.size'),
      weight: ref('text.weight'),
      family: ref('font'),
      slant: ref('slant'),
    },
  }
}

/**
 * Whether the four edges carry one value, so a target with a shorthand (CSS `padding`) can use
 * it instead of four declarations. A convenience the web tier needs and the others do not - but
 * it is a question about the intent, so it belongs here rather than being re-derived.
 */
export function insetsAreUniform<T>(insets: EdgeIntent<T>): boolean {
  const values = [insets.blockStart, insets.blockEnd, insets.inlineStart, insets.inlineEnd].map(
    (r) => r?.value,
  )
  return values.every((v) => v === values[0])
}

/** Whether both edges of each axis carry one value, so CSS can say `padding-block` / `-inline`. */
export function insetAxesAreSymmetric<T>(insets: EdgeIntent<T>): boolean {
  return (
    insets.blockStart?.value === insets.blockEnd?.value &&
    insets.inlineStart?.value === insets.inlineEnd?.value
  )
}

/**
 * The logical edges as physical sides, in a horizontal left-to-right system - the assumption
 * `edgesToPhysical` makes for `pinned` and `bleed` too (proposal 0056 §8). The IR has no writing
 * direction yet; when it does, this and `edgesToPhysical` are the two places that read it.
 */
export function insetsPhysical<T>(insets: EdgeIntent<T>): PhysicalEdgeIntent<T> {
  return {
    top: insets.blockStart,
    right: insets.inlineEnd,
    bottom: insets.blockEnd,
    left: insets.inlineStart,
  }
}

/**
 * A border's style as the keyword it is, defaulting to `solid`. Only meaningful for a caller
 * whose leaves are the authored strings; the Figma plugin has no stroke style to set and does
 * not ask.
 */
export function borderStyleKeyword(border: BorderIntent<string>): string {
  return border.style?.value ?? 'solid'
}

// ─── Slot coverage: a target has to say something about every slot ───────────
// The point of naming the slots is that they can be counted. A new one - core gains a facet, or
// an existing facet starts feeding somewhere new - used to mean remembering three files, and
// forgetting one meant a design system quietly rendering differently on one target.
//
// `FacetSlotName` closes the list, so each target declares a TOTAL record over it. Adding a slot
// here is then a compile error in the web tier, the Mac canvas and the Figma plugin until each
// has said what it does with it - including saying "nothing, and here is why", which is the
// answer for a focus ring in a static preview.
//
// The granularity is per THING A TARGET CAN SUPPORT, which is why the four edges are one slot
// (no target supports a subset) while an all-sides border and a per-edge one are two (Figma and
// AppKit draw the first and refuse the second).
export const FACET_SLOTS = [
  'fill',
  'ink',
  'corner',
  'insets',
  'gap',
  'opacity',
  'elevation',
  'border',
  'borderPerEdge',
  'ring',
  'textSize',
  'textWeight',
  'textFamily',
  'textSlant',
] as const

export type FacetSlotName = (typeof FACET_SLOTS)[number]

/**
 * Which slots this intent actually fills. A target walks this against its own coverage record,
 * so "what could not be translated" is derived from the two rather than hand-written per branch.
 */
export function filledSlots<T>(intent: FacetIntent<T>): FacetSlotName[] {
  const filled: FacetSlotName[] = []
  const add = (name: FacetSlotName, present: unknown) => {
    if (present) filled.push(name)
  }
  add('fill', intent.fill)
  add('ink', intent.ink)
  add('corner', intent.corner)
  add(
    'insets',
    intent.insets.blockStart ??
      intent.insets.blockEnd ??
      intent.insets.inlineStart ??
      intent.insets.inlineEnd,
  )
  add('gap', intent.gap)
  add('opacity', intent.opacity)
  add('elevation', intent.elevation)
  add(
    'border',
    intent.borders.some((b) => b.side === ''),
  )
  add(
    'borderPerEdge',
    intent.borders.some((b) => b.side !== ''),
  )
  add('ring', intent.ring)
  add('textSize', intent.text.size)
  add('textWeight', intent.text.weight)
  add('textFamily', intent.text.family)
  add('textSlant', intent.text.slant)
  return filled
}

/**
 * What a target does with a slot: `null` when it renders it, a reason when it cannot. The reason
 * is the message a user sees, so it says what is missing rather than that something is missing.
 */
export type SlotCoverage = Record<FacetSlotName, string | null>

/** The slots this target cannot render, out of the ones this intent fills. */
export function unsupportedSlots<T>(
  intent: FacetIntent<T>,
  coverage: SlotCoverage,
): { slot: FacetSlotName; reason: string }[] {
  const out: { slot: FacetSlotName; reason: string }[] = []
  for (const slot of filledSlots(intent)) {
    const reason = coverage[slot]
    if (reason) out.push({ slot, reason })
  }
  return out
}

// ─── The cascade: a later layer wins per EDGE, not per key (proposal 0057 §4.5) ──
// A node's facets are its base map with each matching state rule laid over it. Laying them over
// KEY BY KEY was wrong wherever one idea has keys of different reach - an inset on all four edges,
// one axis, or one edge; a border on all sides or one. A base `insetX: 4` under a hover rule's
// `inset: 8` merged to `{ insetX: 4, inset: 8 }`, and the axis then beat the shorthand: the
// Studio preview and the Mac canvas drew 8/4/8/4 on hover. The generated React emits the rule
// into its own `:hover` selector, where the browser lets `padding: 8px` override the base's
// `padding-inline` - 8 everywhere, which is what the author wrote. Two targets, two answers.
//
// The rule now matches the browser: a layer's key SHADOWS every earlier key of the same idea
// whose edges it fully covers. Within one layer the most specific key still wins (§4.4), and
// that is also what the web tier emits, so the merged map means exactly what the CSS computes.

type Edge = 'block-start' | 'block-end' | 'inline-start' | 'inline-end'

const ALL_EDGES: readonly Edge[] = ['block-start', 'block-end', 'inline-start', 'inline-end']

const INSET_REACH: Record<string, readonly Edge[]> = {
  inset: ALL_EDGES,
  insetX: ['inline-start', 'inline-end'],
  insetY: ['block-start', 'block-end'],
  'inset.block-start': ['block-start'],
  'inset.block-end': ['block-end'],
  'inset.inline-start': ['inline-start'],
  'inset.inline-end': ['inline-end'],
}

// Border sides: physical sides read as the logical edge they name left to right, the same
// assumption `insetsPhysical` makes. The browser resolves `border-top` and `border-block-start`
// into one cascade the same way.
const BORDER_REACH: Record<BorderSideSuffix, readonly Edge[]> = {
  '': ALL_EDGES,
  '.top': ['block-start'],
  '.right': ['inline-end'],
  '.bottom': ['block-end'],
  '.left': ['inline-start'],
  '.inline-start': ['inline-start'],
  '.inline-end': ['inline-end'],
  '.block-start': ['block-start'],
  '.block-end': ['block-end'],
}

const BORDER_KEY = /^border((?:\.[a-z-]+)?)\.(width|color|style)$/

/** Which idea a facet key belongs to and which edges it reaches, or undefined for a key that
 *  has no edges (a fill, a corner) and is simply replaced. */
export function facetReach(key: string): { group: string; edges: readonly Edge[] } | undefined {
  if (isInsetKey(key)) return { group: 'inset', edges: INSET_REACH[key]! }
  const m = BORDER_KEY.exec(key)
  if (m) {
    const edges = BORDER_REACH[m[1] as BorderSideSuffix]
    if (edges) return { group: `border.${m[2]}`, edges }
  }
  return undefined
}

/**
 * `layer` laid over `base`: every key of `layer` replaces its own name, and also removes each
 * earlier key of the same group whose edges it covers. Pure; neither argument is changed.
 */
export function overlayFacets(
  base: Record<string, string>,
  layer: Record<string, string> | undefined,
): Record<string, string> {
  if (!layer) return base
  const out = { ...base }
  for (const key of Object.keys(layer)) {
    const reach = facetReach(key)
    if (!reach) continue
    for (const earlier of Object.keys(out)) {
      if (earlier === key) continue
      const r = facetReach(earlier)
      if (r && r.group === reach.group && r.edges.every((e) => reach.edges.includes(e)))
        delete out[earlier]
    }
  }
  return Object.assign(out, layer)
}
