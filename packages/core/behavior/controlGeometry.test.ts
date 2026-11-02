import { describe, expect, it } from 'vitest'
import { SWITCH_GEOMETRY, switchThumbTravel, type SwitchGeometry } from './controlGeometry'
import type { Length } from '../foundations/dimensions'

// The point of `switchThumbTravel` is that it CANNOT go stale, which is a property of the
// relationship rather than of any one number - so these test the relationship. The old
// literal `translateX(16px)` would pass the first case here and fail every other one.

const fixed = (value: number) => ({ kind: 'fixed' as const, value })

/** Every length these cases build is fixed; anything else is the test's own bug. */
function px(l: Length): number {
  if (l.kind !== 'fixed') throw new Error(`expected a fixed length, got ${l.kind}`)
  return l.value
}

function withTrack(over: Partial<SwitchGeometry['track']>): SwitchGeometry {
  return { ...SWITCH_GEOMETRY, track: { ...SWITCH_GEOMETRY.track, ...over } }
}

describe('switchThumbTravel', () => {
  it('is the track inner width minus the thumb', () => {
    // 40 - 2x1 border - 2x2 padding - 18 thumb
    expect(switchThumbTravel()).toEqual(fixed(16))
  })

  it('follows the track when it gets wider', () => {
    expect(switchThumbTravel(withTrack({ width: fixed(44) }))).toEqual(fixed(20))
  })

  it('follows the padding and the border, which both eat into the same space', () => {
    expect(switchThumbTravel(withTrack({ padding: fixed(4) }))).toEqual(fixed(12))
    expect(switchThumbTravel(withTrack({ borderWidth: fixed(2) }))).toEqual(fixed(14))
  })

  it('follows the thumb', () => {
    const g = { ...SWITCH_GEOMETRY, thumb: { ...SWITCH_GEOMETRY.thumb, size: fixed(20) } }
    expect(switchThumbTravel(g)).toEqual(fixed(14))
  })

  it('leaves the thumb flush against the far edge', () => {
    // The end position, measured from the outside of the track, must land the thumb's far
    // edge exactly on the track's inner edge. This is the invariant the frozen string could
    // not hold: nothing catches the thumb if it overshoots.
    const g = withTrack({ width: fixed(64), padding: fixed(3) })
    const { width, borderWidth, padding } = g.track
    const rest = px(borderWidth) + px(padding)
    const far = rest + px(switchThumbTravel(g)) + px(g.thumb.size)
    expect(far).toBe(px(width) - px(borderWidth) - px(padding))
  })

  it('refuses to guess when the geometry mixes unit families', () => {
    // An em-sized track cannot be resolved without the element's text metrics, and a wrong
    // number here would silently mis-place the thumb on every target. Zero is the caller's
    // signal to compute it itself.
    const g = withTrack({ width: { kind: 'em', value: 3 } })
    expect(switchThumbTravel(g)).toEqual(fixed(0))
  })
})
