import { describe, expect, it } from 'vitest'
import { generate } from '../../../index'
import { toComponentSource, componentUsesContext } from './emit'
import type { ComponentIR, ComponentNode, Predicate } from '@mildastudio/core'

function n(p: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>): ComponentNode {
  return { name: p.id, tag: 'auto', origin: p.parentId === null ? 'root' : 'author', locked: false, childrenIds: [], ...p } as ComponentNode
}

function widget(presence?: Predicate): ComponentIR {
  const root = n({ id: 'root', kind: 'container', tag: 'div', parentId: null, childrenIds: ['badge'] })
  const badge = n({ id: 'badge', kind: 'text', tag: 'span', parentId: 'root', content: { kind: 'static', text: 'Night' }, presence })
  return { name: 'Widget', archetype: null, structure: { rootId: 'root', nodes: { root, badge } }, contract: { props: [], events: [] } }
}

describe('context runtime channel (0032 phase 4)', () => {
  const darkGate: Predicate = { kind: 'cmp', ref: { kind: 'context', group: 'ColorScheme' }, op: 'eq', value: 'dark' }

  it('a context leaf lowers to the MildaContext hook read', () => {
    const tsx = toComponentSource(widget(darkGate))
    expect(tsx).toContain(`import { useMildaContext } from './MildaContext'`)
    expect(tsx).toContain('const _mildaCtx = useMildaContext()')
    expect(tsx).toContain('_mildaCtx["ColorScheme"] === "dark"')
    expect(tsx).toContain(`'use client'`)
  })

  it('componentUsesContext + generate() include MildaContext.tsx only when a context leaf exists', () => {
    expect(componentUsesContext(widget(darkGate))).toBe(true)
    expect(componentUsesContext(widget())).toBe(false)
    expect(generate(widget(darkGate)).map((f) => f.path)).toContain('MildaContext.tsx')
    expect(generate(widget()).map((f) => f.path)).not.toContain('MildaContext.tsx')
  })
})
