import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import type { ComponentIR, ComponentNode } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── Insets through the export path, which the corpus cannot exercise ─────────
// `document-roundtrip.test.ts` starts from TEXT and is the fixed point that matters for a
// `.milda` file. This file starts from the IR, because that is the direction the EDITOR
// exports in - a document assembled by the app, printed, and read back.
//
// Every corpus node states both axes, which is the one shape that always survived. Until
// proposal 0057 the surface could not spell one axis or one edge, so a chip with horizontal
// padding exported as a chip with padding on every side, and a shorthand with one axis came
// back with different keys. Both were `it.fails` entries here. The surface now has
// `inset.inline` / `inset.block` and the four `inset.<edge>` forms, and the printer prints the
// keys that are stored, so every shape below is a fixed point: the same KEYS, not just the same
// edges, because which key holds a value decides what a state rule overrides (0057 §4.5).

function docWith(facets: Record<string, string>) {
  const root = {
    id: 'root',
    name: 'root',
    kind: 'container',
    tag: 'auto',
    origin: 'root',
    locked: false,
    parentId: null,
    childrenIds: [],
    facets,
  } as unknown as ComponentNode
  const component = {
    id: 'c.Padded',
    name: 'Padded',
    archetype: null,
    structure: { rootId: 'root', nodes: { root } },
    contract: { props: [], events: [] },
  } as ComponentIR
  return { components: [component], foundations: undefined, meta: {} }
}

/** IR facets -> `.milda` -> IR facets, the path the app's export and re-import take. */
function roundTrip(facets: Record<string, string>): Record<string, string> {
  const text = documentToDsl(docWith(facets) as Parameters<typeof documentToDsl>[0])
  const ir = documentToIr(parseMildaDocument(text).document)
  const component = ir.components[0]!
  const root = component.structure.nodes[component.structure.rootId]!
  return Object.fromEntries(
    Object.entries(root.facets ?? {}).filter(([k]) => k.startsWith('inset')),
  )
}

describe('inset facets survive print-and-reparse', () => {
  const shapes: Record<string, Record<string, string>> = {
    'the uniform shorthand': { inset: 'space-2' },
    'both axes together (the corpus form)': { insetX: 'space-4', insetY: 'space-2' },
    'both axes carrying one value': { insetX: 'space-2', insetY: 'space-2' },
    'the horizontal axis alone': { insetX: 'space-4' },
    'the vertical axis alone': { insetY: 'space-2' },
    'the shorthand with one axis beating it': { inset: 'space-2', insetX: 'space-4' },
    'the shorthand with one axis that agrees': { inset: 'space-2', insetX: 'space-2' },
    'the shorthand with both axes': { inset: 'space-1', insetX: 'space-4', insetY: 'space-2' },
    'one edge alone': { 'inset.inline-start': 'space-3' },
    'every edge, each its own value': {
      'inset.block-start': 'space-1',
      'inset.block-end': 'space-2',
      'inset.inline-start': 'space-3',
      'inset.inline-end': 'space-4',
    },
    'the leading-icon button: an axis and one tighter edge': {
      insetY: 'space-1',
      insetX: 'space-4',
      'inset.inline-start': 'space-3',
    },
    'a literal zero on one edge': { inset: 'space-2', 'inset.block-end': '0' },
  }

  for (const [name, facets] of Object.entries(shapes)) {
    it(name, () => {
      expect(roundTrip(facets)).toEqual(facets)
    })
  }
})

describe('how insets print', () => {
  const printed = (facets: Record<string, string>) =>
    documentToDsl(docWith(facets) as Parameters<typeof documentToDsl>[0])
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('inset'))

  it('keeps the two-value form for the corpus shape', () => {
    expect(printed({ insetY: 'space-2', insetX: 'space-4' })).toEqual(['inset space.2 space.4'])
  })

  it('prints one axis by its logical name', () => {
    expect(printed({ insetX: 'space-4' })).toEqual(['inset.inline space.4'])
  })

  it('prints least specific first, so the file reads in the order the edges resolve', () => {
    expect(
      printed({ 'inset.inline-start': 'space-1', inset: 'space-2', insetX: 'space-4' }),
    ).toEqual(['inset space.2', 'inset.inline space.4', 'inset.inline-start space.1'])
  })
})

// A physical edge word is read as the logical edge it names left to right, with a warning, and
// never written back - the treatment proposal 0056 gave `pinned top`. It is there for an author
// arriving from CSS, not for compatibility: no printer ever wrote it.
describe('a physical inset edge', () => {
  it('reads as the logical edge, says so, and prints back logical', () => {
    const text = documentToDsl(
      docWith({ 'inset.inline-start': 'space-3' }) as Parameters<typeof documentToDsl>[0],
    ).replace('inset.inline-start', 'inset.left')
    expect(text).toContain('inset.left space.3')
    const parsed = parseMildaDocument(text)
    expect(parsed.issues.some((i) => i.code === 'inset-physical')).toBe(true)
    const ir = documentToIr(parsed.document)
    const component = ir.components[0]!
    const root = component.structure.nodes[component.structure.rootId]!
    expect(root.facets).toEqual({ 'inset.inline-start': 'space-3' })
  })
})
