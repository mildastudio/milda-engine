import { describe, expect, it } from 'vitest'
import { seedStructure } from './seed'
import { setAlertSeverity, setRating, setTabs, setOverlay, setAccordionMode } from './ops'

// Proposal 0034 — per-archetype config surfaces. Alert severity is a paint variant
// (repaints facets); the rest are plain config objects stored on the node.

describe('per-archetype config surfaces (0034)', () => {
  it('Alert severity repaints fill/border + icon ink and records the choice', () => {
    const s0 = seedStructure('Alert', 'Alert', { includeOptional: true })
    const s1 = setAlertSeverity(s0, s0.rootId, 'danger')
    const root = s1.nodes[s1.rootId]
    expect(root.severity).toBe('danger')
    expect(root.facets?.fill).toBe('danger-subtle')
    expect(root.facets?.['border.color']).toBe('danger')
    const icon = Object.values(s1.nodes).find((n) => n.part?.split('.').pop() === 'icon')
    expect(icon?.facets?.ink).toBe('danger')
  })

  it('Alert severity=info clears the field (it is the default)', () => {
    const s0 = seedStructure('Alert', 'Alert', { includeOptional: true })
    const s1 = setAlertSeverity(s0, s0.rootId, 'success')
    const s2 = setAlertSeverity(s1, s1.rootId, 'info')
    expect(s2.nodes[s2.rootId].severity).toBeUndefined()
    expect(s2.nodes[s2.rootId].facets?.fill).toBe('info-subtle')
  })

  it('config surfaces store and clear on the node', () => {
    const s0 = seedStructure('Rating', 'Rating')
    const s1 = setRating(s0, s0.rootId, { max: 10, allowHalf: true })
    expect(s1.nodes[s1.rootId].rating).toEqual({ max: 10, allowHalf: true })
    const s2 = setRating(s1, s1.rootId, null)
    expect(s2.nodes[s2.rootId].rating).toBeUndefined()

    const tabs0 = seedStructure('Tabs', 'Tabs')
    const tabs1 = setTabs(tabs0, tabs0.rootId, { orientation: 'vertical', activation: 'manual' })
    expect(tabs1.nodes[tabs1.rootId].tabs).toEqual({ orientation: 'vertical', activation: 'manual' })

    const acc0 = seedStructure('Accordion', 'Accordion')
    const acc1 = setAccordionMode(acc0, acc0.rootId, 'multiple')
    expect(acc1.nodes[acc1.rootId].accordion).toBe('multiple')

    const ov0 = seedStructure('Dialog', 'Dialog', { includeOptional: true })
    const ov1 = setOverlay(ov0, ov0.rootId, { placement: 'top', dismiss: ['escape'] })
    expect(ov1.nodes[ov1.rootId].overlay).toEqual({ placement: 'top', dismiss: ['escape'] })
  })
})
