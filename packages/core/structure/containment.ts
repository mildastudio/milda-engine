import { archetypesByName } from '@mildastudio/milda'
import type { ContentCategory } from '@mildastudio/milda'
import type { ComponentIR, ComponentNode, NodeKind } from './types'

export type { ContentCategory }

export type ContentAccept = ContentCategory | null

export interface ContainmentChild {
  kind: NodeKind
  componentId?: string
}

const PHRASE_STATIC: ContentCategory = { level: 'phrase', interactive: false }
const PHRASE_INTERACTIVE: ContentCategory = { level: 'phrase', interactive: true }
const REGION_STATIC: ContentCategory = { level: 'region', interactive: false }
const REGION_OPEN: ContentAccept = { level: 'region', interactive: true }

function primitiveCategory(kind: NodeKind): ContentCategory | 'structural' {
  switch (kind) {
    case 'text':
    case 'icon':
    case 'content':
    case 'output':
      return PHRASE_STATIC

    case 'container':
    case 'fragment':
      return PHRASE_STATIC
    case 'control':
    case 'input':
      return PHRASE_INTERACTIVE
    case 'item':
    case 'table':
    case 'foreign':
      return REGION_STATIC
    case 'row':
    case 'cell':
      return 'structural'
    case 'instance':
      return REGION_STATIC
  }
}

export function categoryFor(
  child: ContainmentChild,
  components: Record<string, ComponentIR>,
): ContentCategory | 'structural' {
  if (child.kind === 'instance') {
    const ref = child.componentId ? components[child.componentId] : undefined
    const produces = ref?.archetype ? archetypesByName[ref.archetype]?.produces : undefined
    return produces ?? REGION_STATIC
  }
  return primitiveCategory(child.kind)
}

function deriveAccept(produces: ContentCategory): ContentAccept {
  return produces.level === 'region' ? REGION_OPEN : PHRASE_STATIC
}

export function acceptsFor(node: ComponentNode, ownerArchetype: string | null): ContentAccept {
  if (node.origin === 'root' && ownerArchetype) {
    const produces = archetypesByName[ownerArchetype]?.produces
    if (produces) return deriveAccept(produces)
  }
  switch (node.kind) {
    case 'container':
    case 'item':
    case 'cell':
    case 'fragment':
      return REGION_OPEN
    case 'control':
    case 'text':
      return PHRASE_STATIC
    case 'table':
    case 'row':
      return null
    case 'input':
    case 'output':
    case 'icon':
    case 'content':
    case 'foreign':
    case 'instance':
      return null
  }
}

function narrower(a: ContentAccept, b: ContentAccept): ContentAccept {
  if (!a || !b) return null
  return {
    level: a.level === 'phrase' || b.level === 'phrase' ? 'phrase' : 'region',
    interactive: a.interactive && b.interactive,
  }
}

function effectiveAccept(
  node: ComponentNode,
  ownerArchetype: string | null,
  nodes?: Record<string, ComponentNode>,
): ContentAccept {
  const own = acceptsFor(node, ownerArchetype)
  if (!own) return null
  const transparent =
    node.origin !== 'root' && (node.kind === 'container' || node.kind === 'fragment')
  if (!transparent || !nodes || !node.parentId) return own
  const parent = nodes[node.parentId]
  return parent ? narrower(own, effectiveAccept(parent, ownerArchetype, nodes)) : own
}

export function canContain(
  parent: ComponentNode,
  ownerArchetype: string | null,
  child: ContainmentChild,
  components: Record<string, ComponentIR>,
  nodes?: Record<string, ComponentNode>,
): boolean {
  if (parent.kind === 'table') return child.kind === 'row'
  if (parent.kind === 'row') return child.kind === 'cell'
  if (child.kind === 'row' || child.kind === 'cell') return false

  const accept = effectiveAccept(parent, ownerArchetype, nodes)
  if (!accept) return false

  const cat = categoryFor(child, components)
  if (cat === 'structural') return false
  const levelOk = accept.level === 'region' || cat.level === 'phrase'
  const interactiveOk = accept.interactive || !cat.interactive
  return levelOk && interactiveOk
}
