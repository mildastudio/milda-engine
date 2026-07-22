import { propTypeLabel } from '@mildastudio/core'
import type { ContractDigest, ComponentDigest, PropDigest, EventDigest, SlotDigest } from './digest'
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

// ─── Pairing ──────────────────────────────────────────────────────────────────
// Members pair by STABLE ID first (digest v2), then by name for legacy digests
// that carry no ids. Id pairing is what makes a rename ONE change ("prop
// `opened` renamed to `isOpened`") instead of a remove+add pair.

interface Pairing<T> {
  matched: Array<{ prevName: string; nextName: string; prev: T; next: T }>
  removed: Array<{ name: string; d: T }>
  added: Array<{ name: string; d: T }>
}

function pairMembers<T extends { id?: string }>(
  prev: Record<string, T>,
  next: Record<string, T>,
): Pairing<T> {
  const out: Pairing<T> = { matched: [], removed: [], added: [] }
  const nextByName = new Map(Object.entries(next))
  const nextById = new Map<string, string>()
  for (const [name, d] of nextByName) if (d.id) nextById.set(d.id, name)

  const claimedNext = new Set<string>()
  const unmatchedPrev: Array<[string, T]> = []

  for (const [name, d] of Object.entries(prev)) {
    const byId = d.id ? nextById.get(d.id) : undefined
    if (byId !== undefined && !claimedNext.has(byId)) {
      out.matched.push({ prevName: name, nextName: byId, prev: d, next: next[byId] })
      claimedNext.add(byId)
    } else {
      unmatchedPrev.push([name, d])
    }
  }
  // Name fallback for legacy members without ids (or ids that vanished).
  for (const [name, d] of unmatchedPrev) {
    const candidate = nextByName.get(name)
    if (candidate && !claimedNext.has(name)) {
      out.matched.push({ prevName: name, nextName: name, prev: d, next: candidate })
      claimedNext.add(name)
    } else {
      out.removed.push({ name, d })
    }
  }
  for (const [name, d] of nextByName) {
    if (!claimedNext.has(name)) out.added.push({ name, d })
  }
  return out
}

// Join sentence fragments as "a", "a and b", or "a, b and c".
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// ─── Component member diffs ───────────────────────────────────────────────────

function diffComponent(name: string, prev: ComponentDigest, next: ComponentDigest): Change[] {
  const changes: Change[] = []
  const add = (severity: 'major' | 'minor', kind: ChangeKind, member: string, summary: string) =>
    changes.push({ severity, kind, component: name, member, summary })

  // Props — every aspect of one prop merges into a single human sentence.
  const props = pairMembers(prev.props, next.props)
  for (const { name: p, d } of props.added) {
    add(
      d.required ? 'major' : 'minor',
      'prop',
      p,
      `Added ${d.required ? 'required' : 'optional'} prop \`${p}\` to \`${name}\``,
    )
  }
  for (const { name: p } of props.removed) {
    add('major', 'prop', p, `Removed prop \`${p}\` from \`${name}\``)
  }
  for (const { prevName, nextName, prev: a, next: b } of props.matched) {
    const clauses: string[] = []
    let sev: 'major' | 'minor' | null = null
    const raise = (s: 'major' | 'minor') => {
      sev = sev === 'major' || s === 'major' ? 'major' : 'minor'
    }
    if (!typesEqual(a.type, b.type)) {
      clauses.push(`changed from type \`${propTypeLabel(a.type)}\` to type \`${propTypeLabel(b.type)}\``)
      raise(inputChangeSeverity(a.type, b.type))
    }
    if (a.required !== b.required) {
      clauses.push(`became ${b.required ? 'required' : 'optional'}`)
      raise(b.required ? 'major' : 'minor')
    }
    if (prevName !== nextName) {
      clauses.push(`was renamed to \`${nextName}\``)
      raise('major')
    }
    if (clauses.length > 0 && sev) {
      add(sev, 'prop', prevName, `Prop \`${prevName}\` on \`${name}\` ${joinClauses(clauses)}`)
    }
  }

  // Events.
  const events = pairMembers(prev.events, next.events)
  for (const { name: e } of events.added) add('minor', 'event', e, `Added event \`${e}\` to \`${name}\``)
  for (const { name: e } of events.removed) add('major', 'event', e, `Removed event \`${e}\` from \`${name}\``)
  for (const { prevName, nextName, prev: a, next: b } of events.matched) {
    const clauses: string[] = []
    let sev: 'major' | 'minor' | null = null
    const raise = (s: 'major' | 'minor') => {
      sev = sev === 'major' || s === 'major' ? 'major' : 'minor'
    }
    const payloadChanged = a.payload || b.payload ? !a.payload || !b.payload || !typesEqual(a.payload, b.payload) : false
    if (payloadChanged) {
      clauses.push(
        a.payload && b.payload
          ? `changed payload from \`${propTypeLabel(a.payload)}\` to \`${propTypeLabel(b.payload)}\``
          : b.payload
            ? `gained a \`${propTypeLabel(b.payload)}\` payload`
            : 'lost its payload',
      )
      raise(a.payload && b.payload ? outputChangeSeverity(a.payload, b.payload) : 'major')
    }
    if (prevName !== nextName) {
      clauses.push(`was renamed to \`${nextName}\``)
      raise('major')
    }
    if (clauses.length > 0 && sev) {
      add(sev, 'event', prevName, `Event \`${prevName}\` on \`${name}\` ${joinClauses(clauses)}`)
    }
  }

  // Slots.
  const slots = pairMembers(prev.slots, next.slots)
  for (const { name: s } of slots.added) add('minor', 'slot', s, `Added slot \`${s}\` to \`${name}\``)
  for (const { name: s } of slots.removed) add('major', 'slot', s, `Removed slot \`${s}\` from \`${name}\``)
  for (const { prevName, nextName, prev: a, next: b } of slots.matched) {
    const clauses: string[] = []
    if (a.arity !== b.arity) clauses.push(`changed arity from ${a.arity} to ${b.arity}`)
    if (a.accepts !== b.accepts) clauses.push(`changed accepted content from ${a.accepts} to ${b.accepts}`)
    if (prevName !== nextName) clauses.push(`was renamed to \`${nextName}\``)
    if (clauses.length > 0) {
      add('major', 'slot', prevName, `Slot \`${prevName}\` on \`${name}\` ${joinClauses(clauses)}`)
    }
  }

  return changes
}

export function diffDigests(prev: ContractDigest, next: ContractDigest): DiffResult {
  const changes: Change[] = []
  const components = pairMembers(prev.components, next.components)

  for (const { name } of components.added) {
    changes.push({
      severity: 'minor',
      kind: 'component',
      component: name,
      summary: `Added component \`${name}\``,
    })
  }
  for (const { name } of components.removed) {
    changes.push({
      severity: 'major',
      kind: 'component',
      component: name,
      summary: `Removed component \`${name}\``,
    })
  }
  for (const { prevName, nextName, prev: a, next: b } of components.matched) {
    if (prevName !== nextName) {
      // A renamed component changes every consumer's import — major, but ONE
      // coherent change instead of remove+add.
      changes.push({
        severity: 'major',
        kind: 'component',
        component: prevName,
        summary: `Renamed component \`${prevName}\` to \`${nextName}\``,
      })
    }
    changes.push(...diffComponent(nextName, a, b))
  }

  return { severity: rollup(changes), changes }
}

export function bumpVersion(version: string, severity: Severity): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((n) => parseInt(n, 10) || 0)
  if (severity === 'major') return `${major + 1}.0.0`
  if (severity === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
