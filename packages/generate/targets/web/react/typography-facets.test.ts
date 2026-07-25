import { describe, expect, it } from 'vitest'
import { toComponentStyles } from './emit'
import type { ComponentIR, ComponentNode } from '@mildastudio/core'

function node(p: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>): ComponentNode {
  return { name: p.id, tag: 'auto', origin: p.parentId === null ? 'root' : 'author', locked: false, childrenIds: [], ...p } as ComponentNode
}

// A text node carrying the three typography facets (0035: weight/font/slant).
function widget(label: ComponentNode): ComponentIR {
  const root = node({ id: 'root', kind: 'container', tag: 'div', parentId: null, childrenIds: ['label'] })
  return {
    name: 'Widget',
    archetype: null,
    structure: { rootId: 'root', nodes: { root, label } },
    contract: { props: [], events: [] },
  }
}

describe('typography facets → CSS (weight / font / slant)', () => {
  const label = node({
    id: 'label',
    kind: 'text',
    tag: 'span',
    parentId: 'root',
    content: { kind: 'static', text: 'Hi' },
    facets: { 'text.weight': 'bold', font: 'mono', slant: 'italic' },
  })
  const css = toComponentStyles(widget(label))

  it('emits font-weight from the weight facet', () => {
    expect(css).toContain('font-weight: var(--ds-fontWeight-bold)')
  })

  it('emits font-family from the font facet', () => {
    expect(css).toContain('font-family: var(--ds-fontFamily-mono)')
  })

  it('emits font-style literally from the slant facet (enum keyword, not a token)', () => {
    expect(css).toContain('font-style: italic')
  })
})
