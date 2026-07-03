import type { DocumentFoundations } from '@mildastudio/core'
import type { GeneratedFile } from '../../index'
import { buildTokenExport, type TokenExport } from './model'
import { toFigmaVariables } from './variables'
import { toDtcg } from './dtcg'

export type FigmaExportFormat = 'variables' | 'dtcg' | 'both'

export interface FigmaExportResult {
  files: GeneratedFile[]

  skipped: TokenExport['skipped']
}

export function figmaFoundationsExport(
  foundations: DocumentFoundations,
  format: FigmaExportFormat = 'both',
): FigmaExportResult {
  const exp = buildTokenExport(foundations)
  const files: GeneratedFile[] = []

  if (format === 'variables' || format === 'both') {
    files.push({
      path: 'figma-variables.json',
      language: 'json',
      code: `${JSON.stringify(toFigmaVariables(exp), null, 2)}\n`,
    })
  }
  if (format === 'dtcg' || format === 'both') {
    files.push({
      path: 'tokens.dtcg.json',
      language: 'json',
      code: `${JSON.stringify(toDtcg(exp), null, 2)}\n`,
    })
  }

  return { files, skipped: exp.skipped }
}

export { buildTokenExport } from './model'
export type { TokenExport } from './model'
