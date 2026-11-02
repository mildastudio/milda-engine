import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { hasDslLine } from './testkit'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── A prop declared once for the whole system (proposal 0051 §5) ──────────────
// The Radix mapping restates `variant`/`size`/`color`/`highContrast`/`radius` on 49 components, and
// the restatement carries no information: what the prop IS is a system-wide decision. A global prop
// is that decision, declared in the foundations and taken by reference - while still appearing in
// each component's interface as an ordinary prop, because that is what a consumer sees.

const SOURCE = `
context-group Variant { Solid Soft }

global-prop variant : Variant = Solid "How the component is painted."
global-prop tone : string

component Button {
  archetype Button
  props {
    global variant, tone
    loading : boolean = false
  }
  part root { }
}

component Box {
  props {
    padding : string
  }
  part root { }
}
`

function irOf(source: string) {
  const parsed = parseMildaDocument(source, {})
  return { ir: documentToIr(parsed.document), issues: parsed.issues }
}

const propsOf = (source = SOURCE, name = 'Button') => {
  const { ir } = irOf(source)
  return ir.components.find((c) => c.name === name)?.contract?.props ?? []
}

describe('the declaration', () => {
  it('lands in the foundations, typed and defaulted', () => {
    const { ir, issues } = irOf(SOURCE)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(ir.foundations.globalProps).toEqual([
      {
        id: 'gp.variant',
        name: 'variant',
        type: { kind: 'context', group: 'cg.variant' },
        default: 'Solid',
        description: 'How the component is painted.',
      },
      { id: 'gp.tone', name: 'tone', type: { kind: 'string' } },
    ])
  })

  it('is absent when the system declares none', () => {
    const { ir } = irOf('component Box { part root { } }')
    expect(ir.foundations.globalProps).toBeUndefined()
  })
})

describe('a component that takes one', () => {
  it('publishes it as an ordinary prop, materialized', () => {
    // The point of materializing: nothing downstream - the generator, the docs, the contract
    // digest - has to resolve the registry to know what the component accepts.
    expect(propsOf()).toEqual([
      {
        id: 'prop.variant',
        name: 'variant',
        type: { kind: 'context', group: 'cg.variant' },
        global: true,
        default: 'Solid',
        description: 'How the component is painted.',
      },
      { id: 'prop.tone', name: 'tone', type: { kind: 'string' }, global: true },
      { id: 'prop.loading', name: 'loading', type: { kind: 'boolean' }, default: false },
    ])
  })

  it('keeps its local props local', () => {
    expect(propsOf(SOURCE, 'Box')).toEqual([
      { id: 'prop.padding', name: 'padding', type: { kind: 'string' } },
    ])
  })

  it('gets an error, and no prop, when the reference names nothing', () => {
    const source = 'component Box { props { global nope } part root { } }'
    const { issues } = irOf(source)
    expect(issues.map((i) => `${i.severity} ${i.code}`)).toEqual(['error global-prop-unknown'])
    expect(propsOf(source, 'Box')).toEqual([])
  })
})

describe('the file it prints back', () => {
  const printed = () => {
    const { ir } = irOf(SOURCE)
    return documentToDsl({
      components: ir.components,
      foundations: ir.foundations,
      sharedTypes: ir.sharedTypes,
    })
  }

  it('declares the global props once', () => {
    expect(
      hasDslLine(
        printed(),
        'global-prop variant : context Variant = "Solid" "How the component is painted."',
      ),
    ).toBe(true)
  })

  it('prints the reference, not a restatement', () => {
    const dsl = printed()
    expect(hasDslLine(dsl, 'global variant, tone')).toBe(true)
    // The type and the default belong to the declaration; a component that restated them would be
    // a second place to change one decision.
    expect(dsl.includes('variant : context Variant = "Solid"\n')).toBe(false)
  })

  it('round-trips: the same registry and the same component surface', () => {
    const first = irOf(SOURCE).ir
    const second = documentToIr(parseMildaDocument(printed(), {}).document)
    expect(second.foundations.globalProps).toEqual(first.foundations.globalProps)
    expect(second.components.map((c) => c.contract?.props)).toEqual(
      first.components.map((c) => c.contract?.props),
    )
  })
})

// ─── What the construct must not disturb ─────────────────────────────────────
// Each of these read or printed differently once `global` and `context` became words the surface
// knows - a file that was legal before the construct must mean what it meant, and a document made
// in the Studio (uuid ids, props in the author's order) must survive the trip through text.

const roundTrip = (source: string) => {
  const first = irOf(source).ir
  const text = documentToDsl({
    components: first.components,
    foundations: first.foundations,
    sharedTypes: first.sharedTypes,
  })
  return { first, text, second: documentToIr(parseMildaDocument(text, {}).document) }
}

describe('what the construct must not disturb', () => {
  it('keeps a component prop order that interleaves global and local props', () => {
    const source = SOURCE.replace(
      'global variant, tone\n    loading : boolean = false',
      'loading : boolean = false\n    global variant\n    size : string\n    global tone',
    )
    const { first, second } = roundTrip(source)
    const names = (ir: typeof first) =>
      ir.components.find((c) => c.name === 'Button')?.contract?.props.map((p) => p.name)
    expect(names(first)).toEqual(['loading', 'variant', 'size', 'tone'])
    expect(names(second)).toEqual(names(first))
  })

  it('still reads a prop that is merely NAMED global', () => {
    const props = propsOf(
      `component Toggle {\n  props {\n    global : boolean = false\n  }\n  part root { }\n}\n`,
      'Toggle',
    )
    expect(props).toEqual([expect.objectContaining({ name: 'global', type: { kind: 'boolean' } })])
    expect(props[0]?.global).toBeUndefined()
  })

  it('never turns an explicit ref into a context type', () => {
    // `ref Color` is how a built-in type is exported; a system with a `Color` aspect must not
    // retype every colour prop on its next read.
    const props = propsOf(
      `context-group Color { Red Blue }\ncomponent Swatch {\n  props {\n    tint : ref Color\n  }\n  part root { }\n}\n`,
      'Swatch',
    )
    expect(props[0]?.type.kind).toBe('ref')
  })

  it('names a Studio-made group (uuid id) by its declared name, and reads it back', () => {
    const { ir } = irOf(SOURCE)
    const uuid = '3f9c2b1e-7a44-4c1b-9d2e-55aa66bb77cc'
    const groups = ir.foundations.contextGroups.map((g) =>
      g.name === 'Variant' ? { ...g, id: uuid } : g,
    )
    const retype = <T extends { type: { kind: string } }>(p: T): T =>
      p.type.kind === 'context' ? { ...p, type: { kind: 'context', group: uuid } } : p
    const text = documentToDsl({
      components: ir.components.map((c) => ({
        ...c,
        contract: c.contract && { ...c.contract, props: c.contract.props.map(retype) },
      })),
      foundations: {
        ...ir.foundations,
        contextGroups: groups,
        globalProps: ir.foundations.globalProps?.map(retype),
      },
      sharedTypes: ir.sharedTypes,
    })
    expect(text).not.toContain(uuid.replace(/-/g, ''))
    expect(
      hasDslLine(
        text,
        'global-prop variant : context Variant = "Solid" "How the component is painted."',
      ),
    ).toBe(true)
    const back = documentToIr(parseMildaDocument(text, {}).document)
    const variant = back.foundations.globalProps?.find((p) => p.name === 'variant')
    expect(variant?.type.kind).toBe('context')
    const group = back.foundations.contextGroups.find(
      (g) => variant?.type.kind === 'context' && g.id === variant.type.group,
    )
    expect(group?.name).toBe('Variant')
  })
})
