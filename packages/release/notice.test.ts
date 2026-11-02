import { describe, expect, it } from 'vitest'
import type { DocumentFoundations, IconLibrary } from '@mildastudio/core'
import { noticeFile, usedIconSets } from './notice'

// A NOTICE is a legal claim in both directions: naming a licence the package does not
// actually carry is as wrong as omitting one it does. These pin both edges.

const set = (prefix: string, name: string, license: string) => ({
  id: `s.${prefix}`,
  prefix,
  name,
  provider: 'Iconify',
  license,
})

const foundations = (icons: IconLibrary): DocumentFoundations =>
  ({ icons }) as unknown as DocumentFoundations

describe('the release NOTICE', () => {
  it('names only the sets an icon actually came from', () => {
    const f = foundations({
      sets: [set('lucide', 'Lucide', 'ISC'), set('ph', 'Phosphor', 'MIT')],
      icons: [{ id: 'i1', kind: 'set', prefix: 'lucide', name: 'home' }],
    } as unknown as IconLibrary)

    const code = noticeFile(f)?.code ?? ''
    expect(code).toContain('Lucide')
    expect(code).toContain('ISC')
    // Available in the design system, but no icon uses it - claiming it would be a
    // licence notice for artwork this package does not contain.
    expect(code).not.toContain('Phosphor')
  })

  it('is omitted entirely when nothing third-party was vendored', () => {
    expect(noticeFile(foundations({ sets: [], icons: [] } as unknown as IconLibrary))).toBeNull()
    expect(noticeFile(undefined)).toBeNull()
  })

  it('does not claim anything about the author own uploads', () => {
    const f = foundations({
      sets: [set('lucide', 'Lucide', 'ISC')],
      icons: [{ id: 'i1', kind: 'custom', name: 'logo', assetId: 'a1' }],
    } as unknown as IconLibrary)
    // A custom upload is the author's file. Milda has no standing to state its licence,
    // so a package containing only uploads gets no NOTICE at all.
    expect(noticeFile(f)).toBeNull()
    expect(usedIconSets(f)).toEqual([])
  })

  it('lists every set in use, not just the first', () => {
    const f = foundations({
      sets: [set('lucide', 'Lucide', 'ISC'), set('tabler', 'Tabler Icons', 'MIT')],
      icons: [
        { id: 'i1', kind: 'set', prefix: 'lucide', name: 'home' },
        { id: 'i2', kind: 'set', prefix: 'tabler', name: 'star' },
      ],
    } as unknown as IconLibrary)
    expect(usedIconSets(f).map((s) => s.name)).toEqual(['Lucide', 'Tabler Icons'])
  })

  it('ships as a file a human and a licence scanner both find', () => {
    const f = foundations({
      sets: [set('lucide', 'Lucide', 'ISC')],
      icons: [{ id: 'i1', kind: 'set', prefix: 'lucide', name: 'home' }],
    } as unknown as IconLibrary)
    expect(noticeFile(f)?.path).toBe('NOTICE.md')
  })
})
