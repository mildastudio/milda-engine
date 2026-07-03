import { propTypeLabel } from '@mildastudio/core'
import type { ContractDigest, ComponentDigest } from './digest'
import { typesEqual, inputChangeSeverity, outputChangeSeverity } from './variance'

export type Severity = 'major' | 'minor' | 'patch'

export type ChangeKind = 'component' | 'prop' | 'event' | 'slot'

export interface Change {
  severity: 'major' | 'minor'
  kind: ChangeKind

  component: string

  member?: string

  summary: string
}

export interface DiffResult {
  severity: Severity
  changes: Change[]
}

const RANK: Record<Severity, number> = { patch: 0, minor: 1, major: 2 }

function rollup(changes: Change[]): Severity {
  let sev: Severity = 'patch'
  for (const c of changes) if (RANK[c.severity] > RANK[sev]) sev = c.severity
  return sev
}

function diffComponent(name: string, prev: ComponentDigest, next: ComponentDigest): Change[] {
  const changes: Change[] = []
  const add = (severity: 'major' | 'minor', kind: ChangeKind, member: string, summary: string) =>
    changes.push({ severity, kind, component: name, member, summary })

  const prevProps = new Set(Object.keys(prev.props))
  const nextProps = new Set(Object.keys(next.props))
  for (const p of nextProps) {
    if (!prevProps.has(p)) {
      const required = next.props[p].required

      add(
        required ? 'major' : 'minor',
        'prop',
        p,
        `${name}: added ${required ? 'required' : 'optional'} prop \`${p}\``,
      )
    }
  }
  for (const p of prevProps) {
    if (!nextProps.has(p)) {
      add('major', 'prop', p, `${name}: removed prop \`${p}\``)
      continue
    }
    const a = prev.props[p]
    const b = next.props[p]
    if (a.required !== b.required) {
      add(
        b.required ? 'major' : 'minor',
        'prop',
        p,
        `${name}: prop \`${p}\` became ${b.required ? 'required' : 'optional'}`,
      )
    }
    if (!typesEqual(a.type, b.type)) {
      const sev = inputChangeSeverity(a.type, b.type)
      add(
        sev,
        'prop',
        p,
        `${name}: prop \`${p}\` type ${propTypeLabel(a.type)} → ${propTypeLabel(b.type)}`,
      )
    }
  }

  const prevEvents = new Set(Object.keys(prev.events))
  const nextEvents = new Set(Object.keys(next.events))
  for (const e of nextEvents) {
    if (!prevEvents.has(e)) add('minor', 'event', e, `${name}: added event \`${e}\``)
  }
  for (const e of prevEvents) {
    if (!nextEvents.has(e)) {
      add('major', 'event', e, `${name}: removed event \`${e}\``)
      continue
    }
    const a = prev.events[e].payload
    const b = next.events[e].payload
    if (!a && !b) continue
    if (!a || !b || !typesEqual(a, b)) {
      const sev = a && b ? outputChangeSeverity(a, b) : 'major'
      add(sev, 'event', e, `${name}: event \`${e}\` payload changed`)
    }
  }

  const prevSlots = new Set(Object.keys(prev.slots))
  const nextSlots = new Set(Object.keys(next.slots))
  for (const s of nextSlots) {
    if (!prevSlots.has(s)) add('minor', 'slot', s, `${name}: added slot \`${s}\``)
  }
  for (const s of prevSlots) {
    if (!nextSlots.has(s)) {
      add('major', 'slot', s, `${name}: removed slot \`${s}\``)
      continue
    }
    const a = prev.slots[s]
    const b = next.slots[s]
    if (a.arity !== b.arity)
      add('major', 'slot', s, `${name}: slot \`${s}\` arity ${a.arity} → ${b.arity}`)
    if (a.accepts !== b.accepts)
      add('major', 'slot', s, `${name}: slot \`${s}\` accepts ${a.accepts} → ${b.accepts}`)
  }

  return changes
}

export function diffDigests(prev: ContractDigest, next: ContractDigest): DiffResult {
  const changes: Change[] = []
  const prevNames = new Set(Object.keys(prev.components))
  const nextNames = new Set(Object.keys(next.components))

  for (const name of nextNames) {
    if (!prevNames.has(name)) {
      changes.push({
        severity: 'minor',
        kind: 'component',
        component: name,
        summary: `Added component \`${name}\``,
      })
    }
  }
  for (const name of prevNames) {
    if (!nextNames.has(name)) {
      changes.push({
        severity: 'major',
        kind: 'component',
        component: name,
        summary: `Removed component \`${name}\``,
      })
      continue
    }
    changes.push(...diffComponent(name, prev.components[name], next.components[name]))
  }

  return { severity: rollup(changes), changes }
}

export function bumpVersion(version: string, severity: Severity): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((n) => parseInt(n, 10) || 0)
  if (severity === 'major') return `${major + 1}.0.0`
  if (severity === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
