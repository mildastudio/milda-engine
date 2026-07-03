import type { ComponentIR, DocumentFoundations } from '@mildastudio/core'
import {
  componentName,
  resolveTag,
  toComponentFiles,
  toIconModule,
  type EmitOptions,
} from './targets/react/emit'
import { themeCss } from './targets/react/theme'

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
}

const reactTarget: Target = {
  name: 'react',
  emit: (ir, options) => {
    const name = componentName(ir)
    const { tsx, css } = toComponentFiles(ir, (options ?? {}) as EmitOptions)
    const files: GeneratedFile[] = [{ path: `${name}.tsx`, language: 'tsx', code: tsx }]

    if (css.trim()) files.push({ path: `${name}.module.css`, language: 'css', code: css })
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
  return [
    target.theme(opts.foundations, opts.assets),
    ...(iconModule ? [iconModule] : []),
    ...target.emit(ir, opts.options),
  ]
}

export {
  resolveTag,
  componentName,
  toComponentSource,
  toComponentStyles,
  toComponentFiles,
  toIconModule,
} from './targets/react/emit'

export {
  SEALED_SURFACE,
  resolveSurface,
  type ReactSurface,
  type EmitOptions,
} from './targets/react/emit'
export { themeCss } from './targets/react/theme'

export { figmaFoundationsExport } from './targets/figma'
export type { FigmaExportFormat, FigmaExportResult } from './targets/figma'

export { documentToDsl } from './targets/dsl/emit'
export type { DslDocumentInput } from './targets/dsl/emit'
export { foundationsToIr, componentToIr, documentToIr } from './targets/dsl/toIr'
export type { FoundationsToIrResult, ComponentToIrResult, DocumentToIrResult } from './targets/dsl/toIr'
