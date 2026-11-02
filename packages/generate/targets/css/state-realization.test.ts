import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { getTarget } from '../../index'
import { documentToIr } from '../dsl/toIr'
import { readCss } from '../web/react/testkit'

// ─── A state the web target cannot select ─────────────────────────────────────
// `StateName` is a closed vocabulary, but the read is lossless: `state invalid` is warned on
// (`state-unknown`) and kept, so the word reaches the IR. `STATE_SELECTOR` has no entry for it,
// and the rule's selector suffix used to come out EMPTY - the Radix TextField's
// `state invalid { ring … }` shipped as a bare `.root { outline: … }`, a focus ring on every text
// field in every state. A condition the target cannot say must cost the rule, never the
// condition, and the target's `skipped` list is where it says so.

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const corpus = (...files: string[]) =>
  files.map((f) => readFileSync(`${REPO_ROOT}docs/dsl/example-radix/${f}.milda`, 'utf8')).join('\n')

function emit(source: string) {
  const ir = documentToIr(parseMildaDocument(source).document)
  const out = getTarget('react').emitDocument(
    {
      componentsById: Object.fromEntries(ir.components.map((c) => [c.name, c])),
      foundations: ir.foundations,
    },
    { sharedTypes: ir.sharedTypes },
  )
  const css = (name: string) =>
    readCss(out.files.find((f) => f.path === `${name}.module.css`)?.code ?? '')
  const tsx = (name: string) => out.files.find((f) => f.path === `${name}.tsx`)?.code ?? ''
  return { css, tsx, skipped: out.skipped }
}

describe('the Radix TextField, where it was found', () => {
  const { css, skipped } = emit(corpus('foundations', 'inputs'))
  const textField = css('TextField')

  it('keeps its focus ring on focus, and nowhere else', () => {
    expect(textField.decl('.root:focus', 'outline-offset')).toBeDefined()
    // `readCss` folds same-selector blocks into one map, so a stray unconditional rule after
    // the base block would have overwritten these.
    expect(textField.decl('.root', 'outline')).toBe('none')
    expect(textField.decl('.root', 'outline-offset')).toBeUndefined()
  })

  it('says which rule it left out, in the author terms', () => {
    expect(skipped).toContain(
      'TextField: part "root": state "invalid" has no web realization, so the rule was left out ' +
        'rather than applied in every state.',
    )
  })
})

// Each rule paints a different corner, so a rule that escaped its condition is visible as the
// corner the bare selector ends up with. Corners rather than fills because the radius scale is
// declared in the Radix foundations and resolves; an unresolved colour would emit nothing at all
// and make every assertion below pass vacuously.
const box =
  corpus('foundations') +
  `
component Box {
  part root {
    corner radius.1
    state hovered { corner radius.2 }
    state invalid { corner radius.3 }
    when state invalid { corner radius.4 }
    when state hovered and state invalid { corner radius.5 }
  }
  part root.label {
    kind text
    content "Go"
    corner radius.1
    when ancestor root invalid { corner radius.6 }
  }
}
`

describe('every path a state reaches a selector by', () => {
  const { css, skipped } = emit(box)
  const sheet = css('Box')

  it('emits a rule on a state it knows', () => {
    expect(sheet.decl('.root:hover', 'border-radius')).toBe('var(--ds-radius-radius-2)')
  })

  it('never lets an unknown state widen a rule into the bare selector', () => {
    // `readCss` folds same-selector blocks, so any of the rules escaping would show here as
    // radius 3, 4 or 5 in place of the base.
    expect(sheet.decl('.root', 'border-radius')).toBe('var(--ds-radius-radius-1)')
    expect(sheet.decl('.label', 'border-radius')).toBe('var(--ds-radius-radius-1)')
    expect(sheet.selectors.filter((s) => s.startsWith('.root') && s !== '.root:hover')).toEqual([
      '.root',
    ])
  })

  it('reports the state block, the `when` leaf and the conjunction, each by its unknown word', () => {
    const own = skipped.filter((s) => s.startsWith('Box: part "root"'))
    expect(own).toEqual(
      Array(3).fill(
        'Box: part "root": state "invalid" has no web realization, so the rule was left out ' +
          'rather than applied in every state.',
      ),
    )
  })

  it('does not hang an anchored child off a bare ancestor selector', () => {
    expect(sheet.selectors.filter((s) => s.includes(' '))).toEqual([])
    expect(skipped).toContain(
      'Box: part "label": state "invalid" has no web realization, so the rule was left out ' +
        'rather than applied in every state.',
    )
  })
})

// ─── A condition the runtime cannot evaluate ──────────────────────────────────
// A `when` with OR, NOT or a comparison has no selector of its own: the sheet keys it off a
// `data-cond` attribute and the generated component sets that attribute from the predicate. A
// leaf the component cannot read at runtime - a pointer state no prop binds, an ancestor's state -
// left the attribute unset, so the rule never applied and nothing said so. It is reported now.

const either =
  corpus('foundations') +
  `
component Either {
  props {
    tone : enum(neutral, danger) = neutral
  }
  part root {
    corner radius.1
    when state hovered or tone = danger { corner radius.2 }
    when tone = danger or tone = neutral { corner radius.3 }
  }
}
`

describe('a rich condition with a leaf the runtime cannot read', () => {
  const { skipped, tsx } = emit(either)

  it('sets the attribute on the root for the condition it can read, and only that one', () => {
    // The root used to get no data-cond attribute at all, so even a pure-prop OR never applied.
    expect(tsx('Either').match(/data-cond-\w+=/g)).toHaveLength(1)
  })

  it('reports the rule it cannot apply, once, by part', () => {
    expect(skipped.filter((s) => s.startsWith('Either:'))).toEqual([
      'Either: part "root": a condition combines a state or an ancestor the generated component ' +
        'cannot read at runtime, so the rule is never applied.',
    ])
  })
})
