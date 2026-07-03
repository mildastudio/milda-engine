import type { GeneratedFile } from '@mildastudio/generate'

export type Granularity = 'single' | 'per-component'

export interface ReleaseConfig {
  scope: string

  name: string

  version: string
  granularity: Granularity

  target?: string

  targetOptions?: Record<string, unknown>

  registry?: string
}

export interface PackageSpec {
  name: string
  version: string

  files: GeneratedFile[]

  entry: string
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>

  cssOnly?: boolean
}

export interface ReleasePlan {
  packages: PackageSpec[]
}
