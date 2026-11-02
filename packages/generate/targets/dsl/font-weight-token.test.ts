import { describe, expect, it } from 'vitest'
import { readCss } from '../web/react/testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr, foundationsToIr } from './toIr'
import { toComponentStyles } from '../web/react/emit'

// font-weight is a first-class token type (0035): a numeric value that maps to the
// editor's `fontWeight` scale, so the token definition and the weight-facet reference
// land on the same `--ds-fontWeight-*` var.
const dsl = [
  'foundations {',
  '  token weight/bold : font-weight = raw 700',
  '}',
  'component Heading "h" {',
  '  part root { weight weight.bold }',
  '}',
].join('\n')

describe('font-weight token type → IR + CSS', () => {
  const { document } = parseMildaDocument(dsl)
  const { foundations } = foundationsToIr(document.foundations)
  const { components } = documentToIr(document)
  const heading = components.find((c) => c.name === 'Heading')!

  it('types the token as fontWeight with the numeric value rendered', () => {
    const tok = foundations.layers[0].tokens[0]
    expect(tok.id).toBe('weight-bold')
    expect(tok.type).toBe('fontWeight')
    expect(tok.value).toEqual({ base: { raw: '700' } })
  })

  it('emits the weight facet against the fontWeight-scale var (definition + reference agree)', () => {
    const css = readCss(toComponentStyles(heading))
    expect(css.decl(css.selectors[0]!, 'font-weight')).toBe('var(--ds-fontWeight-weight-bold)')
  })
})
