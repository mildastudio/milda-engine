// Calendar behavior core (proposal 0029, Tier 1).
//
// Pure TypeScript: no DOM, no JSX, no framework, no ambient clock (`today` is an
// INPUT, never read from Date.now) and no i18n (month/weekday *labels* are the
// view's Intl concern - this core only orders and classifies cells). It is the
// single source of truth for DatePicker logic, imported verbatim by every web
// framework view so a React MFE and a Vue MFE compute an identical calendar.
//
// Internal canonical form is `{ year, month, day }` with **month 1-12** (calendar-
// honest, matching Temporal.PlainDate / @internationalized/date CalendarDate, and
// avoiding the JS Date 0-index footgun leaking into this layer). The thin view
// converts to/from the project's chosen representation (isoDate | nativeDate | ...)
// at the boundary; representation never enters this file.

/** A timezone-less calendar date. `month` is 1-12, `day` is 1-31. */
export interface YMD {
  year: number
  month: number
  day: number
}

/** 0 = Sunday ... 6 = Saturday (matches `Date.prototype.getUTCDay`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type SingleSelection = YMD | null
/** `end` is null while the user has picked only the first endpoint. */
export type RangeSelection = { start: YMD; end: YMD | null } | null

export interface CalendarInput {
  /** Month currently shown in the grid. `month` is 1-12. */
  displayedMonth: { year: number; month: number }
  /** First column of the grid. Defaults to Sunday (0). */
  weekStartsOn?: Weekday
  mode?: 'single' | 'range'
  /** `SingleSelection` in single mode, `RangeSelection` in range mode. */
  selection?: SingleSelection | RangeSelection
  /** Inclusive lower bound; dates before it are `disabled`. */
  min?: YMD
  /** Inclusive upper bound; dates after it are `disabled`. */
  max?: YMD
  /** Weekday indices (0-6) that are always `disabled` (e.g. weekends). */
  disabledWeekdays?: Weekday[]
  /** Range mode: the cell under the cursor, for previewing the span. */
  hoverPreview?: YMD | null
  /** The reference "today", injected so the core stays pure/deterministic. */
  today?: YMD | null
  /** Escape hatch: arbitrary per-date disabling (proposal 0029 §2). */
  isDateDisabled?: (date: YMD) => boolean
  /** Escape hatch: arbitrary per-date highlighting. */
  isDateHighlighted?: (date: YMD) => boolean
}

export interface CalendarCellState {
  today: boolean
  disabled: boolean
  /** Cell belongs to a previous/next month, shown to complete the week. */
  outsideMonth: boolean
  selected: boolean
  rangeStart: boolean
  rangeEnd: boolean
  /** Strictly between the range endpoints (endpoints excluded). */
  inRange: boolean
  highlighted: boolean
}

export interface CalendarCell {
  date: YMD
  states: CalendarCellState
}

export interface CalendarModel {
  displayedMonth: { year: number; month: number }
  /** The 7 weekday indices in display order, e.g. `[1,2,3,4,5,6,0]` for Monday-start. */
  weekdayOrder: Weekday[]
  /** Complete weeks (7 cells each) covering the displayed month. */
  weeks: CalendarCell[][]
  /** Displayed month shifted by -1, for the "prev" control. */
  prevMonth: { year: number; month: number }
  /** Displayed month shifted by +1, for the "next" control. */
  nextMonth: { year: number; month: number }
}

// --- pure date arithmetic (UTC-based, deterministic given inputs) --------------

/** Number of days in a 1-12 month. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the *next* month rolls back to the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Weekday (0 = Sunday) of a calendar date. */
export function dayOfWeek(d: YMD): Weekday {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() as Weekday
}

/** Add (or subtract) whole days, normalizing across month/year boundaries. */
export function addDays(d: YMD, n: number): YMD {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day + n))
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

/** Shift a year/month by `delta` months (1-12 output month). */
export function addMonths(m: { year: number; month: number }, delta: number): {
  year: number
  month: number
} {
  const zeroBased = m.year * 12 + (m.month - 1) + delta
  return { year: Math.floor(zeroBased / 12), month: ((zeroBased % 12) + 12) % 12 + 1 }
}

/** Chronological comparison: negative if `a < b`, 0 if equal, positive if `a > b`. */
export function compareYMD(a: YMD, b: YMD): number {
  return a.year - b.year || a.month - b.month || a.day - b.day
}

const sameDay = (a: YMD | null | undefined, b: YMD | null | undefined): boolean =>
  !!a && !!b && compareYMD(a, b) === 0

// --- model construction --------------------------------------------------------

type EffectiveRange = { a: YMD; b: YMD | null } | null

/** Normalize a range selection (+ optional hover preview) into ordered endpoints. */
function effectiveRange(sel: RangeSelection, hover: YMD | null | undefined): EffectiveRange {
  if (!sel) return null
  const end = sel.end ?? hover ?? null
  if (!end) return { a: sel.start, b: null }
  return compareYMD(sel.start, end) <= 0 ? { a: sel.start, b: end } : { a: end, b: sel.start }
}

export function buildCalendar(input: CalendarInput): CalendarModel {
  const weekStartsOn = input.weekStartsOn ?? 0
  const mode = input.mode ?? 'single'
  const { year, month } = input.displayedMonth
  const disabledWeekdays = new Set(input.disabledWeekdays ?? [])

  const single = mode === 'single' ? (input.selection as SingleSelection) ?? null : null
  const range = mode === 'range' ? effectiveRange((input.selection as RangeSelection) ?? null, input.hoverPreview) : null

  // Leading blanks: how many days of the previous month fill the first row.
  const firstDow = dayOfWeek({ year, month, day: 1 })
  const lead = (firstDow - weekStartsOn + 7) % 7
  const gridStart = addDays({ year, month, day: 1 }, -lead)

  const total = daysInMonth(year, month)
  const weeksCount = Math.ceil((lead + total) / 7)

  const weeks: CalendarCell[][] = []
  for (let w = 0; w < weeksCount; w++) {
    const row: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d)
      row.push({ date, states: classify(date) })
    }
    weeks.push(row)
  }

  return {
    displayedMonth: { year, month },
    weekdayOrder: Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday),
    weeks,
    prevMonth: addMonths({ year, month }, -1),
    nextMonth: addMonths({ year, month }, 1),
  }

  function classify(date: YMD): CalendarCellState {
    const disabled =
      (input.min != null && compareYMD(date, input.min) < 0) ||
      (input.max != null && compareYMD(date, input.max) > 0) ||
      disabledWeekdays.has(dayOfWeek(date)) ||
      (input.isDateDisabled?.(date) ?? false)

    const rangeStart = !!range && (range.b != null ? sameDay(date, range.a) : sameDay(date, range.a))
    const rangeEnd = !!range && range.b != null && sameDay(date, range.b)
    const inRange =
      !!range &&
      range.b != null &&
      compareYMD(date, range.a) > 0 &&
      compareYMD(date, range.b) < 0

    const selected = mode === 'range' ? rangeStart || rangeEnd : sameDay(date, single)

    return {
      today: sameDay(date, input.today),
      disabled,
      outsideMonth: date.month !== month || date.year !== year,
      selected,
      rangeStart,
      rangeEnd,
      inRange,
      highlighted: input.isDateHighlighted?.(date) ?? false,
    }
  }
}
