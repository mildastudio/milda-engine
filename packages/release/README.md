# @mildastudio/release

**Assembles a publishable package** from a Milda design system - the last stage of
the pipeline.

Given a document's components and foundations, `release` runs the generators and
assembles their output into a coherent, installable artifact (source files, entry
points, and metadata) ready to be published to a registry.

## What's in here

- **assemble** - runs [`@mildastudio/generate`](../generate) across a document's
  components and foundations and lays the results out as a package.
- **types** - the shapes describing a release and its generated files.

## Design invariants

- **Deterministic assembly.** The same document and options produce the same
  package, so releases are reproducible and diffable.
- **Contract-aware.** Pairs with [`@mildastudio/contract`](../contract) so a release can
  carry the right semantic version for the changes it contains.

## Status

`0.x` - unstable until `1.0`. Depends on [`@mildastudio/core`](../core) and
[`@mildastudio/generate`](../generate).

## License

MIT
