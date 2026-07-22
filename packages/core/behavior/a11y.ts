import type { ComponentNode } from '../structure/types'

export function isNameableControl(node: ComponentNode): boolean {
  return node.kind === 'input' || node.kind === 'control'
}

export function hasAccessibleName(node: ComponentNode): boolean {
  if (node.a11y?.name || node.a11y?.labelledBy) return true
  // A default-slot control (a bare Tooltip/Popover trigger) defers its name to
  // whatever the consumer eventually wraps it around — it isn't nameless, the
  // name just isn't known yet at the archetype level.
  if (node.slot?.default) return true
  return Boolean(node.content)
}

export function controlMissingName(node: ComponentNode): boolean {
  return isNameableControl(node) && !hasAccessibleName(node)
}

function hasTextLabel(node: ComponentNode): boolean {
  // A text node names a control only if it actually carries content — an EMPTY label node (no
  // content: an icon-only button whose label was never given text) provides no accessible name,
  // so it must not silence the name-risk warning. Mirrors the node-level `hasAccessibleName`'s
  // `Boolean(node.content)`; a bound/static label counts, a content-less one doesn't.
  return node.kind === 'text' && Boolean(node.content)
}

function subtreeHasTextLabel(node: ComponentNode, nodes: Record<string, ComponentNode>): boolean {
  if (hasTextLabel(node)) return true
  for (const id of node.childrenIds ?? []) {
    const child = nodes[id]
    if (child && subtreeHasTextLabel(child, nodes)) return true
  }
  return false
}

export function isInteractiveSurface(node: ComponentNode): boolean {
  if (isNameableControl(node)) return true
  return (node.emits ?? []).some(
    (e) => e.on === 'activate' || e.on === 'change' || e.on === 'input',
  )
}

export function hasAccessibleNameInTree(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): boolean {
  if (node.a11y?.name || node.a11y?.labelledBy) return true
  if (node.slot?.default) return true
  return subtreeHasTextLabel(node, nodes)
}

export function controlNameRisk(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): boolean {
  return isInteractiveSurface(node) && !hasAccessibleNameInTree(node, nodes)
}

export function activatingLabel(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): ComponentNode | undefined {
  if (!isNameableControl(node)) return undefined
  const target = node.a11y?.labelledBy
  if (!target) return undefined
  const label = nodes[target]
  return label?.kind === 'text' ? label : undefined
}

export function labelActivatesControl(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): ComponentNode | undefined {
  if (node.kind !== 'text') return undefined
  for (const n of Object.values(nodes)) {
    if (isNameableControl(n) && n.a11y?.labelledBy === node.id) return n
  }
  return undefined
}
