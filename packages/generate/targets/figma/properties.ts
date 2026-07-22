// ─── Contract → Figma component properties (proposal 0010 phase 2) ───────────

import type { ComponentContract, ComponentNode } from '@mildastudio/core'

export type FigmaPropertyType = 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP'

export interface FigmaComponentProperty {
  name: string
  type: FigmaPropertyType
  defaultValue: string | boolean
  variantOptions?: string[]
  // Which node's content this TEXT property drives — informational; the scene's
  // own per-node `contentBinding` is the authoritative wiring the plugin follows.
  boundNodeName?: string
}

function contentBindsTo(node: ComponentNode, propName: string): boolean {
  const content = node.content
  if (!content || content.kind !== 'dynamic') return false
  const binds = (v: { kind: string; propName?: string }) =>
    v.kind === 'bind' && v.propName === propName
  return binds(content.default) || content.rules.some((r) => binds(r.value))
}

export function buildComponentProperties(
  contract: ComponentContract | undefined,
  nodes: Record<string, ComponentNode>,
): FigmaComponentProperty[] {
  if (!contract) return []

  return contract.props.map((prop): FigmaComponentProperty => {
    if (prop.type.kind === 'enum') {
      return {
        name: prop.name,
        type: 'VARIANT',
        defaultValue: String(prop.default ?? prop.type.values[0]),
        variantOptions: prop.type.values,
      }
    }
    if (prop.type.kind === 'boolean') {
      return { name: prop.name, type: 'BOOLEAN', defaultValue: Boolean(prop.default ?? false) }
    }
    if (prop.type.kind === 'component') {
      return { name: prop.name, type: 'INSTANCE_SWAP', defaultValue: '' }
    }
    const boundNode = Object.values(nodes).find((n) => contentBindsTo(n, prop.name))
    return {
      name: prop.name,
      type: 'TEXT',
      defaultValue: prop.default != null ? String(prop.default) : '',
      boundNodeName: boundNode?.name,
    }
  })
}
