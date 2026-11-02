import { describe, expect, it } from 'vitest'
import { migrateFoundations, type DocumentFoundations, type Token } from '@mildastudio/core'
import { themeCss } from './theme'

// The web end of proposal 0038: a length reaches CSS through the unit policy, so the
// fixed/text-scaled distinction the IR now keeps has to be visible in the output.

const foundations = (tokens: Token[]): DocumentFoundations =>
  migrateFoundations({
    contextGroups: [],
    layers: [{ id: 'l', name: 'L', order: 0, groups: [], tokens }],
    fonts: [],
    icons: { sets: [], icons: [] },
  } as DocumentFoundations)

const token = (id: string, type: Token['type'], raw: string): Token => ({
  id,
  name: id,
  type,
  value: { base: { raw } },
  group: null,
  order: 0,
})

describe('themeCss - lengths', () => {
  it('writes a fixed length in px and a text-scaled one in rem', () => {
    const css = themeCss(
      foundations([
        token('gap-fixed', 'spacing', '12px'),
        token('gap-scaled', 'spacing', '0.75rem'),
      ]),
    )
    expect(css).toMatch(/--ds-spacing-gap-fixed:\s*12px/)
    // rem is the only web unit that tracks the user's text size, so a scaled length
    // stays rem regardless of what a fixed length is written in.
    expect(css).toMatch(/--ds-spacing-gap-scaled:\s*0\.75rem/)
  })

  it('lowers the pill intent to the CSS idiom', () => {
    const css = themeCss(foundations([token('full', 'radius', '9999px')]))
    expect(css).toMatch(/--ds-radius-full:\s*9999px/)
  })

  it('keeps a viewport length verbatim', () => {
    const css = themeCss(foundations([token('wide', 'size', '100vw')]))
    expect(css).toMatch(/--ds-size-wide:\s*100vw/)
  })
})
