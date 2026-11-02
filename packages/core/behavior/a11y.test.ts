import { describe, expect, it } from 'vitest'
import { seedArchetypeContract, seedStructure } from '../structure/seed'
import { controlNameRisk } from './a11y'

// The seeded Button as the editor creates it: structure PLUS the archetype contract, which
// is what puts the `activate` emit on the root (making it an interactive surface at all).
function seedButton() {
  const structure = seedStructure('Button', 'Button')
  seedArchetypeContract(structure, 'Button')
  const { rootId, nodes } = structure
  const label = Object.values(nodes).find((n) => n.part === 'label')!
  return { root: nodes[rootId], label, nodes }
}

// A freshly seeded Button's label part is a DEFAULT CONTENT SLOT with no content of its
// own - the consumer passes the text. That is a deferred name, not a missing one, so the
// name-risk warning must stay silent (it used to fire on every new Button).
describe('controlNameRisk', () => {
  it('is silent for a seeded Button whose label is a content slot', () => {
    const { root, label, nodes } = seedButton()
    expect(root.emits?.some((e) => e.on === 'activate')).toBe(true)
    expect(label.slot?.default).toBe(true)
    expect(label.content).toBeUndefined()
    expect(controlNameRisk(root, nodes)).toBe(false)
  })

  it('fires when the label neither exposes a slot nor carries content', () => {
    const { root, label, nodes } = seedButton()
    delete label.slot
    expect(controlNameRisk(root, nodes)).toBe(true)
  })

  it('is silent for a label with static content and no slot', () => {
    const { root, label, nodes } = seedButton()
    delete label.slot
    label.content = { kind: 'static', text: 'Save' }
    expect(controlNameRisk(root, nodes)).toBe(false)
  })
})
