import type { PackageSpec, ReleaseDestination } from './types'
import { installCommand, isPublicNpm } from './install'

export { assemble } from './assemble'
// What the package carries for a reader that is not a human (DESIGN.md, AGENTS.md, …).
export {
  ARTIFACT_INFO,
  ARTIFACT_PATHS,
  DEFAULT_ARTIFACTS,
  agentsMarkdown,
  artifactFiles,
  catalogJson,
  designMarkdown,
  llmsText,
  mildaSource,
  resolveArtifacts,
} from './artifacts'
export type { ArtifactContext, ReleaseArtifacts } from './artifacts'
export {
  componentMarkdown,
  describeComponent,
  // How the system is used (proposal 0052 §8) - the one place a surface reads rules from.
  describeRules,
  describeTokens,
  rulesMarkdown,
  rulesNaming,
  tokenValueSummary,
  tokensMarkdown,
} from './describe'
export type {
  DescribedComponent,
  DescribedConstraint,
  DescribedEvent,
  DescribedProp,
  DescribedSlot,
  DescribedToken,
} from './describe'
// Which dist-tag a version publishes under (proposal 0040 blocker 5). One rule, shared by our
// own publish service and by the workflow we commit into an author's repository, because
// `latest` moving backwards is a consumer-facing failure and the two paths must not disagree.
export { compareVersions, distTagFor, majorOf, movesLatestBackwards } from './disttag'
export type { DistTagInput } from './disttag'
export type {
  Granularity,
  ReleaseConfig,
  ReleaseDestination,
  ReleaseDestinationKind,
  PackageSpec,
  ReleasePlan,
} from './types'
export type { GeneratedFile } from '@mildastudio/generate'
export type { ComponentIR, DocumentFoundations } from '@mildastudio/core'

// Registry-facing metadata a destination contributes to the published manifest.
// Kept separate from PackageSpec: the spec is what the generator produced, this is
// where it is going.
export interface ManifestMeta {
  // `owner/repo` → a package.json `repository` field. GitHub Packages REQUIRES it
  // to link the published package to its repository; npm merely shows it.
  repository?: string
  // Pinned publish target, mirrored into `publishConfig.registry`. Belt-and-braces
  // next to `npm publish --registry`: it also makes a re-publish from the ejected
  // source go to the same place.
  registry?: string
}

// ─── What npm actually packs ─────────────────────────────────────────────────
// `files` is an allowlist: once it is set, anything not matched by it (or on npm's own
// always-included list - package.json, README, LICENSE, main) is silently absent from
// the tarball. Root-level documents we generate - NOTICE.md, DESIGN.md, AGENTS.md,
// llms.txt - are on neither list, so they have to be named or the package ships without
// the very files that explain it.
//
// Derived from the spec rather than hard-coded, so a new root-level artifact is carried
// by construction and cannot be forgotten here.
function rootDocs(spec: PackageSpec): string[] {
  return spec.files
    .filter((f) => !f.path.includes('/') && f.path !== 'theme.css')
    .map((f) => f.path)
}

// The `repository` field npm understands, from a bare `owner/repo`. Anything that
// already looks like a URL is passed through untouched.
function repositoryField(repository: string): Record<string, unknown> | string {
  const trimmed = repository.trim()
  if (!trimmed) return ''
  if (/^(https?:|git[@+])/i.test(trimmed)) return trimmed
  return { type: 'git', url: `git+https://github.com/${trimmed}.git` }
}

export function packageManifest(spec: PackageSpec, meta?: ManifestMeta): Record<string, unknown> {
  // Destination-contributed fields, appended to whichever manifest shape we build.
  const extra: Record<string, unknown> = {}
  if (meta?.repository?.trim()) extra.repository = repositoryField(meta.repository)
  if (meta?.registry) extra.publishConfig = { registry: meta.registry }

  if (spec.cssOnly) {
    return {
      name: spec.name,
      version: spec.version,
      private: false,
      exports: { './theme.css': './theme.css' },
      files: ['theme.css', ...rootDocs(spec)],
      ...extra,
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
    files: [...(shipsTheme ? ['dist', 'theme.css'] : ['dist']), ...rootDocs(spec)],
    dependencies: spec.dependencies,
    peerDependencies: spec.peerDependencies,
    ...extra,
  }
}

// ─── The SOURCE package manifest (ejected / committed trees) ─────────────────
// `packageManifest` above describes a package whose dist/ is already built (what
// the registry service publishes). This one describes the same package shipped as
// SOURCE: main/module/types still point at dist/, but the tree carries src/ and a
// `build` script that produces it, so the consumer (or a CI job) can build it.
//
// Two callers share it, and they must agree byte-for-byte: the "eject to source"
// zip download, and the tree Milda commits into a user's repository for the
// publish-from-your-own-CI path (proposal 0020 §12). The `repository` field is not
// cosmetic there: GitHub Packages needs it to link the package to its repo, and npm
// trusted publishing requires it to MATCH the repo the workflow runs in.
export function sourcePackageManifest(
  spec: PackageSpec,
  meta?: ManifestMeta,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {}
  if (meta?.repository?.trim()) extra.repository = repositoryField(meta.repository)
  if (meta?.registry) extra.publishConfig = { registry: meta.registry }

  if (spec.cssOnly) {
    return {
      name: spec.name,
      version: spec.version,
      private: false,
      exports: { './theme.css': './theme.css' },
      files: ['theme.css', ...rootDocs(spec)],
      ...extra,
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
    // Source is the source of truth; dist is produced by `npm run build`.
    source: spec.entry || 'src/index.ts',
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    exports: exportsMap,
    files: [...(shipsTheme ? ['dist', 'src', 'theme.css'] : ['dist', 'src']), ...rootDocs(spec)],
    scripts: {
      build: 'tsup src/index.ts --format esm,cjs --dts --external react,react-dom',
    },
    dependencies: spec.dependencies,
    peerDependencies: spec.peerDependencies,
    devDependencies: {
      '@types/react': '>=18',
      tsup: '^8',
      typescript: '^5',
    },
    ...extra,
  }
}

export { installCommand } from './install'

// ─── What a consumer has to do to install (per destination) ───────────────────
// A bare `npm install` is only the whole story on public npm. Everywhere else the
// scope has to be routed at the registry, and on the two authenticated-read
// destinations (our private registry, and GitHub Packages even for PUBLIC
// packages) a token is required to install at all. `.npmrc` is the honest answer
// there, so we hand it to the user instead of a command that will 404 for their
// team.
export interface InstallInstructions {
  command: string
  // A `.npmrc` snippet to add to the consuming project; null when none is needed.
  npmrc: string | null
  // Whether installing requires a token (⇒ the snippet carries an auth line).
  authenticatedRead: boolean
}

// Scope-routing + optional auth lines for a registry, as an .npmrc snippet. The
// token is never inlined - it references an env var the consumer supplies.
export function npmrcSnippet(scope: string, registry: string, authenticated: boolean): string {
  const bare = scope.replace(/^@+/, '')
  const host = registry.replace(/^https?:/, '').replace(/\/$/, '')
  const lines = [`@${bare}:registry=${registry.replace(/\/$/, '')}`]
  if (authenticated) lines.push(`${host}/:_authToken=\${NPM_TOKEN}`)
  return lines.join('\n')
}

export function installInstructions(
  spec: PackageSpec,
  registry: string | undefined,
  destination?: ReleaseDestination,
): InstallInstructions {
  const kind = destination?.kind ?? 'milda'
  // GitHub Packages' npm registry has NO anonymous read - a token is required even
  // for a public package. That is the one destination where we must say so, or the
  // author ships an install command their own team cannot run.
  //
  // The Milda-hosted registry is anonymous-read TODAY (the dev Verdaccio config);
  // it becomes token-gated with 0020 slice 2/3, at which point it joins `github`
  // here and the copy follows automatically.
  const authenticatedRead = kind === 'github'
  const scope = spec.name.startsWith('@') ? (spec.name.split('/')[0] as string) : ''
  const snippet = scope && registry ? npmrcSnippet(scope, registry, authenticatedRead) : null

  // Public npm is every client's default: nothing to route, nothing to configure.
  if (kind === 'npm' && isPublicNpm(registry)) {
    return { command: `npm install ${spec.name}@${spec.version}`, npmrc: null, authenticatedRead }
  }
  // The hosted registry keeps its copy-paste one-liner (it resolves anonymously
  // today), with the scope-routing snippet as the durable form.
  if (kind === 'milda') {
    return { command: installCommand(spec, registry), npmrc: snippet, authenticatedRead }
  }
  return { command: `npm install ${spec.name}@${spec.version}`, npmrc: snippet, authenticatedRead }
}

export { noticeFile, usedIconSets } from './notice'
