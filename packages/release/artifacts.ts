import type { ComponentIR, DocumentFoundations, SharedType } from '@mildastudio/core'
import { componentName, documentToDsl, type GeneratedFile } from '@mildastudio/generate'
import type { ReleaseConfig } from './types'
import {
  componentMarkdown,
  describeComponent,
  describeRules,
  describeTokens,
  rulesMarkdown,
  tokensMarkdown,
} from './describe'
import { propConstraintSentence, requiredWhenSentence } from '@mildastudio/core'

// ─── What ships beside the code, for the reader who is not a human ───────────
// A released package is the design system arriving somewhere a person will build with
// it - and increasingly the thing building with it is an agent. It already has the
// whole contract; what it lacks is any of it in a form that can be READ without
// running the compiler. So the release can write that form into the package.
//
// Five artifacts, each answering a different question, each opt-in per project:
//
//   DESIGN.md          what this system offers - tokens, components, props, slots
//   AGENTS.md          how to build with it correctly, and what not to do
//   llms.txt           the index that points at the other two
//   design-system.json the same contract as data, for a tool rather than a reader
//   design-system.milda the SOURCE - the whole system in the authoring language
//
// They are generated, never authored: everything here is derived from the IR that was
// released, so the description cannot drift from the package it describes. That is the
// entire argument for generating them rather than asking the author to keep a doc in
// step by hand.
//
// Truthfulness rule: a claim is only made when this module can see the fact behind it.
// The package's own file list decides whether a theme stylesheet is mentioned; the
// output settings decide how sub-components are named. Nothing here guesses, because a
// confidently wrong instruction to an agent is worse than a missing one.

export interface ReleaseArtifacts {
  /** DESIGN.md - the system in prose and tables. */
  design: boolean
  /** AGENTS.md - build-with-it rules for a coding agent. */
  agents: boolean
  /** llms.txt - the machine-readable index at the package root. */
  llms: boolean
  /** design-system.json - the contract as data. */
  catalog: boolean
  /** design-system.milda - the design system in its own source language. */
  source: boolean
}

// The three READING artifacts are on by default: they are small, they are what the
// named request was for, and a package that cannot explain itself is the status quo we
// are fixing. The two DATA artifacts are off: they restate the package in a second
// form, which is a real choice about what you ship rather than a free improvement.
export const DEFAULT_ARTIFACTS: ReleaseArtifacts = {
  design: true,
  agents: true,
  llms: true,
  catalog: false,
  source: false,
}

export function resolveArtifacts(value?: Partial<ReleaseArtifacts>): ReleaseArtifacts {
  return { ...DEFAULT_ARTIFACTS, ...value }
}

export const ARTIFACT_PATHS: Record<keyof ReleaseArtifacts, string> = {
  design: 'DESIGN.md',
  agents: 'AGENTS.md',
  llms: 'llms.txt',
  catalog: 'design-system.json',
  source: 'design-system.milda',
}

/** Author-facing labels and one-line rationales, so the Studio's copy lives with the thing. */
export const ARTIFACT_INFO: Record<
  keyof ReleaseArtifacts,
  { path: string; label: string; blurb: string }
> = {
  design: {
    path: ARTIFACT_PATHS.design,
    label: 'Design system reference',
    blurb: 'Every token, component, prop, event and slot as readable markdown.',
  },
  agents: {
    path: ARTIFACT_PATHS.agents,
    label: 'Agent instructions',
    blurb: 'How to build with this library correctly - the rules a coding agent needs.',
  },
  llms: {
    path: ARTIFACT_PATHS.llms,
    label: 'llms.txt index',
    blurb: 'The conventional entry point an AI tool looks for first.',
  },
  catalog: {
    path: ARTIFACT_PATHS.catalog,
    label: 'Machine-readable catalogue',
    blurb: 'The same contract as JSON, for scripts and tools rather than readers.',
  },
  source: {
    path: ARTIFACT_PATHS.source,
    label: 'Milda source',
    blurb: 'The whole design system in its authoring language, shipped with the package.',
  },
}

export interface ArtifactContext {
  components: ComponentIR[]
  foundations?: DocumentFoundations
  sharedTypes?: SharedType[]
  config: ReleaseConfig
  /** The package these files are being written into - its name and what else it ships. */
  pkg: { name: string; version: string; files: GeneratedFile[] }
  /** How a consumer installs it, when the caller knows. */
  installCommand?: string
}

// ─── Facts about the package, read rather than assumed ───────────────────────

const shipsTheme = (ctx: ArtifactContext): boolean =>
  ctx.pkg.files.some((f) => f.path === 'theme.css')

// Sub-component naming and emission style are library-wide output settings the author
// chose (proposal 0015). They change what the import line looks like, so an instruction
// that ignores them teaches the wrong API.
function outputSetting(ctx: ArtifactContext, key: string): string | undefined {
  const value = (ctx.config.targetOptions ?? {})[key]
  return typeof value === 'string' ? value : undefined
}

const publicComponents = (ctx: ArtifactContext): ComponentIR[] =>
  ctx.components.filter((c) => !c.internal)

// The authored name is what the design system calls it; `componentName` is the identifier
// the package actually exports (the same call `assemble` builds the barrel from). A doc
// that shows "Toggle button" where the code says `ToggleButton` teaches an import that
// throws.
const described = (ctx: ArtifactContext) =>
  publicComponents(ctx).map((c) => ({
    ...describeComponent(c, ctx.sharedTypes ?? [], ctx.foundations?.contextGroups),
    exportName: componentName(c),
  }))

const systemName = (ctx: ArtifactContext): string => ctx.config.name || ctx.pkg.name

// A rule names components by their AUTHORED name; a reader types the identifier the package
// exports. A name no public component answers to (a rule about an internal part, or a dangling
// reference) is printed as written rather than invented.
function exportNames(ctx: ArtifactContext): (authored: string) => string {
  const byName = new Map(publicComponents(ctx).map((c) => [c.name, componentName(c)]))
  return (authored) => byName.get(authored) ?? authored
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

// ─── DESIGN.md ───────────────────────────────────────────────────────────────

export function designMarkdown(ctx: ArtifactContext): string {
  const components = described(ctx)
  const tokens = describeTokens(ctx.foundations)

  const lines: string[] = [
    `# ${systemName(ctx)}`,
    '',
    `Design system reference for \`${ctx.pkg.name}\` v${ctx.pkg.version}.`,
    '',
    'Generated by Milda from the design system source at release time. Do not edit: the',
    'next release overwrites it. Change the design system and release again instead.',
    '',
  ]

  if (ctx.installCommand) {
    lines.push('## Install', '', '```bash', ctx.installCommand, '```', '')
  }

  lines.push('## Contents', '')
  if (tokens.length)
    lines.push(`- ${count(tokens.length, 'foundation token', 'foundation tokens')}`)
  lines.push(`- ${count(components.length, 'component', 'components')}`)
  const rules = describeRules(ctx.foundations)
  if (rules.length) lines.push(`- ${count(rules.length, 'usage rule', 'usage rules')}`)
  if (shipsTheme(ctx)) {
    lines.push('- A theme stylesheet (`theme.css`) carrying the tokens')
  }
  lines.push('')

  if (tokens.length) {
    lines.push(
      '## Foundations',
      '',
      'Tokens are listed layer by layer, in the order the layers resolve: a value on a later',
      'layer is expressed in terms of an earlier one. `→ name` means the token references',
      'another token rather than holding its own value.',
      '',
      tokensMarkdown(tokens),
      '',
    )
  }

  lines.push('## Components', '')
  if (components.length === 0) {
    lines.push('_This release publishes no public components._', '')
  } else {
    const name = exportNames(ctx)
    lines.push(components.map((c) => componentMarkdown(c, rules, name)).join('\n\n'), '')
  }

  // How the system is meant to be put together (proposal 0052 §5), checked by `milda check`.
  if (rules.length) {
    lines.push(
      '## Usage rules',
      '',
      'How these components are meant to be put together. Each rule has an id, a severity and',
      'a reason; `milda check` reports a broken one by its id.',
      '',
      rulesMarkdown(rules, exportNames(ctx)),
      '',
    )
  }

  return `${lines.join('\n').trimEnd()}\n`
}

// ─── AGENTS.md ───────────────────────────────────────────────────────────────

export function agentsMarkdown(ctx: ArtifactContext): string {
  const components = described(ctx)
  const naming = outputSetting(ctx, 'naming')
  const emitStyle = outputSetting(ctx, 'emitStyle')
  const roster = components.map((c) => c.exportName)

  const lines: string[] = [
    `# Building with ${systemName(ctx)}`,
    '',
    `Instructions for an AI coding agent working in a project that depends on`,
    `\`${ctx.pkg.name}\`. The full contract - every component, prop, event, slot and token -`,
    'is in [DESIGN.md](./DESIGN.md); read it before writing code against this library.',
    '',
    '## The rules',
    '',
    '1. **Use these components instead of writing your own.** The roster below is the whole',
    '   library. If a UI need is covered by one of them, reach for it - a hand-rolled',
    '   equivalent loses the design system, its accessibility work and its theming.',
    '2. **Only the documented props exist.** The API surface is generated from a contract',
    '   and is deliberately closed. A prop that is not in DESIGN.md is not supported, and',
    '   passing it is a bug rather than an extension point. The constraints listed under',
    '   "Interface constraints" are part of that contract.',
    '3. **Never edit files inside this package.** It is compiler output: the next release',
    '   overwrites every one of them. Changes belong in the design system itself.',
    '4. **Style through the design tokens, never with ad-hoc values.** A hard-coded colour',
    '   or spacing value is invisible to theming and will not follow the system when it',
    '   changes.',
  ]

  if (shipsTheme(ctx)) {
    lines.push(
      '5. **Import the theme stylesheet once, at the application root.** The components read',
      '   their values from it; without it they render unthemed.',
      '',
      '```js',
      `import '${ctx.pkg.name}/theme.css'`,
      '```',
    )
  }

  // The two layers of proposal 0052: what one instance must say, then how instances go together.
  // Both are stated before the import line because both decide what code to write at all.
  const name = exportNames(ctx)
  const constrained = components.filter(
    (c) => c.constraints?.length || c.props.some((p) => p.requiredWhen),
  )
  if (constrained.length) {
    lines.push('', '## Interface constraints', '')
    for (const c of constrained) {
      const said = [
        ...c.props
          .filter((p) => p.requiredWhen)
          .map((p) => `\`${p.name}\` is ${requiredWhenSentence(p).replace(/^R/, 'r')}`),
        ...(c.constraints ?? []).map((k) => propConstraintSentence({ id: '', ...k })),
      ]
      lines.push(`- \`${c.exportName}\`: ${said.join(' ')}`)
    }
  }
  const rules = describeRules(ctx.foundations)
  if (rules.length) {
    lines.push(
      '',
      '## Usage rules',
      '',
      'The design system states how its components go together. These are checked by',
      '`milda check`: an `error` fails the check, a `warning` is reported. Follow the reason,',
      'not only the letter - it says what to do in the case the rule does not name.',
      '',
      rulesMarkdown(rules, name),
    )
  }

  lines.push('', '## Importing', '')
  const sample = roster[0] ?? 'Component'
  lines.push(
    '```js',
    `import { ${roster.slice(0, 3).join(', ') || sample} } from '${ctx.pkg.name}'`,
    '```',
    '',
  )
  if (naming === 'dot') {
    lines.push(
      'Sub-components are properties of their parent: `Card.Header`, not `CardHeader`.',
      '',
    )
  } else if (naming === 'flat') {
    lines.push('Sub-components are exported as flat names: `CardHeader`, not `Card.Header`.', '')
  }
  if (emitStyle === 'compound') {
    lines.push(
      'Composition is compound: a slot is filled by nesting its sub-component as a child,',
      'not by passing an element through a prop.',
      '',
    )
  } else if (emitStyle === 'props') {
    lines.push('Composition is by props: a slot is filled by passing content to its prop.', '')
  } else if (emitStyle === 'both') {
    lines.push(
      'Both composition styles are emitted: nest sub-components, or pass slot content',
      'through the matching prop. Prefer nesting - it is the complete surface.',
      '',
    )
  }

  lines.push('## Components in this library', '')
  if (components.length === 0) {
    lines.push('_This release publishes no public components._', '')
  } else {
    lines.push('| Component | What it is for |', '| --- | --- |')
    for (const c of components) {
      const what = (c.description ?? (c.archetype ? `A ${c.archetype}` : ''))
        .replace(/\|/g, '\\|')
        .replace(/\s*\n\s*/g, ' ')
      lines.push(`| \`${c.exportName}\` | ${what} |`)
    }
    lines.push('')
  }

  lines.push(
    '## When something is missing',
    '',
    'If the library has no component for what you need, say so rather than inventing one',
    'or reaching past the API. Extending the system is a design decision made in the design',
    'system, not in the consuming application.',
    '',
  )

  return `${lines.join('\n').trimEnd()}\n`
}

// ─── llms.txt ────────────────────────────────────────────────────────────────
// The conventional root index (llmstxt.org): an H1, a blockquote summary, then linked
// sections. Deliberately links only to files this release actually wrote - an index
// that points at something absent is worse than no index.

export function llmsText(ctx: ArtifactContext, selected: ReleaseArtifacts): string {
  const components = described(ctx)
  const tokens = describeTokens(ctx.foundations)

  const lines: string[] = [
    `# ${systemName(ctx)}`,
    '',
    `> The ${ctx.pkg.name} design system, v${ctx.pkg.version}: ${count(components.length, 'component', 'components')}`,
    `> and ${count(tokens.length, 'design token', 'design tokens')}, generated by Milda from a single source of truth.`,
    '',
    '## Docs',
    '',
  ]
  if (selected.design) {
    lines.push(
      `- [${ARTIFACT_PATHS.design}](./${ARTIFACT_PATHS.design}): every component's props, events and slots, and every design token.`,
    )
  }
  if (selected.agents) {
    lines.push(
      `- [${ARTIFACT_PATHS.agents}](./${ARTIFACT_PATHS.agents}): how to build with this library, and what not to do.`,
    )
  }
  if (selected.agents && describeRules(ctx.foundations).length) {
    lines.push(
      `- [Usage rules](./${ARTIFACT_PATHS.agents}#usage-rules): how the components are meant to be put together, and what \`milda check\` reports.`,
    )
  }
  if (selected.catalog) {
    lines.push(
      `- [${ARTIFACT_PATHS.catalog}](./${ARTIFACT_PATHS.catalog}): the same contract as JSON, for tools.`,
    )
  }
  if (selected.source) {
    lines.push(
      `- [${ARTIFACT_PATHS.source}](./${ARTIFACT_PATHS.source}): the design system in its authoring language.`,
    )
  }
  lines.push('')
  if (components.length) {
    lines.push('## Components', '')
    for (const c of components) {
      lines.push(`- ${c.exportName}: ${c.description ?? c.archetype ?? 'component'}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

// ─── design-system.json ──────────────────────────────────────────────────────

export function catalogJson(ctx: ArtifactContext): string {
  const catalog = {
    generator: 'milda',
    name: systemName(ctx),
    package: ctx.pkg.name,
    version: ctx.pkg.version,
    components: publicComponents(ctx).map((c) => {
      const d = describeComponent(c, ctx.sharedTypes ?? [], ctx.foundations?.contextGroups)
      return {
        name: d.name,
        archetype: d.archetype,
        description: d.description,
        status: d.status,
        since: d.since,
        props: d.props.map((p) => ({
          name: p.name,
          type: p.typeLabel,
          required: p.required,
          ...(p.requiredWhen ? { requiredWhen: p.requiredWhen } : {}),
          default: p.default,
          description: p.description,
        })),
        ...(d.constraints ? { constraints: d.constraints } : {}),
        events: d.events,
        slots: d.slots,
      }
    }),
    tokens: describeTokens(ctx.foundations),
    // Always present (proposal 0052 §8), so "no rules" and "a catalogue from before rules" are
    // told apart by the key rather than guessed. The IR's objects, unchanged.
    rules: describeRules(ctx.foundations),
  }
  return `${JSON.stringify(catalog, null, 2)}\n`
}

// ─── design-system.milda ─────────────────────────────────────────────────────
// The authoring language, not a realization of it (proposal 0041). What travels here is
// the released CONTRACT and its foundations; the surrounding library - demo scenes, docs
// pages, asset bytes - is not part of what a release assembles, so it is not part of
// this file either. `Export → Download Milda file` in the Studio is the complete one.

export function mildaSource(ctx: ArtifactContext): string {
  const output = Object.fromEntries(
    Object.entries(ctx.config.targetOptions ?? {}).filter(
      (entry): entry is [string, string | number | boolean] =>
        ['string', 'number', 'boolean'].includes(typeof entry[1]),
    ),
  )
  return documentToDsl({
    components: ctx.components,
    foundations: ctx.foundations,
    sharedTypes: ctx.sharedTypes,
    meta: { name: systemName(ctx), version: ctx.pkg.version },
    output,
  })
}

// ─── The files ───────────────────────────────────────────────────────────────

export function artifactFiles(
  ctx: ArtifactContext,
  selection?: Partial<ReleaseArtifacts>,
): GeneratedFile[] {
  const selected = resolveArtifacts(selection)
  const files: GeneratedFile[] = []
  if (selected.design) {
    files.push({ path: ARTIFACT_PATHS.design, language: 'markdown', code: designMarkdown(ctx) })
  }
  if (selected.agents) {
    files.push({ path: ARTIFACT_PATHS.agents, language: 'markdown', code: agentsMarkdown(ctx) })
  }
  if (selected.llms) {
    files.push({ path: ARTIFACT_PATHS.llms, language: 'text', code: llmsText(ctx, selected) })
  }
  if (selected.catalog) {
    files.push({ path: ARTIFACT_PATHS.catalog, language: 'json', code: catalogJson(ctx) })
  }
  if (selected.source) {
    files.push({ path: ARTIFACT_PATHS.source, language: 'text', code: mildaSource(ctx) })
  }
  return files
}
