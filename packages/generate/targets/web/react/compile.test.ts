import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { API, DiagnosticCategory, type Diagnostic } from 'typescript/unstable/sync'
import { componentUsesContext, getComponentTarget, type GeneratedFile } from '../../../index'
import { documentToIr } from '../../dsl/toIr'

// ─── The generated React must actually compile ────────────────────────────────
// Every other test of this emitter asserts on the emitted STRING with `toContain`, which
// cannot tell the difference between "React that works" and "React that happens to contain
// the substring". The emitter is the product's deliverable - a change that emits an unclosed
// tag, a duplicated declaration or a prop typed against nothing passed CI and shipped.
//
// So this test does the one thing no other test did: it hands the emitted modules to the
// TypeScript compiler.
//
//     .milda corpus  ->  IR  ->  target.emit  ->  tsc  ->  no diagnostics
//
// Two gates, deliberately separate so a red run says which kind of broken it is:
//
//   PARSE     every emitted .ts/.tsx is syntactically valid TSX. Cheap, unconditional, and
//             the half that can never be wrong for an environmental reason.
//   TYPECHECK the emitted modules typecheck against each other and against the real
//             @types/react, under `strict`. This is the half that catches a prop typed
//             against a name that does not exist, or two declarations of one component.
//
// The fixtures are the same real corpus the DSL round-trip uses, for the same reason: a
// system built from the actual archetypes exercises far more of the emitter than a toy.

// Resolved from this file, not the working directory - the runner's cwd is its own package.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

const CORPUS = [
  'docs/dsl/walkthrough/walkthrough.milda',
  'docs/dsl/example-radix/foundations.milda',
  'docs/dsl/example-radix/actions.milda',
  'docs/dsl/example-radix/inputs.milda',
  'docs/dsl/example-radix/typography.milda',
  'docs/dsl/example-radix/layout.milda',
  'docs/dsl/example-radix/navigation.milda',
  'docs/dsl/example-radix/overlays.milda',
  'docs/dsl/example-radix/collections.milda',
  'docs/dsl/example-radix/palettes.milda',
]

// A directory name per document. Each document's components compile TOGETHER and only with
// each other, which is what a released package looks like: sibling modules importing
// siblings. It also keeps two documents that both define a `Button` from colliding.
const slug = (path: string) => path.replace(/[^A-Za-z0-9]+/g, '_')

// The canary lives in the same program as everything else and holds code that MUST fail. It
// is what stops this test from passing vacuously: an empty program, an unresolved `react`, or
// a checker that never ran would all report zero errors, and would all look like success.
const CANARY = '__canary'

// A deliberately-wrong module. Each line is a different way the emitter could break, so the
// canary also proves the specific machinery is live: JSX is being checked (not just parsed),
// React's own types resolved, and the DOM element types came with them.
const CANARY_SOURCE = [
  "import type { ReactElement } from 'react'",
  'export const notAnElement: ReactElement = 42',
  'export const unknownDomProp = <div notAnAttribute="x" />',
  'export const elementIsNotANumber: number = <span />',
].join('\n')

// Emit one document exactly the way `packages/release/assemble.ts` does. Passing the same
// options matters: `sharedTypes` and `icons` decide what the emitted props are typed
// against, so emitting with `{}` would compile a component whose API is not the one shipped.
function emitDocument(source: string): GeneratedFile[] {
  const ir = documentToIr(parseMildaDocument(source).document)
  if (ir.components.length === 0) return []
  const target = getComponentTarget('react')
  const options = {
    ...(ir.meta.output ?? {}),
    sharedTypes: ir.sharedTypes,
    ...(ir.foundations?.icons ? { icons: ir.foundations.icons } : {}),
    // Passed for the same reason `sharedTypes` is: a prop TYPED BY a context group (0001) types
    // as that group's contexts, so emitting without them compiles a different public API than
    // the one a release ships.
    ...(ir.foundations?.contextGroups ? { contextGroups: ir.foundations.contextGroups } : {}),
    componentsById: Object.fromEntries(
      ir.components.map((c) => [(c as { id?: string }).id ?? c.name, c]),
    ),
  }
  const iconModule = target.icons(ir.foundations)
  const contextModule = ir.components.some(componentUsesContext)
    ? (target.context?.() ?? null)
    : null
  return [
    ...(iconModule ? [iconModule] : []),
    ...(contextModule ? [contextModule] : []),
    ...ir.components.flatMap((c) => target.emit(c, options)),
  ]
}

// A diagnostic is only useful if it names the line it is about, and the compiler reports byte
// offsets. Resolving them here is what turns a red run into an actionable one.
function formatDiagnostic(d: Diagnostic, sources: Map<string, string>): string {
  const name = d.fileName ?? '(no file)'
  const text = sources.get(name)
  if (!text) return `${name}: TS${d.code} ${d.text}`
  const before = text.slice(0, d.pos)
  const line = before.split('\n').length
  const col = d.pos - (before.lastIndexOf('\n') + 1) + 1
  const short = name.slice(name.indexOf(CANARY) >= 0 ? 0 : name.lastIndexOf('/') + 1)
  return `${short}:${line}:${col} TS${d.code} ${d.text}\n    ${text.split('\n')[line - 1]?.trim()}`
}

describe('the generated React compiles', () => {
  let api: API
  let workspace: string
  const sources = new Map<string, string>()
  const syntactic = new Map<string, Diagnostic[]>()
  const semantic = new Map<string, Diagnostic[]>()
  let moduleCount = 0

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'milda-react-compile-'))

    const write = (dir: string, files: GeneratedFile[]) => {
      mkdirSync(join(workspace, dir), { recursive: true })
      for (const file of files) {
        // Only the TS modules go to the compiler. The stylesheets are emitted beside them and
        // are a bundler's business, not the type system's.
        const full = join(workspace, dir, file.path)
        writeFileSync(full, file.code)
        if (/\.tsx?$/.test(file.path)) {
          sources.set(full, file.code)
          moduleCount += 1
        }
      }
    }

    for (const path of CORPUS) {
      write(slug(path), emitDocument(readFileSync(join(REPO_ROOT, path), 'utf8')))
    }
    write(CANARY, [{ path: 'canary.tsx', language: 'tsx', code: CANARY_SOURCE }])

    // A CSS-module declaration, because `import styles from './Button.module.css'` is a
    // bundler contract rather than a TypeScript one. Consumers declare this (or their
    // framework does); supplying it here keeps the gate about the emitted React.
    writeFileSync(
      join(workspace, 'css-modules.d.ts'),
      "declare module '*.module.css' {\n  const classes: Record<string, string>\n  export default classes\n}\n",
    )

    // `strict`, because that is the setting the generated package is consumed under, and the
    // laxer ones would let a prop typed against nothing through. React is resolved from the
    // repo's own @types/react by absolute path - the workspace is a temp directory with no
    // node_modules of its own, and vendoring one would make this test slow and its result a
    // statement about the copy rather than about the repo.
    const reactTypes = join(REPO_ROOT, 'node_modules/@types/react')
    writeFileSync(
      join(workspace, 'tsconfig.json'),
      JSON.stringify(
        {
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
        },
        null,
        2,
      ),
    )

    // TypeScript 7 is the native compiler: there is no in-process `ts.createSourceFile`, and
    // the whole JS API is this out-of-process one. It is also why compiling ~50 modules costs
    // tens of milliseconds rather than seconds, so the corpus needs no subsetting.
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
    // The API holds a child process; leaving it up would hang the run.
    api?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  const report = (map: Map<string, Diagnostic[]>, dir: string) =>
    (map.get(dir) ?? []).map((d) => formatDiagnostic(d, sources))

  // The gate is worth nothing if it is measuring an empty program or a compiler that never
  // typechecked. Both halves are asserted before any "no errors" claim is believed.
  it('is not vacuous: it compiled the corpus and the canary really fails', () => {
    expect(moduleCount).toBeGreaterThan(40)
    expect(report(syntactic, CANARY)).toEqual([])
    expect((semantic.get(CANARY) ?? []).map((d) => d.code).sort()).toEqual([2322, 2322, 2322])
  })

  describe.each(CORPUS)('%s', (path) => {
    const dir = slug(path)

    it('every emitted module parses as valid TSX', () => {
      expect(report(syntactic, dir)).toEqual([])
    })

    it('every emitted module typechecks under strict, against the real React types', () => {
      expect(report(semantic, dir)).toEqual([])
    })
  })
})
