import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { hasDslLine } from './testkit'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── How the system is used (proposal 0052) ────────────────────────────────────
// The corpus file (`docs/dsl/rules/usage-rules.milda`) proves every form survives a round trip.
// This file pins what the corpus cannot: the diagnostics, the names a rule resolves through, and
// the two surface gaps 0052 closed on the way (`required` and a prop's prose had no spelling).

function irOf(source: string) {
  const parsed = parseMildaDocument(source, {})
  return { ir: documentToIr(parsed.document), issues: parsed.issues }
}
const print = (source: string) => {
  const { ir } = irOf(source)
  return documentToDsl({ components: ir.components, foundations: ir.foundations })
}
const codes = (source: string) => irOf(source).issues.map((i) => `${i.severity}:${i.code}`)

const BUTTON = `
context-group Variant { Primary Secondary }
component Button {
  archetype Button
  props {
    variant : context Variant = Secondary
    loading : boolean = false
    loadingLabel : string required when loading "Read out while loading."
    label : string required
    labelledBy : string
    one-of label, labelledBy
  }
}
`

describe('interface constraints', () => {
  it('lowers required, required when, the prose and the group constraints', () => {
    const props = irOf(BUTTON).ir.components[0]!.contract!
    const byName = Object.fromEntries(props.props.map((p) => [p.name, p]))
    expect(byName.label!.required).toBe(true)
    expect(byName.loadingLabel!.requiredWhen).toEqual({
      kind: 'cmp',
      ref: { kind: 'prop', path: 'loading' },
      op: 'set',
    })
    expect(byName.loadingLabel!.description).toBe('Read out while loading.')
    expect(props.constraints).toEqual([
      { id: 'pc.0.one-of.label.labelledby', kind: 'one-of', props: ['label', 'labelledBy'] },
    ])
  })

  it('prints them back the way they were written', () => {
    const out = print(BUTTON)
    expect(
      hasDslLine(out, 'loadingLabel : string required when loading "Read out while loading."'),
    ).toBe(true)
    expect(hasDslLine(out, 'label : string required')).toBe(true)
    expect(hasDslLine(out, 'one-of label, labelledBy')).toBe(true)
  })

  it('keeps `exclusive` an ordinary prop name when no name follows it', () => {
    const { ir, issues } = irOf(`component Box { props { exclusive : boolean } }`)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(ir.components[0]!.contract!.props.map((p) => p.name)).toEqual(['exclusive'])
    expect(ir.components[0]!.contract!.constraints).toBeUndefined()
  })

  it('warns on a member the component does not declare, and refuses a one-member group', () => {
    expect(codes(`component Box { props { a : string\n any-of a, b } }`)).toEqual([
      'warning:constraint-unknown-prop',
    ])
    expect(codes(`component Box { props { a : string\n exclusive a } }`)).toEqual([
      'error:constraint-too-few',
    ])
  })

  it('reads a required-when over a state as a mistake, not as a condition', () => {
    expect(codes(`component Box { props { a : string required when state hovered } }`)).toEqual([
      'warning:required-when-not-prop',
    ])
  })
})

describe('usage rules', () => {
  const rule = (body: string, head = 'r error') =>
    `${BUTTON}\nrule ${head} {\n  ${body}\n  because "Why."\n}\n`

  it('names a component by its declared identifier and stores its authored name', () => {
    const src = `
component ToggleButton {
  archetype ToggleButton
  meta { name "Toggle button" }
}
rule one-toggle warning {
  max 1 ToggleButton within archetype Form
  because "Why."
}
`
    const { ir, issues } = irOf(src)
    expect(issues).toEqual([])
    const r = ir.foundations.rules![0]!
    expect(r.kind === 'count' && r.subject.name).toBe('Toggle button')
    expect(hasDslLine(print(src), 'max 1 ToggleButton within archetype Form')).toBe(true)
  })

  it('keeps a dangling reference with a warning', () => {
    const src = rule('never Chip within archetype Nope')
    expect(codes(src)).toEqual(['warning:rule-unknown-component', 'warning:rule-unknown-archetype'])
    expect(irOf(src).ir.foundations.rules).toHaveLength(1)
  })

  it('keeps a rule with no reason, and says the reason is missing', () => {
    const src = `${BUTTON}\nrule quiet error {\n  never Button within Button\n}\n`
    expect(codes(src)).toEqual(['error:rule-because-missing'])
    expect(irOf(src).ir.foundations.rules![0]!.rationale).toBe('')
  })

  it('refuses a reused id, a second statement and an impossible count', () => {
    const twice = `${rule('never Button within Button')}\n${rule('never Button within Button')}`
    expect(codes(twice)).toEqual(['error:rule-duplicate-id'])
    expect(
      codes(
        `${BUTTON}\nrule r error {\n  never Button within Button\n  tokens color\n  because "x"\n}`,
      ),
    ).toEqual(['error:rule-second-statement'])
    expect(codes(rule('min 3 max 1 Button within Button'))).toEqual(['error:rule-count-bound'])
  })

  it('needs a severity', () => {
    expect(codes(rule('never Button within Button', 'r'))).toEqual(['error:rule-severity'])
  })

  it('reads the token types in the foundations vocabulary', () => {
    const r = irOf(rule('tokens color, font-size, border')).ir.foundations.rules![0]!
    expect(r.kind === 'tokens-only' && r.types).toEqual(['color', 'fontSize', 'borderWidth'])
    expect(
      hasDslLine(print(rule('tokens color, font-size, border')), 'tokens color, font-size, border'),
    ).toBe(true)
    expect(codes(rule('tokens colour'))).toEqual(['warning:rule-unknown-token-type'])
  })

  it('reads a where as a predicate over props', () => {
    const r = irOf(
      rule('max 1 Button where variant = Primary and not loading within archetype Form'),
    ).ir.foundations.rules![0]!
    expect(r.kind === 'count' && r.subject.where).toEqual({
      kind: 'all',
      items: [
        { kind: 'cmp', ref: { kind: 'prop', path: 'variant' }, op: 'eq', value: 'Primary' },
        { kind: 'cmp', ref: { kind: 'prop', path: 'loading' }, op: 'unset' },
      ],
    })
    expect(codes(rule('never Button where state hovered within Button'))).toEqual([
      'warning:rule-where-not-prop',
    ])
  })

  it('says what it expected when a statement is not one', () => {
    expect(codes(rule('at most 1 Button within Button'))).toEqual(['error:rule-statement'])
  })

  it('prints a component with no parts as no parts, so the second read does not seed any', () => {
    const once = print(`component Dialog {\n  archetype Dialog\n}\n`)
    expect(once).not.toContain('part root')
    expect(print(once)).toBe(once)
  })
})
