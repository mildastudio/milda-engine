import { beforeAll, describe, expect, it } from 'vitest'
import type { ComponentIR, ComponentNode, ContentValue } from '@mildastudio/core'
import { toComponentSource } from './emit'
import { readEmitted, type EmittedModule } from './testkit'

function node(
  partial: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>,
): ComponentNode {
  return {
    name: partial.id,
    tag: 'auto',
    origin: partial.parentId === null ? 'root' : 'author',
    locked: false,
    childrenIds: [],
    ...partial,
  } as ComponentNode
}

// A Link whose root <a> carries a `destination` seam. The bound prop name is arbitrary -
// the generator lowers whatever `destination` points at to the native href.
function linkComponent(destination: ContentValue | undefined, propName = 'url'): ComponentIR {
  const root = node({
    id: 'root',
    kind: 'container',
    parentId: null,
    childrenIds: ['label'],
    destination,
  })
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
  let m: Record<string, EmittedModule>

  beforeAll(() => {
    m = readEmitted({
      none: toComponentSource(linkComponent(undefined)),
      boundUrl: toComponentSource(linkComponent({ kind: 'bind', propName: 'url' }, 'url')),
      boundTarget: toComponentSource(linkComponent({ kind: 'bind', propName: 'target' }, 'target')),
      static: toComponentSource(linkComponent({ kind: 'value', value: '/home' })),
    })
  })

  it('emits an <a> root', () => {
    // `one` is the assertion: exactly one anchor, and it is the outermost element.
    expect(m.none.one('a').ancestors).toEqual([])
  })

  it('lowers a prop-bound destination to href, using the bound prop name (not "to")', () => {
    expect(m.boundUrl.attr('a', 'href')).toBe('url')
  })

  it('honours whatever the destination is bound to, regardless of prop name', () => {
    expect(m.boundTarget.attr('a', 'href')).toBe('target')
  })

  it('lowers a static destination to a literal href', () => {
    expect(m.static.attr('a', 'href')).toBe('"/home"')
  })

  it('emits no href when the node has no destination', () => {
    // On the element rather than in the file: an href anywhere else would not be this bug.
    expect(m.none.one('a').attrs.has('href')).toBe(false)
  })
})
