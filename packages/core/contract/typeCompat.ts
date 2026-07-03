import type { PropType, PropValue, SharedType } from './types'

export function resolvePropType(type: PropType, sharedTypes: SharedType[] = []): PropType {
  if (type.kind === 'ref') {
    const shared = sharedTypes.find((t) => t.id === type.ref)
    if (shared) return shared.definition
  }
  return type
}

export function isTypeCompatible(
  source: PropType,
  target: PropType,
  sharedTypes: SharedType[] = [],
): boolean {
  const s = resolvePropType(source, sharedTypes)
  const t = resolvePropType(target, sharedTypes)
  if (s.kind !== t.kind) return false

  switch (t.kind) {
    case 'array':
      return isTypeCompatible(s.kind === 'array' ? s.item : s, t.item, sharedTypes)
    case 'object': {
      if (s.kind !== 'object') return false

      return t.fields.every((tf) => {
        if (!tf.required) return true
        const sf = s.fields.find((f) => f.name === tf.name)
        return sf ? isTypeCompatible(sf.type, tf.type, sharedTypes) : false
      })
    }
    case 'component': {
      if (s.kind !== 'component') return false
      if (!t.componentIds?.length) return true
      if (!s.componentIds?.length) return false
      return s.componentIds.every((id) => t.componentIds!.includes(id))
    }
    default:
      return true
  }
}

export function isTextRenderable(type: PropType, sharedTypes: SharedType[] = []): boolean {
  const t = resolvePropType(type, sharedTypes)
  return t.kind === 'string' || t.kind === 'number' || t.kind === 'enum'
}

export function isRenderable(type: PropType, sharedTypes: SharedType[] = []): boolean {
  const t = resolvePropType(type, sharedTypes)
  return isTextRenderable(t, sharedTypes) || t.kind === 'component' || t.kind === 'array'
}

export function parsePropValue(resolvedKind: PropType['kind'], raw: string): PropValue {
  if (resolvedKind === 'boolean') return raw === 'true'
  if (resolvedKind === 'number') return Number(raw)
  return raw
}
