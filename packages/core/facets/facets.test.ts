import { describe, expect, it } from 'vitest'
import { FACETS, KIND_FACETS, facetRegistryProblems } from './facets'

// The registry is what the editor reads to label and render every facet a node kind offers,
// so an offered-but-unregistered key is a crash (it was: `slant` shipped in KIND_FACETS for
// every text-bearing kind without a FACETS entry, and selecting any text node's Style tab
// threw on `FACETS[key].label`). Pin the invariant instead of the one missing key.
describe('facet registry', () => {
  it('defines every facet the kinds offer, each valued exactly one way', () => {
    expect(facetRegistryProblems()).toEqual([])
  })

  it('offers slant to every text-bearing kind as a keyword enum', () => {
    for (const kind of ['text', 'control', 'output', 'cell'] as const) {
      expect(KIND_FACETS[kind]).toContain('slant')
    }
    expect(FACETS.slant.keywords).toEqual(['normal', 'italic', 'oblique'])
    expect(FACETS.slant.scale).toBeUndefined()
  })
})
