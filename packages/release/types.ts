import type { GeneratedFile } from '@mildastudio/generate'
import type { ReleaseArtifacts } from './artifacts'

export type Granularity = 'single' | 'per-component'

// ─── Where the bytes go (proposal 0020) ──────────────────────────────────────
// Neutral infrastructure metadata: it says nothing about WHAT is generated, only
// which registry receives it, so it carries no platform-independence risk.
//
//   milda  - the Milda-hosted private registry. The service knows its own URL and
//            authenticates from its environment, so no registry/token here.
//   npm    - registry.npmjs.org, published with the user's own token.
//   github - GitHub Packages (npm.pkg.github.com). Two hard constraints the other
//            kinds don't have: the scope MUST be the repo owner (lowercased), and
//            the manifest MUST carry `repository` or the package is not linked to
//            its repo. Both are enforced upstream (lib/publishing) and realized
//            here via `repository`.
//   custom - any other npm-protocol registry (Artifactory, Nexus, GitLab, Azure
//            Artifacts, Cloudsmith, Gitea, a self-hosted Verdaccio, …).
export type ReleaseDestinationKind = 'milda' | 'npm' | 'github' | 'custom'

export interface ReleaseDestination {
  kind: ReleaseDestinationKind
  // Where `npm publish` pushes and (for external kinds) the origin consumers
  // install from. Omitted on `milda`: the service publishes over its own loopback
  // and shows its own public origin instead.
  registry?: string
  // `owner/repo`, emitted as the package.json `repository` field. Required by
  // GitHub Packages to link the package to a repository; optional elsewhere.
  repository?: string
  // npm only: a SCOPED package defaults to `restricted`, which a free npm account
  // cannot publish (402). Defaults to `public`; `restricted` is for authors with a
  // paid npm org who want the package private.
  access?: 'public' | 'restricted'
}

export interface ReleaseConfig {
  scope: string

  name: string

  version: string
  granularity: Granularity

  target?: string

  targetOptions?: Record<string, unknown>

  registry?: string

  // Absent ⇒ the Milda-hosted registry (the pre-0020 behaviour), so older callers
  // and the example release script keep working unchanged.
  destination?: ReleaseDestination

  // Which reader-facing artifacts the package carries (DESIGN.md, AGENTS.md, …).
  // A PARTIAL: an absent flag takes DEFAULT_ARTIFACTS, so a caller that says nothing
  // gets the default set rather than an empty one.
  artifacts?: Partial<ReleaseArtifacts>
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
