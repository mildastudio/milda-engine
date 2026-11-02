import { beforeAll, describe, expect, it } from 'vitest'
import type { ComponentIR, ComponentNode } from '@mildastudio/core'
import { toComponentSource } from './emit'
import { readEmitted, type EmittedModule } from './testkit'

// The generator half of the media-kind agreement. The canvas half is the `media kinds`
// block in `packages/editor/render/componentRender.test.tsx`, and the claim only
// holds if both are pinned: the two renderers are in different packages and different test
// lanes, so no single test can compare them. `componentRenderParity` cannot cover this
// either - its fixtures are seeded archetypes, and none of them carries non-image media.
//
// What is asserted is the ELEMENT, because that is what the canvas and the output have to
// agree on. A media node is selectable and styleable, so a designer sizing a `video` on the
// canvas is sizing whatever ships.

// The media node is a CHILD, which is where every archetype actually puts one (an Avatar's
// image, a Card's cover). A root content node takes a different path on both sides - the
// root is always resolved through `resolveTag` - so putting the fixture there would test a
// shape the product does not produce.
function mediaComponent(media?: string): ComponentIR {
  const base = {
    tag: 'auto',
    origin: 'author',
    locked: false,
    childrenIds: [],
  }
  // The media node carries a facet because `emitElement` drops an icon or content node
  // that has none (`!node.facets` -> null). Every archetype's media node has facets from
  // its defaults, so this is the realistic shape - but note the asymmetry: the CANVAS
  // renders a facet-less content node, so an author who clears every facet from an image
  // still sees it and does not get it. That is its own finding, not this test's subject.
  const root = {
    ...base,
    id: 'root',
    name: 'root',
    kind: 'container',
    origin: 'root',
    parentId: null,
    childrenIds: ['media'],
  } as unknown as ComponentNode
  const node = {
    ...base,
    id: 'media',
    name: 'media',
    kind: 'content',
    parentId: 'root',
    facets: {},
    ...(media ? { media } : {}),
  } as unknown as ComponentNode
  return {
    name: 'Media',
    archetype: null,
    structure: { rootId: 'root', nodes: { root, media: node } },
    contract: { props: [], events: [] },
  } as ComponentIR
}

describe('media kinds emit the element the canvas draws', () => {
  let m: Record<string, EmittedModule>

  beforeAll(() => {
    m = readEmitted({
      img: toComponentSource(mediaComponent('img')),
      video: toComponentSource(mediaComponent('video')),
      audio: toComponentSource(mediaComponent('audio')),
      embed: toComponentSource(mediaComponent('embed')),
      none: toComponentSource(mediaComponent()),
    })
  })

  it.each([
    ['img', 'img'],
    ['video', 'video'],
    ['audio', 'audio'],
    ['embed', 'iframe'],
  ])('a %s node emits <%s>', (media, tag) => {
    expect(m[media].one(tag).ancestors).toEqual(['div'])
  })

  it('defaults to an image when the node names no media kind', () => {
    expect(m.none.one('img').ancestors).toEqual(['div'])
  })

  it('names the frame, because an unnamed iframe is unreachable to a screen reader', () => {
    expect(m.embed.one('iframe').attrs.has('title')).toBe(true)
  })
})
