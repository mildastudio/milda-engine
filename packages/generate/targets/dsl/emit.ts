// ─── DSL target - emit the Milda surface syntax (.milda) ──────────────────────
// A document-level printer: a whole design system → one human-readable `.milda`
// file in the concrete surface syntax (docs/dsl/GRAMMAR.ebnf, PRELUDE §10). The
// surface is *sugar* over the canonical AST; this walks the editor IR and prints
// that sugar directly.
//
// What it emits, in grammar order:
//   • context-group declarations           (foundations.contextGroups)
//   • foundations { token … }              (layers → typed tokens: raw / alias / structured)
//   • type declarations                     (sharedTypes, minus built-ins)
//   • component declarations                (archetype + props + events + parts)
//
// Fidelity: this is a faithful one-way print of what the editor IR actually holds.
// The IR does NOT store the hand-authored composition algebra (uses/wire/gate) -
// that is implied by a component's `archetype` - so we never fabricate it. Concepts
// the IR carries that have no clean surface form (instances, foreign code, free
// behaviors, motion) degrade to a `#` note rather than breaking the output. Token
// refs are internally consistent: a declaration path and every reference to it
// derive from the same id→path map, so the file resolves against itself even when
// the editor's ids don't match a hand-authored system's path choices.

import type {
  ColorOp,
  ComponentGroup,
  ComponentInstance,
  ComponentIR,
  ComponentNode,
  ComputeValue,
  ContentValue,
  LengthOp,
  DocBlock,
  DocPage,
  DocsFooter,
  DocsSiteMeta,
  ContextGroup,
  DocumentFoundations,
  EventDef,
  EventEmission,
  FontFamily,
  ForeignContent,
  Layer,
  MediaSource,
  NodeA11y,
  NodeBehavior,
  NodeContent,
  NodeMotion,
  NodeRepeat,
  NodeSlot,
  Predicate,
  PropConstraint,
  PropDef,
  PropType,
  PropValue,
  RuleSubject,
  UsageRule,
  SharedType,
  Slot,
  SlotSample,
  StateRule,
  TextStyleValue,
  Token,
  TokenType,
  TokenValue,
  IconLibrary,
} from '@mildastudio/core'
import {
  ALL_STATE_NAMES,
  BORDER_SIDES,
  INSET_EDGE_KEYS,
  formatAxisSize,
  formatPosition,
  parseAxisSize,
  parsePosition,
  predicateFromLegacy,
  BUILTIN_SHARED_TYPES,
  FACETS,
  formatLength,
  isRawValue,
  lengthOf,
  parseLength,
} from '@mildastudio/core'
import type { Asset, AssetFolder, AssetRegistry, LengthValue } from '@mildastudio/milda'
import { MILDA_SURFACE_VERSION, PRELUDE_VERSION, archetypesByName } from '@mildastudio/milda'
import type { CoordEntry } from '@mildastudio/milda'

export type MetaValue = string | number | boolean | Array<string | number | boolean>

export interface DslDocumentInput {
  components: ComponentIR[]
  foundations?: DocumentFoundations
  sharedTypes?: SharedType[]
  meta?: {
    name?: string
    milda?: string
    prelude?: string
    // Document metadata (proposal 0026) - `version`/`description` join the header
    // `meta {}` block; `metadata` carries any extra free-form keys.
    version?: string
    description?: string
    metadata?: Record<string, MetaValue>
  }
  // Library-wide output settings (the document's `output`). These shape the PUBLIC API of
  // the generated components - emission style, sub-component naming, the date/time/colour
  // representations - so a `.milda` that omits them describes a different contract than the
  // one that was published (proposal 0039 §2.3, 0041 §1). They were dropped entirely until
  // now: `documentToDsl` simply had nowhere to put them.
  //
  // Typed structurally rather than as the editor's `OutputSettings`, because this package
  // does not depend on @mildastudio/editor - and it does not need to: every field is a flat
  // scalar, which is exactly what a `meta {}` entry can carry, so this needs no grammar
  // change.
  output?: Record<string, string | number | boolean>
  // ─── The library around the components (proposal 0041) ────────────────────────
  // Organisation, demo scenes, the docs overlay and the asset library: four document
  // fields the printer had nowhere to put, so they were dropped from every export. All
  // four are authored content, which is the whole argument for carrying them.
  componentGroups?: ComponentGroup[]
  examples?: DslExample[]
  docs?: DslDocs
  assets?: AssetRegistry
  // Asset bytes as a `data:` URI, per asset id (0041 §1.2 option 1). Supplied by the
  // caller because fetching bytes is not the printer's job: an export that wants to be
  // self-contained provides them, the git mirror leaves them out and ships the files
  // beside the text. The same format expresses both.
  embedAsset?: (assetId: string) => string | undefined
}

// A demo scene as the printer needs it: a component-shaped tree plus the scene's own
// state. Structural, so the editor's `Example` satisfies it without this package
// depending on the editor.
export interface DslExample {
  name: string
  id?: string
  for?: string
  description?: string
  state?: Record<string, { type: PropType; initial: PropValue }>
  structure?: ComponentIR['structure']
}

// The docs overlay as the printer needs it (structurally core's `DocsModel`).
export interface DslDocs {
  pages: DocPage[]
  site?: DocsSiteMeta
  footer?: DocsFooter
}

// Output settings travel as `output.<field>` keys in the document's `meta {}` block. The
// prefix keeps them identifiable and out of the author's own metadata namespace, and dotted
// keys are already legal (the parser preserves key casing verbatim).
const OUTPUT_PREFIX = 'output.'

// The surface + prelude version defaults live in the language package, beside the rest of
// the closed surface, so the reader and this printer cannot disagree about them.
// `MILDA_VERSION` is the local alias this file has always used.
const MILDA_VERSION = MILDA_SURFACE_VERSION

// The surface the part header belongs to. A document keeps the version it declares, so
// re-exporting an older file does not claim syntax it never used - but every part is printed with
// its header (`part Button: container {`, proposal 0055), which an older reader loses the
// component over. A file that says `milda 0.8` and is written in 0.9 is the one lie the version
// exists to prevent, so a file that PRINTS a part raises an older declared version to this. One
// that prints none (foundations only) is still what it said it was, and keeps it.
const PART_HEADER_SURFACE = '0.9'
const PART_HEADER_LINE = /^\s*part \S+: /

// The same rule for the one-axis and one-edge insets (proposal 0057, surface 0.10). A 0.9 reader
// loses only the statement, not the part, but a file that says 0.9 and prints `inset.inline` is
// still the lie the version exists to prevent.
const INSET_EDGE_SURFACE = '0.10'
const INSET_EDGE_LINE = /^\s*inset\.[a-z-]+ /

// `a` is older than `b`, segment by segment as numbers (`0.10` is newer than `0.9`).
function surfaceOlder(a: string, b: string): boolean {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0
  }
  return false
}

// The newest surface whose syntax the printed lines actually use, or the declared one if it is
// newer still. Ordered newest first; each entry is a version and the line shape that needs it.
const SURFACE_FLOORS: readonly [string, RegExp][] = [
  [INSET_EDGE_SURFACE, INSET_EDGE_LINE],
  [PART_HEADER_SURFACE, PART_HEADER_LINE],
]

function writtenSurface(declared: string | undefined, lines: readonly string[]): string {
  const v = declared ?? MILDA_VERSION
  for (const [floor, line] of SURFACE_FLOORS) {
    if (!surfaceOlder(v, floor)) return v
    if (lines.some((l) => line.test(l))) return floor
  }
  return v
}

// ─── Small text helpers ───────────────────────────────────────────────────────

const INDENT = '  '
const pad = (depth: number) => INDENT.repeat(depth)

// Normalize a free-form name to a single grammar `segment` (ident-ish): lowercase,
// non-alphanumerics collapsed to '-', trimmed. Empty falls back to `fallback`.
function seg(s: string, fallback = 'x'): string {
  const out = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return out || fallback
}

// PascalCase identifier for a component / type name.
function pascal(s: string, fallback = 'Component'): string {
  const parts = s
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const out = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join('')
  return out || fallback
}

// ─── Naming an id that has no declaration to borrow a name from ──────────────
// IR ids are NAMESPACED (`st.accent`, `cg.component`, `ctx.colorscheme.light`). Pascal-casing
// such an id folds the namespace into the surface name (`st.accent` -> `StAccent`), and
// reparsing that name re-namespaces it (`st.staccent`), whose next print is `StStaccent`. It
// accumulated on every pass, so the file was not merely lossy - it was UNSTABLE: exporting an
// unchanged system twice produced two different files (proposal 0041 §1.1a, `prefix`).
//
// Every id -> name fallback therefore goes through the LAST segment only. Where a declaration
// exists its name wins, because the author's casing is authoritative.
const localOf = (id: string) => (id.includes('.') ? id.slice(id.lastIndexOf('.') + 1) : id)

function typeRefName(ref: string, declared?: Map<string, string>): string {
  const name = declared?.get(ref)
  if (name) return pascal(name, name)
  return pascal(localOf(ref), localOf(ref))
}

// Any AUTHORED name: a prop, an event, a token, a token group, a part, or a prop referenced
// by a binding. Names are neutral by contract - an identifier OR kebab-case - and the target
// generator owns the platform casing. `seg()` lowercases, which silently renamed `highContrast`
// to `highcontrast` and `brandColor` to `brandcolor` on export: a rename of a prop is a breaking
// change to every generated component, and a rename of a token breaks every reference to it
// (0041 §1.1a, the `casing` defect). A name that is already a legal identifier is therefore
// emitted verbatim; anything else still normalizes to a kebab segment.
//
// Deliberately NOT used for closed vocabularies (interaction state names) or for id fallbacks,
// where lowercasing is the correct normalization rather than a loss.
// What may be emitted verbatim: a grammar segment that happens to carry capitals. This is
// deliberately WIDER than an identifier - my first version only accepted `[A-Za-z0-9_]`, so a
// name like `None-2` (which the grammar accepts, and which the printer's own uniquifying suffix
// produces) fell through to `seg()` and came back as `none-2`. The fourth appearance of the same
// class: lowercasing is right for an id and wrong for a name.
const SAFE_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*[A-Za-z0-9_]$|^[A-Za-z_]$/
function nameSeg(s: string, fallback = 'x'): string {
  const trimmed = s.trim()
  return SAFE_SEGMENT.test(trimmed) ? trimmed : seg(trimmed, fallback)
}

// A token name that ALREADY contains separators is a path expressed in the name. That is the
// normal shape for a token parsed from a file: the editor keeps hierarchy in `group`, but the
// parser has no groups, so `token radius/xs` arrives as one token NAMED `radius/xs` with
// `group: null`. Flattening that to a single segment renamed it to `radius-xs` on export, and
// the reparse then had a differently-named token. So each segment is named independently.
function namePath(name: string, fallback = 'x'): string {
  const parts = name
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return fallback
  return parts.map((p) => nameSeg(p, fallback)).join('/')
}

// A grammar `string` literal.
const quote = (s: string) => JSON.stringify(s)

// A comment line at `depth`.
const note = (depth: number, text: string) => `${pad(depth)}# ${text}`

// A metadata scalar: a bare identifier when it is one (readable - `status stable`),
// else a quoted string; numbers/booleans bare (proposal 0026).
function metaScalar(v: string | number | boolean): string {
  if (typeof v === 'string') return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(v) ? v : quote(v)
  return String(v)
}
const metaValue = (v: MetaValue): string =>
  Array.isArray(v) ? `[${v.map(metaScalar).join(', ')}]` : metaScalar(v)

// A `meta { key value … }` block from ordered entries.
function emitMetaBlock(entries: Array<[string, MetaValue]>, depth: number): string[] {
  if (entries.length === 0) return []
  const out = [`${pad(depth)}meta {`]
  for (const [k, v] of entries) out.push(`${pad(depth + 1)}${k} ${metaValue(v)}`)
  out.push(`${pad(depth)}}`)
  return out
}

// ─── Token path resolution ──────────────────────────────────────────────────
// Build an id→path map from every token's group ancestry + name, guaranteeing
// uniqueness. Declarations join with '/', references with '.'.

// Token identity in the editor IR is (type, id): the same id (`none`, `md`, …) is
// reused across scales, and refs are type-scoped (a facet's scale IS the target
// token's type). So the index is keyed by `type\0id`, while decl paths share one
// `foundations {}` namespace and are made globally unique.
interface TokenIndex {
  pathByKey: Map<string, string>
  // ─── Hoisted literals, to be printed back inline (proposal 0041) ────────────
  // The surface syntax allows an inline literal inside an alias slot
  // (`alias by ColorScheme { Light -> hex(fcfcfc) }`), but the canonical AST's slots hold
  // only token IDS - so the parser HOISTS each literal into a synthesized token and warns
  // (`inline-literal`). The emitter used to see only those tokens, so it printed them as
  // named declarations with machine-generated names (`inline-color-7`): exporting a system
  // silently GREW its foundations with tokens the author never wrote.
  //
  // Owner decision 2026-07-27: a design system cannot hold an anonymous value, and the file's
  // inline literal is sugar over a token - which is exactly what hoisting implements. So the
  // printer restores the sugar: a hoisted token is not declared, and every reference to it
  // prints its VALUE. Keyed like every other ref (`type` + id), since refs are type-scoped.
  inlined: Map<string, Token>
  // The font library, by id - what a `{ font }` slot names. A family is printed as the RECORD
  // it is (name, generic fallback, where the face comes from) rather than as the token id,
  // because the library is not part of the file's namespace: an id would resolve to nothing on
  // read, and the reader would have no way to rebuild the family it meant.
  fonts: Map<string, FontFamily>
}

// A separator no id or type can contain, so the composite key is unambiguous. Written as
// the ESCAPE `\0` and never as a literal NUL byte: a raw NUL in the source makes git treat
// this whole file as binary, which turns every diff into "Bin 27006 -> 27437 bytes" and
// every merge of it into an all-or-nothing conflict.
const keyOf = (type: string, id: string) => `${type}\0${id}`

// A token the parser synthesized for an inline literal. Two independent markers, because
// either alone is weak: the id namespace (`tok.lit-…`, normalized to `lit-…` in the editor IR)
// and the placeholder name the parser writes instead of a real one.
const HOISTED_ID = /^lit-/
const HOISTED_NAME = /^\(inline .+\)$/
export function isHoistedLiteral(t: { id: string; name: string }): boolean {
  return HOISTED_ID.test(t.id) && HOISTED_NAME.test(t.name)
}

function buildTokenIndex(
  foundations: DocumentFoundations | undefined,
  // Which hoisted tokens may be printed inline (keyed like a ref). Absent ⇒ none, so a
  // single-component export behaves exactly as before.
  inlineable?: Set<string>,
): TokenIndex {
  const pathByKey = new Map<string, string>()
  const inlined = new Map<string, Token>()
  const fonts = new Map<string, FontFamily>()
  const used = new Set<string>()
  if (!foundations) return { pathByKey, inlined, fonts }
  for (const f of foundations.fonts ?? []) fonts.set(f.id, f)

  for (const layer of foundations.layers) {
    const groupName = new Map<string, { name: string; parent: string | null }>()
    for (const g of layer.groups ?? []) groupName.set(g.id, { name: g.name, parent: g.parent })

    const ancestry = (groupId: string | null | undefined): string[] => {
      const chain: string[] = []
      let cur = groupId ?? null
      const guard = new Set<string>()
      while (cur && groupName.has(cur) && !guard.has(cur)) {
        guard.add(cur)
        const g = groupName.get(cur)!
        chain.unshift(nameSeg(g.name))
        cur = g.parent
      }
      return chain
    }

    for (const t of layer.tokens) {
      const key = keyOf(t.type, t.id)
      // A token that will be printed inline gets no declaration path: nothing declares it,
      // and nothing references it by name.
      if (inlineable?.has(key)) {
        inlined.set(key, t)
        continue
      }
      const base = [...ancestry(t.group), namePath(t.name)].join('/')
      let path = base
      let n = 2
      while (used.has(path)) path = `${base}-${n++}`
      used.add(path)
      pathByKey.set(key, path)
    }
  }
  return { pathByKey, inlined, fonts }
}

// The decl path for a token (slashes). Falls back to its normalized name.
function declPath(index: TokenIndex, t: Token): string {
  return index.pathByKey.get(keyOf(t.type, t.id)) ?? namePath(t.name)
}

// A token reference for use inside a value/facet (dotted), resolved against the
// referencing context's `type` (facet scale). Falls back to a dotted form of the
// raw id when the target isn't in the document (dangling ref).
function ref(index: TokenIndex, type: string, id: string): string {
  const path = index.pathByKey.get(keyOf(type, id))
  if (path) return path.replace(/\//g, '.')
  return seg(id).replace(/-/g, '.') || id
}

// ─── Token type mapping (editor TokenType → DSL type name) ────────────────────

// editor TokenType -> the surface keyword. Every value here MUST be a word the parser
// accepts (`TOKEN_TYPE_NAMES`), or the type silently changes on reparse: a missing
// `fontFamily` entry fell through to `seg('fontFamily')` = `fontfamily`, which the parser
// does not know, so the token came back typed `dimension` (proposal 0041 §1.1a). That is a
// SEMANTIC loss, not a rename. The mapping is asserted against the parser's vocabulary in
// document-roundtrip.test.ts so the next gap fails a test instead of corrupting a file.
const TYPE_MAP: Record<string, string> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'radius',
  // `border` is a real AST type that lowers back to the editor's `borderWidth` scale. Mapping it
  // to `dimension` collapsed it into `size`, so a facet whose scale is `borderWidth` could no
  // longer resolve its own token and printed a dotted fallback (proposal 0041 §1.1d).
  borderWidth: 'border',
  fontSize: 'font-size',
  fontFamily: 'font-family',
  fontWeight: 'font-weight',
  // `ratio` is the surface word for a unitless ratio, and it is what the value schema calls
  // this kind (RatioValue). It replaced `number`, which named the value's SHAPE rather than
  // its kind: the parser reads `number` too, so a file exported before this still comes back
  // as a ratio, but nothing writes it any more. Closing the last of 0041 §4 - before the AST
  // gained the `lineHeight` type there was no word at all here, so a line height came back
  // typed `size` and a ratio of `1.2` became `1.2px`.
  lineHeight: 'ratio',
  letterSpacing: 'letter-spacing',
  // `opacity` DOES have a surface keyword, and mapping it to `number` was simply wrong: the
  // token came back mistyped for no reason.
  opacity: 'opacity',
  size: 'dimension',
  elevation: 'elevation',
  duration: 'duration',
  gradient: 'gradient',
  textStyle: 'typography',
  easing: 'easing',
}
const dslType = (t: TokenType): string => TYPE_MAP[t] ?? seg(String(t))

// Exported so the reader (toIr) splits the same namespace the writer used.
export const DSL_OUTPUT_PREFIX = OUTPUT_PREFIX

// Exported for the round-trip test's vocabulary assertion.
export const DSL_TOKEN_TYPE_OUTPUTS: readonly string[] = Object.values(TYPE_MAP)

// The DSL type names whose value is a length literal. Gating on this rather than on
// core's isLengthType keeps the emitter honest about what it is PRINTING, and it must be
// the SURFACE spelling of every type the parser reads as a length (its `LENGTH_AST_TYPES`),
// because a bare number in any of these positions comes back as a length whose unit the
// reader has to guess (it used to guess `rem`). Giving `borderWidth`/`fontSize`/
// `letterSpacing` their own surface words widened the parser's set and left this one
// behind, so those three printed a bare number into a position that now demands a unit -
// `length-unit-required` on our own output. The two sets are asserted equal in
// document-roundtrip.test.ts so the next divergence fails a test instead of a file.
const DSL_LENGTH_TYPES = new Set([
  'spacing',
  'radius',
  'dimension',
  'border',
  'font-size',
  'letter-spacing',
])
const emitsLength = (t: TokenType): boolean => DSL_LENGTH_TYPES.has(dslType(t))

/** Exported for the round-trip test's length-vocabulary assertion. */
export const DSL_LENGTH_TYPE_OUTPUTS: readonly string[] = [...DSL_LENGTH_TYPES]

// ─── Value emission ───────────────────────────────────────────────────────────

// A raw IR value → its first-class DSL literal (color function, unit-suffixed number,
// or bare number), or null to fall back to a quoted string. Mirrors the parser's
// literal grammar so emit → parse round-trips as first-class values, not raw strings.
const COLOR_FN_RE = /^(hex|srgb|rgb|p3|oklch|hsl)\(/
const UNIT_LIT_RE = /^-?\d*\.?\d+(px|rem|em|%|ms|s)$/
const BARE_NUM_RE = /^-?\d+(\.\d+)?$/
// The IR stores real CSS, where wide-gamut colour is `color(display-p3 …)`; the DSL
// spells the same value `p3(…)`. Without this bridge a P3 token emitted as a quoted
// string, and the parser then rejected it as a `color-nonhex` escape - so P3 never
// round-tripped despite being a first-class space on both sides.
const P3_CSS_RE = /^color\(\s*display-p3\s+([^)]+)\)$/i
function firstClassLiteral(type: string, raw: string): string | null {
  const r = raw.trim()
  // Hex digits are case-insensitive, and the parser lowercases them - so emitting the author's
  // `#3F4A6B` verbatim made the first print differ from every later one. The printer emits the
  // canonical (lower) form, which is the same rule that keeps lengths canonical.
  if (COLOR_FN_RE.test(r)) return r.startsWith('hex(') ? r.toLowerCase() : r
  if (BARE_NUM_RE.test(r) || UNIT_LIT_RE.test(r)) return r
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(r)
  if (hex && type === 'color') return `hex(${hex[1].toLowerCase()})`
  const p3 = P3_CSS_RE.exec(r)
  if (p3 && type === 'color') return `p3(${p3[1].trim()})`
  return null
}

// A RAW value → the surface form for it. One rule for every position that prints a raw value,
// because they must agree: `facetValue` had its own, cruder version (bare number, else QUOTE),
// which emitted `inset "6px"` and `fixed("0px")` - and the grammar wants a bare literal there,
// so the exported file did not parse. That made a starter-kit project's `.milda` export
// unusable, which is the worst failure mode a printer has: the file looks fine and is not
// (proposal 0041 §1.1c).
function rawLiteral(type: string, raw: string): string {
  // A length is canonicalised on the way out, so a legacy unit-less "12" emits as `12px`
  // rather than as a bare `12` the reader would have to guess at (it used to guess `rem`,
  // which is where the 16x round-trip drift came from).
  if (emitsLength(type as TokenType)) {
    const length = parseLength(raw)
    if (length.kind !== 'relative') return formatLength(length)
    return quote(length.css)
  }
  return firstClassLiteral(type, raw) ?? quote(raw)
}

// A typed length → its DSL literal. `formatLength` already produces the canonical
// surface spelling, so the two stay in step by construction.
function lengthLiteral(value: LengthValue): string {
  return formatLength(lengthOf(value))
}

// A single Slot as a value fragment: a bare token path (ref, resolved against
// `type`) or a literal.
function slotValue(index: TokenIndex, type: string, slot: Slot): string {
  if ('ref' in slot) {
    // A hoisted literal is not a token the author named, so print what they wrote: the value,
    // at the site that references it. Hoisting only ever happens inside an alias slot, so this
    // position always accepts a literal. Having no exceptions is by construction (the parser
    // synthesizes exactly one base slot); anything else falls through to a normal reference
    // rather than guessing.
    const hoisted = index.inlined.get(keyOf(type, slot.ref))
    if (hoisted && (hoisted.value.exceptions?.length ?? 0) === 0) {
      return slotValue(index, type, hoisted.value.base)
    }
    return ref(index, type, slot.ref)
  }
  // A typed length prints its canonical spelling: `12px`, `scaled(0.75)`, `pill` (0038).
  if ('dimension' in slot) return lengthLiteral(slot.dimension)
  if ('raw' in slot) return rawLiteral(type, slot.raw)
  if ('easing' in slot) {
    const e = slot.easing
    if (e.kind === 'cubicBezier') return quote(`cubic-bezier(${e.points.join(', ')})`)
    return quote(e.kind)
  }
  if ('gradient' in slot) {
    const g = slot.gradient
    const stops = g.stops
      .map(
        (s) =>
          `${'raw' in s.color ? s.color.raw : ref(index, 'color', (s.color as { ref: string }).ref)} ${s.position}%`,
      )
      .join(', ')
    return quote(`${g.kind}-gradient(${g.angle ?? 0}deg, ${stops})`)
  }
  if ('font' in slot) return fontLiteral(index.fonts.get(slot.font.id))
  if ('textStyle' in slot) return textStyleLiteral(index, slot.textStyle)
  // A computed value (proposal 0044). Printed as the relationship it IS, not as the value it
  // happens to resolve to today - which is the whole reason the slot exists. Before this had a
  // branch it fell through to the empty `raw ""` below, so every computed token in an exported
  // file lost its base, its steps and its meaning, silently (proposal 0041's exact failure).
  if ('compute' in slot) return computeLiteral(index, type, slot.compute)
  return quote('')
}

/**
 * A font family as the RECORD the reader can rebuild it from - `{ family; fallback; source }`.
 *
 * Not the id and not the bare CSS stack. The id belongs to the editor's font library, which is
 * not part of the file's namespace, so it would resolve to nothing on read; the stack is a
 * lowering, so a reader could not tell a bundled Google face from a platform one, and a
 * generator has to know that to decide between a stylesheet link, an @font-face and nothing.
 *
 * A system family's `family` IS its stack - that is what a system face is - and it says so with
 * `source: system`. What does NOT survive: a custom family's extra faces (only the first asset
 * is named) and the library entry's display name, which is editor chrome. Both are reported by
 * `emitDocument`'s issue list rather than dropped in silence.
 */
function fontLiteral(fam: FontFamily | undefined): string {
  if (!fam) return quote('')
  const parts: string[] = []
  const family =
    fam.source.kind === 'system'
      ? fam.source.stack
      : fam.source.kind === 'google'
        ? fam.source.family
        : fam.name
  parts.push(`family: ${quote(family)}`)
  parts.push(`fallback: ${fam.fallback}`)
  parts.push(`source: ${fam.source.kind}`)
  if (fam.source.kind === 'google') parts.push(`license: ${quote(fam.source.license)}`)
  if (fam.source.kind === 'custom' && fam.source.faces[0]) {
    parts.push(`asset: ${quote(fam.source.faces[0].assetId)}`)
  }
  return `{ ${parts.join('; ')} }`
}

/**
 * A text style as its five fields. It used to print `raw ""` - the guard below the value
 * emitter said "handled by the structured typography emitter", and there was no such emitter -
 * so every text style in an exported file lost its family, its size and its spacing, silently.
 *
 * Each measured field goes through `slotValue` at its OWN type, so a size that references a
 * token prints as that token's path and one holding a literal prints the literal. The family
 * prints as a path when it names a fontFamily token, and as the family record when it names
 * the library directly.
 */
function textStyleLiteral(index: TokenIndex, ts: TextStyleValue): string {
  const family =
    typeof ts.family === 'string'
      ? fontLiteral(index.fonts.get(ts.family))
      : ref(index, 'fontFamily', ts.family.ref)
  // The IR type names, not the surface ones: `slotValue` resolves a ref through the index,
  // which is keyed by (IR type, id), and it decides "is this a length" by mapping the IR type
  // to its surface spelling itself.
  const parts = [
    `family: ${family}`,
    `size: ${slotValue(index, 'fontSize', ts.size)}`,
    `weight: ${slotValue(index, 'fontWeight', ts.weight)}`,
    `line-height: ${slotValue(index, 'lineHeight', ts.lineHeight)}`,
    `letter-spacing: ${slotValue(index, 'letterSpacing', ts.letterSpacing)}`,
  ]
  return `{ ${parts.join('; ')} }`
}

/**
 * `compute BASE [in SPACE] { step; step }` - the surface form of a derived value.
 *
 * The base and a `mix` operand go through `slotValue`, so a reference prints as a path and a
 * literal prints as a literal (the parser hoists that back into a synthesized token, the same
 * round trip an inline literal in an alias slot already makes).
 */
function computeLiteral(index: TokenIndex, type: string, c: ComputeValue): string {
  const base = slotValue(index, type, c.base)
  const space = c.space ? ` in ${c.space}` : ''
  const steps = c.ops.map((op) => computeStep(index, type, op)).join('; ')
  return `compute ${base}${space} { ${steps} }`
}

// An amount stored as a 0..1 fraction, written the way an author says it. Trimmed, so 0.2
// prints as `20%` rather than `20.0000%`.
const pct = (n: number): string => `${+(n * 100).toFixed(2)}%`
const num = (n: number): string => String(+n.toFixed(3))

function computeStep(index: TokenIndex, type: string, op: ColorOp | LengthOp): string {
  switch (op.op) {
    case 'rotate':
      return `rotate ${num(op.degrees)}deg`
    case 'mix':
      return `mix ${slotValue(index, type, op.with)} ${pct(op.amount)}`
    case 'scale':
      return `scale ${num(op.factor)}`
    // dp-denominated, and spelled with the unit so the file says which measure it is.
    case 'offset':
      return `offset ${num(op.delta)}px`
    case 'round':
      return `round ${num(op.to)}px`
    default:
      return `${op.op} ${pct(op.amount)}`
  }
}

// The right-hand side of a `token … =` declaration (refs resolve against `type`).
function tokenValue(
  index: TokenIndex,
  group: (id: string) => string,
  type: string,
  tv: TokenValue,
  issues?: string[],
  tokenId?: string,
): string {
  const exceptions = tv.exceptions ?? []
  if (exceptions.length > 0) {
    // The surface form is single-aspect by construction (`alias by <Group> { … }`), while the
    // IR can now hold exceptions across several aspects (proposal 0042 §2.1). Until the
    // grammar gains a multi-aspect form (0042 §8), a token that varies on more than one
    // aspect cannot be spelled - so it is REPORTED rather than quietly truncated, because a
    // silently lossy export is exactly what 0041 exists to prevent.
    const groups = [...new Set(exceptions.map((e) => e.group))]
    if (groups.length > 1) {
      issues?.push(
        `token ${tokenId ?? '(unnamed)'} varies on ${groups.length} aspects (${groups.join(', ')}); the current surface can only spell one, so only ${groups[0]} was written`,
      )
    }
    const by = groups[0]
    const groupName = group(by)
    const entries = [
      `default -> ${slotValue(index, type, tv.base)}`,
      ...exceptions
        .filter((e) => e.group === by)
        .map(
          (e) => `${group(`${by}:${e.context}`) || e.context} -> ${slotValue(index, type, e.slot)}`,
        ),
    ]
    return `alias by ${groupName} { ${entries.join('; ')} }`
  }
  const slot = tv.base
  // A ref slot desugars to a bare alias-to-one-token (surface sugar, see examples) - EXCEPT
  // when it points at a hoisted literal. Those tokens are deliberately never declared
  // (0041), so printing the reference would dangle: `= lit.color.6` naming a token that
  // appears nowhere in the file. Going through slotValue restores the literal instead.
  //
  // This only became reachable with 0042: a token whose cases all held the same value used
  // to be a `byContext` and printed through the alias path, where every slot already went
  // through slotValue. Folding it to a single base is what exposed the short-circuit.
  if ('ref' in slot && !index.inlined.has(keyOf(type, slot.ref))) {
    return ref(index, type, slot.ref)
  }
  const frag = slotValue(index, type, slot)
  // First-class literals (color functions, unit numbers) stand alone; an opaque quoted string
  // and a STRUCTURED value (a family, a text style) both need the `raw` keyword - the grammar's
  // `tokenvalue` has no bare `{ … }` form, so printing one without it produced a file that did
  // not parse.
  return frag.startsWith('"') || frag.startsWith('{') ? `raw ${frag}` : frag
}

// ─── Foundations ──────────────────────────────────────────────────────────────

function emitContextGroups(groups: ContextGroup[]): string[] {
  return groups.map((g) => {
    const contexts = g.contexts.map((c) => pascal(c.name, seg(c.name))).join(' ')
    return `context-group ${pascal(g.name, g.id)} { ${contexts} }`
  })
}

function emitFoundations(foundations: DocumentFoundations, index: TokenIndex): string[] {
  const lines: string[] = []
  // Resolve a context-group id → its DSL name, and a `groupId:contextId` → context name.
  const groupNameById = new Map<string, string>()
  const ctxNameById = new Map<string, string>()
  for (const g of foundations.contextGroups) {
    groupNameById.set(g.id, pascal(g.name, g.id))
    for (const c of g.contexts) ctxNameById.set(`${g.id}:${c.id}`, pascal(c.name, seg(c.name)))
  }
  // Both fallbacks name the LAST id segment (see localOf): an undeclared group referenced as
  // `component` must not print as `CgComponent`, and a context slot keyed
  // `ctx.colorscheme.light` must not print as its whole dotted path.
  const group = (key: string): string =>
    key.includes(':')
      ? (ctxNameById.get(key) ?? pascal(localOf(key.split(':')[1] ?? key)))
      : (groupNameById.get(key) ?? pascal(localOf(key)))

  const layers = [...foundations.layers].sort((a, b) => a.order - b.order)
  const total = layers.reduce((n, l) => n + l.tokens.length, 0)
  if (total === 0) return lines

  lines.push('foundations {')
  let emitted = 0
  layers.forEach((layer: Layer) => {
    const tokens = [...layer.tokens].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    // Count what will actually be DECLARED: a layer holding only hoisted literals (which print
    // inline at their use sites) would otherwise emit an empty `layer NAME { }` block, and an
    // empty block is not something a reader should have to interpret.
    const declarable = tokens.filter((t) => !index.inlined.has(keyOf(t.type, t.id)))
    if (declarable.length === 0) return
    if (emitted > 0) lines.push('')
    emitted++
    // A real `layer NAME { … }` block, not a comment. It used to be `# Semantic layer`, which
    // the parser ignored, so a layered foundations imported as ONE layer and the author's
    // ordering was silently flattened (proposal 0041 §1.1c).
    lines.push(`${pad(1)}layer ${nameSeg(layer.name)} {`)
    for (const t of declarable) {
      // A hoisted literal is printed at its use site instead (see TokenIndex.inlined), so it
      // gets no declaration. Skipping the path alone was not enough: `declPath` falls back to
      // the token's name, so the declaration would still be emitted - as `inline-color`,
      // colliding with every other one.
      if (index.inlined.has(keyOf(t.type, t.id))) continue
      const path = declPath(index, t)
      const value = tokenValue(index, group, t.type, t.value)
      // A quoted trailing string, not a comment: a comment is discarded on read, so the
      // description used to vanish on every round trip (0041 §1.1d).
      const desc = t.description ? ` ${quote(t.description)}` : ''
      lines.push(`${pad(2)}token ${path} : ${dslType(t.type)} = ${value}${desc}`)
    }
    lines.push(`${pad(1)}}`)
  })
  lines.push('}')
  return lines
}

// ─── Shared types ─────────────────────────────────────────────────────────────

function typeExpr(t: PropType, declared?: DeclaredTypes): string {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'any':
      return t.kind
    case 'enum':
      return `enum(${t.values.join(', ')})`
    case 'literal':
      return typeof t.value === 'string' ? quote(t.value) : String(t.value)
    case 'ref':
      return `ref ${typeRefName(t.ref, declared)}`
    // A context-group-typed prop (proposal 0001). Printed in the EXPLICIT form rather than as the
    // bare-ident sugar: the sugar reads as a context type only because no shared type claims the
    // name, so printing it would make the meaning of an exported file depend on what else the file
    // happens to declare.
    //
    // The group is named the way its `context-group` declaration prints it, looked up by id: a
    // group made in the Studio has a uuid for an id, which printed as an identifier names a group
    // the file does not declare, and the binding is gone on the next read.
    case 'context':
      return `context ${declared?.get(contextGroupKey(t.group)) ?? pascal(localOf(t.group), localOf(t.group))}`
    case 'array':
      return `array<${typeExpr(t.item, declared)}>`
    case 'union':
      return `union(${t.members.map((m) => typeExpr(m, declared)).join(', ')})`
    case 'intersection':
      // Arrow, not a bare `map(typeExpr)`: that would pass the array index as `declared`.
      return `union(${t.members.map((m) => typeExpr(m, declared)).join(', ')})` // no surface intersection; widen to union
    case 'object':
      return `object { ${t.fields
        .map((f) => `${nameSeg(f.name)}${f.required ? '' : '?'}: ${typeExpr(f.type, declared)}`)
        .join('; ')} }`
    case 'component':
      return t.componentIds && t.componentIds.length
        ? `component(${t.componentIds.map((c) => pascal(c, c)).join(', ')})`
        : 'component'
    case 'record':
      return `object { }` // record has no direct surface; empty object placeholder
    case 'function':
      return 'string' // functions have no surface form; widen
    case 'typeParam':
      return t.name
    default:
      return 'any'
  }
}

// id -> the author's declared name, so a reference prints the same identifier the
// declaration does (the file header's promise for token refs, now honoured for type refs).
export type DeclaredTypes = Map<string, string>

// Context groups share the map under their own key space, so a group id can never shadow a
// shared-type id that happens to be spelled the same.
const contextGroupKey = (groupId: string): string => `\0cg:${groupId}`

function declaredTypeNames(types: SharedType[], groups: ContextGroup[] = []): DeclaredTypes {
  // Builtins are NOT declared in the file (they are part of the language), but a prop that
  // references one still has to name it. Leaving them out made the reference fall back to
  // pascal-casing the builtin's ID: `__builtin_icon_name` printed as `BuiltinIconName`,
  // which is not the type's name (`IconName`) and resolved to nothing on re-read. They are
  // seeded from the language's own registry, so a document that does not carry them in
  // `sharedTypes` (most do not - they are implicit) still prints correct references.
  return new Map([
    ...[...BUILTIN_SHARED_TYPES, ...types].map((t): [string, string] => [t.id, t.name]),
    ...groups.map((g): [string, string] => [contextGroupKey(g.id), pascal(g.name, g.id)]),
  ])
}

function emitSharedTypes(types: SharedType[], declared: DeclaredTypes): string[] {
  const authored = types.filter((t) => !t.builtin)
  return authored.map((t) => {
    const params = t.params && t.params.length ? `(${t.params.join(', ')})` : ''
    return `type ${pascal(t.name, t.id)}${params} = ${typeExpr(t.definition, declared)}`
  })
}

// ─── Components ─────────────────────────────────────────────────────────────

const propDefault = (v: PropValue): string | undefined => {
  if (typeof v === 'string') return quote(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return undefined // arrays/objects: no compact literal default
}

function emitProps(
  props: PropDef[],
  depth: number,
  declared?: DeclaredTypes,
  constraints: PropConstraint[] = [],
): string[] {
  if (props.length === 0 && constraints.length === 0) return []
  const lines = [`${pad(depth)}props {`]
  // A GLOBAL prop is printed as the reference it was authored as (0051 §5) - restating the type
  // and default would make the declaration and the component two places to change one decision,
  // which is the whole thing this construct removes. A RUN of them shares one line, because that
  // is how it reads (`global variant, size, color`), but each run stays where it stands: prop
  // order is the component's API order, and hoisting every global to the top reordered it on
  // each export - and on each save of the Mac app, which re-reads what it writes.
  let run: string[] = []
  const flush = () => {
    if (run.length) lines.push(`${pad(depth + 1)}global ${run.join(', ')}`)
    run = []
  }
  for (const p of props) {
    if (p.global) {
      run.push(nameSeg(p.name))
      continue
    }
    flush()
    // `name : Type`, the one spelling of name-then-type on this surface - the same one a
    // token declaration and an object field are written with (spec/FORMAT.md §6, milda 0.4).
    let line = `${pad(depth + 1)}${nameSeg(p.name)} : ${typeExpr(p.type, declared)}`
    if (p.default !== undefined) {
      const d = propDefault(p.default)
      if (d !== undefined) line += ` = ${d}`
    }
    // `required` / `required when <predicate>` (proposal 0052 §4). A condition supersedes the
    // flag: a prop that is always required has no condition to state.
    if (p.requiredWhen) line += ` required when ${predToDsl(p.requiredWhen)}`
    else if (p.required) line += ' required'
    if (p.binding) line += ` bind ${nameSeg(p.binding)}`
    // Inline metadata annotations (proposal 0026) - status/since (props have no author).
    const m = p.meta
    if (m?.status) line += ` @status ${m.status}`
    if (m?.since) line += ` @since ${m.since}`
    // Last, as a global prop's prose is. Neither this nor `required` survived an export before.
    if (p.description) line += ` ${quote(p.description)}`
    lines.push(line)
  }
  flush()
  // The group constraints after the props they name, in authored order.
  for (const c of constraints)
    lines.push(`${pad(depth + 1)}${c.kind} ${c.props.map((n) => nameSeg(n)).join(', ')}`)
  lines.push(`${pad(depth)}}`)
  return lines
}

// ─── Usage rules (proposal 0052 §5) ──────────────────────────────────────────
// `rule <id> <severity> { <statement> because "<rationale>" }`, one statement keyword per kind.

// A component is named by the identifier it is DECLARED with (`component ToggleButton`), never by
// its authored name ("Toggle button"), or the reference would not resolve on the way back in.
function ruleSubjectDsl(s: RuleSubject): string {
  const head = s.kind === 'archetype' ? `archetype ${nameSeg(s.name)}` : pascal(s.name)
  return s.where ? `${head} where ${predToDsl(s.where)}` : head
}

function ruleStatement(r: UsageRule): string {
  switch (r.kind) {
    case 'count': {
      const bounds = [
        r.min !== undefined ? `min ${r.min}` : '',
        r.max !== undefined ? `max ${r.max}` : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `${bounds} ${ruleSubjectDsl(r.subject)} within ${ruleSubjectDsl(r.within)}`
    }
    case 'never':
      return `never ${ruleSubjectDsl(r.subject)} within ${ruleSubjectDsl(r.within)}`
    case 'only-within':
      return `only ${ruleSubjectDsl(r.subject)} within ${r.within.map(ruleSubjectDsl).join(', ')}`
    case 'tokens-only':
      return `tokens ${r.types.map((t) => dslType(t)).join(', ')}`
    case 'prefer':
      return `prefer ${pascal(r.component)} for archetype ${r.archetypes.map((a) => nameSeg(a)).join(', ')}`
  }
}

export function emitRules(rules: UsageRule[]): string[] {
  const out: string[] = []
  for (const r of rules) {
    if (out.length) out.push('')
    out.push(
      `rule ${r.id} ${r.severity} {`,
      `  ${ruleStatement(r)}`,
      `  because ${quote(r.rationale)}`,
      '}',
    )
  }
  return out
}

function emitEvents(events: EventDef[], depth: number): string[] {
  if (events.length === 0) return []
  const lines = [`${pad(depth)}events {`]
  for (const e of events) lines.push(`${pad(depth + 1)}${nameSeg(e.name)}`)
  lines.push(`${pad(depth)}}`)
  return lines
}

// A facet/layout value: token ref (bare path, resolved against the facet's scale)
// or a raw literal (quoted). The scale doubles as the target token's type.
function facetValue(index: TokenIndex, scale: string, raw: string): string {
  if (isRawValue(raw)) return rawLiteral(scale, raw)
  return ref(index, scale, raw)
}

// The paint-facet lines for a node/state's `facets` map, in a stable order.
function facetLines(
  index: TokenIndex,
  facets: Record<string, string> | undefined,
  depth: number,
): string[] {
  if (!facets) return []
  const out: string[] = []
  const scaleOf = (key: string) => FACETS[key]?.scale ?? 'color'
  const v = (key: string) => facetValue(index, scaleOf(key), facets[key])

  if (facets.fill) out.push(`${pad(depth)}fill ${v('fill')}`)
  if (facets.ink) out.push(`${pad(depth)}ink ${v('ink')}`)
  // Border is nine facets, not one: all-sides plus each of the eight edges core names
  // (`BORDER_SIDES`, proposal 0002). Printing only the all-sides pair DROPPED an authored
  // per-edge border outright - `border.inline-start accent.a6 thick` on the Radix Blockquote
  // was the whole quote rule, and it did not survive an export (invariant 6). Style went the
  // same way: it is a keyword rather than a token, so it never had a `FACETS` entry to be
  // looked up through, and `border gray.a6 thin dashed` came back solid.
  for (const { suffix } of BORDER_SIDES) {
    const color = facets[`border${suffix}.color`]
    const width = facets[`border${suffix}.width`]
    const style = facets[`border${suffix}.style`]
    if (!color && !width && !style) continue
    // Colour first, then width, then style - the order the reader's positional fallback
    // assumes when a referenced token is not declared in this file.
    const parts = [
      color && v(`border${suffix}.color`),
      width && v(`border${suffix}.width`),
      style,
    ].filter(Boolean)
    out.push(`${pad(depth)}border${suffix} ${parts.join(' ')}`)
  }
  if (facets.corner) out.push(`${pad(depth)}corner ${v('corner')}`)
  if (facets['text.size']) out.push(`${pad(depth)}text ${v('text.size')}`)
  if (facets['text.weight']) out.push(`${pad(depth)}weight ${v('text.weight')}`)
  // The other two typography axes (0035 §3). Both are readable by the parser, and both were
  // missing here - so a font/slant set in the editor was DROPPED from the .milda, which 0041's
  // "the file carries the whole system" forbids. `slant` is an enum keyword, not a token, so it
  // prints literally (the parser reads it as raw).
  if (facets.font) out.push(`${pad(depth)}font ${v('font')}`)
  if (facets.slant) out.push(`${pad(depth)}slant ${facets.slant}`)
  // Insets print the keys that are STORED, least specific first, and never normalize
  // (proposal 0057 §4.6). The two axes with no shorthand are the corpus form, `inset ‹block›
  // ‹inline›`; anything else is the shorthand, then each axis, then each edge, as its own
  // statement. This used to fold `inset` + `insetX` into the two-value form, which rendered the
  // same but came back with different keys, and to print a lone axis as `inset ‹one›`, which came
  // back as all four edges - the two export losses `inset-roundtrip.test.ts` recorded.
  if (facets.insetY && facets.insetX && !facets.inset) {
    out.push(`${pad(depth)}inset ${v('insetY')} ${v('insetX')}`)
  } else {
    if (facets.inset) out.push(`${pad(depth)}inset ${v('inset')}`)
    if (facets.insetY) out.push(`${pad(depth)}inset.block ${v('insetY')}`)
    if (facets.insetX) out.push(`${pad(depth)}inset.inline ${v('insetX')}`)
  }
  for (const key of INSET_EDGE_KEYS) {
    if (facets[key]) out.push(`${pad(depth)}${key} ${v(key)}`)
  }
  if (facets.elevation) out.push(`${pad(depth)}elevation ${v('elevation')}`)
  if (facets.opacity) out.push(`${pad(depth)}opacity ${v('opacity')}`)
  if (facets.ring) out.push(`${pad(depth)}ring ${v('ring')}`)
  return out
}

// A per-axis size token → a DSL sizing intent.
// One axis as the surface spells it: the intent, then its clamps (0056 §3.2). A fixed size
// prints through `facetValue` so a token comes back as its path and a literal as a literal.
function axisSpelling(
  index: TokenIndex,
  layout: Record<string, string>,
  axis: 'width' | 'height',
): string {
  const parsed = parseAxisSize(layout[axis]) ?? { mode: 'fit' }
  const intent =
    parsed.mode === 'fixed'
      ? `fixed(${facetValue(index, 'size', parsed.value)})`
      : formatAxisSize(parsed)
  const min = layout[`${axis}Min`]
  const max = layout[`${axis}Max`]
  return [
    intent,
    ...(min ? [`min(${facetValue(index, 'size', min)})`] : []),
    ...(max ? [`max(${facetValue(index, 'size', max)})`] : []),
  ].join(' ')
}

// The `layout { … }` block for a node: structural facets + `gap` (a paint facet
// on the IR, a container facet in the surface).
function layoutBlock(
  index: TokenIndex,
  layout: Record<string, string> | undefined,
  facets: Record<string, string> | undefined,
  depth: number,
): string[] {
  const inner: string[] = []
  const structural =
    layout &&
    (layout.direction ||
      layout.align ||
      layout.distribute ||
      layout.wrap ||
      layout.width ||
      layout.height ||
      layout.widthMin ||
      layout.widthMax ||
      layout.heightMin ||
      layout.heightMax ||
      layout.position)
  const gap = facets?.gap
  if (!structural && !gap) return []

  const parts: string[] = []
  // `stack` is optional in the grammar, and a node that never stated a direction must not
  // come back with one: printing a default `stack row` INVENTED `layout.direction` on four
  // Radix layout primitives (Box, Grid, Inset, Separator), which is authored data the
  // document did not hold before the export.
  if (layout?.direction) parts.push(`stack ${layout.direction}`)
  if (gap) parts.push(`gap ${facetValue(index, 'spacing', gap)}`)
  if (layout?.align) parts.push(`align ${layout.align}`)
  if (layout?.distribute) parts.push(`distribute ${layout.distribute}`)
  // `nowrap` is the default and has no line; the other two words print as themselves.
  if (layout?.wrap === 'wrap' || layout?.wrap === 'wrap-reverse') parts.push(`wrap ${layout.wrap}`)
  // The second axis is printed only when the node HAS one. It used to be unconditional, so a
  // width-only node came back with `height: fit` - and an absent height emits no CSS length
  // while `fit` emits `fit-content`, which is a layout change rather than a spelling. The
  // reader now takes `size ‹axis›` with one value (see `atValueEnd` in the parser). A clamp
  // without an intent (`heightMax` alone) names the axis too, printing the default `fit`.
  const hasWidth = !!(layout?.width || layout?.widthMin || layout?.widthMax)
  const hasHeight = !!(layout?.height || layout?.heightMin || layout?.heightMax)
  if (hasWidth && hasHeight) {
    parts.push(
      `size ${axisSpelling(index, layout!, 'width')} ${axisSpelling(index, layout!, 'height')}`,
    )
  } else if (hasWidth) {
    parts.push(`size ${axisSpelling(index, layout!, 'width')}`)
  } else if (hasHeight) {
    // Height-only takes the NAMED form, because the positional pair cannot express it and
    // filling the width with `fit` would add a declaration the author never wrote.
    parts.push(`size height ${axisSpelling(index, layout!, 'height')}`)
  }
  // The record's value is already the surface's spelling (`overlay`, `pinned block-start`).
  const position = parsePosition(layout?.position)
  if (position) parts.push(`position ${formatPosition(position)}`)
  // Nothing printable (e.g. `wrap: 'nowrap'` alone, which is the default and has no keyword):
  // an empty `layout { }` is noise, and it only ever parsed because `stack` used to fill it.
  if (parts.length === 0) return []
  inner.push(`${pad(depth)}layout { ${parts.join('; ')} }`)
  return inner
}

// A part's slot descriptor.
function slotLine(
  slot: NodeSlot,
  depth: number,
  exampleName?: (id: string) => string | undefined,
): string {
  const bits = ['slot']
  if (slot.arity && slot.arity !== 'single') bits.push(slot.arity)
  if (slot.accepts.kind === 'content') bits.push('of content')
  else if (slot.accepts.kind === 'type')
    bits.push(`of ref ${pascal(slot.accepts.ref, slot.accepts.ref)}`)
  else if (slot.accepts.kind === 'component')
    bits.push(`of ${pascal(slot.accepts.ref, slot.accepts.ref)}`)
  if (slot.keyedBy) bits.push(`keyed-by ${nameSeg(slot.keyedBy)}`)
  // The rest of NodeSlot, which used to be dropped: `default` decides which slot receives
  // positional children (so losing it changes the generated component's call shape),
  // `exposeAs` is its public name, `role` its structural part in a disclosure, and
  // `description` is authored prose the docs transclude.
  if (slot.default) bits.push('default')
  if (slot.exposeAs) bits.push(`as ${nameSeg(slot.exposeAs)}`)
  if (slot.role) bits.push(`role ${seg(slot.role)}`)
  if (slot.sample) bits.push(`sample ${slotSample(slot.sample, exampleName)}`)
  if (slot.description) bits.push(quote(slot.description))
  return `${pad(depth)}${bits.join(' ')}`
}

// A slot's design-time sample fill. Never generated - a canvas/docs stand-in (0021). An
// `example` sample names the SCENE, quoted, like every other reference to an example: printing
// its id produced `sample example ex-1`, which resolves to nothing in the file.
function slotSample(s: SlotSample, exampleName?: (id: string) => string | undefined): string {
  if (s.kind === 'text') return quote(s.text)
  if (s.kind === 'example') return `example ${quote(exampleName?.(s.exampleId) ?? s.exampleId)}`
  return `[${s.items.map((i) => slotSample(i, exampleName)).join(', ')}]`
}

// The state/variant lines for a node's state-rule matrix (proposal 0025 - conditional
// styling is now first-class in the surface):
//   • pure state           → `state hovered { … }`
//   • prop × state          → `state hovered when variant=danger { … }`
//   • prop-only paint        → `when size=lg { … }`
// The surface `when` takes ONE condition; a rule with multiple prop conditions emits
// its first and lists the rest as an inline note (multi-condition is a documented 0025
// follow-up), so the output stays round-trippable by the parser.
// Serialize a value in a predicate: bare for simple idents/numbers/bools, quoted otherwise.
function predValue(v: PropValue | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return /^[\w-]+$/.test(v) ? v : JSON.stringify(v)
  return String(v)
}

const PRED_OP: Record<string, string> = {
  eq: '=',
  ne: '!=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
  contains: 'contains',
}

// ─── Addressing a node from elsewhere in the file (proposal 0041) ─────────────
// The IR points at nodes by internal id (`ancestor <nodeId>`, `a11y.labelledBy`, a free
// behaviour's `targetNodeId`, …). Those ids are workspace-local and are REGENERATED on
// import, so printing one produces a reference that resolves to nothing in the file it is
// written into - a dangling pointer that looks like data.
//
// The surface addresses a node by its PART PATH, which the file itself declares. This map
// is the single place that translation happens, so every position that names a node names
// it the same way, and the reader can resolve the path back to whatever id it minted.
export type NodeAddresses = Map<string, string>

// The state words are a closed vocabulary (`STATE_NAMES`, which `ALL_STATE_NAMES` copies), and
// every one is already lowercase, so lowercasing them is a no-op. A word outside it is still
// carried, because the read is lossless - the reader warns on it (`state-unknown`) and keeps it -
// so it prints exactly as written (`highContrast` on the Radix Text/Code parts): running it
// through `seg()` renamed it to `highcontrast` on export, the casing defect fixed for prop names
// in `nameSeg` and never followed through to the state-ref path.
const KNOWN_STATES = new Set<string>(ALL_STATE_NAMES)
function stateSeg(s: string): string {
  const trimmed = String(s).trim()
  return KNOWN_STATES.has(trimmed.toLowerCase()) ? trimmed.toLowerCase() : nameSeg(trimmed, 'state')
}

const addrOf = (addr: NodeAddresses | undefined, nodeId: string): string =>
  addr?.get(nodeId) ?? nameSeg(nodeId, 'node')

// A predicate (0032) as surface text: `variant = primary and (state error or context ColorScheme = dark)`.
// Leaves name their source (prop path bare, `state <s>`, `context <group>`, `ancestor <path> <s>`);
// groups join with `and`/`or`, nested groups parenthesized; `not` negates.
function predToDsl(p: Predicate, addr?: NodeAddresses): string {
  if (p.kind === 'cmp') {
    const r = p.ref
    const name =
      r.kind === 'prop'
        ? r.path
        : r.kind === 'state'
          ? `state ${r.state}`
          : r.kind === 'ancestor'
            ? `ancestor ${addrOf(addr, r.nodeId)} ${r.state}`
            : `context ${r.group}`
    if (p.op === 'set') return name
    if (p.op === 'unset') return `not ${name}`
    return `${name} ${PRED_OP[p.op]} ${predValue(p.value)}`
  }
  if (p.kind === 'not') return `not (${predToDsl(p.item, addr)})`
  const item = (q: Predicate) =>
    q.kind === 'all' || q.kind === 'any' ? `(${predToDsl(q, addr)})` : predToDsl(q, addr)
  return p.items.map(item).join(p.kind === 'all' ? ' and ' : ' or ')
}

function stateLines(
  index: TokenIndex,
  rules: StateRule[] | undefined,
  depth: number,
  addr?: NodeAddresses,
): string[] {
  if (!rules || rules.length === 0) return []
  const out: string[] = []
  for (const rule of rules) {
    // Rich `when` predicate (0032): emit a faithful `when <predicate> { … }` block. A legacy rule
    // anchored on an ANCESTOR's state (the Studio's "when the root is selected") has no
    // `state`-block spelling, so it prints as the predicate it already is: `when ancestor <path>
    // <state>`. It used to fall through to the state-block path below, which knows nothing of
    // `ancestorStates`, and came out as `state default` - the condition gone, the rule dead.
    const rich =
      rule.when ??
      (rule.ancestorStates?.length
        ? predicateFromLegacy(rule.props, rule.states, rule.ancestorStates)
        : undefined)
    if (rich) {
      const body = [
        ...facetLines(index, rule.facets, depth + 1),
        ...layoutBlock(index, rule.layout, rule.facets, depth + 1),
      ]
      const pred = predToDsl(rich, addr)
      if (body.length === 0) out.push(`${pad(depth)}when ${pred} {}`)
      else out.push(`${pad(depth)}when ${pred} {`, ...body, `${pad(depth)}}`)
      continue
    }
    // Spaced around `=` to match `predToDsl`, which is the canonical printer for the same
    // condition. The two paths disagreeing made export non-idempotent: a legacy prop-map rule
    // printed `orientation=horizontal`, reparsed into a rich predicate, and reprinted as
    // `orientation = horizontal` (proposal 0041 §1.1a, the `spacing` defect).
    //
    // SEVERAL prop conditions join with `and`. The surface `when` takes one predicate and a
    // predicate can be a conjunction (0032), so the old "print the first, list the rest in a
    // comment" was never a grammar limit - it silently widened the rule: a style that applied
    // to `variant = subtle AND tone = success` came back applying to every `subtle` tone.
    const conds = Object.entries(rule.props ?? {}).map(([k, val]) => `${k} = ${predValue(val)}`)
    const when = conds.join(' and ')
    const whenClause = when ? ` when ${when}` : ''
    const extra = ''
    const body = [
      ...facetLines(index, rule.facets, depth + 1),
      ...layoutBlock(index, rule.layout, rule.facets, depth + 1),
    ]
    const names = rule.states.length
      ? rule.states.map((s) => stateSeg(String(s)))
      : when
        ? []
        : ['default']

    if (names.length === 0) {
      // Prop-only paint (no interaction state): a state-less `when` block.
      if (body.length === 0) out.push(`${pad(depth)}when ${when} {}${extra}`)
      else out.push(`${pad(depth)}when ${when} {${extra}`, ...body, `${pad(depth)}}`)
      continue
    }
    for (const name of names) {
      if (body.length === 0) out.push(`${pad(depth)}state ${name}${whenClause} {}${extra}`)
      else out.push(`${pad(depth)}state ${name}${whenClause} {${extra}`, ...body, `${pad(depth)}}`)
    }
  }
  return out
}

// A CoordEntry (the §9 algebra) as a surface line.
function coordLine(c: CoordEntry, depth: number): string[] {
  if (c.kind === 'wire') {
    const when = c.when ? ` when ${c.when}` : ''
    const arg = c.arg ? `(${c.arg})` : ''
    return [`${pad(depth)}wire ${c.from}${when} -> ${c.to}${arg}`]
  }
  if (c.kind === 'gate') return [`${pad(depth)}gate ${c.machine} active when ${c.activeWhen}`]
  return [note(depth, `composition ${c.kind} - omitted from the surface print`)]
}

const emitParams = (params?: Record<string, string>): string =>
  params && Object.keys(params).length
    ? `(${Object.entries(params)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')})`
    : ''

// Component behavior composition (proposal 0024). The EFFECTIVE composition is the
// archetype's canonical wiring ⊕ any AUTHORED composition stored on the IR (phase 2):
// when the component carries its own `composition`, that is the source of truth and is
// printed as-is; otherwise the archetype's wiring is derived and printed (phase 1).
function compositionLines(ir: ComponentIR, depth: number): string[] {
  const authored = ir.composition
  if (authored && (authored.uses.length || authored.wires.length || authored.gates.length)) {
    const out: string[] = []
    for (const u of authored.uses)
      out.push(`${pad(depth)}uses ${u.atom}${emitParams(u.params)} as ${u.as}`)
    for (const w of authored.wires) {
      const when = w.when ? ` when ${w.when}` : ''
      const arg = w.arg ? `(${w.arg})` : ''
      out.push(`${pad(depth)}wire ${w.from}${when} -> ${w.to}${arg}`)
    }
    for (const g of authored.gates)
      out.push(`${pad(depth)}gate ${g.machine} active when ${g.activeWhen}`)
    return out
  }

  // No authored composition ⇒ nothing to print. The archetype's canonical wiring used to be
  // derived and printed here under a `# derived from archetype X` note, and that was a
  // fabrication with a cost: reading the file back turned the derivation into AUTHORED
  // composition, so exporting twice produced two different documents (the second one
  // carrying a copy of the archetype's algebra as if the author had written it). The file
  // already says `archetype X`, which is the whole of that information.
  return []
}

// ─── What a part carries beyond paint (proposal 0041) ─────────────────────────

// A fixed-or-bound value: `"Submit"` / `bind label`. One rule for every position that
// takes one (text, accessible name, alt, destination, an emit payload, an instance prop),
// because they are the same concept and must read the same way.
function contentValue(v: ContentValue): string {
  if (v.kind === 'bind') return `bind ${nameSeg(v.propName, 'prop')}`
  const raw = v.value
  if (typeof raw === 'string') return quote(raw)
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return quote(JSON.stringify(raw))
}

// A node's text (0009/0032). The common case is one line; a node whose text varies by
// predicate gets a block with a `default` and one `when … -> …` leg per rule.
//
// The keyword is `content`, not `text`: `text` is already a paint FACET (`text md` sets the
// font size), and a keyword whose meaning depends on whether its argument is a string or a
// word is the kind of grammar that reads fine and parses wrong.
function contentLines(content: NodeContent, depth: number, addr?: NodeAddresses): string[] {
  if (content.kind === 'static') return [`${pad(depth)}content ${quote(content.text)}`]
  if (content.rules.length === 0) return [`${pad(depth)}content ${contentValue(content.default)}`]
  return [
    `${pad(depth)}content {`,
    `${pad(depth + 1)}default ${contentValue(content.default)}`,
    ...content.rules.map(
      (r) =>
        `${pad(depth + 1)}${r.when ? `when ${predToDsl(r.when, addr)} -> ` : 'otherwise '}${contentValue(r.value)}`,
    ),
    `${pad(depth)}}`,
  ]
}

// Accessible naming (0013). `labelled-by`/`described-by` point at another part BY PATH.
function a11yLine(a11y: NodeA11y, depth: number, addr?: NodeAddresses): string[] {
  const bits: string[] = []
  if (a11y.name) bits.push(`name ${contentValue(a11y.name)}`)
  if (a11y.labelledBy) bits.push(`labelled-by ${addrOf(addr, a11y.labelledBy)}`)
  if (a11y.describedBy) bits.push(`described-by ${addrOf(addr, a11y.describedBy)}`)
  if (bits.length === 0) return []
  return [`${pad(depth)}a11y { ${bits.join('; ')} }`]
}

// The events a node raises. `eventId` is internal; the surface names the declared EVENT,
// so the file resolves against its own `events { … }` block.
function emitLines(
  emits: EventEmission[],
  depth: number,
  eventName: (id: string) => string | undefined,
): string[] {
  // An emission whose event cannot be NAMED is skipped rather than printed against an
  // internal id. That happens inside an `example`, which is contract-less by design (0021):
  // a scene declares no events, so an emit in one names nothing the file can resolve - its
  // liveness comes from `action` instead. Printing it produced a line the reader then had to
  // drop, which is the definition of a non-idempotent file.
  const named = emits
    .map((e) => ({ e, name: eventName(e.eventId) }))
    .filter((x): x is { e: EventEmission; name: string } => !!x.name)
  if (named.length === 0) return []
  const lines = [`${pad(depth)}emits {`]
  for (const { e, name } of named) {
    const bits = [nameSeg(name, 'event'), 'on', seg(e.on)]
    if (e.payload) bits.push('payload', contentValue(e.payload))
    if (e.signal) bits.push('signal', nameSeg(e.signal))
    if (e.locked) bits.push('locked')
    lines.push(`${pad(depth + 1)}${bits.join(' ')}`)
  }
  lines.push(`${pad(depth)}}`)
  return lines
}

// Repetition (`repeat items as item`). A STATIC item list is authored data, so it is
// printed as a literal array rather than dropped.
function repeatLine(r: NodeRepeat, depth: number): string {
  const alias = ` as ${nameSeg(r.itemAlias, 'item')}`
  if (r.source.kind === 'prop')
    return `${pad(depth)}repeat ${nameSeg(r.source.propName, 'prop')}${alias}`
  const items = r.source.items.map((i) => (typeof i === 'string' ? quote(i) : String(i))).join(', ')
  return `${pad(depth)}repeat static [${items}]${alias}`
}

// Transitions (0017). `duration`/`easing`/`delay` are TOKEN references, resolved against
// their own scales so a motion token prints the same path its declaration does.
function motionLines(index: TokenIndex, motion: NodeMotion, depth: number): string[] {
  if (motion.transitions.length === 0) return []
  const lines = [`${pad(depth)}motion {`]
  for (const t of motion.transitions) {
    const facets = (t.facets ?? []).map((f) => seg(f)).join(' ')
    const bits = ['transition']
    if (facets) bits.push(facets)
    bits.push('duration', facetValue(index, 'duration', t.duration))
    if (t.easing) bits.push('easing', facetValue(index, 'easing', t.easing))
    if (t.delay) bits.push('delay', facetValue(index, 'duration', t.delay))
    lines.push(`${pad(depth + 1)}${bits.join(' ')}`)
  }
  lines.push(`${pad(depth)}}`)
  return lines
}

// A nested component (0012). Named by COMPONENT NAME, never by the workspace's id.
function instanceLines(
  inst: ComponentInstance,
  depth: number,
  componentName: (id: string) => string,
): string[] {
  const head = `${pad(depth)}instance ${pascal(componentName(inst.componentId), 'Component')}`
  const props = inst.props ?? []
  if (props.length === 0) return [`${head} {}`]
  return [
    `${head} {`,
    ...props.map((p) => `${pad(depth + 1)}${nameSeg(p.name, 'prop')} = ${contentValue(p.value)}`),
    `${pad(depth)}}`,
  ]
}

// A free behaviour (0041 §4). These ARE neutral - a focus trap or a typeahead is an
// interaction, not a platform - so each is printed as a real block whose fields are
// scalars and PART PATHS. The two web-flavoured fields (`clickaway.eventType`,
// `scrollLock.target`) are carried verbatim rather than reinterpreted.
const BEHAVIOR_NODE_FIELDS = new Set([
  'initialFocusNodeId',
  'targetNodeId',
  'labelNodeId',
  'itemNodeId',
  'anchorNodeId',
  'excludeNodeIds',
])

function behaviorLines(b: NodeBehavior, depth: number, addr?: NodeAddresses): string[] {
  const entries: string[] = []
  for (const [k, v] of Object.entries(b)) {
    if (k === 'id' || k === 'kind' || v == null) continue
    const key = kebab(k)
    if (BEHAVIOR_NODE_FIELDS.has(k)) {
      const paths = (Array.isArray(v) ? v : [v]).map((id) => addrOf(addr, String(id)))
      if (paths.length) entries.push(`${key} ${paths.join(' ')}`)
      continue
    }
    if (Array.isArray(v)) {
      entries.push(
        `${key} [${v.map((x) => metaScalar(x as string | number | boolean)).join(', ')}]`,
      )
      continue
    }
    entries.push(`${key} ${metaScalar(v as string | number | boolean)}`)
  }
  const head = `${pad(depth)}behavior ${kebab(b.kind)}`
  if (entries.length === 0) return [`${head} {}`]
  return [`${head} { ${entries.join('; ')} }`]
}

// A camelCase field name → the surface's kebab spelling, and back (`kebab`/`camel` are
// each other's inverse for the field names used here).
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

// The per-archetype config surfaces (0029/0034/0035). Each is a flat record of scalars,
// so one printer serves all of them and the reader validates per block.
function configLines(name: string, cfg: object, depth: number): string[] {
  const entries: string[] = []
  for (const [k, v] of Object.entries(cfg)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      entries.push(
        `${kebab(k)} [${v.map((x) => metaScalar(x as string | number | boolean)).join(', ')}]`,
      )
      continue
    }
    if (typeof v === 'object') continue
    entries.push(`${kebab(k)} ${metaScalar(v as string | number | boolean)}`)
  }
  if (entries.length === 0) return []
  return [`${pad(depth)}${name} { ${entries.join('; ')} }`]
}

// Media provenance (0028): the consumer supplies the source (`bind`), or the image IS
// part of the design system (`static`, an asset in the library).
function mediaSourceLine(src: MediaSource, depth: number): string {
  if (src.kind === 'static') return `${pad(depth)}source static ${nameSeg(src.assetId, 'asset')}`
  const bits = [`source bind ${nameSeg(src.propName, 'prop')}`]
  if (src.sample) {
    bits.push(
      src.sample.kind === 'asset'
        ? `sample asset ${nameSeg(src.sample.assetId, 'asset')}`
        : `sample url ${quote(src.sample.url)}`,
    )
  }
  return `${pad(depth)}${bits.join(' ')}`
}

// Non-portable content (0041 §4, owner decision): kept, quarantined, and TAGGED with the
// target whose language it is written in - so a reader that does not know that target
// skips it instead of guessing. Dropping it silently was the alternative, and a file that
// silently drops authored code is the failure mode this whole proposal exists to end.
function foreignLines(f: ForeignContent, depth: number): string[] {
  const bits = ['foreign']
  bits.push(seg(FOREIGN_TARGET))
  if (f.label) bits.push(quote(f.label))
  bits.push(quote(f.code))
  return [`${pad(depth)}${bits.join(' ')}`]
}

// The only target foreign content can currently be authored for: the escape hatch is a
// React snippet (`ForeignContent.code`). Stated explicitly in the file rather than left
// implicit, because the whole point of the tag is that a non-React reader can skip it.
const FOREIGN_TARGET = 'web-react'

// One `part … { … }` block for a node. `path` is the node's ADDRESS: a dotted part path
// whose prefix is its parent's, which is how the reader recovers the tree (and how every
// other position in the file refers to this node).
function emitPart(
  index: TokenIndex,
  node: ComponentNode,
  depth: number,
  path: string,
  ctx: PartContext,
): string[] {
  const body: string[] = []

  // What the part IS, said where it is named (proposal 0055 §3.2): `part Button: container {`.
  // The kind is printed on EVERY part, never left to the archetype's role: `kind` was inferred on
  // import before it was written down, which turned an `icon` into an `item` and a `control` into
  // a `container`, and a role is only a safe default while the prelude keeps it. A saved file
  // pins what each part is; the header only moves where the pin is written.
  // Whether the part may be removed is NOT printed: the archetype requires it or it does not,
  // and the reader asks the archetype (`isLockedPart`).
  const head = [`part ${path}: ${seg(node.kind)}`]
  // Provenance: an author-added node is not the same as an archetype-born one (the editor
  // gates editing on it), and it is authored information, so the file carries it.
  // Except on the root: the reader takes the first part as the root, and the walk prints the root
  // first, so `origin root` there says what the position already said (proposal 0055 §3.1).
  const rootByPosition = node.origin === 'root' && node.id === ctx.rootId
  if (node.origin && node.origin !== 'archetype' && !rootByPosition)
    body.push(`${pad(depth + 1)}origin ${seg(node.origin)}`)

  // Conditional presence (0031/0032): the node renders only when the predicate holds.
  if (node.presence)
    body.push(`${pad(depth + 1)}present when ${predToDsl(node.presence, ctx.addr)}`)
  if (node.slot) body.push(slotLine(node.slot, depth + 1, ctx.exampleName))
  if (node.content) body.push(...contentLines(node.content, depth + 1, ctx.addr))
  if (node.a11y) body.push(...a11yLine(node.a11y, depth + 1, ctx.addr))
  if (node.emits?.length) body.push(...emitLines(node.emits, depth + 1, ctx.eventName))
  if (node.stateBindings?.length) {
    for (const b of node.stateBindings) {
      body.push(`${pad(depth + 1)}bind state ${stateSeg(b.state)} ${nameSeg(b.propName, 'prop')}`)
    }
  }
  if (node.valueBinding)
    body.push(`${pad(depth + 1)}bind value ${nameSeg(node.valueBinding.propName, 'prop')}`)
  if (node.value) body.push(`${pad(depth + 1)}value ${typeExpr(node.value.type, ctx.declared)}`)
  if (node.repeat) body.push(repeatLine(node.repeat, depth + 1))
  if (node.cell) {
    const bits = ['cell']
    if (node.cell.header) bits.push('header')
    if (node.cell.scope) bits.push(seg(node.cell.scope))
    body.push(`${pad(depth + 1)}${bits.join(' ')}`)
  }
  if (node.control) body.push(`${pad(depth + 1)}control ${seg(node.control.as)}`)
  if (node.group) body.push(`${pad(depth + 1)}group ${seg(node.group.as)}`)
  if (node.presentation) body.push(`${pad(depth + 1)}presentation ${kebab(node.presentation)}`)
  if (node.media) body.push(`${pad(depth + 1)}media ${seg(node.media)}`)
  if (node.mediaSource) body.push(mediaSourceLine(node.mediaSource, depth + 1))
  if (node.mediaAlt) body.push(`${pad(depth + 1)}alt ${contentValue(node.mediaAlt)}`)
  if (node.destination) body.push(`${pad(depth + 1)}destination ${contentValue(node.destination)}`)

  body.push(...layoutBlock(index, node.layout, node.facets, depth + 1))
  body.push(...facetLines(index, node.facets, depth + 1))
  body.push(...stateLines(index, node.states, depth + 1, ctx.addr))
  if (node.motion) body.push(...motionLines(index, node.motion, depth + 1))

  // The per-archetype config surfaces. Printed from an explicit table so a new config on
  // the node type is a compile error here rather than a silent omission.
  if (node.severity) body.push(`${pad(depth + 1)}severity ${seg(node.severity)}`)
  if (node.accordion) body.push(`${pad(depth + 1)}accordion ${seg(node.accordion)}`)
  if (node.calendar) body.push(...configLines('calendar', node.calendar, depth + 1))
  if (node.timePicker) body.push(...configLines('time-picker', node.timePicker, depth + 1))
  if (node.tabs) body.push(...configLines('tabs', node.tabs, depth + 1))
  if (node.slider) body.push(...configLines('slider', node.slider, depth + 1))
  if (node.rating) body.push(...configLines('rating', node.rating, depth + 1))
  if (node.colorPicker) body.push(...configLines('color-picker', node.colorPicker, depth + 1))
  if (node.overlay) body.push(...configLines('overlay', node.overlay, depth + 1))

  // Demo interactions (0021) - what makes an example scene live rather than a still.
  for (const a of node.actions ?? []) {
    const bits = ['action', seg(a.on), a.op, nameSeg(a.variable, 'var')]
    if (a.op === 'set' && a.value !== undefined)
      bits.push(propDefault(a.value) ?? quote(String(a.value)))
    body.push(`${pad(depth + 1)}${bits.join(' ')}`)
  }

  if (node.instance) body.push(...instanceLines(node.instance, depth + 1, ctx.componentName))
  for (const b of node.behaviors ?? []) body.push(...behaviorLines(b, depth + 1, ctx.addr))
  if (node.foreign) body.push(...foreignLines(node.foreign, depth + 1))

  if (body.length === 0) return [`${pad(depth)}${head.join(' ')} {}`]
  return [`${pad(depth)}${head.join(' ')} {`, ...body, `${pad(depth)}}`]
}

// What a part needs from its component/document to print a reference by NAME rather than
// by an internal id.
interface PartContext {
  addr: NodeAddresses
  /** The declared event of that id, or undefined when nothing in the file declares it. */
  eventName: (id: string) => string | undefined
  componentName: (id: string) => string
  /** The name of the demo scene of that id, for a slot's `sample example …`. */
  exampleName?: (id: string) => string | undefined
  declared?: DeclaredTypes
  /** The node the walk starts from, which is therefore the FIRST part the file prints. */
  rootId?: string
}

// ─── Part paths: the tree, written down ───────────────────────────────────────
// A part's path IS its position in the tree (`surface.option.label`), which is how the
// reader rebuilds nesting. The emitter used to print `nameSeg(node.part)`, and `nameSeg`
// rejects a dot - so `option.indicator` was flattened to `option-indicator` and every
// nested node came back as a SIBLING of its parent. Measured on the starter kit: a tree
// five levels deep imported two levels deep. The same defect class as token name paths
// (0041 §1.1a): a name that contains separators is a path, and must be segmented.
function partPaths(ir: { structure?: ComponentIR['structure'] }): NodeAddresses {
  const nodes = ir.structure?.nodes ?? {}
  const out: NodeAddresses = new Map()
  const usedByParent = new Map<string, Set<string>>()
  // The root's own segment is NOT part of its descendants' paths. The reader attaches a
  // dotless part to the first-declared part (`parentOf` in toIr), so `root` + `spinner` and
  // `root` + `root.spinner` describe the identical tree - but the second spelling is the one
  // the reader turns into a node named `root.spinner` with the id `cmp.button:root-spinner`.
  // Exporting a file therefore RENAMED every part one level down from what its author wrote.
  // Anchoring the walk at the root's own path and printing descendants relative to it gives
  // the authored spelling back, and is what the corpus is written in throughout.
  // The last segment of an authored part name, or the node's own name: the ancestry comes
  // from the walk, so an archetype's already-dotted `option.indicator` must not contribute
  // its prefix twice.
  const leafOf = (node: ComponentNode) => {
    const raw = node.part ?? node.name
    return nameSeg(raw.includes('.') ? (raw.split('.').pop() as string) : raw, 'part')
  }
  // `''` is the top level of the flat `part` map, where the root and its direct children
  // both live.
  const TOP = '\0top'
  const walk = (id: string, parentPath: string) => {
    const node = nodes[id]
    if (!node || out.has(id)) return
    const leaf = leafOf(node)
    const key = parentPath || TOP
    const used = usedByParent.get(key) ?? new Set<string>()
    usedByParent.set(key, used)
    let seg2 = leaf
    let n = 2
    while (used.has(seg2)) seg2 = `${leaf}-${n++}`
    used.add(seg2)
    const path = parentPath ? `${parentPath}.${seg2}` : seg2
    out.set(id, path)
    for (const childId of node.childrenIds ?? []) walk(childId, path)
  }
  const rootId = ir.structure?.rootId
  const root = rootId ? nodes[rootId] : undefined
  if (!rootId || !root) return out
  const rootLeaf = leafOf(root)
  out.set(rootId, rootLeaf)
  // The root's segment is reserved at the top level: a child of the root that happened to
  // carry the same name would otherwise print the same path and silently replace the root
  // in the reader's `anatomy` map.
  usedByParent.set(TOP, new Set([rootLeaf]))
  for (const childId of root.childrenIds ?? []) walk(childId, '')
  return out
}

// A node's line range within the text returned by `componentToDsl` (0-based,
// end exclusive) - lets a caller highlight one node's `part { … }` block.
export interface DslNodeRange {
  start: number
  end: number
}

function emitComponent(
  ir: ComponentIR,
  index: TokenIndex,
  ranges?: Record<string, DslNodeRange>,
  declared?: DeclaredTypes,
  // id → name for every component in the document, so an instance names the component it
  // nests instead of pointing at a workspace-local id (absent in a standalone print).
  componentNames?: Map<string, string>,
  // group id → slash path, so a component can say which library category it sits in.
  groupPathById?: Map<string, string>,
  // example id → name, for a slot whose design-time sample IS a demo scene (0021).
  exampleNames?: Map<string, string>,
): string[] {
  const lines: string[] = []
  // The declaration name is an IDENTIFIER, because every reference in the file resolves
  // against it. The author's own spelling rides in `meta { name … }` below when the two differ.
  const codeName = pascal(ir.name)
  const header = ir.description
    ? `component ${codeName} ${quote(ir.description)} {`
    : `component ${codeName} {`
  lines.push(header)

  if (ir.archetype) lines.push(`${pad(1)}archetype ${pascal(ir.archetype, ir.archetype)}`)
  else lines.push(note(1, 'no archetype (empty component)'))

  // The library category. Printed by PATH, so it resolves against the `group` declarations.
  const groupId = (ir as { group?: string | null }).group
  const groupPath = groupId ? groupPathById?.get(groupId) : undefined
  if (groupPath) lines.push(`${pad(1)}group ${groupPath}`)

  // Component metadata (proposal 0026), plus the component's DISPLAY name when it differs
  // from the identifier the declaration must use.
  //
  // A component is declared by identifier (`component ColorPicker {`) because everything
  // references it by that name. But the authored name is free text - 18 of the 50 starter-kit
  // components are named like "Color picker" - and pascal-casing it on export renamed the whole
  // library on re-import. No grammar change is needed: the `meta {}` block already carries
  // arbitrary keys and preserves the string verbatim, which is the same reasoning that put the
  // output settings there (§1.1b). Emitted only when it differs, so a component whose name IS
  // an identifier gains nothing.
  const metaEntries = Object.entries(ir.meta ?? {}) as Array<[string, MetaValue]>
  if (ir.name !== codeName) metaEntries.unshift(['name', ir.name])
  if (metaEntries.length) lines.push('', ...emitMetaBlock(metaEntries, 1))

  const props = ir.contract?.props ?? []
  const events = ir.contract?.events ?? []
  const propLines = emitProps(props, 1, declared, ir.contract?.constraints)
  const eventLines = emitEvents(events, 1)
  if (propLines.length) lines.push('', ...propLines)
  if (eventLines.length) lines.push('', ...eventLines)

  // Behavior composition - authored (stored on the IR) or derived from the archetype.
  const compLines = compositionLines(ir, 1)
  if (compLines.length) lines.push('', ...compLines)

  // Walk the node tree depth-first; each node is a `part` block addressed by its path.
  const nodes = ir.structure?.nodes ?? {}
  const rootId = ir.structure?.rootId
  const addr = partPaths(ir)
  const eventNameById = new Map(events.map((e) => [e.id, e.name]))
  const ctx: PartContext = {
    addr,
    // A dangling event id keeps its last segment rather than printing the whole internal
    // id: `button.event.click` is a nameless reference in the file, `click` resolves.
    eventName: (id) => eventNameById.get(id) ?? localOf(id),
    componentName: (id) => componentNames?.get(id) ?? localOf(id),
    exampleName: (id) => exampleNames?.get(id),
    declared,
    rootId,
  }
  const visited = new Set<string>()
  const walk = (id: string) => {
    const node = nodes[id]
    if (!node || visited.has(id)) return
    visited.add(id)
    lines.push('')
    const start = lines.length
    lines.push(...emitPart(index, node, 1, addr.get(id) ?? nameSeg(node.name, 'part'), ctx))
    if (ranges) ranges[node.id] = { start, end: lines.length }
    for (const childId of node.childrenIds ?? []) walk(childId)
  }
  const treeStart = lines.length
  if (rootId) walk(rootId)
  // A component whose whole tree is the bare root the reader would make anyway prints no part at
  // all. Printing it was not a fixed point: the reader seeds an archetype's parts only when the
  // file names some part, so the printed `part root` made the SECOND read grow a label, a
  // surface and a panel the first read never had (found by 0052's corpus, whose components are
  // contract-only).
  const tree = lines.slice(treeStart).map((l) => l.trim())
  const bareRoot = ['', 'part root: container {}']
  if (
    Object.keys(nodes).length === 1 &&
    tree.length === bareRoot.length &&
    tree.every((l, i) => l === bareRoot[i])
  ) {
    lines.splice(treeStart)
    if (ranges && rootId) delete ranges[rootId]
  }

  lines.push('}')
  return lines
}

// A component's full `component X { … }` block, standalone (not nested in a document),
// plus each node's line range so a caller can highlight the currently selected node.
// Used by the Studio editor's dev-only Inspector DSL preview.
export interface DslComponentResult {
  text: string
  ranges: Record<string, DslNodeRange>
}

export function componentToDsl(
  ir: ComponentIR,
  foundations?: DocumentFoundations,
  sharedTypes?: SharedType[],
): DslComponentResult {
  const index = buildTokenIndex(foundations)
  const ranges: Record<string, DslNodeRange> = {}
  // Without the declared names a standalone component still prints stable type refs (the
  // namespace is stripped either way); with them it prints the author's exact identifier.
  const lines = emitComponent(
    ir,
    index,
    ranges,
    declaredTypeNames(sharedTypes ?? [], foundations?.contextGroups),
  )
  return { text: lines.join('\n'), ranges }
}

// ─── Document ─────────────────────────────────────────────────────────────

// Which hoisted literals may be printed inline: all of them, EXCEPT any whose id also appears
// somewhere in a component. Hoisting only happens in alias slots, so in a file that came from
// the parser every reference is inlineable - but a token picked in the EDITOR can be referenced
// from a component facet, and inlining one there would leave a dangling reference to a
// declaration we skipped. The check is a deliberately blunt scan of the serialized components:
// conservative in the only direction that matters (a false positive merely keeps a declaration
// that could have been inlined).
function inlineableHoisted(
  foundations: DocumentFoundations | undefined,
  components: ComponentIR[],
): Set<string> {
  const out = new Set<string>()
  if (!foundations) return out
  const hoisted = foundations.layers.flatMap((l) => l.tokens).filter(isHoistedLiteral)
  if (hoisted.length === 0) return out
  const componentText = JSON.stringify(components)
  for (const t of hoisted) {
    if (!componentText.includes(`"${t.id}"`)) out.add(keyOf(t.type, t.id))
  }
  return out
}

// ─── The library around the components (proposal 0041) ────────────────────────

// A group tree → one `group <path> "prose"` declaration per node, parents first. The path
// IS the nesting, exactly as for token groups, so no block nesting is needed.
function emitComponentGroups(groups: ComponentGroup[]): string[] {
  const pathById = groupPaths(groups)
  return [...groups]
    .sort((a, b) => (pathById.get(a.id) ?? '').localeCompare(pathById.get(b.id) ?? ''))
    .map((g) => {
      const path = pathById.get(g.id) ?? nameSeg(g.name, 'group')
      return `group ${path}${g.description ? ` ${quote(g.description)}` : ''}`
    })
}

// id → slash path for every group, resolved through the parent chain.
function groupPaths(groups: ComponentGroup[]): Map<string, string> {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const out = new Map<string, string>()
  const pathOf = (id: string, guard = new Set<string>()): string => {
    const cached = out.get(id)
    if (cached) return cached
    const g = byId.get(id)
    if (!g || guard.has(id)) return ''
    guard.add(id)
    const own = nameSeg(g.name, 'group')
    const path = g.parent ? `${pathOf(g.parent, guard)}/${own}` : own
    out.set(id, path)
    return path
  }
  for (const g of groups) pathOf(g.id)
  return out
}

// A demo scene (0021). Structurally a component, so it reuses the same part printer -
// which is the point: an example is edited by the same surfaces, and it must be carried by
// the same syntax rather than by a second, parallel dialect.
function emitExample(
  ex: DslExample,
  index: TokenIndex,
  declared: DeclaredTypes,
  componentNames: Map<string, string>,
  exampleNames: Map<string, string>,
): string[] {
  const head = ['example', quote(ex.name)]
  if (ex.for) head.push('for', pascal(componentNames.get(ex.for) ?? localOf(ex.for), 'Component'))
  if (ex.description) head.push(quote(ex.description))
  const lines = [`${head.join(' ')} {`]

  const state = Object.entries(ex.state ?? {})
  if (state.length) {
    lines.push(`${pad(1)}demo {`)
    for (const [name, v] of state) {
      const initial = propDefault(v.initial)
      lines.push(
        `${pad(2)}${nameSeg(name, 'var')} : ${typeExpr(v.type, declared)}${initial !== undefined ? ` = ${initial}` : ''}`,
      )
    }
    lines.push(`${pad(1)}}`)
  }

  const nodes = ex.structure?.nodes ?? {}
  const addr = partPaths(ex)
  const ctx: PartContext = {
    addr,
    // An example is contract-less (0021): it declares no events, so an emit inside a scene
    // has no name the file can resolve and is not printed (see emitLines).
    eventName: () => undefined,
    componentName: (id) => componentNames.get(id) ?? localOf(id),
    exampleName: (id) => exampleNames.get(id),
    declared,
    rootId: ex.structure?.rootId,
  }
  const visited = new Set<string>()
  const walk = (id: string) => {
    const node = nodes[id]
    if (!node || visited.has(id)) return
    visited.add(id)
    lines.push('')
    lines.push(...emitPart(index, node, 1, addr.get(id) ?? nameSeg(node.name, 'part'), ctx))
    for (const childId of node.childrenIds ?? []) walk(childId)
  }
  if (ex.structure?.rootId) walk(ex.structure.rootId)
  lines.push('}')
  return lines
}

// The docs overlay (0018). Every transclusion addresses its target by NAME: a block that
// pointed at a workspace id would render an empty box in any other reader.
function emitDocs(docs: DslDocs, ctx: DocsRefs): string[] {
  const lines = ['docs {']
  const s = docs.site
  if (s) {
    const bits: string[] = []
    if (s.name) bits.push(`name ${quote(s.name)}`)
    if (s.tagline) bits.push(`tagline ${quote(s.tagline)}`)
    if (s.version) bits.push(`version ${quote(s.version)}`)
    if (s.searchPlaceholder) bits.push(`search-placeholder ${quote(s.searchPlaceholder)}`)
    if (bits.length) lines.push(`${pad(1)}site { ${bits.join('; ')} }`)
  }
  const f = docs.footer
  if (f && (f.links.length || f.copyright)) {
    lines.push(`${pad(1)}footer {`)
    if (f.copyright) lines.push(`${pad(2)}copyright ${quote(f.copyright)}`)
    for (const l of f.links) lines.push(`${pad(2)}link ${quote(l.label)} ${quote(l.href)}`)
    lines.push(`${pad(1)}}`)
  }
  for (const page of docs.pages) {
    const head = [`${pad(1)}page ${quote(page.title)}`]
    if (page.group) head.push(`in ${quote(page.group)}`)
    const parent = page.parentId ? ctx.pageTitle(page.parentId) : undefined
    if (parent) head.push(`under ${quote(parent)}`)
    lines.push(`${head.join(' ')} {`)
    for (const block of page.blocks) lines.push(...docBlockLines(block, ctx, 2))
    lines.push(`${pad(1)}}`)
  }
  lines.push('}')
  return lines
}

// What a docs block needs in order to name what it points at.
interface DocsRefs {
  pageTitle: (id: string) => string | undefined
  componentName: (id: string) => string | undefined
  propName: (componentId: string | undefined, propId: string) => string | undefined
  exampleName: (id: string) => string | undefined
  groupPath: (id: string) => string | undefined
  assetName: (id: string) => string | undefined
}

function docBlockLines(block: DocBlock, ctx: DocsRefs, depth: number): string[] {
  const p = pad(depth)
  const cmp = (id: string | undefined) =>
    id ? pascal(ctx.componentName(id) ?? localOf(id), 'Component') : undefined
  switch (block.kind) {
    case 'divider':
      return [`${p}divider`]
    case 'image': {
      const asset = block.assetId ? ctx.assetName(block.assetId) : undefined
      return [`${p}image${asset ? ` asset ${quote(asset)}` : ''}`]
    }
    case 'component': {
      const name = cmp(block.componentId)
      return [`${p}component${name ? ` ${name}` : ''}`]
    }
    case 'componentProps':
    case 'componentEvents':
    case 'componentComposition': {
      const keyword = kebab(block.kind)
      const name = cmp(block.componentId)
      return [`${p}${keyword}${name ? ` ${name}` : ''}`]
    }
    case 'componentProp': {
      const name = cmp(block.componentId)
      const prop = block.propId ? ctx.propName(block.componentId, block.propId) : undefined
      return [
        `${p}component-prop${name ? ` ${name}` : ''}${prop ? ` ${nameSeg(prop, 'prop')}` : ''}`,
      ]
    }
    case 'componentEvent': {
      const name = cmp(block.componentId)
      return [
        `${p}component-event${name ? ` ${name}` : ''}${block.eventName ? ` ${nameSeg(block.eventName, 'event')}` : ''}`,
      ]
    }
    case 'example': {
      const name = block.exampleId ? ctx.exampleName(block.exampleId) : undefined
      return [`${p}example${name ? ` ${quote(name)}` : ''}`]
    }
    case 'componentGroup': {
      const path = block.groupId ? ctx.groupPath(block.groupId) : undefined
      return [`${p}component-group${path ? ` ${path}` : ''}`]
    }
    case 'tokens':
    case 'swatch':
      return [`${p}${block.kind}${block.tokenType ? ` ${dslType(block.tokenType)}` : ''}`]
    default: {
      // A prose block: its kind IS the keyword (`heading "…"`).
      const prose = block as { kind: string; text: string; anchor?: string }
      const anchor = prose.anchor ? ` anchor ${quote(prose.anchor)}` : ''
      return [`${p}${seg(prose.kind)} ${quote(prose.text ?? '')}${anchor}`]
    }
  }
}

// The asset library (§1.2). Metadata plus WHERE the bytes are: a `data:` URI makes the
// file self-contained, a plain url keeps it small and expects the bytes alongside.
function emitAssets(
  registry: AssetRegistry,
  embed?: (assetId: string) => string | undefined,
): string[] {
  const assets: Asset[] = Object.values(registry.assets ?? {})
  const folders: AssetFolder[] = Object.values(registry.folders ?? {})
  if (assets.length === 0 && folders.length === 0) return []
  const lines = ['assets {']
  const folderPath = assetFolderPaths(folders)
  for (const path of [...folderPath.values()].sort()) lines.push(`${pad(1)}folder ${path}`)
  if (folderPath.size && assets.length) lines.push('')
  for (const a of assets) {
    const head = [`${pad(1)}${seg(a.kind)}`, quote(a.name)]
    const folder = a.folderId ? folderPath.get(a.folderId) : undefined
    if (folder) head.push('in', folder)
    const entries: string[] = []
    if (a.mimeType) entries.push(`mime ${quote(a.mimeType)}`)
    if (a.sizeBytes) entries.push(`size ${a.sizeBytes}`)
    if (a.uploadedAt) entries.push(`uploaded ${quote(a.uploadedAt)}`)
    if (a.tags?.length)
      entries.push(`tags [${a.tags.map((t: string) => metaScalar(t)).join(', ')}]`)
    for (const [k, v] of Object.entries(a)) {
      if (ASSET_BASE_FIELDS.has(k) || v == null) continue
      if (typeof v === 'object') continue
      entries.push(`${kebab(k)} ${metaScalar(v as string | number | boolean)}`)
    }
    // The bytes, last: a data URI is long, and putting it at the end keeps the readable
    // metadata readable in a diff.
    const data = embed?.(a.id)
    if (data) entries.push(`data ${quote(data)}`)
    else if (a.url) entries.push(`url ${quote(a.url)}`)
    lines.push(`${head.join(' ')} { ${entries.join('; ')} }`)
  }
  lines.push('}')
  return lines
}

// The fields every asset has, printed explicitly above (so the loop below prints only the
// per-kind metadata). `id`/`folderId` are workspace-local and deliberately not printed.
const ASSET_BASE_FIELDS = new Set([
  'id',
  'name',
  'kind',
  'mimeType',
  'sizeBytes',
  'uploadedAt',
  'url',
  'tags',
  'folderId',
])

// The icon library. Statement ORDER is meaning: the first `set` is what a bare glyph name
// resolves against, so the sets print in the library's order and the reader keeps it. No id is
// printed - parts name glyphs by name, and a custom glyph names its asset by name (FORMAT.md §3).
function emitIcons(lib: IconLibrary, assetName: (id: string) => string | undefined): string[] {
  if (lib.sets.length === 0 && lib.icons.length === 0) return []
  // A provider's names are mostly words (`chevron-down`), but nothing promises it.
  const word = (v: string) => (/^[A-Za-z][A-Za-z0-9_-]*$/.test(v) ? v : quote(v))
  const block = (entries: string[]) => (entries.length ? ` { ${entries.join('; ')} }` : '')
  const lines = ['icons {']
  for (const set of lib.sets) {
    const entries: string[] = []
    if (set.provider) entries.push(`provider ${quote(set.provider)}`)
    if (set.license) entries.push(`license ${quote(set.license)}`)
    if (set.samples?.length) entries.push(`samples [${set.samples.map(word).join(', ')}]`)
    lines.push(`${pad(1)}set ${word(set.prefix)} ${quote(set.name)}${block(entries)}`)
  }
  if (lib.sets.length && lib.icons.length) lines.push('')
  for (const icon of lib.icons) {
    const entries: string[] = []
    if (icon.label) entries.push(`label ${quote(icon.label)}`)
    if (icon.kind === 'set') {
      // The body last, as an asset's `data` is: it is long, and the readable fields should
      // stay readable in a diff.
      if (icon.svg) entries.push(`svg ${quote(icon.svg)}`)
      lines.push(`${pad(1)}glyph ${word(icon.prefix)} ${word(icon.name)}${block(entries)}`)
    } else {
      const asset = assetName(icon.assetId)
      if (asset) entries.unshift(`asset ${quote(asset)}`)
      lines.push(`${pad(1)}custom ${quote(icon.name)}${block(entries)}`)
    }
  }
  lines.push('}')
  return lines
}

function assetFolderPaths(folders: AssetFolder[]): Map<string, string> {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const out = new Map<string, string>()
  const pathOf = (id: string, guard = new Set<string>()): string => {
    const cached = out.get(id)
    if (cached) return cached
    const f = byId.get(id)
    if (!f || guard.has(id)) return ''
    guard.add(id)
    const own = nameSeg(f.name, 'folder')
    const path = f.parentId ? `${pathOf(f.parentId, guard)}/${own}` : own
    out.set(id, path)
    return path
  }
  for (const f of folders) pathOf(f.id)
  return out
}

// Resolve every id a docs block can point at back to the NAME the file declares.
function docsRefs(
  input: DslDocumentInput,
  componentNames: Map<string, string>,
  groupPathById: Map<string, string>,
): DocsRefs {
  const pageTitles = new Map((input.docs?.pages ?? []).map((p) => [p.id, p.title]))
  const exampleNames = new Map((input.examples ?? []).map((e) => [e.id ?? e.name, e.name]))
  const assetNames = new Map(Object.values(input.assets?.assets ?? {}).map((a) => [a.id, a.name]))
  const propsByComponent = new Map(
    input.components.map((c) => [
      (c as { id?: string }).id ?? c.name,
      new Map((c.contract?.props ?? []).map((p) => [p.id, p.name])),
    ]),
  )
  return {
    pageTitle: (id) => pageTitles.get(id),
    componentName: (id) => componentNames.get(id),
    propName: (componentId, propId) =>
      (componentId ? propsByComponent.get(componentId)?.get(propId) : undefined) ?? localOf(propId),
    exampleName: (id) => exampleNames.get(id),
    groupPath: (id) => groupPathById.get(id),
    assetName: (id) => assetNames.get(id),
  }
}

export function documentToDsl(input: DslDocumentInput): string {
  const { components, foundations, sharedTypes, meta, output } = input
  const index = buildTokenIndex(foundations, inlineableHoisted(foundations, components))
  const out: string[] = []

  // Header banner.
  out.push('# ============================================================================')
  out.push(`# ${meta?.name ? `${meta.name} - ` : ''}Milda design system`)
  out.push('# Surface syntax over the canonical AST. What this file promises to carry, what it')
  out.push('# deliberately does not, and how its references resolve: spec/FORMAT.md in the')
  out.push('# `milda` language package (grammar: spec/GRAMMAR.ebnf, AST: spec/PRELUDE.md §10).')
  out.push('# Generated by Milda - export of the design-system document.')
  out.push('# ============================================================================')
  out.push('')

  // Capability version - a first-class declaration, not a comment (proposal 0026).
  // Filled in once the file is written: whether it is still the declared version depends on
  // what the rest of the file says (see `writtenSurface`).
  const versionLine = out.length
  out.push('')
  out.push(`prelude ${meta?.prelude ?? PRELUDE_VERSION}`)
  out.push('')

  // Document metadata block (name/version/description + any extra keys).
  const docMeta: Array<[string, MetaValue]> = []
  if (meta?.name) docMeta.push(['name', meta.name])
  if (meta?.version) docMeta.push(['version', meta.version])
  if (meta?.description) docMeta.push(['description', meta.description])
  for (const [k, v] of Object.entries(meta?.metadata ?? {})) docMeta.push([k, v])
  // Sorted so the block is stable across exports regardless of key insertion order - the
  // git mirror (0039) diffs this file, so incidental reordering is noise.
  for (const [k, v] of Object.entries(output ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    docMeta.push([`${OUTPUT_PREFIX}${k}`, v])
  }
  if (docMeta.length) {
    out.push(...emitMetaBlock(docMeta, 0))
    out.push('')
  }

  const ctxGroups = foundations?.contextGroups ?? []
  if (ctxGroups.length) {
    out.push('# ---- Context groups (theming dimensions) -----------------------------------')
    out.push(...emitContextGroups(ctxGroups))
    out.push('')
  }

  if (foundations) {
    const foundationLines = emitFoundations(foundations, index)
    if (foundationLines.length) {
      out.push(...foundationLines)
      out.push('')
    }
  }

  if (foundations?.icons) {
    const assetNames = new Map(Object.values(input.assets?.assets ?? {}).map((a) => [a.id, a.name]))
    const iconLines = emitIcons(foundations.icons, (id) => assetNames.get(id))
    if (iconLines.length) {
      out.push('# ---- Icons (the sets parts draw from, and the curated glyphs) --------------')
      out.push(...iconLines)
      out.push('')
    }
  }

  const declared = declaredTypeNames(sharedTypes ?? [], foundations?.contextGroups)
  const typeLines = emitSharedTypes(sharedTypes ?? [], declared)
  if (typeLines.length) {
    out.push('# ---- Shared types ----------------------------------------------------------')
    out.push(...typeLines)
    out.push('')
  }

  // Global props (0051 §5), after the types they are typed by and before the components that
  // reference them - declaration before use, the order the rest of the file is written in.
  const globalPropLines = (foundations?.globalProps ?? []).map((gp) => {
    const def = gp.default !== undefined ? propDefault(gp.default) : undefined
    const desc = gp.description ? ` ${quote(gp.description)}` : ''
    return `global-prop ${nameSeg(gp.name)} : ${typeExpr(gp.type, declared)}${def !== undefined ? ` = ${def}` : ''}${desc}`
  })
  if (globalPropLines.length) {
    out.push('# ---- Global props (declared once, taken by reference) ----------------------')
    out.push(...globalPropLines)
    out.push('')
  }

  // Component ids only exist on the editor's `EditorComponent`; the printer takes the IR,
  // so an id is read opportunistically. Without it an `instance` would name a workspace id.
  const componentNames = new Map<string, string>()
  for (const ir of components) {
    const id = (ir as { id?: string }).id
    if (id) componentNames.set(id, ir.name)
  }

  // example id → name, so a slot's design-time `sample example …` and a docs `example` block
  // both address a scene the same way: by the name the file declares.
  const exampleNames = new Map((input.examples ?? []).map((e) => [e.id ?? e.name, e.name]))

  const groups = input.componentGroups ?? []
  if (groups.length) {
    out.push('# ---- Component groups (library organisation) -------------------------------')
    out.push(...emitComponentGroups(groups))
    out.push('')
  }

  // Grouped, then in sibling order: the file's component ORDER is the library's order, so
  // it has to be the order a reader would rebuild (there is no `order N` line to carry -
  // position is the honest surface form for it).
  const groupPathById = groupPaths(groups)
  const sorted = [...components].sort((a, b) => {
    const ga = groupPathById.get((a as { group?: string | null }).group ?? '') ?? ''
    const gb = groupPathById.get((b as { group?: string | null }).group ?? '') ?? ''
    if (ga !== gb) return ga.localeCompare(gb)
    const oa = (a as { order?: number }).order ?? 0
    const ob = (b as { order?: number }).order ?? 0
    return oa - ob
  })

  for (const ir of sorted) {
    if (!ir.structure?.nodes) continue
    out.push(
      ...emitComponent(ir, index, undefined, declared, componentNames, groupPathById, exampleNames),
    )
    out.push('')
  }

  // Usage rules (0052 §5) after the components they name - declaration before use, as above.
  const rules = foundations?.rules ?? []
  if (rules.length) {
    out.push('# ---- Usage rules (how the system is put together) --------------------------')
    out.push(...emitRules(rules))
    out.push('')
  }

  const examples = input.examples ?? []
  if (examples.length) {
    out.push('# ---- Examples (demo scenes) ------------------------------------------------')
    out.push('')
    for (const ex of examples) {
      out.push(...emitExample(ex, index, declared, componentNames, exampleNames))
      out.push('')
    }
  }

  if (input.assets) {
    const assetLines = emitAssets(input.assets, input.embedAsset)
    if (assetLines.length) {
      out.push('# ---- Assets ----------------------------------------------------------------')
      out.push(...assetLines)
      out.push('')
    }
  }

  if (input.docs && (input.docs.pages.length || input.docs.site || input.docs.footer)) {
    out.push('# ---- Docs ------------------------------------------------------------------')
    out.push(...emitDocs(input.docs, docsRefs(input, componentNames, groupPathById)))
    out.push('')
  }

  out[versionLine] = `milda ${writtenSurface(meta?.milda, out)}`

  // Collapse a trailing blank line into a single terminating newline.
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n') + '\n'
}
