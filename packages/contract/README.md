# @mildastudio/contract

Contract **digest, diff, and variance** for Milda components - the layer that
turns "the IR is the contract" into real semantic versioning.

A component's public surface (props, events, slots, types) is hashed into a
stable **digest**; two digests can be **diffed** into a set of changes; and each
change is classified by **variance** (its polarity - is it safe, additive, or
breaking for consumers?). That classification drives automatic semver decisions.

## What's in here

- **digest** - reduces a component's `ComponentIR` contract to a stable,
  order-independent fingerprint.
- **diff** - computes the structural changes between two contract versions.
- **variance** - the polarity rules that map each change to backwards-compatible,
  additive, or breaking, so a release can pick the right semver bump.

## Design invariants

- **Consumers are the reference frame.** Polarity is judged from the point of
  view of code that depends on the component, not the author's intent.
- **Contract, not code.** Versioning is derived from the IR contract, so it stays
  correct regardless of how any target happens to render it.

## Status

`0.x` - unstable until `1.0`. Depends on [`@mildastudio/core`](../core).

## License

MIT
