import type { ComponentNode, ComponentStructure } from './types'

export interface Subtree {
  nodes: Record<string, ComponentNode>
  rootId: string
}

export function extractSubtree(structure: ComponentStructure, nodeId: string): Subtree | null {
  if (!structure.nodes[nodeId]) return null
  const nodes: Record<string, ComponentNode> = {}
  const walk = (id: string) => {
    const n = structure.nodes[id]
    if (!n) return
    nodes[id] = n
    n.childrenIds.forEach(walk)
  }
  walk(nodeId)
  return { nodes, rootId: nodeId }
}

export function cloneForPaste(subtree: Subtree): Subtree {
  const idMap = new Map<string, string>()
  for (const oldId of Object.keys(subtree.nodes)) idMap.set(oldId, crypto.randomUUID())

  const nodes: Record<string, ComponentNode> = {}
  for (const oldId of Object.keys(subtree.nodes)) {
    const n = subtree.nodes[oldId]
    const id = idMap.get(oldId)!
    nodes[id] = {
      ...n,
      id,
      part: undefined,
      origin: 'author',
      locked: false,

      states: n.states?.map((r) => ({ ...r, id: crypto.randomUUID() })),
      behaviors: n.behaviors?.map((b) => ({ ...b, id: crypto.randomUUID() })),
      parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId)! : null,
      childrenIds: n.childrenIds.map((c) => idMap.get(c)).filter((c): c is string => Boolean(c)),
    }
  }
  return { nodes, rootId: idMap.get(subtree.rootId)! }
}
