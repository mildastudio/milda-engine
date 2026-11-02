// The STRUCTURAL half of control lowering: which nodes a materialized toggle is made of
// and how to find them. Neutral by construction - `core/structure/ops.ts` consumes exactly
// this half (one predicate, one lookup, four part names) and never touched a declaration.
//
// The geometry that used to sit below moved out in proposal 0045 phase 2: the numbers to
// `controlGeometry.ts` beside this file, the CSS to `generate/targets/web/_shared/control.ts`.
import type { ComponentNode } from '../structure/types'
import { effectiveValueType } from '../structure/types'

// The realization parts below are recognised by NAME, and a part has two spellings: the Studio
// stores the bare name (`thumb`), the `.milda` reader the path from the root (`track.thumb`),
// because the file addresses parts by path. Comparing the last segment makes both answer the
// same, which is what keeps a materialized toggle materialized through its own file.
export function partLeaf(node: ComponentNode | undefined): string | undefined {
  return node?.part?.split('.').pop()
}

// The hidden native input of the LEGACY materialized form: the contract used to live on a
// `control`-part input child of the label shell, and `migrateDocument` lifts it onto the shell
// and drops the node. It is the one boolean input that is not itself a toggle, and the
// migration asks this same question, so the two cannot disagree about what is legacy.
export function isLegacyToggleControl(node: ComponentNode): boolean {
  return node.kind === 'input' && node.part === CHECKBOX_CONTROL_PART && node.parentId != null
}

// A boolean input realizes as a styled toggle wherever it sits. This used to require `!part`,
// on the reading that only archetype anatomy has one - but the `.milda` reader gives every node
// a part, so the demo system's Switch and Checkbox came back from their own file as bare native
// checkboxes in every target. No archetype seeds a boolean input with a part (BooleanInput's
// lowered toggle has none), so the legacy control is the only thing the old guard excluded.
export function isCustomToggle(node: ComponentNode): boolean {
  return (
    node.kind === 'input' &&
    effectiveValueType(node)?.kind === 'boolean' &&
    !isLegacyToggleControl(node)
  )
}

export function customToggleVariant(node: ComponentNode): 'checkbox' | 'switch' | undefined {
  if (!isCustomToggle(node)) return undefined
  return node.control?.as ?? 'checkbox'
}

export const CHECKBOX_GLYPH_PART = 'glyph'

export function checkboxGlyphChild(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): ComponentNode | undefined {
  if (customToggleVariant(node) !== 'checkbox') return undefined
  for (const id of node.childrenIds) {
    const child = nodes[id]
    if (child?.kind === 'icon' && partLeaf(child) === CHECKBOX_GLYPH_PART) return child
  }
  return undefined
}

export const CHECKBOX_INDICATOR_PART = 'indicator'
export const SWITCH_TRACK_PART = 'track'
export const SWITCH_THUMB_PART = 'thumb'

export const CHECKBOX_CONTROL_PART = 'control'

export interface MaterializedToggleParts {
  variant: 'checkbox' | 'switch'

  indicator?: ComponentNode
  glyph?: ComponentNode

  track?: ComponentNode
  thumb?: ComponentNode
}

export function materializedToggleParts(
  node: ComponentNode,
  nodes: Record<string, ComponentNode>,
): MaterializedToggleParts | undefined {
  if (node.kind !== 'container') return undefined
  if (effectiveValueType(node)?.kind !== 'boolean') return undefined
  const child = (part: string) =>
    node.childrenIds.map((id) => nodes[id]).find((c) => partLeaf(c) === part)
  const variant: 'checkbox' | 'switch' = node.control?.as ?? 'checkbox'
  if (variant === 'switch') {
    const track = child(SWITCH_TRACK_PART)
    if (!track) return undefined
    const thumb = track.childrenIds
      .map((id) => nodes[id])
      .find((c) => partLeaf(c) === SWITCH_THUMB_PART)
    return { variant, track, thumb }
  }
  const indicator = child(CHECKBOX_INDICATOR_PART)
  if (!indicator) return undefined
  const glyph = indicator.childrenIds
    .map((id) => nodes[id])
    .find((c): c is ComponentNode => !!c && c.kind === 'icon')
  return { variant, indicator, glyph }
}
