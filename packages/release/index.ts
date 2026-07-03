import type { PackageSpec } from './types'

export { assemble } from './assemble'
export type { Granularity, ReleaseConfig, PackageSpec, ReleasePlan } from './types'
export type { GeneratedFile } from '@mildastudio/generate'
export type { ComponentIR, DocumentFoundations } from '@mildastudio/core'

export function packageManifest(spec: PackageSpec): Record<string, unknown> {
  if (spec.cssOnly) {
    return {
      name: spec.name,
      version: spec.version,
      private: false,
      exports: { './theme.css': './theme.css' },
      files: ['theme.css'],
    }
  }

  const shipsTheme = spec.files.some((f) => f.path === 'theme.css')
  const exportsMap: Record<string, unknown> = {
    '.': {
      types: './dist/index.d.ts',
      import: './dist/index.js',
      require: './dist/index.cjs',
    },
  }
  if (shipsTheme) exportsMap['./theme.css'] = './theme.css'

  return {
    name: spec.name,
    version: spec.version,
    private: false,
    type: 'module',
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: exportsMap,
    files: shipsTheme ? ['dist', 'theme.css'] : ['dist'],
    dependencies: spec.dependencies,
    peerDependencies: spec.peerDependencies,
  }
}

export function installCommand(spec: PackageSpec, registry?: string): string {
  const reg = registry ? ` --registry ${registry}` : ''
  return `npm install ${spec.name}@${spec.version}${reg}`
}
