import { describe, expect, it } from 'vitest'
import { typesEqual } from './variance'

// ─── A context-typed prop is a type, not an unknown ──────────────────────────
// `canonicalType` had no `context` case and fell through to 'unknown', so a prop moved from one
// context group to another compared EQUAL - invisible to the contract diff and to the semver it
// derives.

describe('typesEqual over context-typed props', () => {
  it('tells two groups apart', () => {
    expect(
      typesEqual({ kind: 'context', group: 'cg.variant' }, { kind: 'context', group: 'cg.size' }),
    ).toBe(false)
  })

  it('still finds the same group equal', () => {
    expect(
      typesEqual(
        { kind: 'context', group: 'cg.variant' },
        { kind: 'context', group: 'cg.variant' },
      ),
    ).toBe(true)
  })

  it('does not confuse a context type with a ref of the same name', () => {
    expect(
      typesEqual({ kind: 'context', group: 'cg.variant' }, { kind: 'ref', ref: 'st.variant' }),
    ).toBe(false)
  })
})
