import { archetypesByName } from '@mildastudio/milda'
import type { StyleDecl } from '../facets/facets'
import type { ComponentIR, ComponentNode } from '../structure/types'

export type SurfaceKind = 'popover' | 'menu' | 'dialog' | 'sheet'

export interface DisclosurePlan {
  kind: 'disclosure'
  surfaceKind: SurfaceKind
  dismissable: boolean
  selectable: boolean
  browsable: boolean
  typeahead: boolean
  triggerId: string
  surfaceId: string

  triggerLabelId?: string
  backdropId?: string
  titleId?: string
  contentId?: string
  closeId?: string

  valueId?: string
  indicatorId?: string
  optionId?: string
  optionCheckId?: string
  optionLabelId?: string
}

export type BehaviorPlan = DisclosurePlan | null

const leaf = (n: ComponentNode): string | undefined => n.part?.split('.').pop()

function surfaceKindFrom(composes: string[]): SurfaceKind | null {
  for (const c of composes) {
    const m = /^presentation(?:\(([^)]+)\))?$/.exec(c)
    if (m) {
      const k = m[1]
      return k === 'menu' || k === 'dialog' || k === 'sheet' ? k : 'popover'
    }
  }
  return null
}

export function planBehavior(component: ComponentIR): BehaviorPlan {
  if (!component.archetype) return null
  const composes = archetypesByName[component.archetype]?.composes ?? []
  const surfaceKind = surfaceKindFrom(composes)
  if (!surfaceKind) return null

  const nodes = component.structure.nodes
  const all = Object.values(nodes)
  const byLeaf = (name: string) => all.find((n) => leaf(n) === name)
  const childByLeaf = (parent: ComponentNode | undefined, name: string) =>
    parent?.childrenIds.map((id) => nodes[id]).find((n) => n && leaf(n) === name)

  const trigger = byLeaf('trigger') ?? byLeaf('control')
  const surface = byLeaf('surface')
  if (!trigger || !surface) return null

  const option = surface.childrenIds.map((id) => nodes[id]).find((n) => n && n.kind === 'item')

  return {
    kind: 'disclosure',
    surfaceKind,
    dismissable: composes.includes('dismiss'),
    selectable: composes.some((c) => c.startsWith('selection')),
    browsable: composes.some((c) => c === 'browse' || c.startsWith('browse')),
    typeahead: composes.some((c) => c === 'typeahead' || c === 'typeahead?'),
    triggerId: trigger.id,
    surfaceId: surface.id,
    triggerLabelId: childByLeaf(trigger, 'label')?.id,
    backdropId: byLeaf('backdrop')?.id,
    titleId: childByLeaf(surface, 'title')?.id,
    contentId: childByLeaf(surface, 'content')?.id,
    closeId: childByLeaf(surface, 'close')?.id,
    valueId: childByLeaf(trigger, 'value')?.id,
    indicatorId: childByLeaf(trigger, 'indicator')?.id,
    optionId: option?.id,
    optionCheckId: option ? childByLeaf(option, 'check')?.id : undefined,
    optionLabelId: option ? childByLeaf(option, 'label')?.id : undefined,
  }
}

export type RenderTarget = 'production' | 'preview'

export function backdropDecls(kind: SurfaceKind, target: RenderTarget = 'production'): StyleDecl[] {
  if (kind === 'dialog' || kind === 'sheet') {
    return [
      { prop: 'position', value: target === 'preview' ? 'absolute' : 'fixed' },
      { prop: 'inset', value: '0' },
      { prop: 'zIndex', value: '1000' },
    ]
  }
  return []
}

export function anchorDecls(kind: SurfaceKind): StyleDecl[] {
  if (kind === 'popover' || kind === 'menu') {
    return [
      { prop: 'position', value: 'relative' },
      { prop: 'display', value: 'inline-block' },
    ]
  }
  return []
}

export function surfacePositionDecls(
  kind: SurfaceKind,
  target: RenderTarget = 'production',
): StyleDecl[] {
  const fixedOrAbsolute = target === 'preview' ? 'absolute' : 'fixed'
  if (kind === 'popover' || kind === 'menu') {
    return [
      { prop: 'position', value: 'absolute' },
      { prop: 'top', value: 'calc(100% + 4px)' },
      { prop: 'left', value: '0' },
      { prop: 'minWidth', value: '100%' },
      { prop: 'zIndex', value: '50' },
    ]
  }
  if (kind === 'dialog') {
    return [
      { prop: 'position', value: fixedOrAbsolute },
      { prop: 'top', value: '50%' },
      { prop: 'left', value: '50%' },
      { prop: 'transform', value: 'translate(-50%, -50%)' },
      { prop: 'maxWidth', value: 'calc(100% - 32px)' },
      { prop: 'maxHeight', value: '90%' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: '1001' },
    ]
  }
  if (kind === 'sheet') {
    return [
      { prop: 'position', value: fixedOrAbsolute },
      { prop: 'top', value: '0' },
      { prop: 'right', value: '0' },
      { prop: 'bottom', value: '0' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: '1001' },
    ]
  }
  return []
}
