import type { ComponentIR, DocumentFoundations } from '@mildastudio/core'
import type { GeneratedFile, Target } from '../../index'
import { buildTokenExport, type TokenExport } from './model'
import { toFigmaVariables } from './variables'
import { toDtcg } from './dtcg'
import { buildComponentScene, type FigmaSceneNode } from './scene'
import { buildComponentProperties, type FigmaComponentProperty } from './properties'
import { buildVariantMatrix } from './variants'

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

// ─── Component export (proposal 0010 phase 2) ────────────────────────────────
// milda.figma.components/v1 - one JSON document for the whole library, so the
// plugin can resolve `instance` node cross-references (componentNames) in one
// pass. Kept as a dedicated function rather than a generic `Target` (see
// packages/generate/index.ts) because its output isn't per-language source
// files - same precedent as `figmaFoundationsExport` above.

export interface FigmaComponentVariantExport {
  name: string
  root: FigmaSceneNode
}

export interface FigmaComponentExport {
  id: string
  name: string
  properties: FigmaComponentProperty[]
  variants: FigmaComponentVariantExport[]
}

export interface FigmaComponentsDocument {
  $schema: 'milda.figma.components/v1'
  // componentId → exported Figma component name, so an `instance` node's
  // `componentRef` (an IR component id) can be resolved to the Component Set the
  // plugin already created in this same import pass.
  componentNames: Record<string, string>
  components: FigmaComponentExport[]
}

export interface FigmaComponentExportOptions {
  maxVariantsPerComponent?: number
  assets?: Record<string, { url?: string }>
}

export interface FigmaComponentExportResult {
  files: GeneratedFile[]
  skipped: string[]
}

export function figmaComponentExport(
  // id → IR, same convention as the React target's `EmitOptions.componentsById`
  // (packages/generate/targets/web/react/emit.ts) - the id is what `instance` nodes'
  // `ComponentInstance.componentId` actually references (a pure `ComponentIR` has
  // no id of its own; the editor layer adds it).
  componentsById: Record<string, ComponentIR>,
  foundations: DocumentFoundations,
  options: FigmaComponentExportOptions = {},
): FigmaComponentExportResult {
  const skipped: string[] = []
  const componentNames = Object.fromEntries(
    Object.entries(componentsById).map(([id, ir]) => [id, ir.name]),
  )

  const exported: FigmaComponentExport[] = Object.entries(componentsById).map(([id, ir]) => {
    const { combos, skipped: variantSkipped } = buildVariantMatrix(ir, {
      maxCombos: options.maxVariantsPerComponent,
    })
    for (const reason of variantSkipped) skipped.push(`${ir.name}: ${reason}`)

    const variants: FigmaComponentVariantExport[] = combos.map((combo) => {
      const { root, skipped: sceneSkipped } = buildComponentScene(
        ir,
        foundations,
        combo,
        options.assets,
      )
      for (const reason of sceneSkipped) skipped.push(`${ir.name} [${combo.name}]: ${reason}`)
      return { name: combo.name, root }
    })

    return {
      id,
      name: ir.name,
      properties: buildComponentProperties(ir.contract, ir.structure.nodes),
      variants,
    }
  })

  const doc: FigmaComponentsDocument = {
    $schema: 'milda.figma.components/v1',
    componentNames,
    components: exported,
  }

  return {
    files: [
      {
        path: 'figma-components.json',
        language: 'json',
        code: `${JSON.stringify(doc, null, 2)}\n`,
      },
    ],
    skipped,
  }
}

// ─── The Figma target, at the seam (proposal 0045 phase 4) ───────────────────
// The two functions above stay: they are the Figma-shaped API, and the Studio's export
// route calls them directly with the format and variant limits it wants. This adapter is
// what makes Figma a `Target` alongside React, which is the thing phase 4 exists to prove.
//
// It is `library` granularity because a Figma file IS one document - `figma-components.json`
// holds every component set, so there is no smaller unit to emit. That is not a limitation
// to work around; it is what the target is, and the interface now says so rather than
// pretending Figma is React with a different printer.
//
// `skipped` is the other half. This target is honestly lossy - no elevation effects, no
// font-weight loading, no focus ring - and proposal 0010's doctrine is to log that rather
// than fake it. Both underlying functions already produce the list; before phase 4 it had
// nowhere to go once you went through the seam.

export const figmaTarget: Target = {
  name: 'figma',
  granularity: 'library',
  emitDocument(doc, options) {
    const opts = (options ?? {}) as FigmaComponentExportOptions & { format?: FigmaExportFormat }
    const files: GeneratedFile[] = []
    const skipped: string[] = []

    if (doc.foundations) {
      const tokens = figmaFoundationsExport(doc.foundations, opts.format ?? 'both')
      files.push(...tokens.files)
      // The token export names what it dropped per token; the component export names it per
      // component. Prefixed so a reader can tell which half refused.
      for (const s of tokens.skipped) skipped.push(`tokens: ${s.name} (${s.reason})`)
    }

    if (Object.keys(doc.componentsById).length > 0) {
      // Components need foundations to resolve their facets; without them there is nothing
      // honest to draw, so say that rather than emitting unstyled frames.
      if (!doc.foundations) {
        skipped.push('components: no foundations, so no facet resolves to a Figma value')
      } else {
        const components = figmaComponentExport(doc.componentsById, doc.foundations, {
          maxVariantsPerComponent: opts.maxVariantsPerComponent,
          assets: doc.assets,
        })
        files.push(...components.files)
        skipped.push(...components.skipped)
      }
    }

    return { files, skipped }
  },
}
