import { describe, expect, it } from 'vitest'
import {
  buildForwardIndex,
  buildReverseIndex,
  collectEdges,
  danglingEdges,
  dependentsOf,
  describeVia,
  findCycles,
  wouldCycle,
} from './references'
import type { DocumentFoundations, Slot, Token, TokenValue } from './document'

const tok = (id: string, value: TokenValue, type: Token['type'] = 'color'): Token => ({
  id,
  name: id,
  type,
  value,
  group: null,
})

const fixed = (slot: Slot): TokenValue => ({ base: slot })
const doc = (tokens: Token[], second: Token[] = []): DocumentFoundations => ({
  contextGroups: [
    {
      id: 'scheme',
      name: 'Scheme',
      contexts: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
    },
  ],
  layers: [
    { id: 'base', name: 'Base', order: 0, groups: [], tokens },
    { id: 'semantic', name: 'Semantic', order: 1, groups: [], tokens: second },
  ],
})

describe('collectEdges - every place a reference can hide', () => {
  it('finds a plain fixed-slot reference', () => {
    const f = doc([tok('a', fixed({ raw: '#fff' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(collectEdges(f)).toEqual([{ from: 'b', to: 'a', via: { via: 'slot' } }])
  })

  // The base is one edge and every exception is another (proposal 0042). An exception's
  // reference is the one a naive walk misses: a token can point somewhere ONLY in dark
  // mode, and a cycle through that is just as fatal as one through the base.
  it('finds the base reference and one per exception', () => {
    const f = doc(
      [tok('light-c', fixed({ raw: '#fff' })), tok('dark-c', fixed({ raw: '#000' }))],
      [
        tok('b', {
          base: { ref: 'light-c' },
          exceptions: [{ group: 'scheme', context: 'dark', slot: { ref: 'dark-c' } }],
        }),
      ],
    )
    expect(collectEdges(f)).toEqual([
      { from: 'b', to: 'light-c', via: { via: 'slot' } },
      { from: 'b', to: 'dark-c', via: { via: 'context', contextId: 'dark' } },
    ])
  })

  it('finds references inside gradient stops', () => {
    const f = doc(
      [tok('start', fixed({ raw: '#000' })), tok('end', fixed({ raw: '#fff' }))],
      [
        tok(
          'grad',
          fixed({
            gradient: {
              kind: 'linear',
              angle: 90,
              stops: [
                { color: { ref: 'start' }, position: 0 },
                { color: { raw: '#888' }, position: 50 },
                { color: { ref: 'end' }, position: 100 },
              ],
            },
          }),
          'gradient',
        ),
      ],
    )
    expect(collectEdges(f)).toEqual([
      { from: 'grad', to: 'start', via: { via: 'gradientStop', index: 0 } },
      { from: 'grad', to: 'end', via: { via: 'gradientStop', index: 2 } },
    ])
  })

  it('finds references inside all four text-style sub-slots', () => {
    const f = doc(
      [tok('s', fixed({ raw: '16' })), tok('w', fixed({ raw: '400' }))],
      [
        tok(
          'ts',
          fixed({
            textStyle: {
              family: 'inter',
              size: { ref: 's' },
              weight: { ref: 'w' },
              lineHeight: { raw: '1.5' },
              letterSpacing: { raw: '0' },
            },
          }),
          'textStyle',
        ),
      ],
    )
    expect(collectEdges(f)).toEqual([
      { from: 'ts', to: 's', via: { via: 'textStyle', field: 'size' } },
      { from: 'ts', to: 'w', via: { via: 'textStyle', field: 'weight' } },
    ])
  })

  it('yields nothing for raw and easing slots', () => {
    const f = doc([
      tok('r', fixed({ raw: '#fff' })),
      tok('e', fixed({ easing: { kind: 'cubicBezier', points: [0.2, 0, 0, 1] } }), 'easing'),
    ])
    expect(collectEdges(f)).toEqual([])
  })
})

describe('indexes', () => {
  const f = doc(
    [tok('base-c', fixed({ raw: '#fff' }))],
    [tok('x', fixed({ ref: 'base-c' })), tok('y', fixed({ ref: 'base-c' }))],
  )

  it('reverse index answers "who depends on this"', () => {
    const reverse = buildReverseIndex(f)
    expect(dependentsOf(reverse, 'base-c').sort()).toEqual(['x', 'y'])
    expect(dependentsOf(reverse, 'x')).toEqual([])
  })

  it('forward index answers "what does this depend on"', () => {
    const forward = buildForwardIndex(f)
    expect(forward.get('x')?.map((e) => e.to)).toEqual(['base-c'])
    expect(forward.get('base-c')).toBeUndefined()
  })
})

describe('danglingEdges', () => {
  it('reports a reference whose target no longer exists', () => {
    const f = doc([], [tok('orphan', fixed({ ref: 'deleted-token' }))])
    expect(danglingEdges(f)).toEqual([
      { from: 'orphan', to: 'deleted-token', via: { via: 'slot' } },
    ])
  })

  it('is empty when every target resolves', () => {
    const f = doc([tok('a', fixed({ raw: '#fff' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(danglingEdges(f)).toEqual([])
  })
})

describe('wouldCycle - the invariant the ref picker only enforced by filtering', () => {
  it('rejects a self-reference', () => {
    const f = doc([tok('a', fixed({ raw: '#fff' }))])
    expect(wouldCycle(f, 'a', 'a')).toBe(true)
  })

  it('rejects a direct back-reference', () => {
    // b -> a already; pointing a at b would close the loop.
    const f = doc([tok('a', fixed({ raw: '#fff' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(wouldCycle(f, 'a', 'b')).toBe(true)
  })

  it('rejects an indirect cycle through a chain', () => {
    // c -> b -> a; pointing a at c would close it.
    const f = doc(
      [tok('a', fixed({ raw: '#fff' }))],
      [tok('b', fixed({ ref: 'a' })), tok('c', fixed({ ref: 'b' }))],
    )
    expect(wouldCycle(f, 'a', 'c')).toBe(true)
  })

  it('allows an edge that keeps the graph acyclic', () => {
    const f = doc(
      [tok('a', fixed({ raw: '#fff' })), tok('other', fixed({ raw: '#000' }))],
      [tok('b', fixed({ ref: 'a' }))],
    )
    expect(wouldCycle(f, 'b', 'other')).toBe(false)
  })

  it('sees cycles that would form through a gradient stop', () => {
    const f = doc(
      [tok('a', fixed({ raw: '#fff' }))],
      [
        tok(
          'grad',
          fixed({ gradient: { kind: 'linear', stops: [{ color: { ref: 'a' }, position: 0 }] } }),
          'gradient',
        ),
      ],
    )
    // grad -> a via a stop, so a -> grad would cycle.
    expect(wouldCycle(f, 'a', 'grad')).toBe(true)
  })

  it('sees cycles that would form through a single context slot', () => {
    const f = doc(
      [tok('a', fixed({ raw: '#fff' }))],
      [
        tok('b', {
          base: { ref: 'a' },
          exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
        }),
      ],
    )
    expect(wouldCycle(f, 'a', 'b')).toBe(true)
  })
})

describe('findCycles - validating an imported document', () => {
  it('reports an existing cycle instead of leaving it to fail at resolve time', () => {
    const f = doc([tok('a', fixed({ ref: 'b' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(findCycles(f).length).toBeGreaterThan(0)
  })

  it('is empty for an acyclic document', () => {
    const f = doc([tok('a', fixed({ raw: '#fff' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(findCycles(f)).toEqual([])
  })

  it('terminates on a self-referencing token', () => {
    const f = doc([tok('a', fixed({ ref: 'a' }))])
    expect(findCycles(f)).toContain('a')
  })
})

describe('describeVia', () => {
  it('names each edge location for diagnostics', () => {
    expect(describeVia({ via: 'slot' })).toBe('value')
    expect(describeVia({ via: 'context', contextId: 'dark' })).toBe('context "dark"')
    expect(describeVia({ via: 'gradientStop', index: 1 })).toBe('gradient stop 2')
    expect(describeVia({ via: 'textStyle', field: 'size' })).toBe('text style size')
  })
})
