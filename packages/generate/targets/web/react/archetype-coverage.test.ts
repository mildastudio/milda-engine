import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { archetypesByName } from '@mildastudio/milda'
import { hasAnatomy, seedArchetypeContract, seedStructure } from '@mildastudio/core'
import { API, DiagnosticCategory, type Diagnostic } from 'typescript/unstable/sync'
import { getComponentTarget, type GeneratedFile } from '../../../index'

// ─── Every archetype the prelude defines must emit React that compiles ────────
// `compile.test.ts` runs the same compiler over the `docs/dsl/` corpus, and that corpus is a
// real design system rather than a coverage instrument: it reaches 23 of the prelude's 51
// archetypes. The other 28 - Combobox, DatePicker, Wizard, Tree, Carousel, Meter and the rest -
// had NOTHING typechecking their output. A generator change that emitted a duplicated
// declaration or an unclosed tag for one of them would have been green here and broken on the
// customer's `npm install`.
//
// The fixture is a SEEDED archetype: `seedStructure` + `seedArchetypeContract` are exactly what
// a freshly created component has in the editor, which makes this the first thing a user of a
// blank project generates. `componentRenderParity.test.tsx` seeds the same way, so the two
// gates line up on the same object even though they live in different packages and test lanes.
//
// The list is DERIVED from the prelude rather than written out, so adding an archetype adds a
// compile gate for it on the same commit.

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

// Only archetypes with anatomy seed a structure; the rest would emit an empty root and assert
// nothing. `hasAnatomy` is core's own answer to that question, so this cannot drift from what
// the editor considers seedable.
const ARCHETYPES = Object.keys(archetypesByName).filter(hasAnatomy).sort()

const CANARY = '__canary'
const CANARY_SOURCE = [
  "import type { ReactElement } from 'react'",
  'export const notAnElement: ReactElement = 42',
  'export const unknownDomProp = <div notAnAttribute="x" />',
].join('\n')

function emitSeeded(archetype: string): GeneratedFile[] {
  const structure = seedStructure(archetype, archetype)
  const component = {
    id: `c.${archetype}`,
    name: archetype,
    archetype,
    structure,
    contract: seedArchetypeContract(structure, archetype),
  }
  return getComponentTarget('react').emit(component, {})
}

function formatDiagnostic(d: Diagnostic, sources: Map<string, string>): string {
  const name = d.fileName ?? '(no file)'
  const text = sources.get(name)
  if (!text) return `${name}: TS${d.code} ${d.text}`
  const before = text.slice(0, d.pos)
  const line = before.split('\n').length
  const col = d.pos - (before.lastIndexOf('\n') + 1) + 1
  return `${name.slice(name.lastIndexOf('/') + 1)}:${line}:${col} TS${d.code} ${d.text}\n    ${text.split('\n')[line - 1]?.trim()}`
}

describe('every seeded archetype emits React that compiles', () => {
  let api: API
  let workspace: string
  const sources = new Map<string, string>()
  const syntactic = new Map<string, Diagnostic[]>()
  const semantic = new Map<string, Diagnostic[]>()

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'milda-archetype-compile-'))

    // A directory per archetype: two archetypes may emit a same-named helper, and bucketing
    // diagnostics by directory is what lets a red run name the archetype that broke.
    const write = (dir: string, files: GeneratedFile[]) => {
      mkdirSync(join(workspace, dir), { recursive: true })
      for (const file of files) {
        const full = join(workspace, dir, file.path)
        writeFileSync(full, file.code)
        if (/\.tsx?$/.test(file.path)) sources.set(full, file.code)
      }
    }

    for (const archetype of ARCHETYPES) write(archetype, emitSeeded(archetype))
    write(CANARY, [{ path: 'canary.tsx', language: 'tsx', code: CANARY_SOURCE }])

    writeFileSync(
      join(workspace, 'css-modules.d.ts'),
      "declare module '*.module.css' {\n  const classes: Record<string, string>\n  export default classes\n}\n",
    )

    const reactTypes = join(REPO_ROOT, 'node_modules/@types/react')
    writeFileSync(
      join(workspace, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          jsx: 'react-jsx',
          skipLibCheck: true,
          target: 'es2022',
          module: 'preserve',
          moduleResolution: 'bundler',
          types: ['react'],
          typeRoots: [join(REPO_ROOT, 'node_modules/@types')],
          paths: { react: [reactTypes], 'react/*': [join(reactTypes, '*')] },
        },
        include: ['**/*.ts', '**/*.tsx'],
      }),
    )

    api = new API({ cwd: workspace })
    const project = api
      .updateSnapshot({ openProjects: [join(workspace, 'tsconfig.json')] })
      .getProjects()[0]
    if (!project) throw new Error('tsc did not open the emitted workspace as a project')

    const bucket = (map: Map<string, Diagnostic[]>, d: Diagnostic) => {
      const dir = (d.fileName ?? '').slice(workspace.length + 1).split('/')[0] ?? ''
      map.set(dir, [...(map.get(dir) ?? []), d])
    }
    for (const d of project.program.getSyntacticDiagnostics()) bucket(syntactic, d)
    for (const d of project.program.getSemanticDiagnostics()) {
      if (d.category === DiagnosticCategory.Error) bucket(semantic, d)
    }
  })

  afterAll(() => {
    api?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  const report = (map: Map<string, Diagnostic[]>, dir: string) =>
    (map.get(dir) ?? []).map((d) => formatDiagnostic(d, sources))

  // The point of the file: the set under test is the WHOLE prelude, not a hand-kept list that
  // a new archetype would quietly fall out of. The canary keeps "no errors" from meaning "the
  // checker never ran".
  it('covers every seedable archetype, and the canary really fails', () => {
    // Named rather than counted: an archetype that loses its anatomy would otherwise drop out
    // of the gate silently, and "the list got shorter" is exactly the failure this file exists
    // to make impossible. Skeleton and Icon are single-element by nature - they seed a bare
    // root, so there is nothing about them for a compile gate to say.
    expect(
      Object.keys(archetypesByName)
        .filter((a) => !hasAnatomy(a))
        .sort(),
    ).toEqual(['Icon', 'Skeleton'])
    expect(report(syntactic, CANARY)).toEqual([])
    expect((semantic.get(CANARY) ?? []).map((d) => d.code).sort()).toEqual([2322, 2322])
  })

  describe.each(ARCHETYPES)('%s', (archetype) => {
    it('every emitted module parses as valid TSX', () => {
      expect(report(syntactic, archetype)).toEqual([])
    })

    it('every emitted module typechecks under strict, against the real React types', () => {
      expect(report(semantic, archetype)).toEqual([])
    })
  })
})
