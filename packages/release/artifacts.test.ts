import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from '@mildastudio/generate'
import { assemble } from './assemble'
import { packageManifest } from './index'
import { ARTIFACT_PATHS, DEFAULT_ARTIFACTS } from './artifacts'
import type { ReleaseConfig } from './types'

// The artifacts exist so a reader - increasingly an agent - can learn the system without
// running the compiler. Two things must hold or they are worse than nothing: what they say
// has to be TRUE of the package they ship in, and they have to actually reach the consumer
// (npm's `files` allowlist silently drops anything unnamed).

const SOURCE = [
  'foundations {',
  '  layer Primitives {',
  '    token blue/9 : color = hex(2563eb)',
  '  }',
  '  layer Semantic {',
  '    token accent : color = blue.9 "The one colour that means action"',
  '  }',
  '}',
  '',
  'component Button "A pressable action" {',
  '  props {',
  '    label : string = "Click me"',
  '    disabled : boolean = false',
  '  }',
  '  events { press }',
  '  part label { slot single of content }',
  '}',
].join('\n')

function irFixture() {
  const { document } = parseMildaDocument(SOURCE)
  const ir = documentToIr(document)
  return ir
}

const config = (over?: Partial<ReleaseConfig>): ReleaseConfig => ({
  scope: 'acme',
  name: 'ds',
  version: '1.2.3',
  granularity: 'single',
  targetOptions: { naming: 'dot', emitStyle: 'compound' },
  ...over,
})

function planFiles(over?: Partial<ReleaseConfig>) {
  const ir = irFixture()
  const plan = assemble(ir.components, config(over), ir.foundations, ir.sharedTypes)
  return plan
}

const fileAt = (files: { path: string; code: string }[], path: string) =>
  files.find((f) => f.path === path)

describe('release artifacts', () => {
  it('writes the default reading set into the package', () => {
    const [pkg] = planFiles().packages
    const paths = pkg.files.map((f) => f.path)
    expect(paths).toContain(ARTIFACT_PATHS.design)
    expect(paths).toContain(ARTIFACT_PATHS.agents)
    expect(paths).toContain(ARTIFACT_PATHS.llms)
    // The data artifacts restate the package in a second form - opt in, never default.
    expect(DEFAULT_ARTIFACTS.catalog).toBe(false)
    expect(paths).not.toContain(ARTIFACT_PATHS.catalog)
    expect(paths).not.toContain(ARTIFACT_PATHS.source)
  })

  it('writes nothing when everything is deselected', () => {
    const [pkg] = planFiles({
      artifacts: { design: false, agents: false, llms: false, catalog: false, source: false },
    }).packages
    for (const path of Object.values(ARTIFACT_PATHS)) {
      expect(pkg.files.map((f) => f.path)).not.toContain(path)
    }
  })

  it('describes the real contract, not a summary of it', () => {
    const [pkg] = planFiles().packages
    const design = fileAt(pkg.files, ARTIFACT_PATHS.design)?.code ?? ''
    expect(design).toContain('## Button')
    expect(design).toContain('`label`')
    expect(design).toContain('`disabled`')
    // A prop's default is what a reader most often needs and most often has to guess.
    expect(design).toContain('"Click me"')
    // Events and slots are contract too - a component described by props alone is half told.
    expect(design).toContain('### Events')
    expect(design).toContain('### Composition (slots)')
    // Tokens, with the reference arrow that says it points at another token.
    expect(design).toContain('`accent`')
    expect(design).toContain('→ ')
  })

  it('teaches the API the author actually chose', () => {
    const dot = fileAt(planFiles().packages[0].files, ARTIFACT_PATHS.agents)?.code ?? ''
    expect(dot).toContain('Card.Header')

    const flat =
      fileAt(
        planFiles({ targetOptions: { naming: 'flat', emitStyle: 'props' } }).packages[0].files,
        ARTIFACT_PATHS.agents,
      )?.code ?? ''
    expect(flat).toContain('exported as flat names')
    expect(flat).toContain('passing content to its prop')
  })

  it('never indexes a file this release did not write', () => {
    const [pkg] = planFiles({ artifacts: { agents: false, catalog: true } }).packages
    const llms = fileAt(pkg.files, ARTIFACT_PATHS.llms)?.code ?? ''
    expect(llms).toContain(ARTIFACT_PATHS.design)
    expect(llms).toContain(ARTIFACT_PATHS.catalog)
    expect(llms).not.toContain(ARTIFACT_PATHS.agents)
  })

  it('ships the catalogue as data a tool can read', () => {
    const [pkg] = planFiles({ artifacts: { catalog: true } }).packages
    const parsed = JSON.parse(fileAt(pkg.files, ARTIFACT_PATHS.catalog)?.code ?? '{}')
    expect(parsed.version).toBe('1.2.3')
    expect(parsed.components.map((c: { name: string }) => c.name)).toContain('Button')
    expect(parsed.tokens.map((t: { name: string }) => t.name)).toContain('accent')
  })

  it('ships the source in the authoring language, readable back', () => {
    const [pkg] = planFiles({ artifacts: { source: true } }).packages
    const milda = fileAt(pkg.files, ARTIFACT_PATHS.source)?.code ?? ''
    // The point of shipping source is that it parses - a decorative .milda would be a lie.
    const { document, issues } = parseMildaDocument(milda)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(document.components.map((c) => c.name)).toContain('Button')
  })

  it('names the artifacts in package.json files, or npm never packs them', () => {
    const [pkg] = planFiles({ artifacts: { catalog: true } }).packages
    const manifest = packageManifest(pkg) as { files: string[] }
    expect(manifest.files).toContain(ARTIFACT_PATHS.design)
    expect(manifest.files).toContain(ARTIFACT_PATHS.agents)
    expect(manifest.files).toContain(ARTIFACT_PATHS.llms)
    expect(manifest.files).toContain(ARTIFACT_PATHS.catalog)
    // The pre-existing entries are untouched.
    expect(manifest.files).toContain('dist')
  })

  it('describes the set once in per-component granularity, on the shared theme package', () => {
    const plan = planFiles({ granularity: 'per-component' })
    const carrying = plan.packages.filter((p) =>
      p.files.some((f) => f.path === ARTIFACT_PATHS.design),
    )
    expect(carrying).toHaveLength(1)
    expect(carrying[0].name).toBe('@acme/ds-theme')
    // css-only or not, the manifest has to name it.
    const manifest = packageManifest(carrying[0]) as { files: string[] }
    expect(manifest.files).toContain(ARTIFACT_PATHS.design)
  })
})

// ─── How the system is used (proposal 0052) ──────────────────────────────────
// Three readers, one source: the checker reads the catalogue's data, an agent reads AGENTS.md, a
// person reads DESIGN.md. They are asserted together because what matters is that they agree.

const RULED = [
  'context-group Variant { Primary Secondary }',
  'component ToggleButton "Pressed or not" {',
  '  archetype ToggleButton',
  '  meta { name "Toggle button" }',
  '  props {',
  '    variant : context Variant = Secondary',
  '    loading : boolean = false',
  '    loadingLabel : string required when loading',
  '    label : string',
  '    labelledBy : string',
  '    one-of label, labelledBy',
  '  }',
  '  part label { slot single of content }',
  '}',
  'rule one-primary error {',
  '  max 1 ToggleButton where variant = Primary within archetype Form',
  '  because "A form has one way forward."',
  '}',
  'rule colour warning {',
  '  tokens color',
  '  because "Literals do not follow the theme."',
  '}',
].join('\n')

function ruledPackage(over?: Partial<ReleaseConfig>) {
  const ir = documentToIr(parseMildaDocument(RULED).document)
  const [pkg] = assemble(ir.components, config(over), ir.foundations, ir.sharedTypes).packages
  return { ir, pkg }
}

describe('usage rules and interface constraints in the artifacts', () => {
  it('writes the rules into the catalogue exactly as the IR holds them', () => {
    const { ir, pkg } = ruledPackage({ artifacts: { catalog: true } })
    const parsed = JSON.parse(fileAt(pkg.files, ARTIFACT_PATHS.catalog)?.code ?? '{}')
    expect(parsed.rules).toEqual(
      [...(ir.foundations.rules ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    )
    const toggle = parsed.components.find((c: { name: string }) => c.name === 'Toggle button')
    expect(toggle.constraints).toEqual([{ kind: 'one-of', props: ['label', 'labelledBy'] }])
    expect(
      toggle.props.find((p: { name: string }) => p.name === 'loadingLabel').requiredWhen,
    ).toEqual({
      kind: 'cmp',
      ref: { kind: 'prop', path: 'loading' },
      op: 'set',
    })
  })

  it('always writes a rules key, so no rules and an old catalogue are told apart', () => {
    const [pkg] = planFiles({ artifacts: { catalog: true } }).packages
    expect(JSON.parse(fileAt(pkg.files, ARTIFACT_PATHS.catalog)?.code ?? '{}').rules).toEqual([])
  })

  it('tells an agent the rules, errors first, by the names it types', () => {
    const { pkg } = ruledPackage()
    const agents = fileAt(pkg.files, ARTIFACT_PATHS.agents)?.code ?? ''
    expect(agents).toContain('## Usage rules')
    const one = agents.indexOf('`one-primary`')
    const colour = agents.indexOf('`colour`')
    expect(one).toBeGreaterThan(0)
    expect(colour).toBeGreaterThan(one)
    // The identifier, not the authored name: an agent that writes `Toggle button` writes nothing.
    expect(agents).toContain(
      'At most 1 `ToggleButton` where `variant` = Primary within any `Form`.',
    )
    expect(agents).toContain('A form has one way forward.')
    expect(agents).toContain('## Interface constraints')
    expect(agents).toContain('`loadingLabel` is required when `loading`.')
    expect(agents).toContain('Set exactly one of `label` or `labelledBy`.')
  })

  it('documents the constraints with the props and the rules with the component', () => {
    const { pkg } = ruledPackage()
    const design = fileAt(pkg.files, ARTIFACT_PATHS.design)?.code ?? ''
    expect(design).toContain('| `loadingLabel` | `string` | when `loading` |')
    expect(design).toContain('### Constraints')
    expect(design).toContain('- 2 usage rules')
    // Under the component it names, and in the full list.
    expect(design.match(/`one-primary`/g)).toHaveLength(2)
  })

  it('links the rules from llms.txt only when there are some', () => {
    const { pkg } = ruledPackage()
    expect(fileAt(pkg.files, ARTIFACT_PATHS.llms)?.code).toContain('#usage-rules')
    const [plain] = planFiles().packages
    expect(fileAt(plain.files, ARTIFACT_PATHS.llms)?.code).not.toContain('#usage-rules')
  })

  it('ships the rules in the source, readable back', () => {
    const { ir, pkg } = ruledPackage({ artifacts: { source: true } })
    const milda = fileAt(pkg.files, ARTIFACT_PATHS.source)?.code ?? ''
    const back = documentToIr(parseMildaDocument(milda).document)
    expect(back.foundations.rules).toEqual(ir.foundations.rules)
  })
})
