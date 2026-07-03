import type { PropType } from '@mildastudio/core'

export function canonicalType(t: PropType): string {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'any':
      return t.kind === 'number' && (t.min !== undefined || t.max !== undefined)
        ? `number(${t.min ?? '-inf'}..${t.max ?? 'inf'})`
        : t.kind
    case 'enum':
      return `enum(${[...t.values].sort().join('|')})`
    case 'literal':
      return `literal(${typeof t.value}:${String(t.value)})`
    case 'union':
      return `union(${t.members.map(canonicalType).sort().join('|')})`
    case 'intersection':
      return `intersection(${t.members.map(canonicalType).sort().join('&')})`
    case 'array':
      return `array(${canonicalType(t.item)})`
    case 'object':
      return `object(${[...t.fields]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => `${f.name}${f.required ? '!' : '?'}:${canonicalType(f.type)}`)
        .join(',')})`
    case 'record':
      return `record(${canonicalType(t.key)},${canonicalType(t.value)})`
    case 'function':
      return `fn(${t.params.map((p) => canonicalType(p.type)).join(',')})=>${canonicalType(t.returnType)}`
    case 'component':
      return `component(${(t.componentIds ?? []).slice().sort().join('|') || '*'})`
    case 'ref':
      return `ref(${t.ref})`
    case 'typeParam':
      return `typeParam(${t.name})`
    default:
      return 'unknown'
  }
}

export function typesEqual(a: PropType, b: PropType): boolean {
  return canonicalType(a) === canonicalType(b)
}

function enumValues(t: PropType): string[] | null {
  if (t.kind === 'enum') return t.values

  if (t.kind === 'union' && t.members.every((m) => m.kind === 'literal')) {
    return t.members.map((m) => String((m as Extract<PropType, { kind: 'literal' }>).value))
  }
  return null
}

function isSubset(a: string[], b: string[]): boolean {
  const set = new Set(b)
  return a.every((v) => set.has(v))
}

function numRange(t: PropType): { min: number; max: number } | null {
  if (t.kind !== 'number') return null
  return { min: t.min ?? -Infinity, max: t.max ?? Infinity }
}

function widens(prev: PropType, next: PropType): boolean {
  const ep = enumValues(prev)
  const en = enumValues(next)
  if (ep && en) return isSubset(ep, en)
  const rp = numRange(prev)
  const rn = numRange(next)
  if (rp && rn) return rn.min <= rp.min && rn.max >= rp.max
  return false
}

export function inputChangeSeverity(prev: PropType, next: PropType): 'minor' | 'major' {
  return widens(prev, next) ? 'minor' : 'major'
}

export function outputChangeSeverity(prev: PropType, next: PropType): 'minor' | 'major' {
  return widens(next, prev) ? 'minor' : 'major'
}
