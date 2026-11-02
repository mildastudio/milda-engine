import type {
  ComponentIR,
  ContextGroup,
  Predicate,
  PropConstraint,
  PropDef,
  PropValue,
} from '@mildastudio/core'
import {
  contextOfValue,
  predicateText,
  propConstraintSentence,
  requiredWhenSentence,
} from '@mildastudio/core'
import { contextValue } from '../_shared'

// ─── Interface constraints, as types (proposal 0052 §4.1) ──────────────────────
// A component with no constraint emits exactly what it did: this pass leaves its source alone.
// A component with one turns its props interface into a BASE plus one union per constraint, and
// the public `XProps` becomes their intersection - so `tsc` rejects the misuse before any checker
// runs, which is the one thing a usage rule can never do.
//
// Every branch is written against the base through indexed access (`XBaseProps['label']`), never
// by re-printing a type: the generator already decided how each prop types, and a second answer
// here could disagree with it. Destructuring keeps working because the base still declares every
// prop; the unions only narrow which combinations are allowed.
//
// A condition the type cannot say is SAID, not dropped: it comes back in `skipped`, the prop stays
// optional, and the checker (0053) enforces it from the contract.

export interface ConstraintTypes {
  tsx: string
  /** What could not be typed, as sentences a report can print. */
  skipped: string[]
}

// How a prop is spelled in the generated API is the emitter's decision; it hands its own rule in,
// so this module cannot name a prop differently from the interface it narrows.
type Ident = (authored: string) => string

/**
 * The finite values a prop admits, as this target spells them - or null when the set is open
 * (a string, a number), where "equals V" has no complement a type can write.
 */
function literalOf(
  prop: PropDef,
  value: PropValue | undefined,
  groups: Map<string, ContextGroup>,
): string | null {
  const t = prop.type
  if (t.kind === 'boolean') return value === true ? 'true' : value === false ? 'false' : null
  if (t.kind === 'enum')
    return typeof value === 'string' && t.values.includes(value) ? JSON.stringify(value) : null
  if (t.kind === 'context') {
    const group = groups.get(t.group)
    const id = group ? contextOfValue(group, value) : undefined
    const name = id ? group?.contexts.find((c) => c.id === id)?.name : undefined
    return name ? JSON.stringify(contextValue(name)) : null
  }
  return null
}

const finite = (p: PropDef) =>
  p.type.kind === 'boolean' || p.type.kind === 'enum' || p.type.kind === 'context'

/**
 * A condition over ONE prop, split into the values that make it hold and the ones that do not,
 * plus whether an unwritten prop (which takes its default, or nothing) makes it hold. Null when the
 * condition is not of that shape - two props, an ordering, a `contains`.
 */
interface Split {
  prop: PropDef
  holds: string[] // literals, or ['__present__'] for a presence test
  presence: boolean
  absentHolds: boolean
}

function splitCondition(
  p: Predicate,
  props: Map<string, PropDef>,
  groups: Map<string, ContextGroup>,
): Split | null {
  const leaves = p.kind === 'any' ? p.items : [p]
  let prop: PropDef | undefined
  const holds: string[] = []
  let presence: boolean | null = null
  let absentHolds = false
  for (const leaf of leaves) {
    if (leaf.kind !== 'cmp' || leaf.ref.kind !== 'prop') return null
    const target = props.get(leaf.ref.path)
    if (!target || (prop && prop !== target)) return null
    prop = target
    const def = target.default
    if (leaf.op === 'set' || leaf.op === 'unset') {
      const wantSet = leaf.op === 'set'
      if (target.type.kind === 'boolean') {
        holds.push(wantSet ? 'true' : 'false')
        if ((def === true) === wantSet) absentHolds = true
        presence = false
      } else {
        // Anything else is "written or not": the closest a type gets to truthiness.
        if (leaves.length > 1) return null
        presence = true
        holds.push(wantSet ? '__present__' : '__absent__')
        absentHolds = !wantSet
      }
      continue
    }
    if (
      (leaf.op !== 'eq' && leaf.op !== 'ne') ||
      !finite(target) ||
      (leaves.length > 1 && leaf.op === 'ne')
    )
      return null
    const lit = literalOf(target, leaf.value, groups)
    if (!lit) return null
    const defLit = def === undefined ? null : literalOf(target, def, groups)
    if (leaf.op === 'eq') {
      holds.push(lit)
      if (defLit === lit) absentHolds = true
    } else {
      // `!= V` holds for every value but V: written as the complement, so its own branch is V.
      holds.push(`!${lit}`)
      if (defLit !== lit) absentHolds = true
    }
    presence = false
  }
  if (!prop) return null
  return { prop, holds, presence: presence ?? false, absentHolds }
}

function conditionUnion(base: string, required: PropDef, split: Split, camel: Ident): string {
  const p = camel(split.prop.name)
  const x = camel(required.name)
  const key = `${base}['${p}']`
  const need = `${x}: NonNullable<${base}['${x}']>`
  const opt = (absent: boolean) => (absent ? '?' : '')
  // The two sides of the condition, as the type of `p` in each branch.
  let yes: string
  let no: string
  if (split.presence) {
    const present = `NonNullable<${key}>`
    const wantPresent = split.holds[0] === '__present__'
    yes = wantPresent ? present : 'undefined'
    no = wantPresent ? 'undefined' : present
  } else if (split.holds.length === 1 && split.holds[0]!.startsWith('!')) {
    const lit = split.holds[0]!.slice(1)
    yes = `Exclude<${key}, ${lit} | undefined>`
    no = lit
  } else {
    const lits = split.holds.join(' | ')
    yes = lits
    no = `Exclude<${key}, ${lits} | undefined>`
  }
  return [
    `  | { ${p}${opt(split.absentHolds)}: ${yes}; ${need} }`,
    `  | { ${p}${opt(!split.absentHolds)}: ${no} }`,
  ].join('\n')
}

function groupUnion(base: string, c: PropConstraint, camel: Ident): string {
  const ids = c.props.map(camel)
  const branch = (i: number) =>
    ids
      .map((id, j) => {
        if (j === i) return c.kind === 'exclusive' ? null : `${id}: NonNullable<${base}['${id}']>`
        return c.kind === 'any-of' ? null : `${id}?: never`
      })
      .filter(Boolean)
      .join('; ')
  return ids.map((_, i) => `  | { ${branch(i)} }`).join('\n')
}

export function applyInterfaceConstraints(
  tsx: string,
  component: ComponentIR,
  name: string,
  camel: Ident,
  contextGroups: ContextGroup[] = [],
): ConstraintTypes {
  const pascal = (s: string) => {
    const c = camel(s)
    return c ? c[0]!.toUpperCase() + c.slice(1) : c
  }
  const contract = component.contract
  const conditional = (contract?.props ?? []).filter((p) => p.requiredWhen && !p.required)
  const groups = contract?.constraints ?? []
  if (conditional.length === 0 && groups.length === 0) return { tsx, skipped: [] }

  const skipped: string[] = []
  const decl = new RegExp(`export interface ${name}Props(\\s+extends [^{]+)?\\s*\\{\\n`)
  const match = decl.exec(tsx)
  if (!match) {
    // This component's emitter writes its own props shape (a picker, a select); its constraints
    // are the checker's to enforce.
    for (const p of conditional) skipped.push(`${name}: ${p.name} - ${requiredWhenSentence(p)}`)
    for (const c of groups) skipped.push(`${name}: ${propConstraintSentence(c)}`)
    return { tsx, skipped }
  }
  const start = match.index
  const end = tsx.indexOf('\n}\n', start)
  if (end < 0) return { tsx, skipped }
  const body = tsx.slice(start, end)
  const declares = (id: string) => new RegExp(`\\n  ${id}\\??:`).test(body)

  const base = `${name}BaseProps`
  const props = new Map((contract?.props ?? []).map((p) => [p.name, p]))
  const groupMap = new Map(contextGroups.map((g) => [g.id, g]))
  const unions: string[] = []
  const names: string[] = []

  for (const p of conditional) {
    const split = splitCondition(p.requiredWhen!, props, groupMap)
    if (!split || !declares(camel(p.name)) || !declares(camel(split.prop.name))) {
      skipped.push(
        `${name}: \`${p.name}\` is required when ${predicateText(p.requiredWhen!)} - not expressible as a type, enforced by milda check`,
      )
      continue
    }
    const alias = `${name}${pascal(p.name)}When`
    names.push(alias)
    unions.push(
      `/** \`${p.name}\`: ${requiredWhenSentence(p)} */\ntype ${alias} =\n${conditionUnion(base, p, split, camel)}`,
    )
  }

  groups.forEach((c, i) => {
    if (c.props.length < 2 || !c.props.every((m) => props.has(m) && declares(camel(m)))) {
      skipped.push(
        `${name}: ${propConstraintSentence(c)} - names a prop this component does not declare`,
      )
      return
    }
    const alias = `${name}${pascal(c.kind)}${i + 1}`
    names.push(alias)
    unions.push(
      `/** ${propConstraintSentence(c)} */\ntype ${alias} =\n${groupUnion(base, c, camel)}`,
    )
  })

  if (names.length === 0) return { tsx, skipped }

  const head = match[0].replace(`export interface ${name}Props`, `interface ${base}`)
  const rewritten =
    tsx.slice(0, start) +
    head +
    tsx.slice(start + match[0].length, end) +
    '\n}\n\n' +
    unions.join('\n\n') +
    `\n\nexport type ${name}Props = ${[base, ...names].join(' & ')}\n` +
    tsx.slice(end + 3)
  return { tsx: rewritten, skipped }
}
