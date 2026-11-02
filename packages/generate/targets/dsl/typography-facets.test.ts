import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import { documentToIr, foundationsToIr } from './toIr'

// All three typography axes (0035 §3) must survive a print-and-reparse. `weight` did; `font`
// and `slant` were readable by the parser but never PRINTED, so setting either in the editor
// dropped it from the .milda - the one thing 0041's "the file carries the whole system" rules
// out. `slant` is an enum keyword (font-style), so it prints literally rather than as a token.
const dsl = [
  'foundations {',
  '  token weight/bold : font-weight = raw 700',
  '  token font/mono : font-family = raw "ui-monospace"',
  '}',
  'component Code "code" {',
  '  part root {',
  '    weight weight.bold',
  '    font font.mono',
  '    slant italic',
  '  }',
  '}',
].join('\n')

describe('typography facets → DSL round-trip (weight / font / slant)', () => {
  const first = parseMildaDocument(dsl)
  const { components } = documentToIr(first.document)
  const { foundations } = foundationsToIr(first.document.foundations)
  const printed = documentToDsl({ components, foundations, meta: { name: 'ds' } })

  it('prints all three axes', () => {
    expect(printed).toMatch(/\bweight weight\.bold\b/)
    expect(printed).toMatch(/\bfont font\.mono\b/)
    expect(printed).toMatch(/\bslant italic\b/)
  })

  it('carries the facets back into the IR unchanged', () => {
    const root = (c: typeof components) => {
      const comp = c.find((x) => x.name === 'Code')!
      return comp.structure.nodes[comp.structure.rootId]
    }
    const before = root(components)
    const after = root(documentToIr(parseMildaDocument(printed).document).components)
    expect(before.facets).toMatchObject({
      'text.weight': expect.any(String),
      font: expect.any(String),
      slant: 'italic',
    })
    expect(after.facets).toEqual(before.facets)
  })
})
