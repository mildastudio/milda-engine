import type { ComponentIR } from './types'

export function instanceRefs(component: ComponentIR): string[] {
  const ids = new Set<string>()
  for (const node of Object.values(component.structure.nodes)) {
    if (node.kind === 'instance' && node.instance?.componentId) {
      ids.add(node.instance.componentId)
    }
  }
  return [...ids]
}

export function wouldCreateInstanceCycle(
  components: Record<string, ComponentIR>,
  hostId: string,
  targetId: string,
): boolean {
  if (targetId === hostId) return true

  const seen = new Set<string>([targetId])
  const queue = [targetId]
  while (queue.length) {
    const current = queue.shift()!
    const component = components[current]
    if (!component) continue
    for (const ref of instanceRefs(component)) {
      if (ref === hostId) return true
      if (!seen.has(ref)) {
        seen.add(ref)
        queue.push(ref)
      }
    }
  }
  return false
}
