import { describe, expect, it } from 'vitest'
import { installInstructions, npmrcSnippet, packageManifest } from './index'
import type { PackageSpec } from './types'

// ─── Destination-shaped manifest + install instructions (proposal 0020) ────────
// The rules encoded here are registry rules, not preferences: getting them wrong
// produces packages that publish but cannot be installed, which is the failure mode
// this whole surface exists to prevent.

const spec: PackageSpec = {
  name: '@acme/ds',
  version: '1.2.3',
  files: [{ path: 'src/index.ts', language: 'ts', code: 'export {}' }],
  entry: 'src/index.ts',
  dependencies: {},
  peerDependencies: { react: '>=18' },
}

describe('packageManifest', () => {
  it('omits repository and publishConfig when no destination metadata is given', () => {
    const manifest = packageManifest(spec)
    expect(manifest.repository).toBeUndefined()
    expect(manifest.publishConfig).toBeUndefined()
  })

  it('turns owner/repo into a git repository field (GitHub Packages needs it to link the package)', () => {
    const manifest = packageManifest(spec, { repository: 'acme/design-system' })
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/acme/design-system.git',
    })
  })

  it('passes an already-qualified repository URL through untouched', () => {
    const manifest = packageManifest(spec, { repository: 'https://gitlab.com/acme/ds' })
    expect(manifest.repository).toBe('https://gitlab.com/acme/ds')
  })

  it('pins the publish target when the destination has one', () => {
    const manifest = packageManifest(spec, { registry: 'https://npm.pkg.github.com' })
    expect(manifest.publishConfig).toEqual({ registry: 'https://npm.pkg.github.com' })
  })

  it('carries destination metadata on the css-only theme package too', () => {
    const theme: PackageSpec = { ...spec, name: '@acme/ds-theme', cssOnly: true }
    const manifest = packageManifest(theme, { repository: 'acme/ds' })
    expect(manifest.repository).toBeDefined()
    expect(manifest.files).toEqual(['theme.css'])
  })
})

describe('installInstructions', () => {
  it('is a bare npm install on public npm - nothing to configure', () => {
    const out = installInstructions(spec, 'https://registry.npmjs.org', {
      kind: 'npm',
      registry: 'https://registry.npmjs.org',
    })
    expect(out.command).toBe('npm install @acme/ds@1.2.3')
    expect(out.npmrc).toBeNull()
    expect(out.authenticatedRead).toBe(false)
  })

  it('tells GitHub Packages consumers they need a token, even for a public package', () => {
    const out = installInstructions(spec, 'https://npm.pkg.github.com', {
      kind: 'github',
      registry: 'https://npm.pkg.github.com',
    })
    expect(out.authenticatedRead).toBe(true)
    expect(out.npmrc).toContain('@acme:registry=https://npm.pkg.github.com')
    expect(out.npmrc).toContain('//npm.pkg.github.com/:_authToken=')
  })

  it('routes the scope for a custom registry without claiming auth is required', () => {
    const out = installInstructions(spec, 'https://repo.example.com/npm', {
      kind: 'custom',
      registry: 'https://repo.example.com/npm',
    })
    expect(out.npmrc).toBe('@acme:registry=https://repo.example.com/npm')
    expect(out.authenticatedRead).toBe(false)
  })

  it('keeps the hosted registry copy-paste one-liner (it resolves anonymously today)', () => {
    const out = installInstructions(spec, 'https://registry.milda.dev', { kind: 'milda' })
    expect(out.command).toBe('npm install @acme/ds@1.2.3 --registry https://registry.milda.dev')
    expect(out.npmrc).toBe('@acme:registry=https://registry.milda.dev')
  })

  it('never inlines a token into the snippet', () => {
    const snippet = npmrcSnippet('@acme', 'https://npm.pkg.github.com', true)
    expect(snippet).toContain('${NPM_TOKEN}')
    expect(snippet).not.toMatch(/ghp_|npm_/)
  })
})
