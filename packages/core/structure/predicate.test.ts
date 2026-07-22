import { describe, expect, it } from 'vitest'
import { evalPredicate, isUnconditional, predicateFromLegacy, representablePredicate, type Predicate, type PredicateContext } from './predicate'

const ctx = (over: Partial<PredicateContext> = {}): PredicateContext => ({
  props: {},
  states: new Set(),
  ...over,
})

describe('evalPredicate', () => {
  it('absent / empty-all ⇒ true; empty-any ⇒ false', () => {
    expect(evalPredicate(undefined, ctx())).toBe(true)
    expect(evalPredicate({ kind: 'all', items: [] }, ctx())).toBe(true)
    expect(evalPredicate({ kind: 'any', items: [] }, ctx())).toBe(false)
  })

  it('prop comparisons: eq / ne / relational / contains', () => {
    const c = ctx({ props: { variant: 'primary', size: 4, tags: ['a', 'b'] } })
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' }, c)).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'ne', value: 'ghost' }, c)).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 }, c)).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'lt', value: 3 }, c)).toBe(false)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'tags' }, op: 'contains', value: 'b' }, c)).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'tags' }, op: 'contains', value: 'z' }, c)).toBe(false)
  })

  it('set / unset truthiness', () => {
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'x' }, op: 'set' }, ctx({ props: { x: 1 } }))).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'x' }, op: 'unset' }, ctx({ props: { x: 0 } }))).toBe(true)
  })

  it('state and context leaves', () => {
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'state', state: 'disabled' }, op: 'set' }, ctx({ states: new Set(['disabled']) }))).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'state', state: 'disabled' }, op: 'set' }, ctx())).toBe(false)
    const dark = ctx({ contexts: { ColorScheme: 'dark' } })
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' }, dark)).toBe(true)
    expect(evalPredicate({ kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'light' }, dark)).toBe(false)
  })

  it('all / any / not composition', () => {
    const p: Predicate = {
      kind: 'all',
      items: [
        { kind: 'any', items: [
          { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
          { kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' },
        ] },
        { kind: 'not', item: { kind: 'cmp', ref: { kind: 'state', state: 'disabled' }, op: 'set' } },
      ],
    }
    expect(evalPredicate(p, ctx({ props: { variant: 'primary' } }))).toBe(true)
    expect(evalPredicate(p, ctx({ states: new Set(['error']) }))).toBe(true)
    expect(evalPredicate(p, ctx({ props: { variant: 'ghost' } }))).toBe(false) // neither OR branch
    expect(evalPredicate(p, ctx({ props: { variant: 'primary' }, states: new Set(['disabled']) }))).toBe(false) // NOT fails
  })

  it('resolves repeat-item-alias paths via itemScopes', () => {
    const p: Predicate = { kind: 'cmp', ref: { kind: 'prop', path: 'row.active' }, op: 'eq', value: true }
    expect(evalPredicate(p, ctx({ itemScopes: [{ alias: 'row', item: { active: true } }] }))).toBe(true)
    expect(evalPredicate(p, ctx({ itemScopes: [{ alias: 'row', item: { active: false } }] }))).toBe(false)
  })
})

describe('predicateFromLegacy (back-compat)', () => {
  it('empty ⇒ undefined (always)', () => {
    expect(predicateFromLegacy(undefined, undefined)).toBeUndefined()
    expect(predicateFromLegacy({}, [])).toBeUndefined()
  })

  it('maps PropCondition + states to an AND of eq/set, matching old semantics', () => {
    const p = predicateFromLegacy({ variant: 'primary' }, ['checked'])!
    expect(p).toEqual({
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
        { kind: 'cmp', ref: { kind: 'state', state: 'checked' }, op: 'set' },
      ],
    })
    // Behaves like the old whenHolds+states AND.
    expect(evalPredicate(p, ctx({ props: { variant: 'primary' }, states: new Set(['checked']) }))).toBe(true)
    expect(evalPredicate(p, ctx({ props: { variant: 'primary' } }))).toBe(false)
  })
})

describe('ancestor leaf', () => {
  it('reads an ancestor node state via the lookup', () => {
    const p: Predicate = { kind: 'cmp', ref: { kind: 'ancestor', nodeId: 'root', state: 'hovered' }, op: 'set' }
    const held = ctx({ ancestorStates: (id) => (id === 'root' ? new Set(['hovered']) : undefined) })
    expect(evalPredicate(p, held)).toBe(true)
    expect(evalPredicate(p, ctx())).toBe(false)
  })
})

describe('representablePredicate (CSS split)', () => {
  it('decomposes an all-of eq/set/ancestor into props/states/ancestorStates', () => {
    const p = predicateFromLegacy({ variant: 'primary' }, ['checked'], [{ nodeId: 'root', state: 'hovered' }])!
    expect(representablePredicate(p)).toEqual({
      props: { variant: 'primary' },
      states: ['checked'],
      ancestorStates: [{ nodeId: 'root', state: 'hovered' }],
    })
  })

  it('empty / single leaf are representable', () => {
    expect(representablePredicate(undefined)).toEqual({ props: {}, states: [], ancestorStates: [] })
    expect(representablePredicate({ kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' })).toEqual({ props: {}, states: ['error'], ancestorStates: [] })
  })

  it('returns null for anything not a static selector (or/not/operators/context)', () => {
    expect(representablePredicate({ kind: 'any', items: [] })).toBeNull()
    expect(representablePredicate({ kind: 'not', item: { kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' } })).toBeNull()
    expect(representablePredicate({ kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 })).toBeNull()
    expect(representablePredicate({ kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' })).toBeNull()
  })
})

describe('isUnconditional', () => {
  it('true for absent and empty-all only', () => {
    expect(isUnconditional(undefined)).toBe(true)
    expect(isUnconditional({ kind: 'all', items: [] })).toBe(true)
    expect(isUnconditional({ kind: 'any', items: [] })).toBe(false)
    expect(isUnconditional({ kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' })).toBe(false)
  })
})
