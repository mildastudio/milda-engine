import type { ComponentIR, UsageRule } from '@mildastudio/core'
import { describe, expect, it } from 'vitest'
import { buildDigest } from './digest'
import { diffDigests } from './diff'

// ─── How the system is used, in the version (proposal 0052 §9) ─────────────────
// An interface constraint is a contract fact: gaining one can reject a use that compiled
// yesterday, so it moves the major version. A usage rule cannot break a build, so it is LISTED in
// the changes and never moves the version.

const button = (over: Partial<NonNullable<ComponentIR['contract']>> = {}): ComponentIR => ({
  name: 'Button',
  archetype: 'Button',
  structure: { rootId: 'r', nodes: {} },
  contract: {
    props: [
      { id: 'p1', name: 'loading', type: { kind: 'boolean' } },
      { id: 'p2', name: 'loadingLabel', type: { kind: 'string' } },
      { id: 'p3', name: 'label', type: { kind: 'string' } },
      { id: 'p4', name: 'labelledBy', type: { kind: 'string' } },
    ],
    events: [],
    ...over,
  },
})

const when = { kind: 'cmp', ref: { kind: 'prop', path: 'loading' }, op: 'set' } as const

describe('interface constraints in the digest', () => {
  it('leaves a digest without them exactly as it was', () => {
    const d = buildDigest([button()])
    expect(d.components.Button).not.toHaveProperty('constraints')
    expect(d.components.Button!.props.loadingLabel).not.toHaveProperty('requiredWhen')
    expect(d).not.toHaveProperty('rules')
  })

  it('makes a new condition a breaking change, and dropping it a minor one', () => {
    const plain = buildDigest([button()])
    const c = button()
    c.contract!.props[1]!.requiredWhen = when
    const conditional = buildDigest([c])
    expect(diffDigests(plain, conditional).severity).toBe('major')
    expect(diffDigests(plain, conditional).changes[0]!.summary).toBe(
      'Prop `loadingLabel` on `Button` became required when `loading`',
    )
    expect(diffDigests(conditional, plain).severity).toBe('minor')
  })

  it('makes a new group constraint a breaking change, whatever the order of its members', () => {
    const plain = buildDigest([button()])
    const one = buildDigest([
      button({ constraints: [{ id: 'a', kind: 'one-of', props: ['labelledBy', 'label'] }] }),
    ])
    const same = buildDigest([
      button({ constraints: [{ id: 'b', kind: 'one-of', props: ['label', 'labelledBy'] }] }),
    ])
    expect(diffDigests(plain, one).severity).toBe('major')
    expect(diffDigests(one, same).changes).toEqual([])
    expect(diffDigests(one, plain).severity).toBe('minor')
  })
})

describe('usage rules in the digest', () => {
  const rule = (over: Partial<UsageRule> = {}): UsageRule =>
    ({
      id: 'no-badge',
      severity: 'warning',
      rationale: 'Why.',
      kind: 'never',
      subject: { kind: 'component', name: 'Badge' },
      within: { kind: 'component', name: 'Button' },
      ...over,
    }) as UsageRule

  it('lists a rule change without moving the version', () => {
    const before = buildDigest([button()], [], [rule()])
    const after = buildDigest([button()], [], [rule({ severity: 'error' })])
    const diff = diffDigests(before, after)
    expect(diff.severity).toBe('patch')
    expect(diff.changes.map((c) => c.summary)).toEqual([
      'The usage rule `no-badge` is now an error',
    ])
  })

  it('ignores a reworded reason, and reports a new statement', () => {
    const before = buildDigest([button()], [], [rule()])
    expect(
      diffDigests(before, buildDigest([button()], [], [rule({ rationale: 'Other.' })])).changes,
    ).toEqual([])
    const moved = rule({ within: { kind: 'component', name: 'Link' } } as Partial<UsageRule>)
    expect(diffDigests(before, buildDigest([button()], [], [moved])).changes[0]!.summary).toBe(
      'The usage rule `no-badge` now says something else',
    )
  })

  it('says nothing about rules against a digest that never recorded them', () => {
    expect(
      diffDigests(buildDigest([button()]), buildDigest([button()], [], [rule()])).changes,
    ).toEqual([])
  })

  it('reports added and removed rules', () => {
    const none = buildDigest([button()], [], [])
    const one = buildDigest([button()], [], [rule()])
    expect(diffDigests(none, one).changes.map((c) => c.summary)).toEqual([
      'Added the usage rule `no-badge` (warning)',
    ])
    expect(diffDigests(one, none).changes.map((c) => c.summary)).toEqual([
      'Removed the usage rule `no-badge`',
    ])
  })
})
