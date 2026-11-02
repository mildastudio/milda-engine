import { describe, expect, it } from 'vitest'
import {
  LAYOUT_SLOTS,
  edgesToPhysical,
  filledLayoutSlots,
  formatAxisSize,
  formatPosition,
  mainAxisOf,
  parseAxisSize,
  parsePosition,
  resolveLayoutIntent,
  unsupportedLayoutSlots,
  type LayoutCoverage,
} from './layoutIntent'

// ─── 0056 §3.4: the record read once ─────────────────────────────────────────
// The record's values are the surface's words. What is asserted here is the reading every
// target shares, so a target cannot parse `weight(2)` its own way and get a different number.

describe('an axis value', () => {
  it('reads the five intents and prints them back', () => {
    for (const v of ['fit', 'fill', 'weight(2)', 'weight(1.5)', 'ratio(16:9)', 'md', '240']) {
      expect(formatAxisSize(parseAxisSize(v)!)).toBe(v)
    }
    expect(parseAxisSize('weight(2)')).toEqual({ mode: 'weight', weight: 2 })
    expect(parseAxisSize('ratio(16:9)')).toEqual({ mode: 'ratio', w: 16, h: 9 })
  })

  it('treats anything that is not an intent word as a fixed size, token or literal alike', () => {
    expect(parseAxisSize('md')).toEqual({ mode: 'fixed', value: 'md' })
    expect(parseAxisSize('12px')).toEqual({ mode: 'fixed', value: '12px' })
    // A malformed intent is not silently a different intent.
    expect(parseAxisSize('weight(two)')).toEqual({ mode: 'fixed', value: 'weight(two)' })
  })
})

describe('a position value', () => {
  it('reads overlay, pinned and bleed with their edges', () => {
    expect(parsePosition('overlay')).toEqual({ kind: 'overlay' })
    expect(parsePosition('pinned block-start')).toEqual({ kind: 'pinned', edges: ['block-start'] })
    expect(parsePosition('bleed inline all')).toEqual({ kind: 'bleed', edges: ['inline', 'all'] })
  })

  it('treats flow and an unknown word as no position, and no edge as every edge', () => {
    expect(parsePosition('flow')).toBeUndefined()
    expect(parsePosition(undefined)).toBeUndefined()
    expect(parsePosition('sticky')).toBeUndefined()
    expect(parsePosition('bleed')).toEqual({ kind: 'bleed', edges: ['all'] })
    expect(parsePosition('pinned leftish')).toEqual({ kind: 'pinned', edges: ['all'] })
  })

  it('prints back what it read', () => {
    for (const v of ['overlay', 'pinned block-start inline-end', 'bleed all']) {
      expect(formatPosition(parsePosition(v)!)).toBe(v)
    }
  })

  it('resolves logical edges to sides of a box, left-to-right, in a fixed order', () => {
    expect(edgesToPhysical(['block-start'])).toEqual(['top'])
    expect(edgesToPhysical(['inline'])).toEqual(['right', 'left'])
    expect(edgesToPhysical(['block', 'inline-start'])).toEqual(['top', 'bottom', 'left'])
    expect(edgesToPhysical(['all'])).toEqual(['top', 'right', 'bottom', 'left'])
  })
})

describe('the intent and its coverage', () => {
  it('reads a whole record and ignores a word no slot accepts', () => {
    expect(
      resolveLayoutIntent({
        direction: 'layers',
        align: 'baseline',
        distribute: 'space-between',
        wrap: 'wrap-reverse',
        width: 'weight(2)',
        heightMax: 'lg',
        position: 'bleed inline',
      }),
    ).toEqual({
      direction: 'layers',
      align: 'baseline',
      wrap: 'wrap-reverse',
      width: { mode: 'weight', weight: 2 },
      heightMax: 'lg',
      position: { kind: 'bleed', edges: ['inline'] },
    })
    expect(resolveLayoutIntent(undefined)).toEqual({})
  })

  it('knows which axis a parent’s children share', () => {
    expect(mainAxisOf('row')).toBe('width')
    expect(mainAxisOf('column')).toBe('height')
    expect(mainAxisOf('layers')).toBeUndefined()
    expect(mainAxisOf(undefined)).toBeUndefined()
  })

  it('derives the report from the coverage rather than from a branch per word', () => {
    const intent = resolveLayoutIntent({
      direction: 'layers',
      distribute: 'evenly',
      width: 'ratio(1:1)',
      widthMin: 'sm',
      position: 'pinned all',
    })
    expect(filledLayoutSlots(intent)).toEqual(['layers', 'evenly', 'ratio', 'clamp', 'pinned'])
    const coverage: LayoutCoverage = Object.fromEntries(
      LAYOUT_SLOTS.map((s) => [s, null]),
    ) as LayoutCoverage
    expect(unsupportedLayoutSlots(intent, coverage)).toEqual([])
    coverage.pinned = 'no scroll'
    coverage.weight = 'unused here, so never reported'
    expect(unsupportedLayoutSlots(intent, coverage)).toEqual([
      { slot: 'pinned', reason: 'no scroll' },
    ])
  })
})
