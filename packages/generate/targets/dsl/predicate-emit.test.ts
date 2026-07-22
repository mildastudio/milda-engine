import { describe, expect, it } from 'vitest'
import { componentToDsl } from './emit'
import { defaultFoundations, type ComponentIR, type ComponentNode, type Predicate } from '@mildastudio/core'

function n(p: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>): ComponentNode {
  return { name: p.id, tag: 'auto', origin: p.parentId === null ? 'root' : 'author', locked: false, childrenIds: [], ...p } as ComponentNode
}

function dsl(badge: ComponentNode): string {
  const root = n({ id: 'root', kind: 'container', tag: 'div', parentId: null, part: 'root', childrenIds: ['badge'] })
  const comp: ComponentIR = {
    name: 'Widget',
    archetype: null,
    structure: { rootId: 'root', nodes: { root, badge } },
    contract: {
      props: [
        { id: '1', name: 'variant', type: { kind: 'enum', values: ['primary', 'ghost'] } },
        { id: '2', name: 'size', type: { kind: 'number' } },
      ],
      events: [],
    },
  }
  return componentToDsl(comp, defaultFoundations()).text
}

describe('DSL predicate emission (0032 phase 5)', () => {
  it('serializes a presence gate with or / context / state leaves', () => {
    const presence: Predicate = {
      kind: 'any',
      items: [
        { kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' },
        { kind: 'cmp', ref: { kind: 'state', state: 'error' }, op: 'set' },
      ],
    }
    expect(dsl(n({ id: 'badge', kind: 'text', tag: 'span', parentId: 'root', part: 'badge', presence }))).toContain(
      'present when context ColorScheme = dark or state error',
    )
  })

  it('serializes a rich style-rule when with and / not / operator', () => {
    const when: Predicate = {
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
        { kind: 'not', item: { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 } },
      ],
    }
    const badge = n({ id: 'badge', kind: 'text', tag: 'span', parentId: 'root', part: 'badge', states: [{ id: 'r1', props: {}, states: [], when, facets: {} }] })
    expect(dsl(badge)).toContain('when variant = primary and not (size >= 3)')
  })
})
