import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from './toIr'

// Overlay realization (proposal 0034): a realize block's `dismiss <triggers>` and
// `backdrop <kind>` fold onto the root node's `overlay` config surface.
const dsl = [
  'component AlertDialog "ad" {',
  '  archetype Dialog',
  '  part content { fill gray.1 }',
  '  realize web { presentation dialog { place center }; backdrop scrim; dismiss none }',
  '}',
  'component Sheet "s" {',
  '  archetype Drawer',
  '  part content { fill gray.1 }',
  '  realize web { dismiss outside escape; backdrop blur }',
  '}',
].join('\n')

describe('overlay realize (dismiss + backdrop) → node.overlay', () => {
  const { document, issues } = parseMildaDocument(dsl)
  const { components } = documentToIr(document)
  const overlayOf = (name: string) => {
    const c = components.find((x) => x.name === name)!
    return (c.structure.nodes[c.structure.rootId] as { overlay?: unknown }).overlay
  }

  it('does not warn on dismiss/backdrop realize statements', () => {
    expect(issues.map((i) => i.code)).not.toContain('realize-stmt')
  })

  it('maps `dismiss none` to an empty (non-dismissable) trigger set + backdrop', () => {
    expect(overlayOf('AlertDialog')).toEqual({ dismiss: [], backdrop: 'scrim' })
  })

  it('maps a dismiss trigger list + backdrop kind', () => {
    expect(overlayOf('Sheet')).toEqual({ dismiss: ['outside', 'escape'], backdrop: 'blur' })
  })
})
