import { describe, expect, it } from 'vitest'
import { resolveToken, writeSlot } from './resolver'
import { migrateFoundations } from '../foundations/document'
import type { DocumentFoundations, Token, TokenValue } from '../foundations/document'

const tok = (id: string, value: TokenValue): Token => ({
  id,
  name: id,
  type: 'color',
  value,
  group: null,
})

const doc = (tokens: Token[]): DocumentFoundations => ({
  contextGroups: [
    {
      id: 'scheme',
      name: 'Scheme',
      contexts: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
    },
  ],
  layers: [{ id: 'base', name: 'Base', order: 0, groups: [], tokens }],
})

// A `byContext` value missing its `slots` map crashed every reader that touched it
// (`.slots.default` on undefined) - production hit this on a token saved by an interrupted
// or pre-slots write, and the whole dashboard died for that one document.
//
// The value model has since become base + exceptions (proposal 0042), so `slots` is gone and
// with it that particular crash. This still guards the regression, because the shape is still
// out there in stored documents: the question is now "does a value carrying NO usable payload
// degrade", and the answer must be a base-only value rather than a throw.
describe('a byContext token value with no slots', () => {
  const malformed = { kind: 'byContext', by: 'scheme' } as unknown as TokenValue

  it('does not throw resolving it directly', () => {
    const f = doc([tok('c', malformed)])
    expect(() =>
      resolveToken('c', f, { contextSelections: { scheme: 'dark' } }, 'color'),
    ).not.toThrow()
  })

  it('is repaired to a plain base when the document is migrated/normalized', () => {
    const f = migrateFoundations(doc([tok('c', malformed)]))
    const value = f.layers[0].tokens[0].value
    expect(value.base).toEqual({ raw: '' })
    expect(value.exceptions).toBeUndefined()
  })

  it('does not throw writing a new slot over it', () => {
    const t = tok('c', malformed)
    expect(() => writeSlot(t, { kind: 'base' }, { raw: '#fff' })).not.toThrow()
    expect(() =>
      writeSlot(t, { kind: 'exception', group: 'scheme', context: 'dark' }, { raw: '#fff' }),
    ).not.toThrow()
  })
})
