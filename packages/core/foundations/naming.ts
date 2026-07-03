import type { Layer, Token, TokenGroup } from './document'

export type NamingSegment = 'prefix' | 'type' | 'groups' | 'name' | 'suffix'

export type NamingCase = 'kebab' | 'snake' | 'camel' | 'pascal' | 'constant'

export interface NamingConvention {
  segments: NamingSegment[]
  prefix: string
  suffix: string
  case: NamingCase
}

export const DEFAULT_NAMING: NamingConvention = {
  segments: ['groups', 'name'],
  prefix: '',
  suffix: '',
  case: 'kebab',
}

function slugWords(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean)
}

export function groupPath(layer: Layer, groupId: string | null | undefined): TokenGroup[] {
  const out: TokenGroup[] = []
  let cur = groupId ?? null
  const guard = new Set<string>()
  while (cur && !guard.has(cur)) {
    guard.add(cur)
    const g = layer.groups.find((g) => g.id === cur)
    if (!g) break
    out.unshift(g)
    cur = g.parent
  }
  return out
}

export interface NameParts {
  type: string
  groups: string[]
  name: string
}

function composeWords(conv: NamingConvention, parts: NameParts): string[] {
  const out: string[] = []
  for (const seg of conv.segments) {
    if (seg === 'prefix') out.push(...slugWords(conv.prefix))
    else if (seg === 'suffix') out.push(...slugWords(conv.suffix))
    else if (seg === 'type') out.push(...slugWords(parts.type))
    else if (seg === 'groups') for (const g of parts.groups) out.push(...slugWords(g))
    else if (seg === 'name') out.push(...slugWords(parts.name))
  }
  return out
}

export function composeName(conv: NamingConvention, parts: NameParts): string {
  return applyCase(composeWords(conv, parts), conv.case)
}

function cap(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

export function applyCase(words: string[], style: NamingCase): string {
  if (words.length === 0) return ''
  switch (style) {
    case 'kebab':
      return words.join('-')
    case 'snake':
      return words.join('_')
    case 'constant':
      return words.join('_').toUpperCase()
    case 'camel':
      return words[0] + words.slice(1).map(cap).join('')
    case 'pascal':
      return words.map(cap).join('')
  }
}

export function tokenCanonicalName(
  layer: Layer,
  token: Token,
  conv: NamingConvention = DEFAULT_NAMING,
): string {
  return composeName(conv, {
    type: token.type,
    groups: groupPath(layer, token.group).map((g) => g.name),
    name: token.name,
  })
}
