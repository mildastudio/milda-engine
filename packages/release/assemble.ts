import {
  defaultFoundations,
  type ComponentIR,
  type DocumentFoundations,
  type SharedType,
} from '@mildastudio/core'
import {
  componentName,
  componentUsesContext,
  getComponentTarget,
  type GeneratedFile,
} from '@mildastudio/generate'
import type { PackageSpec, ReleaseConfig, ReleasePlan } from './types'
import { noticeFile } from './notice'
import { artifactFiles, type ArtifactContext } from './artifacts'
import { installCommand } from './install'

const PEER_DEPS: Record<string, string> = { react: '>=18', 'react-dom': '>=18' }

function normalizeScope(scope: string): string {
  return scope.replace(/^@+/, '').trim()
}

function rootPackageName(config: ReleaseConfig): string {
  return `@${normalizeScope(config.scope)}/${config.name}`
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

const moduleBase = (path: string): string => path.replace(/\.[^./]+$/, '')

function barrel(files: GeneratedFile[]): GeneratedFile {
  const lines = files
    .filter((f) => f.language !== 'css')
    .map((f) => `export * from './${moduleBase(f.path)}'`)
  return { path: 'src/index.ts', language: 'ts', code: `${lines.join('\n')}\n` }
}

const underSrc = (files: GeneratedFile[]): GeneratedFile[] =>
  files.map((f) => ({ ...f, path: `src/${f.path}` }))

export function assemble(
  components: ComponentIR[],
  config: ReleaseConfig,
  foundations?: DocumentFoundations,
  sharedTypes?: SharedType[],

  assets?: Record<string, { url?: string }>,
): ReleasePlan {
  if (components.length === 0) {
    throw new Error('Nothing to release: the document has no components.')
  }

  const target = getComponentTarget(config.target)
  const theme = target.theme(foundations, assets)

  const iconModule = target.icons(foundations, assets)
  // Vendored glyphs are redistribution, so the licence travels with them (0019 + the
  // launch backlog's licensing item). null when nothing third-party was vendored.
  const notice = noticeFile(foundations)
  // Shared context runtime (0032 phase 4), emitted once when any component gates on a context.
  const contextModule = components.some(componentUsesContext) ? (target.context?.() ?? null) : null
  const sharedExtra = [iconModule, contextModule].filter((f): f is GeneratedFile => f !== null)
  const root = rootPackageName(config)

  const componentsById = Object.fromEntries(
    components.map((c) => [(c as { id?: string }).id ?? componentName(c), c]),
  )
  const targetOptions = {
    ...config.targetOptions,
    ...(sharedTypes ? { sharedTypes } : {}),

    // The token set the theme is written from, so a component emits a `var()` only for a custom
    // property that theme declares and reads anything else as a literal (proposal 0049).
    foundations: foundations ?? defaultFoundations(),
    ...(foundations?.icons ? { icons: foundations.icons } : {}),
    // The context groups a prop may be TYPED BY (proposal 0001): the emitter needs the group's
    // contexts to type the prop and to set the attribute the theme sheet keys its blocks on.
    ...(foundations?.contextGroups ? { contextGroups: foundations.contextGroups } : {}),
    ...(assets ? { assets } : {}),
    componentsById,
  }

  // The reader-facing artifacts (DESIGN.md, AGENTS.md, …) describe the package they
  // land in, so they are written LAST, over a spec whose files are already decided:
  // whether a theme stylesheet ships is a fact to read, not to predict.
  const withArtifacts = (spec: PackageSpec): PackageSpec => {
    const ctx: ArtifactContext = {
      components,
      foundations,
      sharedTypes,
      config,
      pkg: { name: spec.name, version: spec.version, files: spec.files },
      installCommand: installCommand(spec, config.registry),
    }
    const extra = artifactFiles(ctx, config.artifacts)
    return extra.length ? { ...spec, files: [...spec.files, ...extra] } : spec
  }

  if (config.granularity === 'single') {
    const emittedByComponent = components.map((c) => ({ c, files: target.emit(c, targetOptions) }))
    const emitted = emittedByComponent.flatMap((e) => e.files)
    const publicFiles = emittedByComponent.filter((e) => !e.c.internal).flatMap((e) => e.files)
    const shared = sharedExtra
    const pkg: PackageSpec = {
      name: root,
      version: config.version,
      files: [
        theme,
        ...(notice ? [notice] : []),
        barrel([...publicFiles, ...shared]),
        ...underSrc(emitted),
        ...underSrc(shared),
      ],
      entry: 'src/index.ts',
      dependencies: {},
      peerDependencies: PEER_DEPS,
    }
    return { packages: [withArtifacts(pkg)] }
  }

  const themePkgName = `${root}-theme`
  const themePkg: PackageSpec = {
    name: themePkgName,
    version: config.version,
    files: [theme],
    entry: '',
    dependencies: {},
    peerDependencies: {},
    cssOnly: true,
  }

  const shared = sharedExtra

  const componentPkgs: PackageSpec[] = components
    .filter((c) => !c.internal)
    .map((c) => {
      const emitted = target.emit(c, targetOptions)
      return {
        name: `${root}-${kebab(componentName(c))}`,
        version: config.version,
        // Per package, not once: in 'multi' granularity each component ships on its own,
        // so a consumer installing one of them must get the notice with it.
        files: [
          ...(notice ? [notice] : []),
          barrel([...emitted, ...shared]),
          ...underSrc(emitted),
          ...underSrc(shared),
        ],
        entry: 'src/index.ts',

        dependencies: { [themePkgName]: config.version },
        peerDependencies: PEER_DEPS,
      }
    })

  // Once per SET, not once per component: the description covers the whole design system,
  // so N copies of it across N component packages would be N things to disagree. The theme
  // package is where it goes - every component package depends on it, so a consumer who
  // installed any one of them has it.
  return { packages: [withArtifacts(themePkg), ...componentPkgs] }
}
