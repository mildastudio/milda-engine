import { describe, expect, it } from 'vitest'
import { computeLength, resolveToken } from './resolver'
import { collectEdges, wouldCycle } from '../foundations/references'
import type { DocumentFoundations, Slot, Token, TokenValue } from '../foundations/document'

// ─── Computed lengths (proposal 0044) ─────────────────────────────────────────
// The numeric counterpart of the computed-colour vocabulary: a base plus scale / offset /
// round. What is worth pinning down is not the arithmetic but the KIND: a text-scaled base
// stays text-scaled under a scale (so the token keeps honouring Dynamic Type) and settles to
// fixed the moment a dp-denominated step applies.

const tok = (id: string, value: TokenValue, type: Token['type'] = 'fontSize'): Token => ({
  id,
  name: id,
  type,
  value,
  group: null,
})
const fixed = (slot: Slot): TokenValue => ({ base: slot })

const doc = (base: Token[], derived: Token[] = []): DocumentFoundations => ({
  contextGroups: [],
  layers: [
    { id: 'base', name: 'Base', order: 0, groups: [], tokens: base },
    { id: 'semantic', name: 'Semantic', order: 1, groups: [], tokens: derived },
  ],
})

describe('computeLength', () => {
  const body = tok('body', fixed({ dimension: { value: 16, unit: 'fixed' } }))

  it('scales a fixed base and keeps it fixed', () => {
    const f = doc([body])
    const out = computeLength(
      { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 1.5 }] },
      f,
      undefined,
      'fontSize',
    )
    expect(out).toEqual({ kind: 'fixed', value: 24 })
  })

  it('applies steps in order, so scale-then-round differs from round-then-scale', () => {
    const f = doc([body])
    const scaleThenRound = computeLength(
      {
        base: { ref: 'body' },
        ops: [
          { op: 'scale', factor: 1.2 },
          { op: 'round', to: 2 },
        ],
      },
      f,
      undefined,
      'fontSize',
    )
    const roundThenScale = computeLength(
      {
        base: { ref: 'body' },
        ops: [
          { op: 'round', to: 2 },
          { op: 'scale', factor: 1.2 },
        ],
      },
      f,
      undefined,
      'fontSize',
    )
    // 16 × 1.2 = 19.2 → 20; 16 → 16 → 19.2
    expect(scaleThenRound).toEqual({ kind: 'fixed', value: 20 })
    expect(roundThenScale).toEqual({ kind: 'fixed', value: 19.2 })
  })

  it('keeps a text-scaled base text-scaled under a scale', () => {
    const f = doc([tok('body', fixed({ dimension: { value: 1, unit: 'scaled' } }))])
    const out = computeLength(
      { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 1.25 }] },
      f,
      undefined,
      'fontSize',
    )
    expect(out).toEqual({ kind: 'scaled', value: 1.25 })
  })

  it('settles a text-scaled base to fixed when a dp step applies, via the assumed root', () => {
    const f = doc([tok('body', fixed({ dimension: { value: 1, unit: 'scaled' } }))])
    const out = computeLength(
      { base: { ref: 'body' }, ops: [{ op: 'offset', delta: 2 }] },
      f,
      undefined,
      'fontSize',
    )
    // 1 × 16 = 16dp, + 2 = 18dp. The lowering is the documented lossy step.
    expect(out).toEqual({ kind: 'fixed', value: 18 })
  })

  it('has no answer for a base with no measurable size', () => {
    const f = doc([tok('body', fixed({ raw: '50%' }))])
    expect(
      computeLength(
        { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 2 }] },
        f,
        undefined,
        'fontSize',
      ),
    ).toBeUndefined()
    // A missing reference is unknown too - not zero.
    expect(
      computeLength({ base: { ref: 'nope' }, ops: [] }, doc([]), undefined, 'fontSize'),
    ).toBeUndefined()
  })

  it('skips a step from the colour vocabulary rather than guessing at it', () => {
    const f = doc([body])
    const out = computeLength(
      // Only reachable by hand-editing or by retyping a token under a computed value.
      {
        base: { ref: 'body' },
        ops: [
          { op: 'lighten', amount: 0.5 },
          { op: 'scale', factor: 2 },
        ],
      },
      f,
      undefined,
      'fontSize',
    )
    expect(out).toEqual({ kind: 'fixed', value: 32 })
  })
})

describe('a computed length through the normal resolver', () => {
  it('resolves to the CANONICAL spelling, like every other length', () => {
    const f = doc(
      [tok('body', fixed({ dimension: { value: 16, unit: 'fixed' } }))],
      [tok('h1', fixed({ compute: { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 2 }] } }))],
    )
    expect(resolveToken('h1', f, undefined, 'fontSize')).toBe('32px')
  })

  it('stays text-scaled through the resolver, so the spelling says scaled()', () => {
    const f = doc(
      [tok('body', fixed({ dimension: { value: 1, unit: 'scaled' } }))],
      [
        tok(
          'h1',
          fixed({ compute: { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 1.5 }] } }),
        ),
      ],
    )
    expect(resolveToken('h1', f, undefined, 'fontSize')).toBe('scaled(1.5)')
  })

  it('is a real edge in the graph, so the cycle guard sees it', () => {
    const f = doc(
      [tok('body', fixed({ dimension: { value: 16, unit: 'fixed' } }))],
      [tok('h1', fixed({ compute: { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 2 }] } }))],
    )
    expect(collectEdges(f)).toEqual([{ from: 'h1', to: 'body', via: { via: 'computeBase' } }])
    // Pointing the base at the token computed from it would close a loop, and is refused.
    expect(wouldCycle(f, 'body', 'h1')).toBe(true)
  })
})
