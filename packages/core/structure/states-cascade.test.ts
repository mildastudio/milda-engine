import { describe, expect, it } from 'vitest'
import { resolveFacetIntent } from '../facets/intent'
import { resolveNodeFacets } from './states'
import type { ComponentNode, StateName } from './types'

// ─── Proposal 0057 §4.5, through the function every non-CSS renderer calls ────
// The Studio preview, the Mac canvas and the Figma scene all reach a node's facets for a state
// set through `resolveNodeFacets`. The generated React does not: it emits each state rule into
// its own selector and lets the browser cascade. These cases are the ones on which the two used
// to disagree, measured on 2026-11-02 - the preview drew 8/4/8/4 on hover while the shipped
// component drew 8 on every edge.

function node(facets: Record<string, string>, hover: Record<string, string>): ComponentNode {
  return {
    id: 'n',
    name: 'n',
    kind: 'container',
    facets,
    states: [{ id: 'r', props: {}, states: ['hovered'], facets: hover }],
  } as unknown as ComponentNode
}

const edgesWhen = (n: ComponentNode, states: StateName[]) => {
  const { insets } = resolveFacetIntent(resolveNodeFacets(n, {}, new Set(states)))
  return [insets.blockStart, insets.blockEnd, insets.inlineStart, insets.inlineEnd].map(
    (r) => r?.value,
  )
}

describe('a state rule lays its insets over the base edge by edge', () => {
  it('a hover shorthand reaches every edge, the axis it covers included', () => {
    const n = node({ insetX: '4px' }, { inset: '8px' })
    expect(edgesWhen(n, [])).toEqual([undefined, undefined, '4px', '4px'])
    expect(edgesWhen(n, ['hovered'])).toEqual(['8px', '8px', '8px', '8px'])
  })

  it('a hover edge changes that edge and nothing else', () => {
    const n = node({ inset: '8px' }, { 'inset.inline-start': '4px' })
    expect(edgesWhen(n, ['hovered'])).toEqual(['8px', '8px', '4px', '8px'])
  })

  it('the base map is not changed by resolving a state', () => {
    const n = node({ insetX: '4px' }, { inset: '8px' })
    resolveNodeFacets(n, {}, new Set(['hovered']))
    expect(n.facets).toEqual({ insetX: '4px' })
  })
})
