import type { ComponentIR, ComponentNode, NodeSlot } from './types'

export interface SlotSurface {
  nodeId: string

  name: string
  slot: NodeSlot
  part?: string
}

function walk(component: ComponentIR, id: string, out: SlotSurface[]): void {
  const node: ComponentNode | undefined = component.structure.nodes[id]
  if (!node) return
  if (node.slot) {
    out.push({
      nodeId: node.id,
      name: node.slot.exposeAs || node.name,
      slot: node.slot,
      part: node.part,
    })
  }
  for (const childId of node.childrenIds) walk(component, childId, out)
}

export function collectSlots(component: ComponentIR): SlotSurface[] {
  const out: SlotSurface[] = []
  walk(component, component.structure.rootId, out)
  return out.filter((s) => !s.slot.default)
}

export function defaultSlot(component: ComponentIR): SlotSurface | undefined {
  const out: SlotSurface[] = []
  walk(component, component.structure.rootId, out)
  return out.find((s) => s.slot.default)
}

export function isPropsProjectable(component: ComponentIR): boolean {
  return collectSlots(component).every(
    (s) => s.slot.arity !== 'many' && s.slot.accepts.kind === 'content',
  )
}
