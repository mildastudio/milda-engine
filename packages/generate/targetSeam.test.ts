import { describe, expect, it } from 'vitest'
import { emptyFoundations, seedArchetypeContract, seedStructure } from '@mildastudio/core'
import type { ComponentIR } from '@mildastudio/core'
import { TARGETS, getComponentTarget, getTarget, type TargetDocument } from './index'

// ─── The multi-target seam, exercised (proposal 0045 phase 4) ────────────────
// The point of the whole 0045 thread was that `Target` had one implementation, so nothing
// proved the split worked - an interface with a single implementer is a description of
// that implementer. These tests drive React and Figma through the SAME calls, which is
// the only way that claim can be checked.
//
// They deliberately assert almost nothing about the CONTENT of either output. Each target
// has its own tests for that. What is asserted here is that the seam is real: both answer
// the same questions, neither needs a special case, and the two things Figma needed that
// React did not (library granularity, a `skipped` channel) are part of the contract rather
// than a detour around it.

function ir(archetype: string): ComponentIR {
  const structure = seedStructure(archetype, archetype)
  if (!structure) throw new Error(`no seed structure for ${archetype}`)
  return {
    name: archetype,
    archetype,
    structure,
    contract: seedArchetypeContract(structure, archetype),
  } as ComponentIR
}

const doc = (): TargetDocument => ({
  componentsById: { 'c.Button': ir('Button'), 'c.Badge': ir('Badge') },
  foundations: emptyFoundations(),
})

describe('every registered target satisfies the seam', () => {
  it('registers more than one target - the premise of the interface', () => {
    expect(TARGETS.length).toBeGreaterThan(1)
    expect(TARGETS).toContain('react')
    expect(TARGETS).toContain('figma')
  })

  it.each(TARGETS)('%s emits files and reports what it skipped', (name) => {
    const out = getTarget(name).emitDocument(doc())
    expect(out.files.length, `${name} emitted nothing`).toBeGreaterThan(0)
    // Every file is complete enough to write to disk. A target returning a path with no
    // code would pass a "length > 0" check and produce an empty package.
    for (const file of out.files) {
      expect(file.path, name).toBeTruthy()
      expect(file.language, name).toBeTruthy()
      expect(file.code.length, `${name}: ${file.path} is empty`).toBeGreaterThan(0)
    }
    expect(Array.isArray(out.skipped), `${name} must report a skipped list`).toBe(true)
  })

  it.each(TARGETS)('%s emits distinct paths, so nothing overwrites anything', (name) => {
    const paths = getTarget(name)
      .emitDocument(doc())
      .files.map((f) => f.path)
    expect(paths).toEqual([...new Set(paths)])
  })

  it.each(TARGETS)('%s declares a granularity that matches what it can do', (name) => {
    const target = getTarget(name)
    if (target.granularity === 'component') {
      expect(getComponentTarget(name).emit(ir('Button')).length).toBeGreaterThan(0)
    } else {
      // Asking a library target for one component is a caller error, and it says so by
      // name rather than returning something plausible and wrong.
      expect(() => getComponentTarget(name)).toThrow(new RegExp(name))
    }
  })
})

describe('what fitting a second target to the seam revealed', () => {
  it('the web target claims to drop nothing, and that claim is checkable', () => {
    expect(getTarget('react').emitDocument(doc()).skipped).toEqual([])
  })

  it('the Figma target reports its losses instead of emitting silently', () => {
    // Not asserting WHICH losses - that is the Figma target's own business and its own
    // tests. What matters here is that the information survives the seam at all; before
    // phase 4 it existed only on the direct call path.
    const out = getTarget('figma').emitDocument(doc())
    expect(out.files.some((f) => f.path.endsWith('.json'))).toBe(true)
    expect(Array.isArray(out.skipped)).toBe(true)
  })

  it('a library target refuses components it cannot resolve, rather than drawing them blank', () => {
    const out = getTarget('figma').emitDocument({ componentsById: { 'c.Button': ir('Button') } })
    expect(out.skipped.join(' ')).toMatch(/foundations/)
  })

  it('the component target emits its shared modules once, not once per component', () => {
    const files = getTarget('react').emitDocument(doc()).files
    expect(files.filter((f) => f.path === 'theme.css')).toHaveLength(1)
  })

  it('an empty document is a valid document', () => {
    for (const name of TARGETS) {
      expect(() => getTarget(name).emitDocument({ componentsById: {} }), name).not.toThrow()
    }
  })
})
