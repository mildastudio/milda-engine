// ─── Which parts a component may not lose ─────────────────────────────────────
// A part is LOCKED - the editor will not delete, cut or re-parent it - when the component would
// stop being what its archetype says without it. That is the archetype's answer, so it is worked
// out here rather than stored: the `.milda` surface used to repeat it per part (`locked`), which
// made it one more thing a file could get wrong, and proposal 0055 took the word out. The Studio,
// the AI tools and the reader all ask this function, so a Radix Dialog's `content` is locked
// whether or not its file happened to write it out - which is what they disagreed on before.
//
// `node.locked` is still a field: the seed and the control lowering set it to what this answers
// (`generate/targets/dsl/required-parts.test.ts` holds them to it), and the reader fills it from here. Anything that
// decides what the editor may do should ask this function instead, because a stored flag cannot
// follow an archetype that changes under it.
import { anatomyIndex, loweredAnatomy } from '@mildastudio/milda'
import { materializedToggleParts } from '../behavior/lowerControl'
import type { ComponentStructure } from './types'

export function isLockedPart(
  archetype: string | null | undefined,
  structure: ComponentStructure,
  nodeId: string,
): boolean {
  const node = structure.nodes[nodeId]
  if (!node) return false
  // The root is the component.
  if (nodeId === structure.rootId) return true
  // A materialized toggle's own parts (0011): the indicator and its glyph, the track and its
  // thumb. The control lowering made them, and the toggle does not draw without them.
  if (isTogglePart(structure, nodeId)) return true
  // The control an archetype LOWERS its value into (BooleanInput's checkbox): the root's input, or
  // the toggle it materialized into. The file names it in its own words, so it reads back as the
  // author's part - but the component has no value without it.
  if (
    node.parentId === structure.rootId &&
    loweredAnatomy(archetype).length > 0 &&
    (node.kind === 'input' || materializedToggleParts(node, structure.nodes) !== undefined)
  )
    return true
  if (node.origin === 'author') return false
  const anatomy = anatomyIndex(archetype)
  if (!anatomy.size) return false
  const leaf = node.part?.split('.').pop()
  const entry = leaf ? anatomy.get(leaf) : undefined
  if (entry) return !entry.optional
  // Neither an anatomy part nor the author's: something else the seed adds on the archetype's
  // behalf.
  return node.origin === 'archetype'
}

function isTogglePart(structure: ComponentStructure, nodeId: string): boolean {
  const parent = structure.nodes[nodeId]?.parentId
  const grandparent = parent ? structure.nodes[parent]?.parentId : null
  for (const host of [parent, grandparent]) {
    const toggle = host ? structure.nodes[host] : undefined
    const parts = toggle ? materializedToggleParts(toggle, structure.nodes) : undefined
    if (!parts) continue
    const ids = [parts.indicator, parts.glyph, parts.track, parts.thumb].map((n) => n?.id)
    if (ids.includes(nodeId)) return true
  }
  return false
}
