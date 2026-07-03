import type { ComponentIR, DocumentFoundations, SharedType } from '@mildastudio/core'
import { componentName, getTarget, type GeneratedFile } from '@mildastudio/generate'
import type { PackageSpec, ReleaseConfig, ReleasePlan } from './types'

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

  const target = getTarget(config.target)
  const theme = target.theme(foundations, assets)

  const iconModule = target.icons(foundations, assets)
  const root = rootPackageName(config)

  const componentsById = Object.fromEntries(
    components.map((c) => [(c as { id?: string }).id ?? componentName(c), c]),
  )
  const targetOptions = {
    ...config.targetOptions,
    ...(sharedTypes ? { sharedTypes } : {}),

    ...(foundations?.icons ? { icons: foundations.icons } : {}),
    ...(assets ? { assets } : {}),
    componentsById,
  }

  if (config.granularity === 'single') {
    const emittedByComponent = components.map((c) => ({ c, files: target.emit(c, targetOptions) }))
    const emitted = emittedByComponent.flatMap((e) => e.files)
    const publicFiles = emittedByComponent.filter((e) => !e.c.internal).flatMap((e) => e.files)
    const shared = iconModule ? [iconModule] : []
    const pkg: PackageSpec = {
      name: root,
      version: config.version,
      files: [
        theme,
        barrel([...publicFiles, ...shared]),
        ...underSrc(emitted),
        ...underSrc(shared),
      ],
      entry: 'src/index.ts',
      dependencies: {},
      peerDependencies: PEER_DEPS,
    }
    return { packages: [pkg] }
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

  const shared = iconModule ? [iconModule] : []

  const componentPkgs: PackageSpec[] = components
    .filter((c) => !c.internal)
    .map((c) => {
      const emitted = target.emit(c, targetOptions)
      return {
        name: `${root}-${kebab(componentName(c))}`,
        version: config.version,
        files: [barrel([...emitted, ...shared]), ...underSrc(emitted), ...underSrc(shared)],
        entry: 'src/index.ts',

        dependencies: { [themePkgName]: config.version },
        peerDependencies: PEER_DEPS,
      }
    })

  return { packages: [themePkg, ...componentPkgs] }
}
