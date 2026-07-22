# @mildastudio/core

The component **intermediate representation (IR)** and its semantics - the layer
every Milda tool operates on between the [`@mildastudio/milda`](../../milda) language and the
generators.

Where the `@mildastudio/milda` package defines the canonical language and prelude, `@mildastudio/core`
is the working model an editor or pipeline manipulates: components, their nodes,
contracts, styling, and behavior, plus the pure operations over them.

## What's in here

- **structure** - the component node tree and the operations on it: `seed`
  (archetype → initial anatomy), `ops` (structural edits), `containment` (which
  nodes may hold which, by content category), `slots`, `instances`, `motion`,
  `states`, `signals`, and `binding`.
- **contract** - the component's public API as data: `types` (the `PropType`
  system), `typeCompat`, and `builtins`.
- **behavior** - lowering of interaction intent: `disclosure`, `lowerControl`
  (e.g. a boolean input → a hidden native control + a styled indicator), and the
  free-behavior shapes.
- **foundations** - resolved design foundations (`typography`, `easing`).
- **docs**, **tokens** - the document/transclusion model and token helpers.

## Design invariants

- **The IR is the contract.** A component's public surface is expressed as data,
  so it can be digested, diffed, and versioned (see
  [`@mildastudio/contract`](../contract)) rather than inferred from generated code.
- **Realization is never the IR.** Native controls, indicator glyphs, and similar
  are produced during lowering/generation; they are never stored in the IR.
- **Extensibility is a declared seam.** The ~20% a fixed vocabulary can't express
  is reached through explicit IR seams (slots, escape hatches), never by editing
  generated output.

## Status

`0.x` - unstable until `1.0`. Depends on [`@mildastudio/milda`](../../milda).

## License

MIT
