import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from './toIr'
import { toComponentStyles } from '../web/react/emit'

// Border facets are multi-valued (width + color + style) and per-side — physical
// (top/right/bottom/left) or logical (inline-start/end, block-start/end).
const dsl = [
  'foundations {',
  '  token accent/a6 : color = escape "#8883"',
  '  token accent/a7 : color = escape "#8884"',
  '}',
  'component Quote "q" {',
  '  part root { border.inline-start accent.a6 thick }',
  '}',
  'component Box "b" {',
  '  part root { border accent.a7 thin dashed }',
  '}',
].join('\n')

describe('border facets → IR + CSS', () => {
  const { document, issues } = parseMildaDocument(dsl)
  const { components } = documentToIr(document)
  const quote = components.find((c) => c.name === 'Quote')!
  const box = components.find((c) => c.name === 'Box')!

  it('parses a per-side border without a facet-unknown warning', () => {
    expect(issues.map((i) => i.code)).not.toContain('facet-unknown')
    expect(document.components[0].anatomy.root?.facets?.['border.inline-start']).toEqual({
      border: { color: 'tok.accent.a6', width: 'tok.thick' },
    })
  })

  it('emits per-side logical border longhand with resolved vars', () => {
    const css = toComponentStyles(quote)
    expect(css).toContain('border-inline-start-width: var(--ds-borderWidth-thick)')
    expect(css).toContain('border-inline-start-color: var(--ds-color-accent-a6)')
    expect(css).toContain('border-inline-start-style: solid')
  })

  it('the all-sides border now captures width + style, not color only', () => {
    const css = toComponentStyles(box)
    expect(css).toContain('border-width: var(--ds-borderWidth-thin)')
    expect(css).toContain('border-color: var(--ds-color-accent-a7)')
    expect(css).toContain('border-style: dashed')
  })
})
