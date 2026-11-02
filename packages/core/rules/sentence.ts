import type { PropConstraint, PropDef } from '../contract/types'
import type { Predicate } from '../structure/predicate'
import type { RuleSubject, UsageRule } from './types'

// ─── Saying a rule ───────────────────────────────────────────────────────────
// One rendering of a rule as a sentence, shared by the Studio, the release artifacts and the
// checker's messages (proposal 0052 §9). An agent told one thing by AGENTS.md and checked against
// another by `milda check` is the drift this exists to prevent, so nobody else words a rule.
//
// `name` lets a caller that knows the target print the identifier a consumer types
// (`ToggleButton`) instead of the authored name ("Toggle button"); core only knows the latter.

export interface SentenceOptions {
  /** How a component name is printed. Default: the authored name in backticks. */
  name?: (authored: string) => string
}

const tick = (s: string) => `\`${s}\``

const OPS: Record<string, string> = {
  eq: '=',
  ne: '≠',
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  contains: 'contains',
}

/** A prop-leaf predicate as prose: `variant` = Primary, `loading`, not `disabled`. */
export function predicateText(p: Predicate): string {
  switch (p.kind) {
    case 'all':
      return p.items.length ? p.items.map(nested).join(' and ') : 'always'
    case 'any':
      return p.items.length ? p.items.map(nested).join(' or ') : 'never'
    case 'not':
      return `not (${predicateText(p.item)})`
    case 'cmp': {
      const ref = p.ref
      const name =
        ref.kind === 'prop'
          ? tick(ref.path)
          : ref.kind === 'state'
            ? `state ${ref.state}`
            : ref.kind === 'context'
              ? `context ${ref.group}`
              : `${ref.nodeId} ${ref.state}`
      if (p.op === 'set') return name
      if (p.op === 'unset') return `not ${name}`
      return `${name} ${OPS[p.op] ?? p.op} ${String(p.value)}`
    }
  }
}

// A compound inside a compound gets parentheses, so `a and (b or c)` does not read as `(a and b) or c`.
const nested = (p: Predicate) =>
  (p.kind === 'all' || p.kind === 'any') && p.items.length > 1
    ? `(${predicateText(p)})`
    : predicateText(p)

function subjectText(s: RuleSubject, opts: SentenceOptions, article = ''): string {
  const name = s.kind === 'component' ? (opts.name ?? tick)(s.name) : `any ${tick(s.name)}`
  const lead = s.kind === 'component' && article ? `${article} ` : ''
  return `${lead}${name}${s.where ? ` where ${predicateText(s.where)}` : ''}`
}

// `fontSize` reads as "font size" in a sentence; the identifier is for the data, not the reader.
const typeWords = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()

function list(items: string[], last = 'and'): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`
}

export function usageRuleSentence(rule: UsageRule, opts: SentenceOptions = {}): string {
  switch (rule.kind) {
    case 'count': {
      const bound =
        rule.min !== undefined && rule.max !== undefined
          ? rule.min === rule.max
            ? `Exactly ${rule.min}`
            : `Between ${rule.min} and ${rule.max}`
          : rule.max !== undefined
            ? `At most ${rule.max}`
            : `At least ${rule.min ?? 0}`
      return `${bound} ${subjectText(rule.subject, opts)} within ${subjectText(rule.within, opts, 'each')}.`
    }
    case 'never':
      return `Never put ${subjectText(rule.subject, opts, 'a')} within ${subjectText(rule.within, opts, 'a')}.`
    case 'only-within':
      return `Use ${subjectText(rule.subject, opts)} only within ${list(
        rule.within.map((w) => subjectText(w, opts)),
        'or',
      )}.`
    case 'tokens-only':
      return `Every ${list(rule.types.map(typeWords))} value comes from a token.`
    case 'prefer':
      return `Anything that is ${list(
        rule.archetypes.map((a) => `a ${tick(a)}`),
        'or',
      )} uses ${(opts.name ?? tick)(rule.component)}.`
  }
}

export function propConstraintSentence(c: PropConstraint): string {
  const members = list(c.props.map(tick), c.kind === 'one-of' || c.kind === 'any-of' ? 'or' : 'and')
  switch (c.kind) {
    case 'one-of':
      return `Set exactly one of ${members}.`
    case 'any-of':
      return `Set at least one of ${members}.`
    case 'exclusive':
      return `Set at most one of ${members}.`
  }
}

/** "Required when `loading`." - the prose a props table and a hover show for `requiredWhen`. */
export function requiredWhenSentence(p: Pick<PropDef, 'name' | 'requiredWhen'>): string {
  return p.requiredWhen ? `Required when ${predicateText(p.requiredWhen)}.` : ''
}
