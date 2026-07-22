import { describe, expect, it } from 'vitest'

import { migrateFoundations, type DocumentFoundations } from './document'

describe('migrateFoundations', () => {
  it('does not seed motion tokens into user-authored layers', () => {
    const foundations: DocumentFoundations = {
      contextGroups: [],
      layers: [{ id: 'custom', name: 'Custom', order: 0, tokens: [], groups: [] }],
      fonts: [],
      icons: { sets: [], icons: [] },
    }

    expect(migrateFoundations(foundations).layers[0].tokens).toEqual([])
  })
})
