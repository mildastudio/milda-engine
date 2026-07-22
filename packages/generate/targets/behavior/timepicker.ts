// Time behavior core (proposal 0029, Tier 1 - sibling of calendar.ts).
//
// Pure TypeScript: no DOM, no JSX, no framework, no i18n (labels are the view's
// Intl concern). Single source of truth for TimePicker slot logic, vendored beside
// the component so every framework target computes an identical time list. Canonical
// form is `{ hour, minute }` (24h, hour 0-23, minute 0-59); the thin view converts
// to/from the project's representation and formats labels via Intl.

/** A wall-clock time of day. `hour` is 0-23, `minute` is 0-59. */
export interface HM {
  hour: number
  minute: number
}

export interface TimeInput {
  /** Minutes between adjacent slots (e.g. 15, 30, 60). Clamped to >= 1. */
  step: number
  /** Inclusive earliest selectable time; earlier slots are `disabled`. */
  min?: HM
  /** Inclusive latest selectable time; later slots are `disabled`. */
  max?: HM
  selection?: HM | null
  /** Escape hatch: arbitrary per-slot disabling. */
  isTimeDisabled?: (time: HM) => boolean
}

export interface TimeCellState {
  selected: boolean
  disabled: boolean
}

export interface TimeCell {
  value: HM
  states: TimeCellState
}

// --- pure helpers --------------------------------------------------------------

/** Minutes since midnight for an HM (0-1439). */
export function toMinutes(t: HM): number {
  return t.hour * 60 + t.minute
}

/** HM from minutes since midnight (wraps into 0-1439). */
export function fromMinutes(n: number): HM {
  const m = ((n % 1440) + 1440) % 1440
  return { hour: Math.floor(m / 60), minute: m % 60 }
}

/** Chronological comparison within a day: negative if `a < b`, 0 if equal. */
export function compareHM(a: HM, b: HM): number {
  return toMinutes(a) - toMinutes(b)
}

// --- slot list construction ----------------------------------------------------

export function buildTimeList(input: TimeInput): TimeCell[] {
  const step = Math.max(1, Math.floor(input.step))
  const cells: TimeCell[] = []
  for (let m = 0; m < 1440; m += step) {
    const value = fromMinutes(m)
    const disabled =
      (input.min != null && compareHM(value, input.min) < 0) ||
      (input.max != null && compareHM(value, input.max) > 0) ||
      (input.isTimeDisabled?.(value) ?? false)
    const selected = input.selection != null && compareHM(value, input.selection) === 0
    cells.push({ value, states: { selected, disabled } })
  }
  return cells
}
