import { describe, expect, it } from 'vitest'
import { readEmitted } from './testkit'
import { generate } from '../../../index'
import { toComponentSource, componentUsesContext } from './emit'
import type { ComponentIR, ComponentNode, Predicate } from '@mildastudio/core'

function n(
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

function widget(presence?: Predicate): ComponentIR {
  const root = n({
    id: 'root',
    kind: 'container',
    tag: 'div',
    parentId: null,
    childrenIds: ['badge'],
  })
  const badge = n({
    id: 'badge',
    kind: 'text',
    tag: 'span',
    parentId: 'root',
    content: { kind: 'static', text: 'Night' },
    presence,
  })
  return {
    name: 'Widget',
    archetype: null,
    structure: { rootId: 'root', nodes: { root, badge } },
    contract: { props: [], events: [] },
  }
}

describe('context runtime channel (0032 phase 4)', () => {
  const darkGate: Predicate = {
    kind: 'cmp',
    ref: { kind: 'context', group: 'ColorScheme' },
    op: 'eq',
    value: 'dark',
  }

  it('a context leaf lowers to the MildaContext hook read', () => {
    const m = readEmitted({ tsx: toComponentSource(widget(darkGate)) }).tsx
    // A real import declaration of that name from that module, not the characters
    // appearing anywhere in the file.
    expect(m.imports).toContainEqual({ from: './MildaContext', named: ['useMildaContext'] })
    expect(m.has('const _mildaCtx = useMildaContext()')).toBe(true)
    // The predicate reads the group off the hook's value - asserted as the whole guard.
    expect(m.guardOf('span')).toBe('(_mildaCtx["ColorScheme"] === "dark")')
    // The directive must be the module's FIRST token to have any effect; `toContain`
    // would have been satisfied by the string appearing in a comment halfway down.
    expect(m.isClientModule).toBe(true)
  })

  it('componentUsesContext + generate() include MildaContext.tsx only when a context leaf exists', () => {
    expect(componentUsesContext(widget(darkGate))).toBe(true)
    expect(componentUsesContext(widget())).toBe(false)
    expect(generate(widget(darkGate)).map((f) => f.path)).toContain('MildaContext.tsx')
    expect(generate(widget()).map((f) => f.path)).not.toContain('MildaContext.tsx')
  })
})
