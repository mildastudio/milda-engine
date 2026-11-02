import {
  LAYOUT_ALIGNS,
  LAYOUT_DIRECTIONS,
  LAYOUT_DISTRIBUTES,
  LAYOUT_WRAPS,
  LOGICAL_EDGES,
  type LayoutAlign,
  type LayoutDirection,
  type LayoutDistribute,
  type LayoutWrap,
  type LogicalEdge,
} from '@mildastudio/milda'

// ─── Layout intent: what a layout record MEANS, once (proposal 0056 §3.4) ─────
// The editor stores a node's layout as a flat record of the surface's own words: `direction:
// row`, `width: weight(2)`, `position: bleed inline`. Three targets read that record, and before
// this module each of them parsed what it understood and dropped the rest in silence - the kernel
// drew `layers` as a column, the web tier drew `weight(2)` as `100%`, nobody read `position`.
//
// This is the 0048 shape applied to layout. The record is read into a typed intent ONCE, here;
// the things a target can fail to draw are a closed list (`LAYOUT_SLOTS`); each target declares a
// coverage record that is TOTAL over that list, so adding a slot is a compile error in all three
// until each says what it does with it; and the target's "could not translate" report is derived
// from the two rather than written out branch by branch. What stays with each target is the
// VALUE: `flex: 2 1 0%` is the web's spelling of a weight, points are the kernel's.
//
// Nothing here names a property or a unit (invariant 2). `top`/`right`/`bottom`/`left` below are
// geometry - which side of a box - and the same words the kernel's `Paint` already uses for insets.

// ─── An axis ──────────────────────────────────────────────────────────────────

/** One axis of a part, parsed from the record's `width` / `height` value. */
export type AxisSizeIntent =
  | { mode: 'fit' }
  | { mode: 'fill' }
  | { mode: 'weight'; weight: number }
  | { mode: 'ratio'; w: number; h: number }
  /** A size token id or a length literal; which it is is the reader's business (0049). */
  | { mode: 'fixed'; value: string }

const WEIGHT_RE = /^weight\((\d+(?:\.\d+)?)\)$/
const RATIO_RE = /^ratio\((\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\)$/

/**
 * The record's axis value, read. Anything that is not one of the intent words is a fixed size:
 * a token id (`md`) or a length (`240`, `12px`), and the 0049 reading order decides which.
 */
export function parseAxisSize(value: string | undefined): AxisSizeIntent | undefined {
  if (!value) return undefined
  if (value === 'fit' || value === 'fill') return { mode: value }
  const weight = WEIGHT_RE.exec(value)
  if (weight) return { mode: 'weight', weight: Number(weight[1]) }
  const ratio = RATIO_RE.exec(value)
  if (ratio) return { mode: 'ratio', w: Number(ratio[1]), h: Number(ratio[2]) }
  return { mode: 'fixed', value }
}

/** The inverse of `parseAxisSize`: the record's (and the surface's) spelling of an axis. */
export function formatAxisSize(axis: AxisSizeIntent): string {
  switch (axis.mode) {
    case 'fit':
    case 'fill':
      return axis.mode
    case 'weight':
      return `weight(${axis.weight})`
    case 'ratio':
      return `ratio(${axis.w}:${axis.h})`
    case 'fixed':
      return axis.value
  }
}

// ─── A position ───────────────────────────────────────────────────────────────

export type PositionIntent =
  | { kind: 'overlay' }
  | { kind: 'pinned'; edges: LogicalEdge[] }
  | { kind: 'bleed'; edges: LogicalEdge[] }

/**
 * The record's `position` value, read. `flow` (and an absent key) is the default and yields
 * nothing, so "has a position" means "is not in plain flow". Unknown edges are dropped rather
 * than guessed; an edge-taking position with none left means `all`, as it does on the surface.
 */
export function parsePosition(value: string | undefined): PositionIntent | undefined {
  if (!value) return undefined
  const [kind, ...rest] = value.trim().split(/\s+/)
  if (kind === 'overlay') return { kind }
  if (kind === 'pinned' || kind === 'bleed') {
    const edges = rest.filter((e): e is LogicalEdge =>
      (LOGICAL_EDGES as readonly string[]).includes(e),
    )
    return { kind, edges: edges.length ? edges : ['all'] }
  }
  return undefined
}

export function formatPosition(position: PositionIntent): string {
  return position.kind === 'overlay' ? 'overlay' : `${position.kind} ${position.edges.join(' ')}`
}

/** A side of a box. Geometry, not CSS: the kernel's `Paint` names its insets the same way. */
export type PhysicalEdge = 'top' | 'right' | 'bottom' | 'left'

/**
 * Logical edges resolved for a horizontal, left-to-right system - the one assumption every
 * target that draws in physical coordinates (the Mac canvas, Figma) makes today. When the IR
 * gains a writing direction of its own, this is the one place that reads it (0056 §8).
 */
export function edgesToPhysical(edges: readonly LogicalEdge[]): PhysicalEdge[] {
  const out = new Set<PhysicalEdge>()
  for (const edge of edges) {
    switch (edge) {
      case 'block-start':
        out.add('top')
        break
      case 'block-end':
        out.add('bottom')
        break
      case 'inline-start':
        out.add('left')
        break
      case 'inline-end':
        out.add('right')
        break
      case 'block':
        out.add('top')
        out.add('bottom')
        break
      case 'inline':
        out.add('left')
        out.add('right')
        break
      case 'all':
        out.add('top')
        out.add('right')
        out.add('bottom')
        out.add('left')
        break
    }
  }
  return (['top', 'right', 'bottom', 'left'] as const).filter((e) => out.has(e))
}

// ─── The intent ───────────────────────────────────────────────────────────────

export interface LayoutIntent {
  direction?: LayoutDirection
  align?: LayoutAlign
  distribute?: LayoutDistribute
  wrap?: LayoutWrap
  width?: AxisSizeIntent
  height?: AxisSizeIntent
  /** Clamps, each a size token id or a length - read like a fixed axis. */
  widthMin?: string
  widthMax?: string
  heightMin?: string
  heightMax?: string
  position?: PositionIntent
}

const asWord = <T extends string>(words: readonly T[], v: string | undefined): T | undefined =>
  v !== undefined && (words as readonly string[]).includes(v) ? (v as T) : undefined

/** A node's resolved layout record (after the state-rule cascade) read into a typed intent. */
export function resolveLayoutIntent(layout: Record<string, string> | undefined): LayoutIntent {
  if (!layout) return {}
  const out: LayoutIntent = {}
  const direction = asWord(LAYOUT_DIRECTIONS, layout.direction)
  if (direction) out.direction = direction
  const align = asWord(LAYOUT_ALIGNS, layout.align)
  if (align) out.align = align
  const distribute = asWord(LAYOUT_DISTRIBUTES, layout.distribute)
  if (distribute) out.distribute = distribute
  const wrap = asWord(LAYOUT_WRAPS, layout.wrap)
  if (wrap) out.wrap = wrap
  const width = parseAxisSize(layout.width)
  if (width) out.width = width
  const height = parseAxisSize(layout.height)
  if (height) out.height = height
  if (layout.widthMin) out.widthMin = layout.widthMin
  if (layout.widthMax) out.widthMax = layout.widthMax
  if (layout.heightMin) out.heightMin = layout.heightMin
  if (layout.heightMax) out.heightMax = layout.heightMax
  const position = parsePosition(layout.position)
  if (position) out.position = position
  return out
}

/**
 * Which axis a parent's children share - the one `fill` and `weight` divide. A `layers` stack
 * has none: its children do not share space, each takes the box.
 */
export function mainAxisOf(direction: LayoutDirection | undefined): 'width' | 'height' | undefined {
  if (direction === 'row') return 'width'
  if (direction === 'column') return 'height'
  return undefined
}

// ─── Coverage ─────────────────────────────────────────────────────────────────
// The things a target can fail to draw. `fit`, `fill` and a fixed size are not here because every
// target draws them; a slot is for a word with a real chance of an honest "not on this canvas".
// `LayoutSlotName` closes the list, so each target declares a TOTAL record over it.

export const LAYOUT_SLOTS = [
  'layers',
  'baseline',
  'evenly',
  'wrapReverse',
  'weight',
  'ratio',
  'clamp',
  'overlay',
  'pinned',
  'bleed',
] as const

export type LayoutSlotName = (typeof LAYOUT_SLOTS)[number]

/**
 * What a target does with a slot: `null` when it draws it, a reason when it cannot or
 * approximates. The reason is the message a user sees, so it says what the target does instead.
 */
export type LayoutCoverage = Record<LayoutSlotName, string | null>

/** Which slots this intent actually uses. */
export function filledLayoutSlots(intent: LayoutIntent): LayoutSlotName[] {
  const out: LayoutSlotName[] = []
  const add = (slot: LayoutSlotName, when: unknown) => {
    if (when) out.push(slot)
  }
  add('layers', intent.direction === 'layers')
  add('baseline', intent.align === 'baseline')
  add('evenly', intent.distribute === 'evenly')
  add('wrapReverse', intent.wrap === 'wrap-reverse')
  add('weight', intent.width?.mode === 'weight' || intent.height?.mode === 'weight')
  add('ratio', intent.width?.mode === 'ratio' || intent.height?.mode === 'ratio')
  add('clamp', intent.widthMin || intent.widthMax || intent.heightMin || intent.heightMax)
  add('overlay', intent.position?.kind === 'overlay')
  add('pinned', intent.position?.kind === 'pinned')
  add('bleed', intent.position?.kind === 'bleed')
  return out
}

/** The slots this target cannot draw as stated, out of the ones this intent uses. */
export function unsupportedLayoutSlots(
  intent: LayoutIntent,
  coverage: LayoutCoverage,
): { slot: LayoutSlotName; reason: string }[] {
  const out: { slot: LayoutSlotName; reason: string }[] = []
  for (const slot of filledLayoutSlots(intent)) {
    const reason = coverage[slot]
    if (reason) out.push({ slot, reason })
  }
  return out
}

/** The authored value behind a slot, for the note that reports it. */
export function layoutSlotValue(intent: LayoutIntent, slot: LayoutSlotName): string {
  switch (slot) {
    case 'layers':
      return 'layers'
    case 'baseline':
      return 'baseline'
    case 'evenly':
      return 'evenly'
    case 'wrapReverse':
      return 'wrap-reverse'
    case 'weight':
    case 'ratio':
      return [intent.width, intent.height]
        .filter((a): a is AxisSizeIntent => a?.mode === slot)
        .map(formatAxisSize)
        .join(', ')
    case 'clamp':
      return [intent.widthMin, intent.widthMax, intent.heightMin, intent.heightMax]
        .filter((v): v is string => !!v)
        .join(', ')
    case 'overlay':
    case 'pinned':
    case 'bleed':
      return intent.position ? formatPosition(intent.position) : ''
  }
}
