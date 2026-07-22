import { describe, expect, it } from 'vitest'

import {
  type Message,
  type MessageCatalog,
  catalogFromManifest,
  emptyMessageCatalog,
  localeContextGroup,
  manifestFromCatalog,
  mergeManifests,
  resolveMessage,
} from './messages'

const msg = (over: Partial<Message> & Pick<Message, 'id' | 'default'>): Message => ({
  source: 'content',
  ...over,
})

const catalog: MessageCatalog = {
  defaultLocale: 'en',
  locales: ['hu', 'de'],
  messages: [
    msg({ id: 'chrome/no-results', default: 'No results', translations: { hu: 'Nincs találat' } }),
    msg({ id: 'a11y/prev-month', default: 'Previous month', source: 'a11y' }),
    msg({
      id: 'chrome/count',
      default: '{n} items',
      params: ['n'],
      translations: { 'en-GB': '{n} things' },
    }),
  ],
}

describe('resolveMessage', () => {
  it('returns the default-locale string when no locale is given', () => {
    expect(resolveMessage('chrome/no-results', catalog)?.text).toBe('No results')
  })

  it('returns the translation for a shipped locale', () => {
    expect(resolveMessage('chrome/no-results', catalog, 'hu')?.text).toBe('Nincs találat')
  })

  it('falls back to the default when a locale has no translation', () => {
    expect(resolveMessage('a11y/prev-month', catalog, 'hu')?.text).toBe('Previous month')
  })

  it('falls back region → base language ("en-GB" → base) then default', () => {
    // 'en-GB' has no entry on no-results; base 'en' IS the default locale → default string
    expect(resolveMessage('chrome/no-results', catalog, 'en-GB')?.text).toBe('No results')
  })

  it('uses an exact region translation when present', () => {
    expect(resolveMessage('chrome/count', catalog, 'en-GB')?.text).toBe('{n} things')
  })

  it('passes params through for interpolation by the view', () => {
    expect(resolveMessage('chrome/count', catalog)?.params).toEqual(['n'])
    expect(resolveMessage('chrome/no-results', catalog)?.params).toBeUndefined()
  })

  it('returns undefined for an unknown id or absent catalog', () => {
    expect(resolveMessage('nope', catalog)).toBeUndefined()
    expect(resolveMessage('chrome/no-results', undefined)).toBeUndefined()
  })
})

describe('localeContextGroup', () => {
  it('builds a Locale dimension from defaultLocale + locales, deduped and ordered', () => {
    const g = localeContextGroup(catalog)
    expect(g.id).toBe('Locale')
    expect(g.contexts.map((c) => c.id)).toEqual(['en', 'hu', 'de'])
  })

  it('dedupes when the default locale is also listed', () => {
    const g = localeContextGroup({ defaultLocale: 'en', locales: ['en', 'hu'], messages: [] })
    expect(g.contexts.map((c) => c.id)).toEqual(['en', 'hu'])
  })
})

describe('manifest', () => {
  it('round-trips catalog → manifest → catalog on default-locale strings', () => {
    const man = manifestFromCatalog(catalog)
    expect(man['chrome/count']).toEqual({
      default: '{n} items',
      params: ['n'],
      description: undefined,
      source: 'content',
    })
    const back = catalogFromManifest(man, 'en')
    expect(back.messages.find((m) => m.id === 'chrome/count')?.default).toBe('{n} items')
    // translations are not part of the manifest (extraction is default-locale only)
    expect(back.messages.find((m) => m.id === 'chrome/no-results')?.translations).toBeUndefined()
  })

  it('mergeManifests keeps first-seen for a colliding id (id is global to the DS)', () => {
    const a = { 'x/y': { default: 'First', source: 'content' as const } }
    const b = { 'x/y': { default: 'Second', source: 'content' as const }, 'a/b': { default: 'C', source: 'a11y' as const } }
    const merged = mergeManifests([a, b])
    expect(merged['x/y'].default).toBe('First')
    expect(merged['a/b'].default).toBe('C')
  })
})

describe('emptyMessageCatalog', () => {
  it('defaults to en with no locales or messages', () => {
    expect(emptyMessageCatalog()).toEqual({ defaultLocale: 'en', locales: [], messages: [] })
    expect(emptyMessageCatalog('hu').defaultLocale).toBe('hu')
  })
})
