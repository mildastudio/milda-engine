import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import {
  defaultFoundations,
  evalPredicate,
  type ComponentIR,
  type ComponentNode,
  type Predicate,
} from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

function n(p: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>): ComponentNode {
  return { name: p.id, tag: 'auto', origin: p.parentId === null ? 'root' : 'author', locked: false, childrenIds: [], ...p } as ComponentNode
}

// Emit a whole document, parse it back, lower to IR — then hand back the reconstructed
// `Widget` component so a test can assert its predicates survived the round-trip.
function roundTrip(badge: ComponentNode): ComponentIR {
  const root = n({ id: 'root', kind: 'container', tag: 'div', parentId: null, part: 'root', childrenIds: ['badge'] })
  const comp: ComponentIR = {
    name: 'Widget',
    archetype: null,
    structure: { rootId: 'root', nodes: { root, badge } },
    contract: {
      props: [
        { id: '1', name: 'variant', type: { kind: 'enum', values: ['primary', 'ghost'] } },
        { id: '2', name: 'size', type: { kind: 'number' } },
        { id: '3', name: 'label', type: { kind: 'string' } },
        { id: '4', name: 'count', type: { kind: 'number' } },
      ],
      events: [],
    },
  }
  const text = documentToDsl({ components: [comp], foundations: defaultFoundations() })
  const { document, issues } = parseMildaDocument(text)
  // No hard parse errors are expected on our own emitter's output.
  expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  const { components } = documentToIr(document)
  const widget = components.find((c) => c.name === 'Widget')
  if (!widget) throw new Error('Widget component missing after round-trip')
  return widget
}

function badgeNode(widget: ComponentIR): ComponentNode {
  const node = Object.values(widget.structure!.nodes).find((nd) => nd.part === 'badge')
  if (!node) throw new Error('badge node missing after round-trip')
  return node
}

describe('DSL predicate round-trip (0032 import parser)', () => {
  it('round-trips a rich StateRule.when — and/or/not, nested groups, every operator, state/context/ancestor leaves', () => {
    const when: Predicate = {
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 },
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'lt', value: 10 },
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'lte', value: 20 },
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gt', value: 1 },
        { kind: 'cmp', ref: { kind: 'prop', path: 'count' }, op: 'ne', value: 0 },
        { kind: 'not', item: { kind: 'cmp', ref: { kind: 'prop', path: 'label' }, op: 'contains', value: '@' } },
        {
          kind: 'any',
          items: [
            { kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' },
            { kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' },
            { kind: 'cmp', ref: { kind: 'ancestor', nodeId: 'card', state: 'hovered' }, op: 'set' },
          ],
        },
        { kind: 'cmp', ref: { kind: 'state', state: 'disabled' }, op: 'unset' },
      ],
    }
    const badge = n({
      id: 'badge',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      part: 'badge',
      states: [{ id: 'r1', props: {}, states: [], when, facets: {} }],
    })

    const rule = badgeNode(roundTrip(badge)).states?.[0]
    expect(rule?.when).toEqual(when)
  })

  it('round-trips a node.presence gate — or / context / state leaves', () => {
    const presence: Predicate = {
      kind: 'any',
      items: [
        { kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' },
        { kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' },
      ],
    }
    const badge = n({ id: 'badge', kind: 'text', tag: 'span', parentId: 'root', part: 'badge', presence })

    expect(badgeNode(roundTrip(badge)).presence).toEqual(presence)
  })

  it('preserves semantics — the reconstructed predicate evaluates identically to the original', () => {
    const when: Predicate = {
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
        { kind: 'not', item: { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 } },
      ],
    }
    const badge = n({
      id: 'badge',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      part: 'badge',
      states: [{ id: 'r1', props: {}, states: [], when, facets: {} }],
    })
    const parsed = badgeNode(roundTrip(badge)).states?.[0]?.when

    const cases = [
      { variant: 'primary', size: 2 },
      { variant: 'primary', size: 5 },
      { variant: 'ghost', size: 1 },
    ]
    for (const props of cases) {
      const ctx = { props, states: new Set<never>() }
      expect(evalPredicate(parsed, ctx)).toBe(evalPredicate(when, ctx))
    }
  })

  it('still accepts the legacy single-condition `when prop = value`', () => {
    // A single `eq` leaf is the degenerate case the flat legacy form covered; it emits as a
    // bare `when variant = primary { … }` and parses straight back to the same leaf.
    const when: Predicate = { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' }
    const badge = n({
      id: 'badge',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      part: 'badge',
      states: [{ id: 'r1', props: {}, states: [], when, facets: {} }],
    })
    expect(badgeNode(roundTrip(badge)).states?.[0]?.when).toEqual(when)
  })
})
