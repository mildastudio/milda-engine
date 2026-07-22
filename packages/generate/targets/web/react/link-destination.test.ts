import { describe, expect, it } from 'vitest'
import type { ComponentIR, ComponentNode, ContentValue } from '@mildastudio/core'
import { toComponentSource } from './emit'

function node(partial: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>): ComponentNode {
  return {
    name: partial.id,
    tag: 'auto',
    origin: partial.parentId === null ? 'root' : 'author',
    locked: false,
    childrenIds: [],
    ...partial,
  } as ComponentNode
}

// A Link whose root <a> carries a `destination` seam. The bound prop name is arbitrary —
// the generator lowers whatever `destination` points at to the native href.
function linkComponent(destination: ContentValue | undefined, propName = 'url'): ComponentIR {
  const root = node({ id: 'root', kind: 'container', parentId: null, childrenIds: ['label'], destination })
  const label = node({ id: 'label', kind: 'text', parentId: 'root' })
  return {
    name: 'Link',
    archetype: 'Link',
    structure: { rootId: 'root', nodes: { root, label } },
    contract: {
      props: [
        { id: 'p1', name: propName, type: { kind: 'string' } },
        { id: 'p2', name: 'label', type: { kind: 'string' } },
      ],
      events: [],
    },
  } as ComponentIR
}

describe('Link destination lowering', () => {
  it('emits an <a> root', () => {
    expect(toComponentSource(linkComponent(undefined))).toContain('<a')
  })

  it('lowers a prop-bound destination to href, using the bound prop name (not "to")', () => {
    const src = toComponentSource(linkComponent({ kind: 'bind', propName: 'url' }, 'url'))
    expect(src).toContain('href={url}')
  })

  it('honours whatever the destination is bound to, regardless of prop name', () => {
    const src = toComponentSource(linkComponent({ kind: 'bind', propName: 'target' }, 'target'))
    expect(src).toContain('href={target}')
  })

  it('lowers a static destination to a literal href', () => {
    const src = toComponentSource(linkComponent({ kind: 'value', value: '/home' }))
    expect(src).toContain('href={"/home"}')
  })

  it('emits no href when the node has no destination', () => {
    expect(toComponentSource(linkComponent(undefined))).not.toContain('href=')
  })
})
