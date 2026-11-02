import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Invariant 2, as a test rather than as prose ─────────────────────────────
// Core may own a design system's NUMBERS and the relationships between them; it may not own a
// unit or a property name. Proposal 0045 evicted the web lowering, and two things survived it -
// `makeFacetResolver` and `makeSizeResolver`, which ran a token through `lengthToCss` and so
// answered "8px". They were invisible because their only caller was the Studio's preview, which
// wanted CSS and had no reason to complain.
//
// They now live in `generate/targets/web/_shared/resolvers.ts`. This asserts the state that
// leaves: `lengthToCss` is still EXPORTED from core - it converts the neutral `Length` that core
// defines, and moving it would scatter that conversion across every web consumer - but nothing
// inside core CALLS it. Core offers the conversion; it never performs it.
//
// A source-text check rather than a type-level one because that is what the claim is about: any
// file here could quietly start lowering to CSS and no signature would change.

const here = dirname(fileURLToPath(import.meta.url))
const coreRoot = dirname(here)

/** Where the conversion is DEFINED and tested - the two files allowed to name it. */
const ALLOWED = ['foundations/dimensions.ts', 'foundations/dimensions.test.ts']

function sourceFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    const rel = prefix ? `${prefix}/${entry}` : entry
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full, rel))
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(rel)
  }
  return out
}

describe('core hands out no CSS', () => {
  it('never calls lengthToCss outside the module that defines it', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles(coreRoot)) {
      if (ALLOWED.includes(rel)) continue
      const text = readFileSync(join(coreRoot, rel), 'utf8')
      // The call, not the word: these files reference it in comments on purpose, saying where the
      // lowering went and why it is not here.
      if (/\blengthToCss\s*\(/.test(text)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  // The same claim from the other side: this file would have caught the two resolvers, so it has
  // to be able to see a real call. If the walk ever stops finding core's sources, the test above
  // passes for the wrong reason.
  it('is actually reading core sources', () => {
    const files = sourceFiles(coreRoot)
    expect(files).toContain('facets/facets.ts')
    expect(files).toContain('foundations/dimensions.ts')
    expect(files.length).toBeGreaterThan(20)
  })
})
