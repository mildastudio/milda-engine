import type { ExportValue, TokenExport } from './model'

interface FigmaModeValue {
  type?: 'VARIABLE_ALIAS'
  collection?: string
  name?: string
  color?: { r: number; g: number; b: number; a: number }
  number?: number
  string?: string
}

interface FigmaVariableJson {
  name: string
  type: 'COLOR' | 'FLOAT' | 'STRING'
  description?: string
  valuesByMode: Record<string, FigmaModeValue>
}

interface FigmaCollectionJson {
  id: string
  name: string
  variables: FigmaVariableJson[]
}

export interface FigmaVariablesDocument {
  $schema: 'milda.figma.variables/v1'
  modes: { id: string; name: string }[]
  modeGroup: string | null
  collections: FigmaCollectionJson[]
}

function modeValue(value: ExportValue): FigmaModeValue | null {
  switch (value.kind) {
    case 'alias':
      return { type: 'VARIABLE_ALIAS', collection: value.ref.collection, name: value.ref.name }
    case 'color':
      return { color: value.rgba }
    case 'number':
      return { number: value.value }
    case 'string':
      return { string: value.value }
    case 'composite':
      return null
  }
}

export function toFigmaVariables(exp: TokenExport): FigmaVariablesDocument {
  const collections: FigmaCollectionJson[] = exp.collections
    .map((c) => ({
      id: c.id,
      name: c.name,
      variables: c.variables
        .filter((v) => v.figmaType !== null)
        .map((v): FigmaVariableJson | null => {
          const valuesByMode: Record<string, FigmaModeValue> = {}
          for (const mode of exp.modes) {
            const mv = modeValue(v.byMode[mode.id])
            if (!mv) return null
            valuesByMode[mode.id] = mv
          }
          return {
            name: v.name,
            type: v.figmaType as 'COLOR' | 'FLOAT' | 'STRING',
            ...(v.description ? { description: v.description } : {}),
            valuesByMode,
          }
        })
        .filter((v): v is FigmaVariableJson => v !== null),
    }))
    .filter((c) => c.variables.length > 0)

  return {
    $schema: 'milda.figma.variables/v1',
    modes: exp.modes,
    modeGroup: exp.modeGroupId,
    collections,
  }
}
