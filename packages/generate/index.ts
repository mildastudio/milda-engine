import { defaultFoundations, type ComponentIR, type DocumentFoundations } from '@mildastudio/core'
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
import { figmaTarget } from './targets/figma'
import {
  CALENDAR_CORE_SOURCE,
  TIME_CORE_SOURCE,
  COLOR_CORE_SOURCE,
} from './targets/behavior/calendarSource.generated'

export interface GeneratedFile {
  path: string

  language: string
  code: string
}

// ─── The target seam (proposal 0045 phase 4) ─────────────────────────────────
// This interface had exactly one implementation for its whole life, so it had quietly
// become the shape of the React target rather than the shape of A target. Fitting Figma
// to it is the test the split was for, and it found two things React had no reason to
// need:
//
//   1. Figma's output unit is the LIBRARY, not the component. One Figma document holds
//      every component set, so "emit this component" has no answer there - it is not a
//      smaller version of the same job.
//   2. Figma is LOSSY and says so. Proposal 0010's doctrine is "lossy / deferred: log,
//      don't fake", and it names every elevation facet it cannot translate into a Figma
//      effect. The old interface had nowhere to put that, so the information existed only
//      on a path that bypassed the seam entirely.
//
// Both are now in the interface. React's `skipped` is a claim rather than a formality: the web
// target expresses everything the vocabulary lets the IR say in its RENDERING. What it reports is
// what falls outside that: an interface constraint whose condition has no TypeScript form
// (proposal 0052 §4.1), which the generated component still accepts and the checker enforces
// instead, and a state rule conditioned on a word the language does not know (the read keeps it,
// the style sheet has no selector for it), which is left out rather than applied unconditionally.

export interface TargetOutput {
  files: GeneratedFile[]
  /**
   * What this target could not express, in the author's terms. Empty means "nothing was
   * dropped", so a target that silently discards something is a defect rather than a
   * matter of degree.
   */
  skipped: string[]
}

/** Everything a target needs from a document to emit a whole library. */
export interface TargetDocument {
  // id → IR. The id is what `instance` nodes reference; a bare `ComponentIR` has none.
  componentsById: Record<string, ComponentIR>
  foundations?: DocumentFoundations
  assets?: Record<string, { url?: string }>
}

export interface Target {
  name: string

  /**
   * The unit this target emits in. `component` targets can also be driven one component
   * at a time (see `ComponentTarget`); `library` targets cannot, because their output is
   * a single document.
   */
  granularity: 'component' | 'library'

  /** Emit everything this target produces for one document. */
  emitDocument(doc: TargetDocument, options?: Record<string, unknown>): TargetOutput
}

/**
 * A target that can also emit a single component, plus the shared modules that go beside
 * it. This is the React shape, and what `generate()` drives - it is a capability some
 * targets have, not what being a target means.
 */
export interface ComponentTarget extends Target {
  granularity: 'component'

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

// One component's files and what they could not express. `emit` keeps the files; `emitDocument`
// keeps both, from the same emission.
function emitReactComponent(
  ir: ComponentIR,
  options?: Record<string, unknown>,
): { files: GeneratedFile[]; skipped: string[] } {
  const name = componentName(ir)
  const { tsx, css, skipped } = toComponentFiles(ir, (options ?? {}) as EmitOptions)
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
  return { files, skipped }
}

const reactTarget: ComponentTarget = {
  name: 'react',
  granularity: 'component',
  emit: (ir, options) => emitReactComponent(ir, options).files,
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
  emitDocument: (doc, options) => {
    const files: GeneratedFile[] = [reactTarget.theme(doc.foundations, doc.assets)]
    const iconModule = reactTarget.icons(doc.foundations, doc.assets)
    if (iconModule) files.push(iconModule)
    const components = Object.values(doc.componentsById)
    if (components.some(componentUsesContext)) {
      const ctx = reactTarget.context?.()
      if (ctx) files.push(ctx)
    }
    // The shared modules are emitted once here rather than per component, which is what
    // every caller that loops `emit()` already has to de-duplicate by path.
    const seen = new Set(files.map((f) => f.path))
    const emitOptions = { foundations: doc.foundations ?? defaultFoundations(), ...options }
    const skipped: string[] = []
    for (const ir of components) {
      const out = emitReactComponent(ir, emitOptions)
      skipped.push(...out.skipped)
      for (const file of out.files) {
        if (seen.has(file.path)) continue
        seen.add(file.path)
        files.push(file)
      }
    }
    return { files, skipped }
  },
}

const targets: Record<string, Target> = {
  react: reactTarget,
  figma: figmaTarget,
}

export const TARGETS: string[] = Object.keys(targets)

export function getTarget(name = 'react'): Target {
  const target = targets[name]
  if (!target) throw new Error(`Unknown generate target: ${name}`)
  return target
}

/**
 * A target that can emit one component at a time. Asking a library-granular target for
 * this is a caller error rather than a missing feature, so it throws by name.
 */
export function getComponentTarget(name = 'react'): ComponentTarget {
  const target = getTarget(name)
  if (target.granularity !== 'component') {
    throw new Error(`The ${target.name} target emits a whole library, not one component`)
  }
  return target as ComponentTarget
}

export interface GenerateOptions {
  target?: string
  options?: Record<string, unknown>

  foundations?: DocumentFoundations

  assets?: Record<string, { url?: string }>
}

export function generate(ir: ComponentIR, opts: GenerateOptions = {}): GeneratedFile[] {
  const target = getComponentTarget(opts.target)
  const iconModule = target.icons(opts.foundations, opts.assets)
  const contextModule = componentUsesContext(ir) ? (target.context?.() ?? null) : null
  return [
    target.theme(opts.foundations, opts.assets),
    ...(iconModule ? [iconModule] : []),
    ...(contextModule ? [contextModule] : []),
    // The component reads the token set its theme was written from, defaults included, so a
    // `var()` is emitted only for a custom property that `theme.css` declares. The context
    // groups travel with the foundations: a prop typed by a context group is typed as that
    // group's contexts only when the emitter can see the group, and this is the one road the
    // release, the CLI and the MCP server all take - without it every such prop was `string`.
    ...target.emit(ir, {
      foundations: opts.foundations ?? defaultFoundations(),
      contextGroups: opts.foundations?.contextGroups,
      ...opts.options,
    }),
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
    {
      path: 'index.ts',
      language: 'ts',
      code: `export * from './calendar'\nexport * from './timepicker'\nexport * from './color'\n`,
    },
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
  propIdentifier,
  ROOT_ELEMENT,
  componentUsesContext,
  toComponentSource,
  toComponentStyles,
  toComponentFiles,
  untypedConstraints,
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
// The React binding of a neutral `InteractionKind` (proposal 0050 slice 1). The Studio
// canvas keys its live handlers off the same function that prints the emitted module's
// handler props, so the two cannot disagree about what `dismiss` binds to.
export { reactHandlerProp } from './targets/web/react/interaction'

// The web tier's CSS lowering of the IR (proposal 0045) - the `--ds-*` naming scheme,
// facets/layout as declarations, motion as the `transition` shorthand, the toggle
// controls, and overlay positioning. Exported because the Studio canvas realizes the SAME
// declarations the generator emits; a second implementation there is exactly the parity
// gap `componentRenderParity` guards.
export {
  colorVarName,
  scaleVarName,
  gradientVarName,
  textStyleVarName,
  easingVarName,
  cssVarRef,
  BORDER_SIDE_PROPS,
  FACET_DEFAULTS,
  baselineDecls,
  facetBaselineDecls,
  facetCssVar,
  facetDecls,
  facetDefaultValue,
  LAYOUT_DEFAULTS,
  WEB_LAYOUT_COVERAGE,
  layoutBaselineDecls,
  layoutDecls,
  layoutVarDecls,
  type LayoutLoweringOptions,
  type LayoutParent,
  motionDecls,
  timingTransitionDecl,
  CHECKBOX_DISABLED_DECLS,
  CHECKBOX_FOCUS_DECLS,
  CHECKBOX_GLYPH_CHECKED_DECLS,
  CHECKBOX_GLYPH_DECLS,
  CHECKBOX_INDICATOR_DECLS,
  CHECKBOX_ROOT_DECLS,
  SR_ONLY_DECLS,
  SWITCH_THUMB_CHECKED_DECLS,
  SWITCH_THUMB_DECLS,
  SWITCH_TRACK_DECLS,
  controlTransitionProps,
  lengthCss,
  anchorDecls,
  backdropDecls,
  surfacePositionDecls,
  makeFacetResolver,
  makeSizeResolver,
  INTERACTION_DOM_EVENT,
} from './targets/web/_shared'
export type { Anchoring, StyleDecl } from './targets/web/_shared'

export { figmaFoundationsExport, figmaComponentExport, figmaTarget } from './targets/figma'
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
