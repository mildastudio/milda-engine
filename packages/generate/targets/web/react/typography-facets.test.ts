import { describe, expect, it } from 'vitest'
import { toComponentStyles } from './emit'
import { readCss } from './testkit'
import type { ComponentIR, ComponentNode } from '@mildastudio/core'

function node(
  p: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>,
): ComponentNode {
  return {
    name: p.id,
    tag: 'auto',
    origin: p.parentId === null ? 'root' : 'author',
    locked: false,
    childrenIds: [],
    ...p,
  } as ComponentNode
}

// A text node carrying the three typography facets (0035: weight/font/slant).
function widget(label: ComponentNode): ComponentIR {
  const root = node({
    id: 'root',
    kind: 'container',
    tag: 'div',
    parentId: null,
    childrenIds: ['label'],
  })
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
  const css = readCss(toComponentStyles(widget(label)))
  // The facets are on the label, so its rule is where they must land - a declaration in
  // the root's rule would style the wrong node and still satisfy a substring check.
  const label_ = () => {
    const selector = css.selectors.find((s) => s.includes('label'))
    if (!selector) throw new Error(`no rule for the label node; got ${css.selectors.join(', ')}`)
    return selector
  }

  it('emits font-weight from the weight facet', () => {
    expect(css.decl(label_(), 'font-weight')).toBe('var(--ds-fontWeight-bold)')
  })

  it('emits font-family from the font facet', () => {
    expect(css.decl(label_(), 'font-family')).toBe('var(--ds-fontFamily-mono)')
  })

  it('emits font-style literally from the slant facet (enum keyword, not a token)', () => {
    expect(css.decl(label_(), 'font-style')).toBe('italic')
  })
})
