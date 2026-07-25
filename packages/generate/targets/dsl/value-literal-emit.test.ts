import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import type { DocumentFoundations } from '@mildastudio/core'

const foundations = (): DocumentFoundations => ({
  contextGroups: [],
  layers: [
    {
      id: 'l',
      name: 'L',
      order: 0,
      groups: [],
      tokens: [
        { id: 'tok.brand', name: 'brand', type: 'color', value: { kind: 'fixed', slot: { raw: '#3b82f6' } }, group: null, order: 0 },
        { id: 'tok.gap', name: 'gap', type: 'spacing', value: { kind: 'fixed', slot: { raw: '0.5rem' } }, group: null, order: 1 },
      ],
    },
  ],
  fonts: [],
  icons: { sets: [], icons: [] },
})

describe('DSL emitter — first-class value literals', () => {
  const dsl = documentToDsl({ components: [], foundations: foundations() })

  it('emits colors as hex(...) rather than a raw quoted string', () => {
    expect(dsl).toContain('token brand : color = hex(3b82f6)')
    expect(dsl).not.toContain('raw "#3b82f6"')
  })

  it('emits dimensions as bare unit literals', () => {
    expect(dsl).toContain('token gap : spacing = 0.5rem')
    expect(dsl).not.toContain('raw "0.5rem"')
  })

  it('round-trips: the emitted first-class literals parse back cleanly', () => {
    const { issues } = parseMildaDocument(dsl)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})
