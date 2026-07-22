import { describe, expect, it } from 'vitest'

import { buildTimeList, compareHM, fromMinutes, toMinutes } from './timepicker'

describe('time helpers', () => {
  it('toMinutes / fromMinutes round-trip and wrap', () => {
    expect(toMinutes({ hour: 9, minute: 30 })).toBe(570)
    expect(fromMinutes(570)).toEqual({ hour: 9, minute: 30 })
    expect(fromMinutes(1440)).toEqual({ hour: 0, minute: 0 }) // wraps
    expect(fromMinutes(-30)).toEqual({ hour: 23, minute: 30 }) // wraps negative
  })

  it('compareHM orders within a day', () => {
    expect(compareHM({ hour: 9, minute: 0 }, { hour: 9, minute: 30 })).toBeLessThan(0)
    expect(compareHM({ hour: 10, minute: 0 }, { hour: 9, minute: 59 })).toBeGreaterThan(0)
    expect(compareHM({ hour: 9, minute: 0 }, { hour: 9, minute: 0 })).toBe(0)
  })
})

describe('buildTimeList', () => {
  it('generates a full day of slots at the given step', () => {
    expect(buildTimeList({ step: 30 })).toHaveLength(48)
    expect(buildTimeList({ step: 60 })).toHaveLength(24)
    expect(buildTimeList({ step: 15 })).toHaveLength(96)
    const first = buildTimeList({ step: 30 })[0]
    expect(first.value).toEqual({ hour: 0, minute: 0 })
    expect(buildTimeList({ step: 30 })[1].value).toEqual({ hour: 0, minute: 30 })
  })

  it('clamps a non-positive step to 1 minute (no infinite loop)', () => {
    expect(buildTimeList({ step: 0 })).toHaveLength(1440)
  })

  it('disables slots outside [min, max]', () => {
    const cells = buildTimeList({ step: 60, min: { hour: 9, minute: 0 }, max: { hour: 17, minute: 0 } })
    const at = (h: number) => cells.find((c) => c.value.hour === h && c.value.minute === 0)!
    expect(at(8).states.disabled).toBe(true)
    expect(at(9).states.disabled).toBe(false)
    expect(at(17).states.disabled).toBe(false)
    expect(at(18).states.disabled).toBe(true)
  })

  it('marks the selected slot', () => {
    const cells = buildTimeList({ step: 30, selection: { hour: 13, minute: 30 } })
    const selected = cells.filter((c) => c.states.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0].value).toEqual({ hour: 13, minute: 30 })
  })

  it('honors the isTimeDisabled escape hatch', () => {
    const cells = buildTimeList({ step: 60, isTimeDisabled: (t) => t.hour === 12 })
    const noon = cells.find((c) => c.value.hour === 12)!
    expect(noon.states.disabled).toBe(true)
    expect(cells.find((c) => c.value.hour === 11)!.states.disabled).toBe(false)
  })
})
