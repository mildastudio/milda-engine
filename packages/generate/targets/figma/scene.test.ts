import { describe, expect, it } from 'vitest'
import {
  LAYOUT_SLOTS,
  emptyFoundations,
  type ComponentIR,
  type ComponentNode,
} from '@mildastudio/core'
import { FIGMA_LAYOUT_COVERAGE, buildComponentScene } from './scene'

// ─── A literal on the Figma side (proposal 0049) ─────────────────────────────
// The scene binds a facet to a Variable when a token claims it and carries the authored value
// otherwise. The plugin then paints that value; what has to hold here is that a word the
// language accepts as a literal reaches it at all, instead of being dropped as a missing token.

function box(facets: Record<string, string>): ComponentIR {
  const root = {
    id: 'r',
    name: 'Box',
    kind: 'container',
    parentId: null,
    childrenIds: [],
    facets,
  } as unknown as ComponentNode
  return {
    name: 'Box',
    archetype: null,
    structure: { rootId: 'r', nodes: { r: root } },
    contract: { props: [], events: [] },
  } as ComponentIR
}

const styleOf = (facets: Record<string, string>) => {
  const { root } = buildComponentScene(box(facets), emptyFoundations(), {
    name: 'Default',
    propCondition: {},
    states: [],
  })
  return 'style' in root ? root.style : {}
}

describe('a literal facet value in the scene', () => {
  it('carries the colour keyword transparent as a plain value', () => {
    expect(styleOf({ 'border.color': 'transparent' })['border.color']).toEqual({
      value: 'transparent',
    })
  })

  it('still binds nothing for a value that is neither a token nor a literal', () => {
    expect(styleOf({ 'border.color': 'acent-3' })['border.color']).toEqual({})
  })
})

// ─── The layout words in the scene (proposal 0056 §3.4) ──────────────────────
describe('layout in the scene', () => {
  const sceneOf = (layout: Record<string, string>) => {
    const ir = box({})
    const root = ir.structure.nodes.r as ComponentNode & { layout?: Record<string, string> }
    root.layout = layout
    return buildComponentScene(ir, emptyFoundations(), {
      name: 'Default',
      propCondition: {},
      states: [],
    })
  }
  const autoLayoutOf = (layout: Record<string, string>) => {
    const { root } = sceneOf(layout)
    return 'autoLayout' in root ? root.autoLayout : undefined
  }

  it('declares a coverage that is total over the slots', () => {
    for (const slot of LAYOUT_SLOTS) expect(slot in FIGMA_LAYOUT_COVERAGE).toBe(true)
  })

  it('carries every axis intent, the clamps and the position', () => {
    expect(
      autoLayoutOf({
        direction: 'layers',
        width: 'weight(2)',
        height: 'ratio(1:1)',
        position: 'overlay',
        widthMax: '240px',
      }),
    ).toMatchObject({
      direction: 'layers',
      width: { mode: 'weight', weight: 2 },
      height: { mode: 'ratio', ratio: { w: 1, h: 1 } },
      position: 'overlay',
      maxWidth: { value: '240px' },
    })
  })

  it('reports what Figma cannot draw as stated, from the coverage', () => {
    const { skipped } = sceneOf({ distribute: 'evenly', position: 'bleed all', width: 'fill' })
    expect(skipped.filter((s) => s.startsWith('Layout '))).toEqual([
      `Layout "evenly" on "Box": ${FIGMA_LAYOUT_COVERAGE.evenly}.`,
      `Layout "bleed all" on "Box": ${FIGMA_LAYOUT_COVERAGE.bleed}.`,
    ])
  })
})
