import type { TokenType } from '../foundations/document'
import type { Predicate } from '../structure/predicate'

// ─── Usage rules ─────────────────────────────────────────────────────────────
// How the system is meant to be PUT TOGETHER (proposal 0052 §5): count, containment, token use
// and the preferred component for an intent. Every one of them is decided over the usage tree -
// what sits where, how many - which is what separates a rule from an interface constraint
// (`requiredWhen`, `PropConstraint`): those are decided from one instance and live in the contract.
//
// Target-neutral by construction (invariant 2). A subject is a component or a prelude archetype,
// never an element; a token rule names token TYPES, never style properties. Mapping either onto a
// platform is the checker's job (proposal 0053), which is why this file is the interface it
// imports rather than something it re-declares.

export type RuleSeverity = 'error' | 'warning'

export const RULE_SEVERITIES: readonly RuleSeverity[] = ['error', 'warning']

/**
 * What a rule talks about. `component` matches instances of the library component with that
 * authored name; `archetype` matches anything that realizes the prelude archetype - a library
 * component whose archetype it is, or whatever the checker knows realizes it on its platform.
 * `where` narrows by the instance's props (proposal 0032, prop leaves only); an unwritten prop
 * takes its declared default.
 */
export interface RuleSubject {
  kind: 'component' | 'archetype'
  name: string
  where?: Predicate
}

interface UsageRuleBase {
  /** kebab-case, unique in the system, stable: what a finding reports and a suppression names. */
  id: string
  severity: RuleSeverity
  /** Why. Read verbatim by the agent and the human, never paraphrased. */
  rationale: string
}

export type UsageRuleBody =
  // Each subject instance counts for its NEAREST enclosing `within` instance only.
  | { kind: 'count'; subject: RuleSubject; within: RuleSubject; min?: number; max?: number }
  | { kind: 'never'; subject: RuleSubject; within: RuleSubject }
  | { kind: 'only-within'; subject: RuleSubject; within: RuleSubject[] }
  | { kind: 'tokens-only'; types: TokenType[] }
  | { kind: 'prefer'; component: string; archetypes: string[] }

export type UsageRule = UsageRuleBase & UsageRuleBody

export type UsageRuleKind = UsageRule['kind']

export const USAGE_RULE_KINDS: readonly UsageRuleKind[] = [
  'count',
  'never',
  'only-within',
  'tokens-only',
  'prefer',
]

/** Every subject a rule mentions, in reading order - what a rename has to rewrite. */
export function ruleSubjects(rule: UsageRule): RuleSubject[] {
  switch (rule.kind) {
    case 'count':
    case 'never':
      return [rule.subject, rule.within]
    case 'only-within':
      return [rule.subject, ...rule.within]
    case 'tokens-only':
    case 'prefer':
      return []
  }
}

/** The authored component names a rule refers to, archetype subjects excluded. */
export function ruleComponentNames(rule: UsageRule): string[] {
  const names = ruleSubjects(rule)
    .filter((s) => s.kind === 'component')
    .map((s) => s.name)
  if (rule.kind === 'prefer') names.push(rule.component)
  return [...new Set(names)]
}
