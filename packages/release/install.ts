import type { PackageSpec } from './types'

// ─── How a consumer installs what we published ───────────────────────────────
// Its own module rather than a section of index.ts, because `assemble` needs it too
// (DESIGN.md opens with the install command) and index.ts imports assemble - a cycle
// nobody should have to reason about for three lines of string building.

// The public npm registry - the one origin an install command must NOT spell out,
// since it is already every client's default.
export const PUBLIC_NPM = 'https://registry.npmjs.org'

export function isPublicNpm(registry: string | undefined): boolean {
  return !registry || registry.replace(/\/$/, '') === PUBLIC_NPM
}

export function installCommand(spec: PackageSpec, registry?: string): string {
  const reg = isPublicNpm(registry) ? '' : ` --registry ${registry}`
  return `npm install ${spec.name}@${spec.version}${reg}`
}
