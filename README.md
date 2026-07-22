# milda-engine

The **Milda engine** - the open-source packages that turn a Milda design-system
description into a versioned, publishable component library. Where
[`@mildastudio/milda`](https://github.com/mildastudio/milda-lang) is the
platform-neutral *language*, this repo is the *machinery* that operates on it:
the working IR, contract versioning, the generators, and the release pipeline.

> This repository is the public, open-source mirror of the `core`, `contract`,
> `generate`, and `release` packages from the Milda monorepo, which stays the
> single source of truth. See [milda.dev](https://milda.dev) for the product and
> the full documentation.

## Packages

| Package | What it does |
| --- | --- |
| [`@mildastudio/core`](packages/core) | The component intermediate representation (IR) and its pure semantics - structure, contract, behavior lowering, foundations. |
| [`@mildastudio/contract`](packages/contract) | Contract digest, diff, and variance - hashes a component's public surface and classifies each change to drive semver. |
| [`@mildastudio/generate`](packages/generate) | The generators - lower the neutral IR into concrete targets (React, CSS, Figma). |
| [`@mildastudio/release`](packages/release) | Assembles a publishable package from a design system by running the generators and laying out the result. |

Every package depends on `@mildastudio/core`, which in turn depends on the
`@mildastudio/milda` language package published from
[milda-lang](https://github.com/mildastudio/milda-lang).

```
@mildastudio/milda  (language, separate repo)
        │
        ▼
@mildastudio/core  ──▶  @mildastudio/contract
        │
        ├──▶  @mildastudio/generate  ──▶  @mildastudio/release
        └───────────────────────────────────┘
```

## Install

Each package is published independently on npm:

```bash
npm install @mildastudio/core
npm install @mildastudio/contract
npm install @mildastudio/generate
npm install @mildastudio/release
```

## Design invariants

- **The IR is the contract.** A component's public surface is expressed as data,
  so it can be digested, diffed, and versioned rather than inferred from
  generated code.
- **Neutral in, idiomatic out.** The IR stays platform-neutral; a generator is
  the only place allowed to introduce platform assumptions (tags, pseudo-classes,
  framework APIs).
- **Generated output is a leaf, never a source.** Output is meant to be
  regenerated; the seams for customization live in the IR, so consumers never
  hand-edit what a generator produced.

## Development

```bash
npm install
npm run build          # build all four packages
npm run typecheck
npm run check:containment
```

Because these packages depend on `@mildastudio/milda` from npm, a local
`npm install` needs that package to be published first (see the publish order in
the monorepo's OSS-mirror notes).

## Status

`0.x` - unstable until `1.0`.

## License

MIT
