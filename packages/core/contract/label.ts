import type { PropType, SharedType } from './types'

export function propTypeLabel(type: PropType, sharedTypes?: SharedType[]): string {
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
      return type.members.map((m) => propTypeLabel(m, sharedTypes)).join(' | ')
    case 'intersection':
      return type.members.map((m) => propTypeLabel(m, sharedTypes)).join(' & ')
    case 'array':
      return `${propTypeLabel(type.item, sharedTypes)}[]`
    case 'object':
      return '{ … }'
    case 'component':
      return 'Component'
    case 'typeParam':
      return type.name
    case 'literal':
      return typeof type.value === 'string' ? `"${type.value}"` : String(type.value)
    case 'record':
      return `Record<${propTypeLabel(type.key, sharedTypes)}, ${propTypeLabel(type.value, sharedTypes)}>`
    case 'function': {
      const params = type.params
        .map((p) => `${p.name}: ${propTypeLabel(p.type, sharedTypes)}`)
        .join(', ')
      return `(${params}) => ${propTypeLabel(type.returnType, sharedTypes)}`
    }
    case 'ref':
      return sharedTypes?.find((t) => t.id === type.ref)?.name ?? 'ref'
    default:
      return 'unknown'
  }
}
