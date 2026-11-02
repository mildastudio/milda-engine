import { describe, expect, it } from 'vitest'
import { readCss } from '../web/react/testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr, foundationsToIr } from './toIr'
import { toComponentStyles } from '../web/react/emit'

// milda ids are `tok.`-prefixed and dotted (`tok.space.2`); the editor + CSS var names
// need the dot-free, hyphenated form (`space-2`). Token DEFINITIONS and REFERENCES must
// normalize identically, or the emitted `var(--ds-…)` won't match the theme's var - and
// dotted ids trip `isRawValue`, leaking the raw `tok.space.2` string into the CSS.
const dsl = [
  'foundations {',
  '  token space/2 : spacing = { value: 0.5; unit: scaled }',
  '}',
  'component Box "b" {',
  '  part root { gap space.2; inset space.2 space.2 }',
  '}',
].join('\n')

describe('DSL → IR token id normalization', () => {
  const { document } = parseMildaDocument(dsl)
  const { foundations } = foundationsToIr(document.foundations)
  const { components } = documentToIr(document)
  const box = components.find((c) => c.name === 'Box')!
  const root = box.structure.nodes[box.structure.rootId]

  it('normalizes token definition ids to the editor form', () => {
    expect(foundations.layers[0].tokens.map((t) => t.id)).toEqual(['space-2'])
  })

  it('normalizes facet token references to match the definition', () => {
    expect(root.facets?.gap).toBe('space-2')
    expect(root.facets?.insetX).toBe('space-2')
    expect(root.facets?.insetY).toBe('space-2')
  })

  it('emits a valid CSS var reference, not the raw milda id', () => {
    const parsed = readCss(toComponentStyles(box))
    const selector = parsed.selectors[0]!
    // gap/insetX/insetY all normalize to the same token, so all three declarations must
    // carry the resolved variable - checking one value "appears somewhere" would pass
    // even if only one of the three had been normalized.
    expect(parsed.decl(selector, 'gap')).toBe('var(--ds-spacing-space-2)')
    const values = [...parsed.rules.values()].flatMap((r) => [...r.values()])
    expect(values.some((v) => v.includes('tok.space'))).toBe(false)
  })
})
