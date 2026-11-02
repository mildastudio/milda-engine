import { describe, expect, it } from 'vitest'
import { readEmitted } from './testkit'
import {
  nodeIsPresent,
  type ComponentIR,
  type ComponentNode,
  type Predicate,
} from '@mildastudio/core'
import { toComponentSource } from './emit'

// A minimal node with only the fields the emitter/evaluator need; the rest are defaulted
// to the inert shape a container/text node carries.
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

function component(nodes: ComponentNode[], rootId: string): ComponentIR {
  return {
    name: 'Widget',
    archetype: null,
    structure: { rootId, nodes: Object.fromEntries(nodes.map((n) => [n.id, n])) },
    contract: {
      props: [
        { id: 'p1', name: 'variant', type: { kind: 'enum', values: ['primary', 'ghost'] } },
        { id: 'p2', name: 'size', type: { kind: 'number' } },
        { id: 'p3', name: 'disabled', type: { kind: 'boolean' } },
      ],
      events: [],
    },
  }
}

const propEq = (path: string, value: unknown): Predicate => ({
  kind: 'cmp',
  ref: { kind: 'prop', path },
  op: 'eq',
  value: value as never,
})

describe('nodeIsPresent (predicate)', () => {
  const base = node({ id: 'n', kind: 'text', parentId: 'root' })

  it('absent presence ⇒ always present', () => {
    expect(nodeIsPresent(base, {}, new Set())).toBe(true)
  })

  it('gates on a predicate', () => {
    const n = { ...base, presence: propEq('variant', 'primary') }
    expect(nodeIsPresent(n, { variant: 'primary' }, new Set())).toBe(true)
    expect(nodeIsPresent(n, { variant: 'ghost' }, new Set())).toBe(false)
  })

  it('resolves repeat-item-alias paths', () => {
    const n = { ...base, presence: propEq('row.active', true) }
    expect(nodeIsPresent(n, {}, new Set(), [{ alias: 'row', item: { active: true } }])).toBe(true)
    expect(nodeIsPresent(n, {}, new Set(), [{ alias: 'row', item: { active: false } }])).toBe(false)
  })
})

describe('React generator predicate emission', () => {
  const withPresence = (presence: Predicate) => {
    const root = node({
      id: 'root',
      kind: 'container',
      tag: 'div',
      parentId: null,
      childrenIds: ['label'],
    })
    const label = node({
      id: 'label',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      content: { kind: 'static', text: 'Hi' },
      presence,
    })
    return toComponentSource(component([root, label], 'root'))
  }

  it('emits AND/OR/NOT + operators as a JS boolean guard', () => {
    const pred: Predicate = {
      kind: 'all',
      items: [
        {
          kind: 'any',
          items: [
            propEq('variant', 'primary'),
            { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 },
          ],
        },
        { kind: 'not', item: { kind: 'cmp', ref: { kind: 'prop', path: 'disabled' }, op: 'set' } },
      ],
    }
    // The WHOLE guard, in one assertion. The old form checked for `||` and `!(`
    // separately, which four unrelated expressions could also satisfy between them.
    expect(readEmitted({ tsx: withPresence(pred) }).tsx.guardOf('span')).toBe(
      '(((variant === "primary") || (size >= 3)) && (!(disabled)))',
    )
  })

  it('emits dotted-path (object field) and contains operators', () => {
    const pred: Predicate = {
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'user.role' }, op: 'eq', value: 'admin' },
        { kind: 'cmp', ref: { kind: 'prop', path: 'label' }, op: 'contains', value: '@' },
      ],
    }
    expect(readEmitted({ tsx: withPresence(pred) }).tsx.guardOf('span')).toBe(
      '((user.role === "admin") && ((label)?.includes("@")))',
    )
  })

  it('guards a repeated node inside the map as a bare expression (no JSX braces)', () => {
    const root = node({
      id: 'root',
      kind: 'container',
      tag: 'ul',
      parentId: null,
      childrenIds: ['row'],
    })
    const row = node({
      id: 'row',
      kind: 'item',
      tag: 'li',
      parentId: 'root',
      content: { kind: 'static', text: 'Row' },
      repeat: { itemAlias: 'item', source: { kind: 'prop', propName: 'items' } },
      presence: propEq('item.active', true),
    })
    const ir = component([root, row], 'root')
    ir.contract!.props.push({
      id: 'p4',
      name: 'items',
      type: {
        kind: 'array',
        item: {
          kind: 'object',
          fields: [{ id: 'f', name: 'active', type: { kind: 'boolean' }, required: false }],
        },
      },
    })
    const tsx = toComponentSource(ir)
    // Inside the map the guard is the callback's bare body, not a `{…}` container - that
    // is what the second assertion is about, and finding the guard on the <li> at all is
    // what says the repeat kept its predicate.
    expect(readEmitted({ tsx }).tsx.guardOf('li')).toBe('(item.active === true)')
    expect(tsx).not.toMatch(/=>\s*\(\s*\{/)
  })

  it('does not wrap an unconditional child', () => {
    const root = node({
      id: 'root',
      kind: 'container',
      tag: 'div',
      parentId: null,
      childrenIds: ['label'],
    })
    const label = node({
      id: 'label',
      kind: 'text',
      tag: 'span',
      parentId: 'root',
      content: { kind: 'static', text: 'Hi' },
    })
    const tsx = toComponentSource(component([root, label], 'root'))
    expect(tsx).not.toMatch(/&&\s*\(/)
  })
})
