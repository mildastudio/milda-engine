import { describe, expect, it } from 'vitest'
import type { ComponentContract } from '../contract/types'
import { propConstraintSentence, requiredWhenSentence, usageRuleSentence } from './sentence'
import type { UsageRule } from './types'
import { ruleComponentNames } from './types'
import { validatePropConstraints, validateUsageRules, type RuleScope } from './validate'

const primary = {
  kind: 'cmp',
  ref: { kind: 'prop', path: 'variant' },
  op: 'eq',
  value: 'Primary',
} as const

const base = { severity: 'error', rationale: 'Because.' } as const

const scope: RuleScope = {
  components: [
    {
      name: 'Button',
      archetype: 'Button',
      contract: { props: [{ id: 'v', name: 'variant', type: { kind: 'string' } }], events: [] },
    },
    { name: 'Tab', archetype: 'Tabs' },
    { name: 'Tabs', archetype: 'Tabs' },
    { name: 'Link', archetype: 'Link' },
  ],
  archetypes: ['Button', 'Form', 'Tabs', 'Link', 'ContextMenu'],
}

// ─── The sentences ───────────────────────────────────────────────────────────
// The SAME wording reaches AGENTS.md, DESIGN.md, the Studio and the checker (0052 §9), so the
// wording is asserted here once rather than in each of them.

describe('usageRuleSentence', () => {
  it('says each kind', () => {
    const rules: UsageRule[] = [
      {
        ...base,
        id: 'a',
        kind: 'count',
        subject: { kind: 'component', name: 'Button', where: primary },
        within: { kind: 'archetype', name: 'Form' },
        max: 1,
      },
      {
        ...base,
        id: 'b',
        kind: 'count',
        subject: { kind: 'component', name: 'Tab' },
        within: { kind: 'component', name: 'Tabs' },
        min: 2,
        max: 7,
      },
      {
        ...base,
        id: 'c',
        kind: 'never',
        subject: { kind: 'component', name: 'Badge' },
        within: { kind: 'component', name: 'Button' },
      },
      {
        ...base,
        id: 'd',
        kind: 'only-within',
        subject: { kind: 'component', name: 'Tab' },
        within: [
          { kind: 'component', name: 'Tabs' },
          { kind: 'archetype', name: 'ContextMenu' },
        ],
      },
      { ...base, id: 'e', kind: 'tokens-only', types: ['color', 'fontSize'] },
      { ...base, id: 'f', kind: 'prefer', component: 'Link', archetypes: ['Link'] },
    ]
    expect(rules.map((r) => usageRuleSentence(r))).toEqual([
      'At most 1 `Button` where `variant` = Primary within any `Form`.',
      'Between 2 and 7 `Tab` within each `Tabs`.',
      'Never put a `Badge` within a `Button`.',
      'Use `Tab` only within `Tabs` or any `ContextMenu`.',
      'Every color and font size value comes from a token.',
      'Anything that is a `Link` uses `Link`.',
    ])
  })

  it('prints a component the way the caller names it', () => {
    const r: UsageRule = {
      ...base,
      id: 'x',
      kind: 'prefer',
      component: 'Toggle button',
      archetypes: ['ToggleButton'],
    }
    expect(usageRuleSentence(r, { name: () => '`ToggleButton`' })).toBe(
      'Anything that is a `ToggleButton` uses `ToggleButton`.',
    )
  })

  it('says the interface constraints', () => {
    expect(
      propConstraintSentence({ id: '1', kind: 'one-of', props: ['label', 'labelledBy'] }),
    ).toBe('Set exactly one of `label` or `labelledBy`.')
    expect(
      requiredWhenSentence({
        name: 'loadingLabel',
        requiredWhen: { kind: 'cmp', ref: { kind: 'prop', path: 'loading' }, op: 'set' },
      }),
    ).toBe('Required when `loading`.')
  })
})

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validateUsageRules', () => {
  const codes = (rules: UsageRule[]) => validateUsageRules(rules, scope).map((i) => i.code)

  it('accepts a well-formed rule', () => {
    expect(
      codes([
        {
          ...base,
          id: 'one-primary',
          kind: 'count',
          subject: { kind: 'component', name: 'Button', where: primary },
          within: { kind: 'archetype', name: 'Form' },
          max: 1,
        },
      ]),
    ).toEqual([])
  })

  it('keeps a dangling reference as a warning, and refuses an unreadable rule', () => {
    const issues = validateUsageRules(
      [
        {
          ...base,
          id: 'x',
          kind: 'never',
          subject: { kind: 'component', name: 'Chip' },
          within: { kind: 'archetype', name: 'Nope' },
        },
        { ...base, id: 'x', rationale: ' ', kind: 'tokens-only', types: ['colour'] as never },
      ],
      scope,
    )
    expect(issues.map((i) => [i.severity, i.code])).toEqual([
      ['warning', 'rule-unknown-component'],
      ['warning', 'rule-unknown-archetype'],
      ['error', 'rule-duplicate-id'],
      ['error', 'rule-because-missing'],
      ['warning', 'rule-unknown-token-type'],
    ])
  })

  it('reads a where by its props', () => {
    expect(
      codes([
        {
          ...base,
          id: 'w',
          kind: 'never',
          subject: {
            kind: 'component',
            name: 'Button',
            where: { kind: 'cmp', ref: { kind: 'state', state: 'hovered' }, op: 'set' },
          },
          within: { kind: 'component', name: 'Tabs' },
        },
        {
          ...base,
          id: 'v',
          kind: 'never',
          subject: {
            kind: 'component',
            name: 'Button',
            where: { kind: 'cmp', ref: { kind: 'prop', path: 'tone' }, op: 'set' },
          },
          within: { kind: 'component', name: 'Tabs' },
        },
      ]),
    ).toEqual(['rule-where-not-prop', 'rule-where-unknown-prop'])
  })

  it('checks the count bounds and suggests never for max 0', () => {
    const count = (min?: number, max?: number): UsageRule => ({
      ...base,
      id: `c${min}-${max}`,
      kind: 'count',
      subject: { kind: 'component', name: 'Tab' },
      within: { kind: 'component', name: 'Tabs' },
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
    })
    expect(codes([count()])).toEqual(['rule-count-bound'])
    expect(codes([count(3, 1)])).toEqual(['rule-count-bound'])
    expect(codes([count(undefined, 0)])).toEqual(['rule-count-zero'])
  })

  it('notices a preferred component that does not realize the archetype', () => {
    expect(
      codes([{ ...base, id: 'p', kind: 'prefer', component: 'Button', archetypes: ['Link'] }]),
    ).toEqual(['rule-prefer-mismatch'])
  })

  it('lists the components a rule names', () => {
    expect(
      ruleComponentNames({
        ...base,
        id: 'd',
        kind: 'only-within',
        subject: { kind: 'component', name: 'Tab' },
        within: [
          { kind: 'component', name: 'Tabs' },
          { kind: 'archetype', name: 'Menu' },
        ],
      }),
    ).toEqual(['Tab', 'Tabs'])
  })
})

describe('validatePropConstraints', () => {
  const contract = (over: Partial<ComponentContract>): ComponentContract => ({
    props: [
      { id: '1', name: 'label', type: { kind: 'string' } },
      { id: '2', name: 'labelledBy', type: { kind: 'string' } },
      { id: '3', name: 'loading', type: { kind: 'boolean' } },
    ],
    events: [],
    ...over,
  })

  it('names the contradictions', () => {
    const c = contract({
      constraints: [{ id: 'g', kind: 'one-of', props: ['label', 'labelledBy'] }],
    })
    c.props[0]!.required = true
    expect(validatePropConstraints(c).map((i) => i.code)).toEqual(['constraint-contradiction'])
  })

  it('needs two real members', () => {
    expect(
      validatePropConstraints(
        contract({ constraints: [{ id: 'g', kind: 'any-of', props: ['label', 'nope'] }] }),
      ).map((i) => i.code),
    ).toEqual(['constraint-unknown-prop'])
    expect(
      validatePropConstraints(
        contract({ constraints: [{ id: 'g', kind: 'exclusive', props: ['label'] }] }),
      ).map((i) => i.code),
    ).toEqual(['constraint-too-few'])
  })

  it('reads a requiredWhen against the other props', () => {
    const c = contract({})
    c.props[1]!.requiredWhen = { kind: 'cmp', ref: { kind: 'prop', path: 'labelledBy' }, op: 'set' }
    c.props[0]!.requiredWhen = { kind: 'cmp', ref: { kind: 'prop', path: 'busy' }, op: 'set' }
    expect(validatePropConstraints(c).map((i) => i.code)).toEqual([
      'required-when-unknown-prop',
      'required-when-self',
    ])
  })
})
