import { describe, expect, it } from 'vitest'
import { seedStructure, seedArchetypeContract, bornWithSampleItems } from './seed'
import { effectiveValueType, type ComponentStructure } from './types'
import type { PropType } from '../contract/types'

// Proposal 0034 axis A: value-bearing atoms lower their params into contract props,
// generalizing LOWERED_VALUE_CONTROL (BooleanInput) / PICKER_VALUE_API (pickers) to
// every input archetype. Before this, a born TextField/Slider/Stepper/Select had
// events but no `value` prop.

function build(archetype: string) {
  const structure = seedStructure(archetype, archetype)
  return { structure, contract: seedArchetypeContract(structure, archetype) }
}
function propNames(archetype: string): string[] {
  return build(archetype).contract.props.map((p) => p.name)
}
function propType(archetype: string, name: string): PropType | undefined {
  return build(archetype).contract.props.find((p) => p.name === name)?.type
}
function loneInput(structure: ComponentStructure) {
  return Object.values(structure.nodes).find((n) => n.kind === 'input')
}

describe('seedArchetypeContract — atom value props (axis A)', () => {
  it('value-entry archetypes expose a string `value`, wired to the input node', () => {
    for (const a of ['TextField', 'TextArea', 'SearchField']) {
      const { structure, contract } = build(a)
      const value = contract.props.find((p) => p.name === 'value')
      expect(value, a).toBeTruthy()
      expect(value!.type, a).toEqual({ kind: 'string' })
      const input = loneInput(structure)
      expect(input?.valueBinding?.propName, a).toBe('value')
      expect(effectiveValueType(input!), a).toEqual({ kind: 'string' })
    }
  })

  it('range/stepping expose numeric value+min+max+step', () => {
    for (const a of ['Slider', 'Stepper']) {
      for (const name of ['value', 'min', 'max', 'step']) {
        expect(propType(a, name), `${a}.${name}`).toEqual({ kind: 'number' })
      }
    }
  })

  it('a Stepper wires its number value onto the input node (activates the stepper plan)', () => {
    const input = loneInput(build('Stepper').structure)
    expect(input?.valueBinding?.propName).toBe('value')
    expect(effectiveValueType(input!)).toEqual({ kind: 'number' })
  })

  it('single selection ⇒ string value; multiple ⇒ string[] value', () => {
    expect(propType('ChoiceGroup', 'value')).toEqual({ kind: 'string' })
    expect(propType('SingleSelect', 'value')).toEqual({ kind: 'string' })
    expect(propType('MultiSelect', 'value')).toEqual({ kind: 'array', item: { kind: 'string' } })
  })

  it('when several value atoms compose, the collection value wins over the text draft', () => {
    // TagsInput = value-entry + selection.multiple ⇒ the token LIST is the value.
    expect(propType('TagsInput', 'value')).toEqual({ kind: 'array', item: { kind: 'string' } })
    // Combobox = value-entry + selection.single ⇒ the committed member (string).
    expect(propType('Combobox', 'value')).toEqual({ kind: 'string' })
  })

  it('does not regress the special-cased archetypes', () => {
    // BooleanInput keeps its lowered `checked`, no stray `value`.
    expect(propNames('BooleanInput')).toContain('checked')
    expect(propNames('BooleanInput')).not.toContain('value')
    // ColorPicker owns its value API and must NOT pick up range's numeric min/max/step.
    const colorProps = propNames('ColorPicker')
    expect(colorProps).toContain('value')
    expect(colorProps).not.toContain('min')
    expect(colorProps).not.toContain('step')
    // DatePicker keeps its date-typed value+bounds.
    expect(propType('DatePicker', 'value')?.kind).toBe('ref')
    expect(propType('DatePicker', 'min')?.kind).toBe('ref')
  })

  it('archetypes with no value-bearing required atom get no value prop', () => {
    // List composes `selection?` (optional) — opt-in, so no born value prop.
    expect(propNames('List')).not.toContain('value')
    expect(propNames('Button')).not.toContain('value')
  })
})

// Proposal 0034 axis B: emits now resolve through composites, and previously-unmapped
// atom signals (submission/navigation/async-state) produce default events.
function eventNames(archetype: string): string[] {
  return build(archetype).contract.events.map((e) => e.name)
}

describe('seedArchetypeContract — composite/atom event coverage (axis B)', () => {
  it('Form surfaces submit + submitSuccess + submitError (submission atom)', () => {
    const evs = eventNames('Form')
    expect(evs).toContain('submit')
    expect(evs).toContain('submitSuccess')
    expect(evs).toContain('submitError')
  })

  it('composite-only archetypes surface their signal', () => {
    // Disclosure = `disclosure` composite → onToggle.
    expect(eventNames('Disclosure')).toContain('toggle')
    // Wizard = `stepping-nav` composite → onStepChange + onComplete.
    expect(eventNames('Wizard')).toEqual(expect.arrayContaining(['stepChange', 'complete']))
  })

  it('navigation archetypes surface navigate', () => {
    expect(eventNames('NavigationBar')).toContain('navigate')
    expect(eventNames('Breadcrumbs')).toContain('navigate')
  })

  it('async-state archetypes surface success + error', () => {
    expect(eventNames('FileUpload')).toEqual(expect.arrayContaining(['success', 'error']))
  })

  it('does not fabricate duplicate events', () => {
    const evs = eventNames('Tree')
    expect(new Set(evs).size).toBe(evs.length)
  })
})

// Proposal 0034 axis C: collections are born with a 3-item sample so they read as a
// recognizable pattern instead of a lone mystery row.
describe('bornWithSampleItems — collection starter samples (axis C)', () => {
  const born = (a: string) => seedStructure(a, a, { bornRepeat: bornWithSampleItems(a) })

  it('marks the single-item-role collections, not Button/Tabs/Table', () => {
    for (const a of ['ChoiceGroup', 'List', 'Menu', 'NavigationBar', 'Accordion', 'Wizard', 'Combobox']) {
      expect(bornWithSampleItems(a), a).toBe(true)
    }
    for (const a of ['Button', 'Tabs', 'Table', 'TextField']) {
      expect(bornWithSampleItems(a), a).toBe(false)
    }
  })

  it('seeds exactly one repeat with a 3-item sample', () => {
    for (const a of ['List', 'Menu', 'Accordion', 'Wizard', 'Rating']) {
      const repeats = Object.values(born(a).nodes).filter((n) => n.repeat)
      expect(repeats.length, a).toBe(1)
      const src = repeats[0].repeat!.source
      expect(src.kind, a).toBe('static')
      expect(src.kind === 'static' && src.items.length, a).toBe(3)
    }
  })

  it('binds the repeated item label to the sample item so it renders One/Two/Three', () => {
    const nodes = born('Menu').nodes
    const bound = Object.values(nodes).find(
      (n) => n.content?.default?.kind === 'bind' && n.content.default.propName === 'item.label',
    )
    expect(bound).toBeTruthy()
  })

  it('a bare template archetype seeds no repeat', () => {
    expect(Object.values(born('Button').nodes).filter((n) => n.repeat)).toHaveLength(0)
  })
})
