import { describe, expect, it } from 'vitest'
import { hasDslLine } from './testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { resolveToken } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// A colour token may carry alpha - the picker can author it since the opacity channel
// landed, and the format's promise is that the file carries the whole system. The chain
// under test is the same one the corpus test walks, narrowed to the one value whose
// support was never asserted: raw slot -> hex(rrggbbaa) -> parse -> IR -> resolved.
describe('a translucent colour through the .milda surface', () => {
  it('round-trips an 8-digit hex', () => {
    const doc: any = {
      version: 1,
      name: 'Alpha',
      components: [],
      foundations: {
        layers: [
          {
            id: 'l1',
            name: 'Base',
            order: 0,
            groups: [],
            tokens: [
              {
                id: 'scrim',
                name: 'scrim',
                type: 'color',
                value: { base: { raw: '#00000066' } },
                group: null,
                order: 0,
              },
            ],
          },
        ],
        contextGroups: [],
      },
    }
    const dsl = documentToDsl(doc)
    expect(hasDslLine(dsl, 'token scrim : color = hex(00000066)')).toBe(true)
    const parsed = parseMildaDocument(dsl)
    expect(parsed.issues.filter((i: any) => i.severity === 'error')).toEqual([])
    const ir: any = documentToIr(parsed.document!)
    expect(resolveToken('scrim', ir.foundations, { contextSelections: {} }, 'color')).toBe(
      '#00000066',
    )
  })
})
