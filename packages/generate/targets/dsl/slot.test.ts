import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from './toIr'

const dsl = [
  'component TextField "tf" {',
  '  part start { slot optional of content; ink gray.11 }',
  '  part sep { slot many }',
  '  part body { slot single of Block }',
  '}',
].join('\n')

describe('slot part → IR node slot', () => {
  const { document, issues } = parseMildaDocument(dsl)
  const anatomy = document.components[0].anatomy

  it('parses slots without the "no AST Part field" warning', () => {
    expect(issues.map((i) => i.code)).not.toContain('slot')
  })

  it('captures arity + accepts (content, bare, and typed)', () => {
    expect(anatomy.start?.slot).toEqual({ arity: 'optional', accepts: { kind: 'content' } })
    expect(anatomy.sep?.slot).toEqual({ arity: 'many', accepts: { kind: 'content' } })
    expect(anatomy.body?.slot).toEqual({ arity: 'single', accepts: { kind: 'type', ref: 'Block' } })
  })

  it('lowers the slot onto the IR node', () => {
    const nodes = documentToIr(document).components[0].structure.nodes
    const start = Object.values(nodes).find((n) => n.part === 'start')!
    expect(start.slot).toEqual({ arity: 'optional', accepts: { kind: 'content' } })
  })
})
