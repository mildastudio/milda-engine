import { describe, expect, it } from 'vitest'
import { toComponentSource, toComponentStyles } from './emit'
import { readCss, readEmitted } from './testkit'
import type { ComponentIR, ComponentNode, Predicate } from '@mildastudio/core'

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

function widget(badge: ComponentNode): ComponentIR {
  const root = node({
    id: 'root',
    kind: 'container',
    tag: 'div',
    parentId: null,
    childrenIds: ['badge'],
  })
  return {
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
}

describe('StateRule.when (0032 phase 3b) - CSS/React realizability split', () => {
  it('a rich `when` (OR + operator) emits a data-cond attr + selector, not a static variant selector', () => {
    const when: Predicate = {
      kind: 'any',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 },
      ],
    }
    const badge = node({
      id: 'badge',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      content: { kind: 'static', text: 'Hi' },
      facets: { fill: 'base' },
      states: [{ id: 'abc123', props: {}, states: [], when, facets: { fill: 'accent' } }],
    })
    const tsx = toComponentSource(widget(badge))
    const css = toComponentStyles(widget(badge))
    // React sets the computed boolean as the data-cond attribute.
    expect(tsx).toMatch(
      /data-cond-abc123=\{\(variant === "primary"\) \|\| \(size >= 3\) \? '' : undefined\}/,
    )
    // CSS targets that attribute, as a selector of its own - not as text that happens to
    // appear inside some other rule.
    expect(readCss(css).selectors.some((sel) => sel.includes('[data-cond-abc123]'))).toBe(true)
  })

  it('a representable rule (prop equality) stays a plain selector - no data-cond', () => {
    const when: Predicate = {
      kind: 'cmp',
      ref: { kind: 'prop', path: 'variant' },
      op: 'eq',
      value: 'ghost',
    }
    const badge = node({
      id: 'badge',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      content: { kind: 'static', text: 'Hi' },
      facets: { fill: 'base' },
      states: [{ id: 'rep1', props: {}, states: [], when, facets: { fill: 'muted' } }],
    })
    const tsx = toComponentSource(widget(badge))
    // No ELEMENT carries a data-cond attribute. Asserting on the attributes rather than on
    // the file also rules out the string surviving inside a comment or a class name.
    const conds = readEmitted({ tsx }).tsx.elements.flatMap((e) =>
      [...e.attrs.keys()].filter((a) => a.startsWith('data-cond-')),
    )
    expect(conds).toEqual([])
  })
})
