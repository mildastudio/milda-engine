import { describe, expect, it } from 'vitest'
import { compareVersions, distTagFor, majorOf, movesLatestBackwards } from './disttag'

// ─── The dist-tag rule (proposal 0040, blocker 5) ─────────────────────────────
// This exists to stop one specific, silent, consumer-facing failure:
//
//   2.0.0 is out. A consumer stuck on 1.x needs a fix, so 1.2.0 ships. Published with no
//   `--tag`, npm points `latest` at 1.2.0 - so `npm install @acme/ds` now yields the OLD major,
//   and everyone on 2.x who reinstalls is silently downgraded across a breaking boundary.
//
// The rule is small; what matters is that it is the SAME rule in both publish paths (our
// service and the workflow we commit into the author's repository), which is why it lives in
// one module rather than at each call site.

describe('distTagFor', () => {
  it('gives the newest version no tag, so it takes `latest`', () => {
    expect(distTagFor({ version: '2.0.0', latestVersion: '1.9.3' })).toBe(null)
    expect(distTagFor({ version: '1.2.4', latestVersion: '1.2.3' })).toBe(null)
  })

  it('gives the FIRST release no tag', () => {
    // Nothing to be older than.
    expect(distTagFor({ version: '1.0.0', latestVersion: null })).toBe(null)
  })

  it('tags a maintenance version with its own line', () => {
    // The whole point: 1.2.0 after 2.0.0 must not become `latest`.
    expect(distTagFor({ version: '1.2.0', latestVersion: '2.0.0' })).toBe('v1')
    expect(distTagFor({ version: '0.9.1', latestVersion: '1.0.0' })).toBe('v0')
    expect(distTagFor({ version: '2.4.1', latestVersion: '3.1.0' })).toBe('v2')
  })

  it('treats a re-publish of the newest version as `latest`, not as older', () => {
    // A retry after a failed publish is not a maintenance release.
    expect(distTagFor({ version: '2.0.0', latestVersion: '2.0.0' })).toBe(null)
  })

  it('says WHY it is tagging, for a log or a UI', () => {
    expect(movesLatestBackwards({ version: '1.2.0', latestVersion: '2.0.0' })).toBe(true)
    expect(movesLatestBackwards({ version: '2.1.0', latestVersion: '2.0.0' })).toBe(false)
  })
})

describe('compareVersions', () => {
  it('compares numerically, not as strings', () => {
    // The string comparison this replaces would call 1.10.0 older than 1.9.0 and tag it - so a
    // legitimate newest release would be published where nobody installs it by default.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
  })

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0)
  })

  it('reads a major off a version', () => {
    expect(majorOf('12.4.1')).toBe(12)
    expect(majorOf('nonsense')).toBe(0)
  })
})
