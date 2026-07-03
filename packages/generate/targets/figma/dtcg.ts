import type { ResolvedTextStyle } from '@mildastudio/core'
import type { ExportValue, ExportVariable, TokenExport } from './model'

interface DtcgToken {
  $type: string
  $value: unknown
  $description?: string
  $extensions?: Record<string, unknown>
}

function pathOf(name: string): [string, string] {
  const slash = name.indexOf('/')
  return slash === -1 ? ['', name] : [name.slice(0, slash), name.slice(slash + 1)]
}

function typographyValue(ts: ResolvedTextStyle): Record<string, string> {
  const out: Record<string, string> = {}
  if (ts.fontFamily) out.fontFamily = ts.fontFamily
  if (ts.fontSize != null) out.fontSize = `${ts.fontSize}px`
  if (ts.fontWeight != null) out.fontWeight = ts.fontWeight
  if (ts.lineHeight != null) out.lineHeight = ts.lineHeight
  if (ts.letterSpacing != null) out.letterSpacing = ts.letterSpacing
  return out
}

function dtcgValue(value: ExportValue): unknown {
  switch (value.kind) {
    case 'alias':
      return `{${value.ref.name.replace('/', '.')}}`
    case 'color':
      return value.hex
    case 'number':
      return value.css
    case 'string':
      return value.value
    case 'composite':
      if (value.dtcgType === 'typography')
        return typographyValue(value.dtcgValue as ResolvedTextStyle)

      return value.css
  }
}

function tokenNode(v: ExportVariable, modes: TokenExport['modes']): DtcgToken {
  const defaultMode = modes[0].id
  const node: DtcgToken = {
    $type: v.dtcgType,
    $value: dtcgValue(v.byMode[defaultMode]),
  }
  if (v.description) node.$description = v.description

  if (modes.length > 1) {
    const serialized = Object.fromEntries(modes.map((m) => [m.id, dtcgValue(v.byMode[m.id])]))
    const distinct = new Set(modes.map((m) => JSON.stringify(serialized[m.id])))
    if (distinct.size > 1) node.$extensions = { 'com.milda.modes': serialized }
  }
  return node
}

export function toDtcg(exp: TokenExport): Record<string, unknown> {
  const doc: Record<string, Record<string, DtcgToken>> = {}

  for (const collection of exp.collections) {
    for (const v of collection.variables) {
      const [group, leaf] = pathOf(v.name)
      ;(doc[group] ??= {})[leaf] = tokenNode(v, exp.modes)
    }
  }
  return doc
}
