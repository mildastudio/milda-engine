import { describe, expect, it } from 'vitest'
import { isLockedPart, seedStructure } from '@mildastudio/core'
import { missingRequiredParts, parseMildaDocument, preludeV0 } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── The parts an archetype requires, three readers of one answer (0055) ──────
// Which parts a component cannot do without is asked in three places: editor tooling reports a
// missing one and offers to write it (`missingRequiredParts`), this reader seeds it, and the
// editor locks it (`isLockedPart`). The surface stopped repeating the answer per part, so these
// three are now the whole of it, and they must agree.

describe('editor tooling and the reader agree on what is missing', () => {
  // The quick fix is only honest if it adds what the reader would have added: for every
  // archetype, a component that states only its root gets from the reader exactly the parts the
  // tooling calls missing - no invented part the author never asked for, and none left out.
  it.each(preludeV0.archetypes.map((a) => [a.name] as const))('%s', (name) => {
    const { document } = parseMildaDocument(
      `component X {\n  archetype ${name}\n  part X: container {}\n}\n`,
    )
    const [c] = document.components
    const missing = missingRequiredParts(c.archetype, c.anatomy).map((m) => m.path)
    const ir = documentToIr(document).components[0]
    const seeded = Object.values(ir.structure.nodes)
      .filter((n) => n.id !== ir.structure.rootId && n.part)
      .map((n) => n.part as string)
    expect(seeded.sort()).toEqual(missing.sort())
  })
})

describe('the lock is the archetype’s answer everywhere', () => {
  // The seed still stores `locked` on each node it makes. It has to be the rule's answer, or the
  // Studio and an imported file would lock different parts of the same component.
  it.each(preludeV0.archetypes.map((a) => [a.name] as const))(
    '%s: the seed stores what the rule says',
    (name) => {
      for (const includeOptional of [false, true]) {
        const s = seedStructure(name, name, { includeOptional })
        const wrong = Object.values(s.nodes)
          .filter((n) => n.locked !== isLockedPart(name, s, n.id))
          .map((n) => `${n.part ?? n.name}: stored ${n.locked}`)
        expect(wrong).toEqual([])
      }
    },
  )

  // ...and the lock survives the file it is no longer written in.
  it.each(preludeV0.archetypes.map((a) => [a.name] as const))(
    '%s: a seeded component keeps its locks through export and import',
    (name) => {
      const structure = seedStructure(name, name, { includeOptional: true })
      const text = documentToDsl({
        components: [{ name, archetype: name, structure }],
      })
      expect(text).not.toMatch(/\blocked\b/)
      const back = documentToIr(parseMildaDocument(text).document).components[0]
      const locks = (nodes: { part?: string; name: string; locked: boolean }[]) =>
        Object.fromEntries(nodes.map((n) => [(n.part ?? n.name).split('.').pop(), n.locked]))
      expect(locks(Object.values(back.structure.nodes))).toEqual(
        locks(Object.values(structure.nodes).map((n) => ({ ...n, part: n.part ?? undefined }))),
      )
    },
  )
})
