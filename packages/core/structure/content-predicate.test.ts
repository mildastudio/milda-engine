import { describe, expect, it } from 'vitest'
import { resolveNodeContent } from './binding'
import type { ComponentNode, NodeContent, Predicate } from './types'

function textNode(content: NodeContent): ComponentNode {
  return {
    id: 'n',
    name: 'n',
    kind: 'text',
    tag: 'span',
    origin: 'author',
    locked: false,
    parentId: 'root',
    childrenIds: [],
    content,
  } as ComponentNode
}

const rule = (when: unknown, text: string) => ({ id: `r-${text}`, when: when as Predicate | undefined, value: { kind: 'value' as const, value: text } })

describe('resolveNodeContent with predicate-gated rules (0032)', () => {
  const content = (rules: ReturnType<typeof rule>[]): NodeContent => ({ kind: 'dynamic', default: { kind: 'value', value: 'D' }, rules })

  it('picks the first rule whose predicate holds, else default', () => {
    const pred: Predicate = { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' }
    const node = textNode(content([rule(pred, 'A')]))
    expect(resolveNodeContent(node, { variant: 'primary' }, 'preview', [])).toBe('A')
    expect(resolveNodeContent(node, { variant: 'ghost' }, 'preview', [])).toBe('D')
  })

  it('supports OR / operators in the gate', () => {
    const pred: Predicate = {
      kind: 'any',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'size' }, op: 'gte', value: 3 },
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'primary' },
      ],
    }
    const node = textNode(content([rule(pred, 'A')]))
    expect(resolveNodeContent(node, { size: 5 }, 'preview', [])).toBe('A')
    expect(resolveNodeContent(node, { variant: 'primary' }, 'preview', [])).toBe('A')
    expect(resolveNodeContent(node, { size: 1, variant: 'ghost' }, 'preview', [])).toBe('D')
  })

  it('reads a LEGACY PropCondition map (back-compat coercion)', () => {
    // Old documents stored `when` as a plain equality map, not a predicate.
    const node = textNode(content([rule({ variant: 'primary' }, 'A')]))
    expect(resolveNodeContent(node, { variant: 'primary' }, 'preview', [])).toBe('A')
    expect(resolveNodeContent(node, { variant: 'ghost' }, 'preview', [])).toBe('D')
  })

  it('an absent gate always matches (otherwise-leg rule)', () => {
    const node = textNode(content([rule(undefined, 'A')]))
    expect(resolveNodeContent(node, {}, 'preview', [])).toBe('A')
  })
})
