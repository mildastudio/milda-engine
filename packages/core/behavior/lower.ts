import type { ComponentNode } from '../structure/types'
import type { NodeBehavior, OverlayPlacement } from './free'

const composesAtom = (node: ComponentNode, atom: string): boolean =>
  (node.composes ?? []).some((c) => c.atom === atom)

export function presentationMode(node: ComponentNode): string | undefined {
  return (node.composes ?? []).find((c) => c.atom === 'presentation')?.mode
}

const DEFAULT_PLACEMENT: Record<string, OverlayPlacement> = {
  popover: 'bottom-start',
  menu: 'bottom-start',
}

export function loweredBehaviors(node: ComponentNode): NodeBehavior[] {
  const mode = presentationMode(node)
  if (!mode) return []

  const anchored = mode === 'popover' || mode === 'menu'
  const modal = mode === 'dialog' || mode === 'sheet'
  const dismiss = composesAtom(node, 'dismiss')
  const out: NodeBehavior[] = []

  if (anchored) {
    out.push({
      id: 'lowered:overlayManagement',
      kind: 'overlayManagement',
      anchorNodeId: null,
      placement: DEFAULT_PLACEMENT[mode] ?? 'bottom-start',
      offsetPx: 6,
      flip: true,
      sameWidth: false,
    })
  }
  if (modal) {
    out.push({ id: 'lowered:scrollLock', kind: 'scrollLock', target: 'body' })
    out.push({
      id: 'lowered:focusTrap',
      kind: 'focusTrap',
      initialFocusNodeId: null,
      returnFocusOnClose: true,
      allowEscapeKey: dismiss,
    })
  }
  if (dismiss) {
    out.push({
      id: 'lowered:clickaway',
      kind: 'clickaway',
      eventType: 'pointerdown',
      excludeNodeIds: [],
    })
  }
  return out
}

export function effectiveBehaviors(node: ComponentNode): NodeBehavior[] {
  const authored = node.behaviors ?? []
  const authoredKinds = new Set(authored.map((b) => b.kind))
  const lowered = loweredBehaviors(node).filter((b) => !authoredKinds.has(b.kind))
  return [...authored, ...lowered]
}

export function isOverlaySurface(node: ComponentNode): boolean {
  const mode = presentationMode(node)
  return mode === 'popover' || mode === 'menu' || mode === 'dialog' || mode === 'sheet'
}
