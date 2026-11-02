import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { API, DiagnosticCategory, type Diagnostic } from 'typescript/unstable/sync'
import { documentToIr } from '../../dsl/toIr'
import { getComponentTarget, getTarget, type GeneratedFile } from '../../../index'

// ─── Interface constraints are types (proposal 0052 §4.1) ──────────────────────
// The point of putting a constraint in the CONTRACT rather than in a usage rule is that the
// compiler enforces it. So this file asserts it the only way that means anything: the real
// TypeScript compiler, over the real React types, against a consumer file that uses the generated
// component both ways. Every misuse carries a `@ts-expect-error`, and an UNUSED one is itself an
// error (TS2578) - so a type that stopped rejecting a misuse fails here as loudly as one that
// started rejecting a correct use.

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))

const SOURCE = `
context-group Variant { Primary Secondary Danger }
component Action {
  archetype Button
  props {
    variant      : context Variant = Secondary
    loading      : boolean = false
    loadingLabel : string required when loading
    confirmText  : string required when variant = Danger
    label        : string
    labelledBy   : string
    href         : string
    target       : string
    count        : number
    countLabel   : string required when count > 0
    one-of    label, labelledBy
    exclusive href, target
  }
  part label { slot single of content }
}
`

const CONSUMER = `
import { Action } from './Action'

export const ok = [
  <Action label="Save" />,
  <Action labelledBy="title" />,
  <Action label="Save" loading loadingLabel="Saving" />,
  <Action label="Save" loading={false} />,
  <Action label="Delete" variant="danger" confirmText="Delete it?" />,
  <Action label="Save" variant="primary" />,
  <Action label="Go" href="/next" />,
]

export const rejected = [
  // @ts-expect-error - neither label nor labelledBy
  <Action />,
  // @ts-expect-error - both label and labelledBy
  <Action label="Save" labelledBy="title" />,
  // @ts-expect-error - loading without its label
  <Action label="Save" loading />,
  // @ts-expect-error - danger without its confirmation
  <Action label="Delete" variant="danger" />,
  // @ts-expect-error - href and target together
  <Action label="Go" href="/next" target="_blank" />,
]

declare const busy: boolean
// @ts-expect-error - a dynamic flag may be true, so the type asks for the label
export const dynamic = <Action label="Save" loading={busy} />
`

function emitted(): { files: GeneratedFile[]; skipped: string[] } {
  const ir = documentToIr(parseMildaDocument(SOURCE).document)
  const options = { contextGroups: ir.foundations.contextGroups }
  const component = { ...ir.components[0]!, id: 'c.action' }
  return {
    files: getComponentTarget('react').emit(component, options),
    skipped: getTarget('react').emitDocument(
      { componentsById: { 'c.action': component }, foundations: ir.foundations },
      options,
    ).skipped,
  }
}

function formatDiagnostic(d: Diagnostic, sources: Map<string, string>): string {
  const text = sources.get(d.fileName ?? '') ?? ''
  const before = text.slice(0, d.pos)
  const line = before.split('\n').length
  return `${(d.fileName ?? '').split('/').pop()}:${line} TS${d.code} ${d.text}\n    ${text.split('\n')[line - 1]?.trim()}`
}

describe('the React types reject what the interface constraints forbid', () => {
  let api: API
  let workspace: string
  const sources = new Map<string, string>()
  let errors: Diagnostic[] = []
  let out: ReturnType<typeof emitted>

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'milda-constraint-types-'))
    out = emitted()
    const write = (path: string, code: string) => {
      const full = join(workspace, path)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, code)
      if (/\.tsx?$/.test(path)) sources.set(full, code)
    }
    for (const f of out.files) write(f.path, f.code)
    write('consumer.tsx', CONSUMER)
    write(
      'css-modules.d.ts',
      "declare module '*.module.css' {\n  const classes: Record<string, string>\n  export default classes\n}\n",
    )
    const reactTypes = join(REPO_ROOT, 'node_modules/@types/react')
    write(
      'tsconfig.json',
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
    errors = [
      ...project.program.getSyntacticDiagnostics(),
      ...project.program
        .getSemanticDiagnostics()
        .filter((d) => d.category === DiagnosticCategory.Error),
    ]
  })

  afterAll(() => {
    api?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  it('compiles the component, accepts every correct use and rejects every misuse', () => {
    expect(errors.map((d) => formatDiagnostic(d, sources))).toEqual([])
  })

  it('keeps the props interface as the base and exports the narrowed type', () => {
    const tsx = out.files.find((f) => f.path === 'Action.tsx')?.code ?? ''
    expect(tsx).toContain('interface ActionBaseProps')
    expect(tsx).not.toContain('export interface ActionProps')
    expect(tsx).toMatch(/export type ActionProps = ActionBaseProps & /)
  })

  it('reports the condition a type cannot say, instead of dropping it', () => {
    expect(out.skipped).toEqual([
      'Action: `countLabel` is required when `count` > 0 - not expressible as a type, enforced by milda check',
    ])
  })
})
