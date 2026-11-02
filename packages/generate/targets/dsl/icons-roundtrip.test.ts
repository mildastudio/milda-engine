import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { defaultFoundations, resolveIcon, type IconLibrary } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'
import { dslLines, hasDslLine } from './testkit'

// ─── The `icons` block ────────────────────────────────────────────────────────
// The icon library is what gives a part's bare glyph name a meaning, so what has to survive is
// not only the entries but their ORDER (the first set answers a bare name) and the bits a
// renderer reads: a vendored SVG body, a label, and which asset draws a custom glyph.

function read(source: string) {
  const parsed = parseMildaDocument(source)
  return { parsed, ir: documentToIr(parsed.document) }
}

function print(icons: IconLibrary, assets?: Parameters<typeof documentToDsl>[0]['assets']) {
  return documentToDsl({
    components: [],
    foundations: { ...defaultFoundations(), layers: [], icons },
    ...(assets ? { assets } : {}),
  })
}

const LIBRARY: IconLibrary = {
  sets: [
    { id: 'ph', prefix: 'ph', name: 'Phosphor', provider: 'Iconify', license: 'MIT' },
    {
      id: 'lucide',
      prefix: 'lucide',
      name: 'Lucide',
      provider: 'Iconify',
      license: 'ISC',
      samples: ['home', 'heart', 'star', 'settings'],
    },
  ],
  icons: [
    // A body with quotes and a newline in it, which is what a real SVG looks like.
    {
      id: 'ph-house',
      kind: 'set',
      prefix: 'ph',
      name: 'house',
      svg: '<svg viewBox="0 0 256 256">\n<path d="M0 0"/></svg>',
    },
    { id: 'lucide-x', kind: 'set', prefix: 'lucide', name: 'x', label: 'Close' },
    // Names a provider may use that are not words in this language.
    { id: 'mdi-123', kind: 'set', prefix: 'mdi', name: '123' },
    { id: 'spark', kind: 'custom', name: 'Spark', assetId: 'asset-1', label: 'Brand spark' },
  ],
}

const ASSETS = {
  assets: {
    'asset-1': {
      id: 'asset-1',
      name: 'Spark mark',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      sizeBytes: 10,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://example.com/spark.svg',
      tags: [],
      viewBox: '0 0 24 24',
      width: 24,
      height: 24,
      folderId: null,
    },
  },
  folders: {},
} as unknown as NonNullable<Parameters<typeof documentToDsl>[0]['assets']>

describe('the icons block', () => {
  const text = print(LIBRARY, ASSETS)
  const { parsed, ir } = read(text)

  it('prints each statement on its own line, with no workspace id', () => {
    expect(hasDslLine(text, 'set ph "Phosphor" { provider "Iconify"; license "MIT" }')).toBe(true)
    expect(hasDslLine(text, 'glyph lucide x { label "Close" }')).toBe(true)
    expect(hasDslLine(text, 'glyph mdi "123"')).toBe(true)
    expect(hasDslLine(text, 'custom "Spark" { asset "Spark mark"; label "Brand spark" }')).toBe(
      true,
    )
    expect(dslLines(text).some((l) => l.includes('asset-1'))).toBe(false)
  })

  it('reads back with no issues', () => {
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(ir.issues).toEqual([])
  })

  it('keeps the sets in order: the first one answers a bare glyph name', () => {
    expect(ir.foundations.icons?.sets.map((s) => s.prefix)).toEqual(['ph', 'lucide'])
    expect(resolveIcon('star', ir.foundations.icons)).toEqual({
      kind: 'set',
      prefix: 'ph',
      name: 'star',
    })
  })

  it('keeps every field a renderer reads', () => {
    const lib = ir.foundations.icons!
    expect(lib.sets[1]?.samples).toEqual(['home', 'heart', 'star', 'settings'])
    expect(resolveIcon('house', lib)).toEqual({
      kind: 'set',
      prefix: 'ph',
      name: 'house',
      svg: LIBRARY.icons[0]!.kind === 'set' ? LIBRARY.icons[0]!.svg : undefined,
    })
    expect(resolveIcon('Close', lib)).toMatchObject({ prefix: 'lucide', name: 'x' })
    expect(resolveIcon('123', lib)).toMatchObject({ prefix: 'mdi', name: '123' })
  })

  it('points a custom glyph at the asset the file names, under the id the reader gave it', () => {
    const custom = ir.foundations.icons!.icons.find((i) => i.kind === 'custom')
    expect(custom?.kind === 'custom' && ir.assets?.assets[custom.assetId]?.name).toBe('Spark mark')
    expect(resolveIcon('spark', ir.foundations.icons, ir.assets?.assets)).toEqual({
      kind: 'custom',
      url: 'https://example.com/spark.svg',
    })
  })

  it('is a fixed point: printing what it read reproduces the text', () => {
    expect(print(ir.foundations.icons!, ir.assets)).toBe(text)
  })
})

describe('reading an icons block someone wrote by hand', () => {
  it('reports what it cannot use instead of keeping it silently', () => {
    const { parsed, ir } = read(`icons {
  set lucide "Lucide" { provider "Iconify"; colour "red"; samples [a, b] }
  glyph lucide check
  custom "Ghost" { asset "Nowhere" }
  sticker lucide x
}`)
    const codes = parsed.issues.map((i) => i.code)
    expect(codes).toContain('icon-set-key')
    expect(codes).toContain('icons-stmt')
    expect(ir.issues.some((i) => i.includes('samples needs exactly four'))).toBe(true)
    expect(ir.issues.some((i) => i.includes('no asset named "Nowhere"'))).toBe(true)
    // What it could use, it kept.
    expect(ir.foundations.icons?.sets.map((s) => s.prefix)).toEqual(['lucide'])
    expect(ir.foundations.icons?.icons.map((i) => i.name)).toEqual(['check', 'Ghost'])
  })

  it('leaves a file without the block with an empty library, as before', () => {
    expect(read('component A { part root { kind container } }').ir.foundations.icons).toEqual({
      sets: [],
      icons: [],
    })
  })

  it('prints nothing for an empty library', () => {
    expect(dslLines(print({ sets: [], icons: [] })).some((l) => l.startsWith('icons'))).toBe(false)
  })
})
