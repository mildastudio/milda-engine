import { describe, expect, it } from 'vitest'

import {
  addDays,
  addMonths,
  buildCalendar,
  compareYMD,
  dayOfWeek,
  daysInMonth,
  type YMD,
} from './calendar'

const jul2026 = { year: 2026, month: 7 }
const at = (cells: ReturnType<typeof buildCalendar>['weeks'], day: number, month = 7) =>
  cells.flat().find((c) => c.date.day === day && c.date.month === month)!

describe('pure date arithmetic', () => {
  it('daysInMonth handles leap years and month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2023, 2)).toBe(28)
    expect(daysInMonth(2026, 7)).toBe(31)
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  it('dayOfWeek returns 0=Sun..6=Sat', () => {
    expect(dayOfWeek({ year: 2026, month: 7, day: 1 })).toBe(3) // Wed
    expect(dayOfWeek({ year: 2024, month: 2, day: 29 })).toBe(4) // Thu
  })

  it('addDays normalizes across month/year boundaries', () => {
    expect(addDays({ year: 2026, month: 7, day: 31 }, 1)).toEqual({ year: 2026, month: 8, day: 1 })
    expect(addDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    })
  })

  it('addMonths wraps the year', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths({ year: 2026, month: 7 }, 13)).toEqual({ year: 2027, month: 8 })
  })

  it('compareYMD orders chronologically', () => {
    const a: YMD = { year: 2026, month: 7, day: 1 }
    expect(compareYMD(a, { year: 2026, month: 7, day: 2 })).toBeLessThan(0)
    expect(compareYMD(a, { ...a })).toBe(0)
    expect(compareYMD({ year: 2027, month: 1, day: 1 }, a)).toBeGreaterThan(0)
  })
})

describe('grid construction', () => {
  it('Sunday-start July 2026 has 3 leading June days and 31 in-month cells', () => {
    const { weeks, weekdayOrder, prevMonth, nextMonth } = buildCalendar({
      displayedMonth: jul2026,
      weekStartsOn: 0,
    })
    expect(weeks[0][0].date).toEqual({ year: 2026, month: 6, day: 28 })
    expect(weekdayOrder).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter((c) => !c.states.outsideMonth)).toHaveLength(31)
    expect(weeks[0][3].date).toEqual({ year: 2026, month: 7, day: 1 })
    expect(prevMonth).toEqual({ year: 2026, month: 6 })
    expect(nextMonth).toEqual({ year: 2026, month: 8 })
  })

  it('Monday-start shifts the lead and weekday order', () => {
    const { weeks, weekdayOrder } = buildCalendar({ displayedMonth: jul2026, weekStartsOn: 1 })
    expect(weeks[0][0].date).toEqual({ year: 2026, month: 6, day: 29 })
    expect(weekdayOrder).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('a month starting on the week-start has no leading cells', () => {
    // 2026-02-01 is a Sunday.
    const { weeks } = buildCalendar({ displayedMonth: { year: 2026, month: 2 }, weekStartsOn: 0 })
    expect(weeks[0][0].date).toEqual({ year: 2026, month: 2, day: 1 })
  })
})

describe('single selection', () => {
  it('marks exactly one selected cell and today', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      mode: 'single',
      selection: { year: 2026, month: 7, day: 15 },
      today: { year: 2026, month: 7, day: 6 },
    })
    const selected = weeks.flat().filter((c) => c.states.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0].date).toEqual({ year: 2026, month: 7, day: 15 })
    const today = weeks.flat().filter((c) => c.states.today)
    expect(today).toHaveLength(1)
    expect(today[0].date).toEqual({ year: 2026, month: 7, day: 6 })
  })
})

describe('min / max / disabledWeekdays', () => {
  it('disables out-of-bounds and disabled-weekday cells', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      min: { year: 2026, month: 7, day: 10 },
      max: { year: 2026, month: 7, day: 20 },
      disabledWeekdays: [0, 6], // weekends
    })
    expect(at(weeks, 5).states.disabled).toBe(true) // < min
    expect(at(weeks, 25).states.disabled).toBe(true) // > max
    expect(at(weeks, 15).states.disabled).toBe(false) // in range, weekday
    expect(at(weeks, 11).states.disabled).toBe(true) // Sat, within bounds but weekend
  })
})

describe('range selection', () => {
  it('marks endpoints and strictly-between cells', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      mode: 'range',
      selection: { start: { year: 2026, month: 7, day: 10 }, end: { year: 2026, month: 7, day: 14 } },
    })
    expect(at(weeks, 10).states.rangeStart).toBe(true)
    expect(at(weeks, 14).states.rangeEnd).toBe(true)
    expect(at(weeks, 12).states.inRange).toBe(true)
    expect(at(weeks, 10).states.inRange).toBe(false) // endpoint excluded
    expect(at(weeks, 9).states.inRange).toBe(false)
    expect(at(weeks, 10).states.selected && at(weeks, 14).states.selected).toBe(true)
  })

  it('normalizes reversed endpoints', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      mode: 'range',
      selection: { start: { year: 2026, month: 7, day: 20 }, end: { year: 2026, month: 7, day: 16 } },
    })
    expect(at(weeks, 16).states.rangeStart).toBe(true)
    expect(at(weeks, 20).states.rangeEnd).toBe(true)
    expect(at(weeks, 18).states.inRange).toBe(true)
  })

  it('previews the span from start to hover when only start is picked', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      mode: 'range',
      selection: { start: { year: 2026, month: 7, day: 10 }, end: null },
      hoverPreview: { year: 2026, month: 7, day: 13 },
    })
    expect(at(weeks, 10).states.rangeStart).toBe(true)
    expect(at(weeks, 13).states.rangeEnd).toBe(true)
    expect(at(weeks, 12).states.inRange).toBe(true)
  })
})

describe('escape-hatch predicates', () => {
  it('honors isDateDisabled and isDateHighlighted', () => {
    const { weeks } = buildCalendar({
      displayedMonth: jul2026,
      isDateDisabled: (d) => d.day === 4,
      isDateHighlighted: (d) => d.day === 6,
    })
    expect(at(weeks, 4).states.disabled).toBe(true)
    expect(at(weeks, 6).states.highlighted).toBe(true)
    expect(at(weeks, 5).states.disabled).toBe(false)
    expect(at(weeks, 5).states.highlighted).toBe(false)
  })
})
