// ─── Which dist-tag a version publishes under (proposal 0040, blocker 5) ──────
// `npm publish` with no `--tag` publishes under `latest`. That is right for the newest version
// and WRONG for every other one, and the failure is silent and consumer-facing:
//
//   2.0.0 is out. A consumer stuck on 1.x needs a fix, so 1.2.0 is released. Without a tag,
//   `latest` now points at 1.2.0 - so every `npm install @acme/ds` gets the OLD major, and the
//   people who were on 2.x and reinstall get silently downgraded across a breaking boundary.
//
// npm's own answer is a dist-tag per maintenance line (`npm publish --tag v1`), which is why
// this is a prerequisite for maintenance releases rather than a nicety: shipping 1.2.0 after
// 2.0.0 is not "possible but untagged", it is actively harmful until this exists.
//
// One rule, one place, because there are two publish paths - our own publish service and the
// workflow we commit into the author's repository - and they must agree. `docs/REGISTRY.md`
// already warned about exactly this trap.

/** Compare two dotted versions. Negative when `a` precedes `b`. Missing parts read as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** The major of a dotted version (`1.2.3` → 1). A prerelease suffix is ignored. */
export const majorOf = (version: string): number => parseInt(version.split('.')[0] ?? '0', 10) || 0

export interface DistTagInput {
  /** The version being published. */
  version: string
  /**
   * The newest version already published for this package, or null/absent when this is the
   * first - or when the caller does not know. Both mean "nothing to be older than", so the
   * version takes `latest`, which is the behaviour every release had before maintenance lines.
   */
  latestVersion?: string | null
}

/**
 * The dist-tag this version must publish under, or null when it should take `latest`
 * (i.e. pass no `--tag` at all).
 *
 * `v<major>` for anything that is not the newest, which is npm's convention for a maintenance
 * line and is what a consumer then installs with `@acme/ds@v1`. A prerelease is not modelled
 * here: this exists to stop `latest` moving backwards, and that is the only decision it makes.
 */
export function distTagFor({ version, latestVersion }: DistTagInput): string | null {
  if (!latestVersion) return null
  if (compareVersions(version, latestVersion) >= 0) return null
  return `v${majorOf(version)}`
}

/**
 * True when publishing this version would move `latest` BACKWARDS if it went out untagged -
 * the condition that makes `--tag` mandatory rather than optional. Kept separate from
 * `distTagFor` so a caller can say WHY it is tagging, in a log or a UI.
 */
export const movesLatestBackwards = (input: DistTagInput): boolean => distTagFor(input) !== null
