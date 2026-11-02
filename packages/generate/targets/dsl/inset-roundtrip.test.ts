import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import type { ComponentIR, ComponentNode } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── Insets through the export path, which the corpus cannot exercise ─────────
// `document-roundtrip.test.ts` starts from TEXT and is the fixed point that matters for a
// `.milda` file. This file starts from the IR, because that is the direction the EDITOR
// exports in - a document assembled by the app, printed, and read back - and because the inset
// shapes below cannot be written in text at all: the surface spells insets as
// `inset ‹all›` or `inset ‹block› ‹inline›`, with no way to say "inline only" or "all four,
// except horizontally".
//
// Every corpus node happens to state BOTH axes, which is the one shape that always survived.
// The two `it.fails` entries below are the inventory of what still does not - the same
// discipline as the round-trip's own KNOWN_GAPS table: closing a gap turns its test red and
// forces the entry out.
//
// They are LOSSES, not cosmetics. A single-axis inset comes back as all four edges, so a chip
// with horizontal padding exports as a chip with padding on every side. Fixing it means giving
// the surface a way to spell one axis, which is a language change (proposal territory) rather
// than an emitter tweak - hence recorded here rather than patched around.

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
  it('the uniform shorthand', () => {
    expect(roundTrip({ inset: 'space-2' })).toEqual({ inset: 'space-2' })
  })

  // The shape every corpus node has, and the reason the gap below went unnoticed.
  it('both axes together', () => {
    expect(roundTrip({ insetX: 'space-4', insetY: 'space-2' })).toEqual({
      insetX: 'space-4',
      insetY: 'space-2',
    })
  })

  it.fails('[known gap: no surface syntax for one axis] the horizontal axis alone', () => {
    expect(roundTrip({ insetX: 'space-4' })).toEqual({ insetX: 'space-4' })
  })

  it.fails('[known gap: no surface syntax for one axis] the vertical axis alone', () => {
    expect(roundTrip({ insetY: 'space-2' })).toEqual({ insetY: 'space-2' })
  })

  // The 2026-08-11 shape (proposal 0048 §6): the axis beats the shorthand per edge, so this
  // node has four edges carrying two values. That is what the two-axis form says, so it prints
  // as one - the KEY comes back normalized (`inset` -> `insetY`) and every edge keeps its
  // value. This used to print the shorthand alone and drop the axis, silently changing the
  // padding on two edges of an exported component.
  it('a mixed inset keeps every edge, with the surviving shorthand read as the block axis', () => {
    expect(roundTrip({ inset: 'space-2', insetX: 'space-4' })).toEqual({
      insetY: 'space-2',
      insetX: 'space-4',
    })
  })

  it('a mixed inset whose two values agree collapses to the shorthand', () => {
    expect(roundTrip({ inset: 'space-2', insetX: 'space-2' })).toEqual({ inset: 'space-2' })
  })

  // What the remaining losses actually DO, pinned so the damage is stated rather than implied:
  // a single axis does not vanish, it spreads to all four edges.
  it('records the current damage: a lone axis comes back as all four edges', () => {
    expect(roundTrip({ insetX: 'space-4' })).toEqual({ inset: 'space-4' })
    expect(roundTrip({ insetY: 'space-2' })).toEqual({ inset: 'space-2' })
  })
})
