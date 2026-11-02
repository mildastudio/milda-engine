import type { ComponentContract, PropConstraint } from '../contract/types'
import { SCALES } from '../foundations/scales'
import type { Predicate } from '../structure/predicate'
import { propConstraintSentence } from './sentence'
import type { RuleSubject, UsageRule } from './types'

// ─── Validation ──────────────────────────────────────────────────────────────
// One checker for both layers, run by the parser (as diagnostics on the file), the Studio (as
// chips on the row) and the release (as the count of rules with warnings), so the three say the
// same sentence about the same mistake (proposal 0052 §4, §5.4).
//
// The severity split is deliberate. A broken REFERENCE is a warning: the rule or constraint is
// kept and matches nothing, which loses no authored text and lets a per-file corpus name a
// component in a sibling file. A rule that cannot be READ - no rationale, a reused id, a count
// with no bound - is an error, because there is no rule there to keep.

export interface RuleIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  /** The rule this is about, when it is about one. */
  ruleId?: string
}

export interface RuleScope {
  /** The system's components, by authored name. */
  components: Array<{ name: string; archetype: string | null; contract?: ComponentContract }>
  /** The prelude's archetype names. Absent: archetype references are not checked. */
  archetypes?: readonly string[]
}

export const TOKEN_TYPES: readonly string[] = [
  'color',
  ...Object.keys(SCALES),
  'gradient',
  'textStyle',
  'easing',
]

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The prop names a predicate reads, and whether it reads anything that is not a prop. */
export function predicateProps(p: Predicate): { props: string[]; nonProp: boolean } {
  const props: string[] = []
  let nonProp = false
  const walk = (q: Predicate) => {
    if (q.kind === 'cmp') {
      if (q.ref.kind === 'prop') props.push(q.ref.path)
      else nonProp = true
    } else if (q.kind === 'not') walk(q.item)
    else q.items.forEach(walk)
  }
  walk(p)
  return { props: [...new Set(props)], nonProp }
}

export function validateUsageRules(rules: UsageRule[], scope: RuleScope): RuleIssue[] {
  const issues: RuleIssue[] = []
  const byName = new Map(scope.components.map((c) => [c.name, c]))
  const archetypes = scope.archetypes ? new Set(scope.archetypes) : null
  const seen = new Set<string>()

  for (const rule of rules) {
    const at = (severity: RuleIssue['severity'], code: string, message: string) =>
      issues.push({ severity, code, message: `${rule.id || 'rule'}: ${message}`, ruleId: rule.id })

    if (!rule.id) at('error', 'rule-id-missing', 'a rule needs an id')
    else if (!ID_RE.test(rule.id))
      at(
        'warning',
        'rule-id-format',
        `"${rule.id}" is not kebab-case - write it like \`one-primary-action\``,
      )
    if (rule.id && seen.has(rule.id))
      at('error', 'rule-duplicate-id', `the id "${rule.id}" is already taken`)
    seen.add(rule.id)
    if (!rule.rationale.trim())
      at(
        'error',
        'rule-because-missing',
        'a rule needs a `because "…"` - the reason is what the agent reads',
      )

    const subject = (s: RuleSubject) => {
      if (s.kind === 'component') {
        const c = byName.get(s.name)
        if (!c) {
          at(
            'warning',
            'rule-unknown-component',
            `no component named "${s.name}" - the rule matches nothing`,
          )
          return
        }
        if (s.where) checkWhere(s.where, [c])
      } else {
        if (archetypes && !archetypes.has(s.name))
          at('warning', 'rule-unknown-archetype', `the prelude has no archetype named "${s.name}"`)
        if (s.where) {
          const realizing = scope.components.filter((c) => c.archetype === s.name)
          if (realizing.length) checkWhere(s.where, realizing)
        }
      }
    }
    const checkWhere = (where: Predicate, candidates: RuleScope['components']) => {
      const { props, nonProp } = predicateProps(where)
      if (nonProp)
        at(
          'warning',
          'rule-where-not-prop',
          'a `where` reads props only - a state or a context has no value where a component is used',
        )
      for (const prop of props) {
        const known = candidates.some((c) => (c.contract?.props ?? []).some((p) => p.name === prop))
        if (!known)
          at(
            'warning',
            'rule-where-unknown-prop',
            `"${prop}" is not a prop of ${candidates.map((c) => c.name).join(', ')}`,
          )
      }
    }

    switch (rule.kind) {
      case 'count': {
        subject(rule.subject)
        subject(rule.within)
        const { min, max } = rule
        if (min === undefined && max === undefined)
          at('error', 'rule-count-bound', 'a count needs `min`, `max` or both')
        for (const n of [min, max])
          if (n !== undefined && (!Number.isInteger(n) || n < 0))
            at('error', 'rule-count-bound', `${n} is not a count - use a whole number ≥ 0`)
        if (min !== undefined && max !== undefined && min > max)
          at(
            'error',
            'rule-count-bound',
            `min ${min} is more than max ${max}, so nothing can satisfy it`,
          )
        if (max === 0 && !min)
          at('warning', 'rule-count-zero', '`max 0` is `never` - write `never … within …`')
        break
      }
      case 'never':
        subject(rule.subject)
        subject(rule.within)
        break
      case 'only-within':
        subject(rule.subject)
        if (rule.within.length === 0)
          at('error', 'rule-only-empty', '`only` needs at least one scope')
        rule.within.forEach(subject)
        break
      case 'tokens-only':
        if (rule.types.length === 0)
          at('error', 'rule-tokens-empty', '`tokens` needs at least one token type')
        for (const t of rule.types)
          if (!TOKEN_TYPES.includes(t))
            at('warning', 'rule-unknown-token-type', `"${t}" is not a token type`)
        break
      case 'prefer': {
        const c = byName.get(rule.component)
        if (!c)
          at(
            'warning',
            'rule-unknown-component',
            `no component named "${rule.component}" - the rule matches nothing`,
          )
        if (rule.archetypes.length === 0)
          at('error', 'rule-prefer-empty', '`prefer` needs at least one archetype')
        for (const a of rule.archetypes)
          if (archetypes && !archetypes.has(a))
            at('warning', 'rule-unknown-archetype', `the prelude has no archetype named "${a}"`)
        if (c && c.archetype && !rule.archetypes.includes(c.archetype))
          at(
            'warning',
            'rule-prefer-mismatch',
            `"${c.name}" realizes ${c.archetype}, which is not one of the archetypes it is preferred for`,
          )
        break
      }
    }
  }
  return issues
}

// ─── Interface constraints ───────────────────────────────────────────────────

export interface ConstraintIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  /** The constraint or prop this is about. */
  constraintId?: string
  prop?: string
}

export function validatePropConstraints(contract: ComponentContract): ConstraintIssue[] {
  const issues: ConstraintIssue[] = []
  const props = new Map(contract.props.map((p) => [p.name, p]))

  for (const p of contract.props) {
    if (!p.requiredWhen) continue
    const { props: reads, nonProp } = predicateProps(p.requiredWhen)
    if (nonProp)
      issues.push({
        severity: 'warning',
        code: 'required-when-not-prop',
        message: `${p.name}: \`required when\` reads props only - a state or a context has no value where the component is used`,
        prop: p.name,
      })
    for (const r of reads) {
      if (r === p.name)
        issues.push({
          severity: 'warning',
          code: 'required-when-self',
          message: `${p.name}: a prop cannot be required on its own value`,
          prop: p.name,
        })
      else if (!props.has(r))
        issues.push({
          severity: 'warning',
          code: 'required-when-unknown-prop',
          message: `${p.name}: "${r}" is not a prop of this component`,
          prop: p.name,
        })
    }
    if (p.required)
      issues.push({
        severity: 'warning',
        code: 'required-when-redundant',
        message: `${p.name}: it is always required, so the condition never matters`,
        prop: p.name,
      })
  }

  for (const c of contract.constraints ?? []) {
    const at = (severity: ConstraintIssue['severity'], code: string, message: string) =>
      issues.push({
        severity,
        code,
        message: `${propConstraintSentence(c)} ${message}`,
        constraintId: c.id,
      })
    const distinct = [...new Set(c.props)]
    if (distinct.length !== c.props.length)
      at('warning', 'constraint-duplicate-member', 'A prop is listed twice.')
    if (distinct.length < 2)
      at('error', 'constraint-too-few', 'A constraint needs two or more props.')
    for (const name of distinct)
      if (!props.has(name))
        at('warning', 'constraint-unknown-prop', `"${name}" is not a prop of this component.`)
    const always = distinct.filter((n) => props.get(n)?.required)
    if (c.kind === 'one-of' && always.length)
      at(
        'warning',
        'constraint-contradiction',
        `${always.join(', ')} is always required, so the others can never be set.`,
      )
    if (c.kind === 'any-of' && always.length)
      at(
        'warning',
        'constraint-vacuous',
        `${always.join(', ')} is always required, so this is always satisfied.`,
      )
    if (c.kind === 'exclusive' && always.length > 1)
      at(
        'warning',
        'constraint-contradiction',
        `${always.join(' and ')} are both always required, so this can never hold.`,
      )
  }
  return issues
}
