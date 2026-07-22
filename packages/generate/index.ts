import type { ComponentIR, DocumentFoundations } from '@mildastudio/core'
import {
  componentName,
  componentUsesContext,
  resolveTag,
  toComponentFiles,
  toIconModule,
  toMildaContextModule,
  type EmitOptions,
} from './targets/web/react/emit'
import { themeCss } from './targets/web/react/theme'
import { CALENDAR_CORE_SOURCE, TIME_CORE_SOURCE, COLOR_CORE_SOURCE } from './targets/behavior/calendarSource.generated'

export interface GeneratedFile {
  path: string

  language: string
  code: string
}

export interface Target {
  name: string

  emit(ir: ComponentIR, options?: Record<string, unknown>): GeneratedFile[]

  theme(foundations?: DocumentFoundations, assets?: Record<string, { url?: string }>): GeneratedFile

  icons(
    foundations?: DocumentFoundations,
    assets?: Record<string, { url?: string }>,
  ): GeneratedFile | null

  // Shared runtime module for context-gated components (0032 phase 4). null when the
  // target has no such channel. Emitted once per package.
  context?(): GeneratedFile | null
}

const reactTarget: Target = {
  name: 'react',
  emit: (ir, options) => {
    const name = componentName(ir)
    const { tsx, css } = toComponentFiles(ir, (options ?? {}) as EmitOptions)
    const files: GeneratedFile[] = [{ path: `${name}.tsx`, language: 'tsx', code: tsx }]

    if (css.trim()) files.push({ path: `${name}.module.css`, language: 'css', code: css })
    // Behavior delivery (proposal 0029 §8.3): 'vendored' (default) copies the core
    // beside the component; 'package' imports it from a shared package instead, so no
    // sibling is emitted (the core ships once via behaviorPackageFiles(), letting a
    // React + Vue microfrontend share the exact same module).
    const delivery = (options as EmitOptions | undefined)?.behaviorDelivery ?? 'vendored'
    if (delivery !== 'package') {
      if (ir.archetype === 'DatePicker') {
        files.push({ path: 'calendar.ts', language: 'ts', code: CALENDAR_CORE_SOURCE })
      }
      if (ir.archetype === 'TimePicker') {
        files.push({ path: 'timepicker.ts', language: 'ts', code: TIME_CORE_SOURCE })
      }
      if (ir.archetype === 'ColorPicker') {
        files.push({ path: 'color.ts', language: 'ts', code: COLOR_CORE_SOURCE })
      }
    }
    return files
  },
  theme: (foundations, assets) => ({
    path: 'theme.css',
    language: 'css',
    code: `${themeCss(foundations, assets)}\n`,
  }),
  icons: (foundations, assets) => {
    const code = toIconModule(foundations?.icons, assets)
    return code ? { path: 'Icon.tsx', language: 'tsx', code } : null
  },
  context: () => ({ path: 'MildaContext.tsx', language: 'tsx', code: toMildaContextModule() }),
}

const targets: Record<string, Target> = {
  react: reactTarget,
}

export const TARGETS: string[] = Object.keys(targets)

export function getTarget(name = 'react'): Target {
  const target = targets[name]
  if (!target) throw new Error(`Unknown generate target: ${name}`)
  return target
}

export interface GenerateOptions {
  target?: string
  options?: Record<string, unknown>

  foundations?: DocumentFoundations

  assets?: Record<string, { url?: string }>
}

export function generate(ir: ComponentIR, opts: GenerateOptions = {}): GeneratedFile[] {
  const target = getTarget(opts.target)
  const iconModule = target.icons(opts.foundations, opts.assets)
  const contextModule = componentUsesContext(ir) ? (target.context?.() ?? null) : null
  return [
    target.theme(opts.foundations, opts.assets),
    ...(iconModule ? [iconModule] : []),
    ...(contextModule ? [contextModule] : []),
    ...target.emit(ir, opts.options),
  ]
}

// The framework-agnostic behavior cores as a standalone package's files (proposal
// 0029 §8.3). In 'package' delivery mode components import from a shared behavior
// package instead of a vendored sibling; a release emits this once so React and Vue
// microfrontends resolve the SAME module (bitwise-identical behavior, no drift).
export function behaviorPackageFiles(): GeneratedFile[] {
  return [
    { path: 'calendar.ts', language: 'ts', code: CALENDAR_CORE_SOURCE },
    { path: 'timepicker.ts', language: 'ts', code: TIME_CORE_SOURCE },
    { path: 'color.ts', language: 'ts', code: COLOR_CORE_SOURCE },
    { path: 'index.ts', language: 'ts', code: `export * from './calendar'\nexport * from './timepicker'\nexport * from './color'\n` },
  ]
}

export { BEHAVIOR_PACKAGE_DEFAULT } from './targets/web/react/emit'

// The framework-agnostic behavior cores (proposal 0029) - re-exported so the Studio
// editor CANVAS renders behavior-heavy archetypes (DatePicker/TimePicker/ColorPicker)
// from the SAME logic the generator emits, closing the generator↔preview parity gap.
export * from './targets/behavior'

export {
  resolveTag,
  componentName,
  componentUsesContext,
  toComponentSource,
  toComponentStyles,
  toComponentFiles,
  toIconModule,
  toMildaContextModule,
} from './targets/web/react/emit'

export {
  SEALED_SURFACE,
  resolveSurface,
  type ReactSurface,
  type EmitOptions,
} from './targets/web/react/emit'
export { themeCss } from './targets/web/react/theme'

export { figmaFoundationsExport, figmaComponentExport } from './targets/figma'
export type {
  FigmaExportFormat,
  FigmaExportResult,
  FigmaComponentExportOptions,
  FigmaComponentExportResult,
  FigmaComponentsDocument,
} from './targets/figma'

export { documentToDsl, componentToDsl } from './targets/dsl/emit'
export type { DslDocumentInput, DslComponentResult, DslNodeRange } from './targets/dsl/emit'
export { foundationsToIr, componentToIr, documentToIr } from './targets/dsl/toIr'
export type {
  FoundationsToIrResult,
  ComponentToIrResult,
  DocumentToIrResult,
  DocumentIrMeta,
} from './targets/dsl/toIr'
