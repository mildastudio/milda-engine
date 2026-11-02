import type { ContextGroup } from '../foundations/document'
import type { PropType, SharedType } from './types'

export function propTypeLabel(
  type: PropType,
  sharedTypes?: SharedType[],
  contextGroups?: ContextGroup[],
): string {
  switch (type.kind) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'any':
      return 'any'
    case 'enum':
      return type.values.map((v) => `"${v}"`).join(' | ') || 'enum'
    case 'union':
      return type.members.map((m) => propTypeLabel(m, sharedTypes, contextGroups)).join(' | ')
    case 'intersection':
      return type.members.map((m) => propTypeLabel(m, sharedTypes, contextGroups)).join(' & ')
    case 'array':
      return `${propTypeLabel(type.item, sharedTypes, contextGroups)}[]`
    case 'object':
      return '{ … }'
    case 'component':
      return 'Component'
    case 'typeParam':
      return type.name
    case 'literal':
      return typeof type.value === 'string' ? `"${type.value}"` : String(type.value)
    case 'record':
      return `Record<${propTypeLabel(type.key, sharedTypes, contextGroups)}, ${propTypeLabel(type.value, sharedTypes, contextGroups)}>`
    case 'function': {
      const params = type.params
        .map((p) => `${p.name}: ${propTypeLabel(p.type, sharedTypes, contextGroups)}`)
        .join(', ')
      return `(${params}) => ${propTypeLabel(type.returnType, sharedTypes, contextGroups)}`
    }
    case 'ref':
      return sharedTypes?.find((t) => t.id === type.ref)?.name ?? 'ref'
    // A context-typed prop (0051) reads as its group's name - `Variant` - which is what its author
    // wrote; it fell through to `unknown`, so every variant prop in a DESIGN.md said nothing.
    case 'context':
      return (
        contextGroups?.find((g) => g.id === type.group)?.name ?? type.group.replace(/^cg\./, '')
      )
    default:
      return 'unknown'
  }
}
