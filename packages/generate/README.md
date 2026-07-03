# @mildastudio/generate

The **generators** — they lower a Milda component IR and its foundations into
concrete output for a specific target.

This is where platform-specific decisions live, and only here. The language and
IR stay neutral; each target is responsible for realizing that neutral model in
its own idiom.

## Targets

- **react** (`targets/react/*`) — emits React components (`emit`) and the theme
  wiring (`theme`), including real interaction behavior and native semantics.
- **css** (`targets/css/*`) — emits stylesheets from resolved facets and tokens.
- **figma** (`targets/figma/*`) — emits Figma Variables and DTCG tokens from the
  foundations (`variables`, `dtcg`, `model`, `color`).

## Design invariants

- **Neutral in, idiomatic out.** A target receives the platform-neutral IR and is
  the *only* place allowed to introduce platform assumptions (tags, pseudo-classes,
  framework APIs).
- **Generated output is a leaf, never a source.** Output is meant to be
  regenerated; the seams for customization live in the IR, so consumers never
  hand-edit what a generator produced.

## Status

`0.x` — unstable until `1.0`. Depends on [`@mildastudio/core`](../core).

## License

MIT
