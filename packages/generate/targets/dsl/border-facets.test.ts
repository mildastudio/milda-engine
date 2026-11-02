import { describe, expect, it } from 'vitest'
import { readCss } from '../web/react/testkit'
import { hasDslLine } from './testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from './toIr'
import { documentToDsl } from './emit'
import { toComponentStyles } from '../web/react/emit'

// Border facets are multi-valued (width + color + style) and per-side - physical
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

  // The facets sit on each component's ROOT, so the root's rule is where the longhand has
  // to land. A declaration anywhere else in the sheet would satisfy a substring check
  // while styling the wrong node.
  const rootRule = (css: string) => {
    const parsed = readCss(css)
    const selector = parsed.selectors[0]
    if (!selector) throw new Error('the component emitted no CSS rules')
    return (prop: string) => parsed.decl(selector, prop)
  }

  it('emits per-side logical border longhand with resolved vars', () => {
    const decl = rootRule(toComponentStyles(quote))
    expect(decl('border-inline-start-width')).toBe('var(--ds-borderWidth-thick)')
    expect(decl('border-inline-start-color')).toBe('var(--ds-color-accent-a6)')
    expect(decl('border-inline-start-style')).toBe('solid')
  })

  // The printer knew only `border.color`/`border.width`, so an authored per-edge border and
  // any border STYLE were dropped on export - the file came back without the edge that was the
  // whole point of the node (invariant 6). Asserted on the emitted TEXT rather than on a
  // reparse, because the loss is in what the printer says.
  it('prints every edge it was given, style included', () => {
    const printed = documentToDsl({
      components,
      foundations: documentToIr(document).foundations,
      sharedTypes: [],
      meta: {},
    })
    expect(hasDslLine(printed, 'border.inline-start accent.a6 thick')).toBe(true)
    expect(hasDslLine(printed, 'border accent.a7 thin dashed')).toBe(true)
  })

  it('the all-sides border now captures width + style, not color only', () => {
    const decl = rootRule(toComponentStyles(box))
    expect(decl('border-width')).toBe('var(--ds-borderWidth-thin)')
    expect(decl('border-color')).toBe('var(--ds-color-accent-a7)')
    expect(decl('border-style')).toBe('dashed')
  })
})
