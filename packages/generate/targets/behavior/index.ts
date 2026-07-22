// Tier 1 - framework-agnostic behavior cores (proposal 0029).
//
// Pure TypeScript. NO DOM, NO JSX, NO framework imports. This tier is the single
// source of truth for *what a component does* (state machines, calendar math,
// selection/range logic) and MUST NOT diverge across framework targets: every
// web view under ../web/<framework> imports the same core from here, so a React
// microfrontend and a Vue microfrontend get bitwise-identical behavior.
//
// First inhabitant: calendar.ts (DatePicker/TimePicker). Select/Combobox state
// machines may migrate here once a second web backend forces the generalization.

export * from './calendar'
export * from './timepicker'
export * from './color'
