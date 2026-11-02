import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import type { ComponentNode } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── The archetype is applied, not just carried ───────────────────────────────
// A `.milda` file names the parts it has something to SAY about: `archetype Button` plus a
// `part root { … }` is a complete Button, because the label is the archetype's. This reader used
// to build the tree from declared parts alone, so an imported Radix Button arrived with a root
// and nothing else - no label, no `{children}` in the generated React, an empty rectangle on the
// canvas, and an anatomy that did not match the archetype it claimed. The archetype WAS carried;
// it was never applied.
//
// The fixture is the Radix Button reduced to the three lines that produced each defect: an
// implicit label, an overlay part the archetype has never heard of, and a gate over it.

const SOURCE = `
milda 0.1

foundations {
  token accent : color = hex(3b82f6)
  token md : spacing = 8px
}

component Button "Trigger an action" {
  archetype Button

  props {
    loading : boolean = false
  }
  events { click from A.invoke }

  uses activation as A
  uses async-state as Async
  wire Async.loading when loading -> A.disable

  part root {
    layout { stack row; align center }
    ink accent
    state loading { ink accent }
  }
  part spinner {
    ink accent
  }
  gate spinner active when Async.loading
}
`

function irOf(source: string) {
  const parsed = parseMildaDocument(source, {})
  expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
  return documentToIr(parsed.document)
}

const button = () => {
  const ir = irOf(SOURCE)
  const component = ir.components.find((c) => c.name === 'Button')
  if (!component) throw new Error('the fixture lost its component')
  const nodes = Object.values(component.structure?.nodes ?? {}) as ComponentNode[]
  const byPart = (part: string) => nodes.find((n) => n.part === part)
  return { ir, component, nodes, byPart }
}

describe('a part the archetype declares and the file leaves implicit', () => {
  it('is seeded, as the archetype names it', () => {
    const { byPart } = button()
    const label = byPart('label')
    expect(label).toBeDefined()
    expect(label!.kind).toBe('text')
    expect(label!.origin).toBe('archetype')
    // The leaf as the FILE would spell it. `seedStructure` prettifies for the Studio's own tree
    // ("Label"), and that spelling cannot survive an export - the file carries the path only.
    expect(label!.name).toBe('label')
  })

  it('is the default content slot, so the component has a children API', () => {
    const label = button().byPart('label')
    expect(label!.slot).toMatchObject({
      default: true,
      arity: 'single',
      accepts: { kind: 'content' },
    })
  })

  it('carries a design-time sample, so the canvas is not an empty rectangle', () => {
    // Never bound and never generated - the same standing a repeated item's sample has.
    expect(button().byPart('label')!.slot?.sample).toEqual({ kind: 'text', text: 'Button' })
  })

  it('does not invent the OPTIONAL parts', () => {
    // The Button anatomy's `icon` is optional. Seeding it would put something in the author's
    // tree they never asked for.
    expect(button().byPart('icon')).toBeUndefined()
  })
})

describe('a part the archetype does not declare', () => {
  it("is the AUTHOR's, not the archetype's", () => {
    // Stamping everything `archetype` told the editor it was looking at anatomy it must not
    // restructure, for a part no archetype has heard of.
    expect(button().byPart('spinner')!.origin).toBe('author')
  })

  it('is not read as text merely because it has an ink', () => {
    // `ink` alone is not evidence of text - every painted node has a colour. Inferring `text`
    // here made the emitter fall back to the node's NAME for its content, so the Radix Button
    // shipped as `<span>spinner</span>`: the part's internal name as the button's label.
    expect(button().byPart('spinner')!.kind).not.toBe('text')
  })
})

describe('a gate over a part', () => {
  it('becomes the node condition, not only a composition entry', () => {
    const { component, byPart } = button()
    // The algebra the file wrote is kept...
    expect(component.composition?.gates).toEqual([
      { id: 'g1', machine: 'spinner', activeWhen: 'Async.loading' },
    ])
    // ...and it now also means something to a target: the part exists only while loading.
    expect(byPart('spinner')!.presence).toEqual({
      kind: 'cmp',
      ref: { kind: 'state', state: 'loading' },
      op: 'set',
    })
  })
})

describe('a wire whose condition is a prop', () => {
  it('binds the state that prop drives', () => {
    // `wire Async.loading when loading -> A.disable` is the same sentence as `bind state loading
    // loading`, in the algebra's vocabulary. Without the binding the emitted CSS carried a
    // `[data-loading]` rule that nothing could ever set.
    const root = button().byPart('root')
    expect(root!.stateBindings).toMatchObject([{ state: 'loading', propName: 'loading' }])
  })

  it('does not bind twice when the file already says it', () => {
    const withBinding = SOURCE.replace(
      '    ink accent\n    state loading',
      '    ink accent\n    bind state loading loading\n    state loading',
    )
    const ir = irOf(withBinding)
    const root = Object.values(
      ir.components.find((c) => c.name === 'Button')?.structure?.nodes ?? {},
    ).find((n) => n.part === 'root')
    expect(root?.stateBindings).toHaveLength(1)
  })
})

describe('the whole thing round-trips', () => {
  it('reaches a fixed point: seeding once does not grow the tree again', () => {
    const first = irOf(SOURCE)
    const printed = documentToDsl({
      components: first.components,
      foundations: first.foundations,
      sharedTypes: first.sharedTypes,
    })
    const second = documentToIr(parseMildaDocument(printed, {}).document)
    const parts = (ir: typeof first) =>
      ir.components.flatMap((c) =>
        Object.values(c.structure?.nodes ?? {}).map((n) => `${n.part}:${n.kind}:${n.origin}`),
      )
    expect(parts(second)).toEqual(parts(first))
  })
})

// ─── Two parts whose names differ only in case ───────────────────────────────
// The node id is derived from the part path through a slug that lowercases, so a root `Media`
// and its child `media` - the shape a Studio-built Media component has, and the one a production
// document carried - derived the SAME id, and the child silently replaced the root. The exporter
// prints descendants relative to the root, which is what made the two paths meet at all.

const CASE_SOURCE = `
milda 0.4

component Media {
  archetype Media

  part Media {
    kind container
    origin root
    locked
  }

  part media {
    kind content
    locked
  }
}
`

describe('two parts whose names differ only in case', () => {
  const read = (text: string) => documentToIr(parseMildaDocument(text, {}).document)

  it('stay two nodes, the root above its child', () => {
    const c = read(CASE_SOURCE).components[0]!
    const nodes = Object.values(c.structure!.nodes)
    expect(nodes.map((n) => n.name).sort()).toEqual(['Media', 'media'])
    const root = c.structure!.nodes[c.structure!.rootId]!
    expect(root.name).toBe('Media')
    expect(root.kind).toBe('container')
    expect(root.childrenIds.map((id) => c.structure!.nodes[id]?.name)).toEqual(['media'])
  })

  it('round-trip to the same file', () => {
    const ir = read(CASE_SOURCE)
    const once = documentToDsl({ components: ir.components, foundations: ir.foundations })
    const back = documentToIr(parseMildaDocument(once, {}).document)
    const twice = documentToDsl({ components: back.components, foundations: back.foundations })
    expect(twice).toBe(once)
    expect(Object.keys(back.components[0]!.structure!.nodes)).toHaveLength(2)
  })
})

// ─── A part the author named differently ─────────────────────────────────────
// A Studio-built TextField carries its input as `part input { kind input }`; the archetype calls
// that part `control`. Seeding by name alone added a SECOND input on every read of such a file.

const RENAMED_CONTROL = `
milda 0.4

component TextField {
  archetype TextField

  part root {
    kind container
  }

  part input {
    kind input
  }
}
`

describe('an archetype part the file names in its own words', () => {
  it('is not seeded a second time', () => {
    const c = documentToIr(parseMildaDocument(RENAMED_CONTROL, {}).document).components[0]!
    const inputs = Object.values(c.structure!.nodes).filter((n) => n.kind === 'input')
    expect(inputs.map((n) => n.name)).toEqual(['input'])
  })
})
