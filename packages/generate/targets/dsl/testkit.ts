// Test-only: reads emitted `.milda` text as LINES rather than as one string.
//
// The DSL emitter is different from the React one: its output is a language, so the exact
// surface spelling IS the contract, and asserting on text is right. What is not right is
// asserting on a substring - `toContain('compute')` is satisfied by the word appearing in
// a token named `computed`, and `toContain('token v : spacing = 12px')` would also pass if
// the emitter wrapped it in something that changed its meaning.
//
// A statement in this language occupies one line, so a line is the honest unit.

const clean = (s: string): string => s.trim()

/** Every non-empty line, trimmed of its indentation. */
export function dslLines(text: string): string[] {
  return text
    .split('\n')
    .map(clean)
    .filter((l) => l.length > 0)
}

/** Whether some line is EXACTLY this statement. */
export function hasDslLine(text: string, line: string): boolean {
  return dslLines(text).includes(clean(line))
}

/**
 * Whether some SINGLE line contains this fragment - for a clause that is part of a larger
 * statement (a `when …` inside a state header). Still a substring, but scoped to one
 * statement, so it cannot be satisfied by two unrelated lines between them.
 */
export function hasDslLineWith(text: string, fragment: string): boolean {
  return dslLines(text).some((l) => l.includes(clean(fragment)))
}

/**
 * Whether some line ends with this fragment - for the cases that assert only a
 * statement's value half (`= hex(3b82f6)`) because the name half is parameterized.
 */
export function hasDslLineEnding(text: string, ending: string): boolean {
  return dslLines(text).some((l) => l.endsWith(clean(ending)))
}
