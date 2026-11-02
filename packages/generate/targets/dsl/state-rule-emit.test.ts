import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import type { ComponentIR, StateRule } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'
import { dslLines, hasDslLine } from './testkit'

// ─── A state rule's condition, on the way out ─────────────────────────────────
// The surface spells a rule's condition two ways - `state <word> [when …]` and `when <predicate>`
// - and the IR can hold conditions neither spells directly. Two of those printed as something
// that read back MEANING something else, which the round trip over the corpus could not see,
// because no `.milda` file can state either shape: only the Studio writes them.
//
//   - A rule with no condition at all printed as `state default`. `default` is not a state, so
//     it read back as a rule that matches nothing (and the reader now warns `state-unknown`).
//   - A rule on SEVERAL states printed one `state` block per word, so "hovered and pressed"
//     came back as "hovered or pressed".

function box(): ComponentIR[] {
  const parsed = parseMildaDocument(
    'component Box {\n  part Box {}\n  part Box.label {\n    kind text\n    ink a\n  }\n}\n',
  )
  return documentToIr(parsed.document).components
}

const label = (components: ComponentIR[]) =>
  Object.values(components[0]!.structure.nodes).find((n) => n.name === 'label')!

// Print, read back, print again. The second print is the round trip's fixed point (invariant 6).
function roundTrip(rules: StateRule[]) {
  const components = box()
  label(components).states = rules
  const text = documentToDsl({ components })
  const back = parseMildaDocument(text)
  const ir = documentToIr(back.document)
  return {
    text,
    issues: back.issues,
    label: label(ir.components),
    again: documentToDsl({ components: ir.components }),
  }
}

// The label is the last part, so its block runs to the component's closing brace.
const labelBlock = (text: string) => {
  const lines = dslLines(text)
  return lines.slice(
    lines.findIndex((l) => l.startsWith('part label')),
    -1,
  )
}

describe('a rule with no condition', () => {
  const unconditional: StateRule[] = [
    { id: 'always', props: {}, states: [], facets: { ink: 'b', fill: 'c' } },
    { id: 'hover', props: {}, states: ['hovered'], facets: { ink: 'd' } },
    {
      id: 'empty-when',
      props: {},
      states: [],
      when: { kind: 'all', items: [] },
      facets: { fill: 'e' },
    },
  ]
  const r = roundTrip(unconditional)

  it('is the part own styling, and prints as that', () => {
    expect(labelBlock(r.text)).toEqual([
      'part label: text {',
      'fill e',
      'ink b',
      'state hovered {',
      'ink d',
      '}',
      '}',
    ])
    expect(dslLines(r.text).filter((l) => /^state default\b|^when\s*\{/.test(l))).toEqual([])
  })

  it('reads back clean, with the condition-bearing rule as the only rule left', () => {
    expect(r.issues).toEqual([])
    expect(r.label.facets).toEqual({ ink: 'b', fill: 'e' })
    expect(r.label.states?.map((s) => s.states)).toEqual([['hovered']])
  })

  it('is a fixed point', () => {
    expect(r.again).toBe(r.text)
  })
})

describe('a rule on several states', () => {
  const r = roundTrip([
    { id: 'both', props: {}, states: ['hovered', 'pressed'], facets: { ink: 'b' } },
  ])

  it('prints the conjunction, not one rule per state', () => {
    expect(hasDslLine(r.text, 'when state hovered and state pressed {')).toBe(true)
    expect(dslLines(r.text).filter((l) => /^state\b/.test(l))).toEqual([])
  })

  it('reads back as the same condition', () => {
    expect(r.issues).toEqual([])
    expect(r.label.states).toHaveLength(1)
    expect(r.label.states![0]!.when).toEqual({
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'state', state: 'hovered' }, op: 'set' },
        { kind: 'cmp', ref: { kind: 'state', state: 'pressed' }, op: 'set' },
      ],
    })
  })

  it('is a fixed point', () => {
    expect(r.again).toBe(r.text)
  })
})
