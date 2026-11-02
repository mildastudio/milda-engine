// ─── AST → editor-IR adapter (foundations) ────────────────────────────────────
// Completes the round-trip: `.milda` text → parse (milda) → canonical AST → HERE →
// the editor IR (@mildastudio/core `DocumentFoundations`) the app loads and edits.
//
// The two representations differ in vocabulary - that difference is the work:
//   • token TYPE: the AST's `TokenType` (color/spacing/typography/shadow/…) maps to
//     the editor's scale-based `TokenType` (color/spacing/fontSize/textStyle/…).
//   • token VALUE: the AST is TYPED (`{space:'srgb',channels:[…]}`, `{value,unit}`);
//     the editor stores CSS-ish raw strings in a `Slot`. So typed values are rendered
//     back to strings (channels→hex, `{value,unit}`→`rem`/`px`), and alias `refs`
//     (context→token-id) become a `byContext` slot map.
//
// Scope: foundations (context-groups + tokens). Component AST→IR (node-tree
// reconstruction from `anatomy` parts) is the next slice; `documentAstToIr` returns
// components untouched with a note.

import { DSL_OUTPUT_PREFIX as OUTPUT_PREFIX, isHoistedLiteral } from './emit'
import type {
  ComponentComposition,
  ComponentGroup as IrComponentGroup,
  ComponentIR,
  ComponentNode,
  ComponentStructure,
  ContentValue,
  DemoAction,
  DocBlock,
  DocPage,
  DocsModel,
  DocumentFoundations,
  EventDef as IrEventDef,
  Icon,
  IconLibrary,
  EventEmission,
  Layer as IrLayer,
  NodeA11y,
  NodeBehavior,
  NodeContent,
  NodeKind,
  NodeOverlay,
  NodeSlot as IrNodeSlot,
  DismissTrigger,
  Predicate as IrPredicate,
  PredicateRef as IrPredicateRef,
  PropConstraint as IrPropConstraint,
  PropDef as IrPropDef,
  PropType,
  RuleSubject as IrRuleSubject,
  SharedType as IrSharedType,
  Slot as IrSlot,
  SlotSample,
  StateName as IrStateName,
  StateRule,
  FontCategory,
  FontFamily,
  TextStyleValue,
  Token as IrToken,
  TokenType as IrTokenType,
  TokenValue as IrTokenValue,
  TokenGroup,
  UsageRule as IrUsageRule,
} from '@mildastudio/core'
import {
  BUILTIN_SHARED_TYPES,
  GOOGLE_FONTS,
  INSET_SURFACE_KEYS,
  ALL_STATE_NAMES,
  ROLE_TO_KIND,
  SYSTEM_STACKS,
  isLockedPart,
  seedStructure,
  contextSlotsToValue,
  defaultBehavior,
  type FreeBehaviorKind,
} from '@mildastudio/core'
import {
  ASSET_FIELDS,
  BEHAVIOR_FIELDS,
  DOC_PROSE_KINDS as DOC_PROSE_KIND_LIST,
  INTERACTION_KINDS,
  MEDIA_TYPES,
  NODE_KINDS,
  PART_CONFIGS,
  anatomyIndex,
  camelField,
  findDeclaredPart,
  type ConfigFieldSpec,
  type InsetEdge,
} from '@mildastudio/milda'
import type {
  Asset,
  AssetFolder,
  AssetRegistry,
  IconsDecl,
  ColorValue,
  Component as AstComponent,
  PropValue,
  ContextGroup as AstContextGroup,
  DimensionValue,
  EventDef as AstEventDef,
  FacetMap,
  FacetValue,
  FontFamilyValue as AstFontFamilyValue,
  FontProvenance,
  Foundations as AstFoundations,
  InsetValue,
  AxisIntent,
  AxisSizeValue,
  LayoutSpec,
  LengthValue,
  AssetsDecl,
  ComponentGroupDecl,
  DocBlockDecl,
  DocsDecl,
  Example as AstExample,
  Part,
  PartBehavior,
  PartContent,
  PartSlot,
  PartSlotSample,
  PartValue,
  Predicate as AstPredicate,
  PredicateRef as AstPredicateRef,
  PropConstraint as AstPropConstraint,
  PropDef as AstPropDef,
  RuleSubject as AstRuleSubject,
  Token as AstToken,
  UsageRule as AstUsageRule,
  TokenType as AstTokenType,
  TypeExpr,
} from '@mildastudio/milda'

export interface FoundationsToIrResult {
  foundations: DocumentFoundations
  issues: string[]
}

// AST token type → editor-IR scale type. The IR has no home for a few AST types
// (fontFamily lives in `foundations.fonts`; blur/tonal/backdrop have no scale) - those
// fall back to the nearest scale and are flagged.
const TYPE_TO_IR: Record<AstTokenType, IrTokenType> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'radius',
  size: 'size',
  duration: 'duration',
  opacity: 'opacity',
  elevation: 'elevation',
  typography: 'textStyle',
  border: 'borderWidth',
  shadow: 'elevation',
  fontFamily: 'fontFamily',
  fontWeight: 'fontWeight',
  blur: 'elevation',
  tonal: 'elevation',
  ring: 'color',
  backdrop: 'color',
  none: 'elevation',
  lineHeight: 'lineHeight',
  fontSize: 'fontSize',
  letterSpacing: 'letterSpacing',
  easing: 'easing',
  gradient: 'gradient',
}

const IR_LOSSY = new Set<AstTokenType>(['blur', 'tonal', 'ring', 'backdrop', 'none'])

// An sRGB/HSL/… ColorValue → a CSS color string for an IR raw slot.
function colorToCss(c: ColorValue): string {
  const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)))
  if (c.space === 'srgb') {
    const [r, g, b] = c.channels
    const hex = (n: number) => clamp255(n).toString(16).padStart(2, '0')
    const base = `#${hex(r)}${hex(g)}${hex(b)}`
    return c.alpha != null && c.alpha < 1 ? `${base}${hex(c.alpha)}` : base
  }
  if (c.space === 'hsl') {
    const [h, s, l] = c.channels
    const pct = (n: number) => `${Math.round(n * 100)}%`
    const a = c.alpha != null && c.alpha < 1 ? ` / ${c.alpha}` : ''
    return `hsl(${Math.round(h)} ${pct(s)} ${pct(l)}${a})`
  }
  // display-p3 / oklch → CSS color() / oklch() best-effort.
  const chans = c.channels.join(' ')
  const a = c.alpha != null && c.alpha < 1 ? ` / ${c.alpha}` : ''
  return c.space === 'oklch' ? `oklch(${chans}${a})` : `color(${c.space} ${chans}${a})`
}

// ─── Rebuilding the font library from the file (fontFamily tokens) ───────────
// The editor keeps font families in a LIBRARY (`foundations.fonts`) and a token names one by
// id. An id means nothing outside the workspace that minted it, so the file carries the family
// RECORD instead - and reading it back means putting that record into a library entry and
// pointing the token at it.
//
// Deduplicated by what the record says, so ten tokens naming Inter rebuild ONE library entry
// rather than ten. The entry's display name is the family itself: the authored name was editor
// chrome and is not in the file, and inventing one per token would fill the library with
// near-duplicates the author never made.

interface FontRebuild {
  fonts: FontFamily[]
  byKey: Map<string, string>
}

const GENERIC_BY_CATEGORY: Record<string, FontCategory> = {
  sans: 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
  display: 'sans-serif',
}

/**
 * Where the face comes from, from either shape the record can arrive in.
 *
 * A `fontFamily` TOKEN's value is normalised by the parser (`source: { kind: 'google' }`); the
 * same record NESTED inside a typography value is not - it is whatever the structured literal
 * held (`source: google`, `license: "…"`). Reading only the normalised shape is what made a
 * bundled Google face come back as a platform stack on the second print.
 */
function provenanceOf(v: AstFontFamilyValue & { license?: unknown }): FontProvenance | undefined {
  const src = v.source as unknown
  if (src && typeof src === 'object' && 'kind' in src) return src as FontProvenance
  if (src === 'system') return { kind: 'system' }
  if (src === 'custom') return { kind: 'custom' }
  if (src === 'google') {
    return { kind: 'google', ...(typeof v.license === 'string' ? { license: v.license } : {}) }
  }
  return undefined
}

/**
 * The CSS generic this family falls back to.
 *
 * `fallback` is read first and `category` only as a backstop, because the surface writes the
 * generic itself (`fallback: monospace`) and only a token-level record gets normalised into a
 * category. Reading the category first turned every nested mono family into a sans one.
 */
function genericOf(v: AstFontFamilyValue): FontCategory {
  const fb = v.fallback as unknown
  const word = typeof fb === 'string' ? fb : Array.isArray(fb) ? String(fb[0] ?? '') : ''
  const w = word.trim().toLowerCase()
  if (w === 'serif' || w === 'monospace' || w === 'sans-serif') return w
  if (w === 'mono') return 'monospace'
  return GENERIC_BY_CATEGORY[v.category] ?? 'sans-serif'
}

/** The library entry for a family record, minting it on first sight. Returns its id. */
function fontIdFor(reg: FontRebuild, raw: AstFontFamilyValue): string {
  const v = { ...raw, source: provenanceOf(raw) }
  const kind = v.source?.kind ?? (v.family.includes(',') ? 'system' : 'named')
  const key = `${kind}\0${v.family}`
  const existing = reg.byKey.get(key)
  if (existing) return existing

  const generic = genericOf(v)
  const base = `font-${seg(v.family)}`
  let id = base
  let n = 2
  while (reg.fonts.some((f) => f.id === id)) id = `${base}-${n++}`

  // A record with no `source` says nothing about a bundled file, so it is read as a stack the
  // platform is expected to have - the one reading that claims nothing the file did not.
  const source: FontFamily['source'] =
    kind === 'system' || kind === 'named'
      ? { kind: 'system', stack: v.family.includes(',') ? v.family : `"${v.family}", ${generic}` }
      : v.source?.kind === 'google'
        ? {
            kind: 'google',
            family: v.family,
            weights: GOOGLE_FONTS.find((g) => g.family === v.family)?.weights ?? [400, 700],
            italic: false,
            license: v.source.license ?? '',
          }
        : {
            kind: 'custom',
            faces: v.assetId ? [{ weight: 400, italic: false, assetId: v.assetId }] : [],
          }

  const label =
    kind === 'system'
      ? (SYSTEM_STACKS.find((s) => s.stack === v.family)?.label ?? v.family)
      : v.family
  reg.fonts.push({ id, name: label, source, fallback: generic })
  reg.byKey.set(key, id)
  return id
}

/** Is this raw payload a family RECORD (rather than a token path)? */
function isFontFamilyValue(raw: unknown): raw is AstFontFamilyValue {
  return (
    !!raw && typeof raw === 'object' && typeof (raw as { family?: unknown }).family === 'string'
  )
}

/**
 * A typography record → the editor's TextStyleValue.
 *
 * The one rule that makes the structured surface readable in both directions: in a field that
 * takes a VALUE OR A TOKEN, a structure is the value and a bare string is a token path. That is
 * what the printer emits (a family record is `{ … }`, a family token is a path; a size is a
 * unit literal, a size token is a path), and it is the only reading a bare word can have in a
 * value position under the grammar.
 */
function textStyleToIr(raw: Record<string, unknown>, reg: FontRebuild): TextStyleValue {
  const slotOf = (v: unknown, fallback: string): IrSlot => {
    if (typeof v === 'string') return { ref: normId(v) }
    if (typeof v === 'number') return { raw: String(v) }
    if (v && typeof v === 'object' && 'value' in v) {
      const d = v as { value: number; unit?: string }
      return 'unit' in v
        ? {
            dimension: {
              value: Number(d.value),
              unit: (d.unit as DimensionValue['unit']) ?? 'fixed',
            },
          }
        : { raw: String(d.value) }
    }
    return { raw: fallback }
  }
  const family = raw.family
  return {
    family: isFontFamilyValue(family)
      ? fontIdFor(reg, family)
      : // An empty string is "no family picked", which is what the printer writes for a style
        // whose family was never chosen - not a reference to a token called nothing.
        typeof family === 'string' && family !== ''
        ? { ref: normId(family) }
        : '',
    size: slotOf(raw.size, '16'),
    weight: slotOf(raw.weight, '400'),
    // `line` / `tracking` are read as synonyms so a hand-written file that spells them the
    // short way is not silently emptied.
    lineHeight: slotOf(raw['line-height'] ?? raw.lineHeight ?? raw.line, '1.5'),
    letterSpacing: slotOf(raw['letter-spacing'] ?? raw.letterSpacing ?? raw.tracking, '0'),
  }
}

// An AST token value → an editor-IR TokenValue.
function valueToIr(tok: AstToken, issues: string[], reg: FontRebuild): IrTokenValue {
  const v = tok.value
  if (v.kind === 'alias') {
    // AST alias refs (context-id → token-id) → a base slot plus one exception per context
    // that actually differs from it. Shared with the migration in core so the "which key is
    // the base, and drop the ones that merely repeat it" rule lives in exactly one place.
    const slots: Record<string, IrSlot> = {}
    for (const [ctx, id] of Object.entries(v.refs)) slots[ctx] = { ref: normId(id) }
    return contextSlotsToValue(v.by, slots)
  }
  if (v.kind === 'escape') {
    return { base: { raw: v.raw } }
  }
  // A computed value (proposal 0044). The two op vocabularies map across unchanged; only a
  // `mix` operand changes shape, because the AST names a token where the IR takes a whole
  // slot. Which vocabulary applies is the token's type, so nothing is decided here.
  if (v.kind === 'compute') {
    return {
      base: {
        compute: {
          base: { ref: normId(v.base) },
          ops: v.ops.map((op) =>
            op.op === 'mix'
              ? { op: 'mix' as const, with: { ref: normId(op.with) }, amount: op.amount }
              : op,
          ),
          ...(v.space ? { space: v.space } : {}),
        },
      },
    }
  }
  // raw - render the typed value back to an IR raw slot string.
  const raw = v.value as unknown
  // The two STRUCTURED types, read back as structure rather than stringified. Both used to fall
  // through to the JSON fallback at the bottom: a family came back as `{"family":"Inter"}` in a
  // raw slot, and a text style the same - which is how a round trip lost them.
  if (tok.type === 'fontFamily' && isFontFamilyValue(raw)) {
    return { base: { font: { id: fontIdFor(reg, raw) } } }
  }
  // Gated on `family`, which is the key that makes a record a TEXT STYLE in this surface. A
  // hand-authored file may carry a typography record of its own shape (the Radix corpus writes
  // `{ role; size; line; tracking }`); reading that as a text style would silently drop the
  // keys the editor has no field for, so it keeps the opaque path below instead.
  if (tok.type === 'typography' && raw && typeof raw === 'object' && 'family' in raw) {
    return { base: { textStyle: textStyleToIr(raw as Record<string, unknown>, reg) } }
  }
  if (tok.type === 'color' && raw && typeof raw === 'object' && 'space' in (raw as object)) {
    return { base: { raw: colorToCss(raw as ColorValue) } }
  }
  // A length keeps its type across the boundary (0038). It used to be flattened to a
  // CSS string here and then unit-stripped on load, which is what made `12px` and
  // `0.75rem` the same value in the editor.
  if (raw && typeof raw === 'object' && 'keyword' in (raw as object)) {
    return { base: { dimension: raw as LengthValue } }
  }
  if (raw && typeof raw === 'object' && 'value' in (raw as object) && 'unit' in (raw as object)) {
    return { base: { dimension: raw as DimensionValue } }
  }
  // A UNITLESS scalar: `{ value: 0.9 }` with no unit, which is how the AST carries an opacity
  // (and any other ratio). It failed the dimension check just above precisely because it has no
  // unit, then fell through to the JSON fallback - so an opacity of 0.9 came back as the raw
  // string `{"value":0.9}` (proposal 0041 §1.1c). Placed after the dimension branch so a real
  // dimension still wins.
  if (
    raw &&
    typeof raw === 'object' &&
    'value' in (raw as object) &&
    !('unit' in (raw as object))
  ) {
    const scalar = (raw as { value: unknown }).value
    if (typeof scalar === 'number' || typeof scalar === 'string') {
      return { base: { raw: String(scalar) } }
    }
  }
  // A duration carries `{ ms: 120 }`. It lowers to the SURFACE spelling `120ms`, not to a bare
  // `120`: the emitter echoes a unit-suffixed literal verbatim, so this is what closes the round
  // trip - and a bare number in a duration position would leave the reader guessing the unit,
  // the same trap that produced the 16x length drift in 0038.
  if (raw && typeof raw === 'object' && 'ms' in (raw as object)) {
    const ms = (raw as { ms: unknown }).ms
    if (typeof ms === 'number') return { base: { raw: `${ms}ms` } }
  }
  if (tok.type === 'fontWeight' && raw && typeof raw === 'object' && 'weight' in (raw as object)) {
    return { base: { raw: String((raw as { weight: number }).weight) } }
  }
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return { base: { raw: String(raw) } }
  }
  // A structured value with no scalar rendering (typography, shadow, …): stringify so
  // nothing is lost, and flag it - the editor stores composite values differently.
  issues.push(`token "${tok.name}" (${tok.type}): composite value stringified into a raw slot`)
  return { base: { raw: JSON.stringify(raw) } }
}

function contextGroupToIr(cg: AstContextGroup): DocumentFoundations['contextGroups'][number] {
  return {
    id: cg.id,
    name: cg.name,
    contexts: cg.contexts.map((c) => ({ id: c.id, name: c.name })),
  }
}

// ─── Undoing the parser's literal hoisting (proposal 0041) ────────────────────
// `alias by ColorScheme { Light -> hex(fcfcfc); Dark -> hex(111111) }` cannot be held by the
// canonical AST as written: its alias slots address a token by ID and nothing else, so the
// parser mints a `tok.lit-color-N` token per distinct literal and points the slot there.
//
// The editor IR has no such constraint - an exception slot holds a value directly - so keeping
// those tokens imports a foundations the author never wrote: the Radix system arrives as 2391
// tokens instead of 969, 1422 of them named `(inline color)`. The emitter already restores the
// sugar on the way out (`inlineableHoisted`), which is what makes this a document-SHAPE defect
// rather than a lossy one: the file was right, the document was wrong, and the round trip
// closed anyway because both ends agreed to hide the artifact.
//
// The one hoisted token that must stay is the one a COMPONENT names: a facet holds a token id
// and cannot hold a value, so inlining it would leave the facet pointing at nothing. That is
// the emitter's own escape, and it has to be the same escape here or an export would reintroduce
// what an import removed.
function inlineHoistedLiterals(foundations: DocumentFoundations, consumers: unknown[]): number {
  const hoisted = new Map<string, IrSlot>()
  for (const layer of foundations.layers) {
    for (const t of layer.tokens) if (isHoistedLiteral(t)) hoisted.set(t.id, t.value.base)
  }
  if (hoisted.size === 0) return 0

  // Same id-in-the-JSON test the emitter uses. A facet value is a bare token id, so the quoted
  // form is precise enough and needs no traversal of every node shape.
  const consumerText = JSON.stringify(consumers)
  const pinned = new Set([...hoisted.keys()].filter((id) => consumerText.includes(`"${id}"`)))

  // A hoisted token's own value is always a literal, never a ref - but the walk is written to
  // terminate on a cycle anyway, because a malformed document must not hang an import.
  // A `mix` operand is a whole slot, so a computed value can name a hoisted literal too.
  function deref(slot: IrSlot, seen: Set<string>): IrSlot {
    if ('compute' in slot) {
      const c = slot.compute
      return {
        compute: {
          ...c,
          base: deref(c.base, new Set(seen)),
          ops: c.ops.map((op) =>
            op.op === 'mix' ? { ...op, with: deref(op.with, new Set(seen)) } : op,
          ),
        },
      }
    }
    if (!('ref' in slot)) return slot
    const target = hoisted.get(slot.ref)
    if (!target || pinned.has(slot.ref) || seen.has(slot.ref)) return slot
    seen.add(slot.ref)
    return deref(target, seen)
  }

  for (const layer of foundations.layers) {
    layer.tokens = layer.tokens
      .filter((t) => !isHoistedLiteral(t) || pinned.has(t.id))
      .map((t) => ({
        ...t,
        value: {
          base: deref(t.value.base, new Set()),
          ...(t.value.exceptions
            ? {
                exceptions: t.value.exceptions.map((e) => ({
                  ...e,
                  slot: deref(e.slot, new Set()),
                })),
              }
            : {}),
        },
      }))
  }
  return hoisted.size - pinned.size
}

// ─── Recovering the token GROUP tree from a path (proposal 0041) ─────────────
// A declaration path IS the hierarchy: `token palette/gray/1` means a token named `1` inside
// group `gray` inside group `palette`. The editor models that as `TokenGroup`s plus a leaf
// name, but this lowering used to take the whole path as the NAME with `group: null` - so
// importing a `.milda` flattened an 8-group foundations into a list of slash-named tokens.
// Authored structure, silently lost, and the Foundations tree came back as a flat list.
//
// Nothing in the FILE was missing, so nothing in the grammar needed to change: the path was
// already there and simply was not being interpreted. Group ids are derived from the path so
// they are deterministic - the same file always yields the same tree, which is what lets the
// printer reproduce the same paths and the round trip close.
interface GroupTree {
  groups: TokenGroup[]
  byPath: Map<string, string>
}

function groupIdFor(path: string[]): string {
  return `grp.${path.map(seg).join('.')}`
}

// Ensure every ancestor group of `path` exists, and return the deepest one's id (null at root).
function ensureGroups(tree: GroupTree, path: string[]): string | null {
  let parent: string | null = null
  for (let i = 0; i < path.length; i++) {
    const prefix = path.slice(0, i + 1)
    const key = prefix.join('/')
    const existing = tree.byPath.get(key)
    if (existing) {
      parent = existing
      continue
    }
    const id = groupIdFor(prefix)
    tree.groups.push({ id, name: path[i] as string, parent, order: tree.groups.length })
    tree.byPath.set(key, id)
    parent = id
  }
  return parent
}

export function foundationsToIr(f: AstFoundations): FoundationsToIrResult {
  const issues: string[] = []
  // Shared across every layer: the same family named twice is one library entry.
  const reg: FontRebuild = { fonts: [], byKey: new Map() }
  const layers: IrLayer[] = f.layers.map((layer) => {
    const tree: GroupTree = { groups: [], byPath: new Map() }
    const tokens = layer.tokens.map((t, i): IrToken => {
      const irType = TYPE_TO_IR[t.type] ?? 'size'
      // A type word this reader does not know - a file written against a LATER surface, most
      // likely. The fallback has to be something, and `size` is the least surprising one, but it
      // is a guess: a unitless `1.5` read as a length becomes `1.5px`, which is how the missing
      // `ratio` word corrupted line heights in the first place (0041 §4). So the guess is stated
      // rather than made in silence - spec/FORMAT.md §6 requires exactly this of any reader.
      if (!(t.type in TYPE_TO_IR)) {
        issues.push(
          `token "${t.name}": unknown token type "${t.type}" (a newer surface version?); read as "${irType}", so its value may be misread`,
        )
      }
      if (IR_LOSSY.has(t.type)) {
        issues.push(
          `token "${t.name}": AST type "${t.type}" has no editor scale; mapped to "${irType}"`,
        )
      }
      // Split the declaration path: the last segment names the token, the rest is its group
      // ancestry. A name without separators is simply ungrouped.
      const parts = t.name
        .split('/')
        .map((x) => x.trim())
        .filter(Boolean)
      const leaf = parts.length ? (parts[parts.length - 1] as string) : t.name
      const group = parts.length > 1 ? ensureGroups(tree, parts.slice(0, -1)) : null
      return {
        id: normId(t.id),
        name: leaf,
        type: irType,
        value: valueToIr(t, issues, reg),
        group,
        order: i,
        ...(t.description ? { description: t.description } : {}),
      }
    })
    return { id: layer.id, name: layer.name, order: layer.order, groups: tree.groups, tokens }
  })

  const foundations: DocumentFoundations = {
    contextGroups: f.contextGroups.map(contextGroupToIr),
    // Props the system declares once (0051 §5). The components that take one carry a
    // materialized copy plus a `global` marker, so a reader never has to resolve this registry
    // to know a component's API - the registry is what the AUTHORING surfaces edit.
    ...(f.globalProps?.length
      ? {
          globalProps: f.globalProps.map((gp) => ({
            id: gp.id,
            name: gp.name,
            type: typeToIr(gp.type),
            ...(gp.default !== undefined ? { default: gp.default } : {}),
            ...(gp.description ? { description: gp.description } : {}),
          })),
        }
      : {}),
    layers,
    fonts: reg.fonts,
    icons: { sets: [], icons: [] },
  }
  return { foundations, issues }
}

// ─── components ──────────────────────────────────────────────────────────────
// The inverse here is inherently heuristic: the AST `anatomy` is a FLAT map of parts
// (facets/layout/variants), while the editor IR is a node TREE with kinds/tags/origins
// that the surface doesn't carry. So node nesting is recovered from dotted part names
// (`surface.option` ⇒ child of `surface`), node kind is inferred, and tags default to
// `auto`. The result is a valid, editable ComponentIR - not a byte-identical original.

const seg = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'

// milda token ids are `tok.`-prefixed and dotted (`tok.gray.12`); the editor uses
// dot-free, hyphenated ids (`gray-12`) that become CSS custom-property names
// (`--ds-color-gray-12`). Normalize on import so token DEFINITIONS and every REFERENCE
// (facets, layout, alias slots) agree - otherwise the dotted id both breaks the CSS var
// name and trips `isRawValue`, emitting the raw `tok.gray.12` string as the value.
const normId = (id: string): string => id.replace(/^tok\./, '').replace(/\./g, '-')

// AST FacetName → editor facet key. Names with no editor facet (typography axes,
// state-layer, backdrop) map to null and are dropped with a note.
const FACET_TO_IR: Record<string, string | null> = {
  fill: 'fill',
  ink: 'ink',
  corner: 'corner',
  gap: 'gap',
  elevation: 'elevation',
  opacity: 'opacity',
  ring: 'ring',
  text: 'text.size',
  weight: 'text.weight', // reuses the existing core font-weight facet
  font: 'font',
  slant: 'slant',
  textClamp: null,
  textWrap: null,
  overlay: null,
  backdrop: null,
}

function facetValueToStr(v: FacetValue): string | null {
  if ('token' in v) return normId(v.token)
  if ('raw' in v) return v.raw
  if ('literal' in v) return String(v.literal)
  return null // inset handled by the caller
}

function applyInset(inset: InsetValue, out: Record<string, string>): void {
  if ('all' in inset) {
    if (inset.all) out.inset = normId(inset.all)
    return
  }
  if (inset.block) out.insetY = normId(inset.block)
  if (inset.inline) out.insetX = normId(inset.inline)
}

function facetMapToIr(fm: FacetMap | undefined, issues: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fm) return out
  for (const [name, val] of Object.entries(fm)) {
    if (!val) continue
    if (name === 'inset' && 'inset' in val) {
      applyInset(val.inset, out)
      continue
    }
    // One axis or one edge (proposal 0057): `inset.inline` is stored as `insetX`, an edge under
    // its own dotted key. Core's table is the one place the two spellings meet.
    if (name.startsWith('inset.')) {
      const key = INSET_SURFACE_KEYS[name.slice('inset.'.length) as InsetEdge]
      const s = facetValueToStr(val)
      if (key && s != null) out[key] = s
      continue
    }
    // border (all sides) + per-side borders → split the multi-valued facet into the
    // editor's flat per-property keys (`border[.side].{color,width,style}`).
    if ((name === 'border' || name.startsWith('border.')) && 'border' in val) {
      const b = val.border
      if (b.color) out[`${name}.color`] = normId(b.color)
      if (b.width) out[`${name}.width`] = normId(b.width)
      if (b.style) out[`${name}.style`] = b.style
      continue
    }
    const irKey = FACET_TO_IR[name]
    if (irKey === null) {
      issues.push(`facet "${name}" has no editor equivalent - dropped`)
      continue
    }
    if (irKey === undefined) continue
    const s = facetValueToStr(val)
    if (s != null) out[irKey] = s
  }
  return out
}

// An AST axis → the record's spelling (`fit`, `fill`, `weight(2)`, `ratio(16:9)`, a size id).
// The surface's words ARE the record's values (0056 §3.1), so this is a spelling, not a lowering.
function axisToStr(axis: AxisIntent): string {
  if (axis === 'fit' || axis === 'fill') return axis
  if ('fixed' in axis) return normId(axis.fixed)
  if ('weight' in axis) return `weight(${axis.weight})`
  return `ratio(${axis.ratio.w}:${axis.ratio.h})`
}

function axisToIr(
  axis: AxisSizeValue | undefined,
  name: 'width' | 'height',
  layout: Record<string, string>,
): void {
  if (!axis) return
  const intent = typeof axis === 'object' && 'intent' in axis ? axis.intent : axis
  layout[name] = axisToStr(intent)
  if (typeof axis === 'object' && 'intent' in axis) {
    if (axis.min) layout[`${name}Min`] = normId(axis.min)
    if (axis.max) layout[`${name}Max`] = normId(axis.max)
  }
}

// LayoutSpec → editor `layout` map, spilling `gap`/`inset` back onto the node's facets
// (where the editor stores them), mirroring the emitter's layout-block assembly.
function layoutToIr(
  ls: LayoutSpec,
  facetsOut: Record<string, string>,
  issues: string[],
): Record<string, string> {
  const layout: Record<string, string> = {}
  if (ls.stack) layout.direction = ls.stack
  if (ls.align) layout.align = ls.align
  if (ls.distribute) layout.distribute = ls.distribute
  if (ls.wrap && ls.wrap !== 'nowrap') layout.wrap = ls.wrap
  else if (ls.flow) layout.wrap = 'wrap'
  if (ls.gap) facetsOut.gap = normId(ls.gap)
  if (ls.inset) applyInset(ls.inset, facetsOut)
  axisToIr(ls.size?.width, 'width', layout)
  axisToIr(ls.size?.height, 'height', layout)
  // `flow` is the default and is not stored, so an absent key and `position flow` read the same.
  if (ls.position && ls.position !== 'flow') {
    layout.position =
      ls.position === 'overlay'
        ? 'overlay'
        : 'pinned' in ls.position
          ? `pinned ${ls.position.pinned.join(' ')}`
          : `bleed ${ls.position.bleed.join(' ')}`
  }
  if (ls.grid) issues.push('layout grid is reserved and has no target yet (0056 §3.3) - dropped')
  return layout
}

// AST predicate ref → editor-IR predicate ref. Structurally identical apart from two
// things: the state-name type (the AST keeps it a plain string, the IR narrows to
// `StateName`), and an `ancestor` leaf, which names a part by PATH in the file and a node
// by id in the IR - so it needs the resolver.
function refToIr(
  ref: AstPredicateRef,
  resolvePart?: (path: string) => string | undefined,
): IrPredicateRef {
  switch (ref.kind) {
    case 'prop':
      return { kind: 'prop', path: ref.path }
    case 'state':
      return { kind: 'state', state: ref.state as IrStateName }
    case 'context':
      return { kind: 'context', group: ref.group }
    case 'ancestor':
      return {
        kind: 'ancestor',
        nodeId: resolvePart?.(ref.nodeId) ?? ref.nodeId,
        state: ref.state as IrStateName,
      }
  }
}

// AST predicate (proposal 0032) → editor-IR `Predicate`. Recurses the AND/OR/NOT tree and
// lowers each comparison leaf; the two shapes match 1:1, so this is a faithful reconstruction
// of the condition the emitter serialized (`predToDsl`) - the inverse that closes the loop.
function predicateToIr(
  p: AstPredicate,
  resolvePart?: (path: string) => string | undefined,
): IrPredicate {
  switch (p.kind) {
    case 'all':
      return { kind: 'all', items: p.items.map((i) => predicateToIr(i, resolvePart)) }
    case 'any':
      return { kind: 'any', items: p.items.map((i) => predicateToIr(i, resolvePart)) }
    case 'not':
      return { kind: 'not', item: predicateToIr(p.item, resolvePart) }
    case 'cmp':
      return {
        kind: 'cmp',
        ref: refToIr(p.ref, resolvePart),
        op: p.op,
        ...(p.value !== undefined ? { value: p.value } : {}),
      }
  }
}

// ─── Lowering what a part IS (proposal 0041) ──────────────────────────────────
// The inverse of the part statements the printer emits. Every one of these VALIDATES
// rather than casts: a `.milda` is untrusted input, and these fields drive code
// generation, so a `kind haha` must not reach a document the generator branches on.
// Anything unrecognised is dropped with an issue, never silently coerced.

// The word sets come from the LANGUAGE (@mildastudio/milda's vocabulary), not from a copy
// declared here: the reader, this lowering and the editor's completion all have to agree about
// what the surface accepts, and two lists in two files with nothing checking them is the exact
// shape of the token-type and length-set defects this proposal already had to fix.
const KNOWN_KINDS = new Set<string>(NODE_KINDS)
const KNOWN_INTERACTIONS = new Set<string>(INTERACTION_KINDS)
const KNOWN_MEDIA = new Set<string>(MEDIA_TYPES)

// A surface kebab key → the IR's camelCase field (`week-starts-on` → `weekStartsOn`).
const camel = camelField

function valueToContent(v: PartValue): ContentValue {
  return v.kind === 'bind' ? { kind: 'bind', propName: v.prop } : { kind: 'value', value: v.value }
}

function contentToIr(
  c: PartContent,
  resolvePart?: (path: string) => string | undefined,
): NodeContent {
  if (c.kind === 'static') return { kind: 'static', text: c.text }
  return {
    kind: 'dynamic',
    default: valueToContent(c.default),
    rules: c.rules.map((r, i) => ({
      id: `cr${i}`,
      ...(r.when ? { when: predicateToIr(r.when, resolvePart) } : {}),
      value: valueToContent(r.value),
    })),
  }
}

function configValue(spec: ConfigFieldSpec, raw: unknown): unknown {
  switch (spec.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? raw : undefined
    case 'number':
      return typeof raw === 'number' ? raw : undefined
    case 'numbers': {
      const arr = Array.isArray(raw) ? raw : [raw]
      const nums = arr.filter((x): x is number => typeof x === 'number')
      return nums.length === arr.length ? nums : undefined
    }
    case 'enum':
      return typeof raw === 'string' && spec.values.includes(raw) ? raw : undefined
    case 'enums': {
      // An EMPTY list is meaningful, not missing: `dismiss []` is a non-dismissable
      // overlay (0034). Collapsing it to absent would flip the behaviour on import.
      const arr = Array.isArray(raw) ? raw : [raw]
      const words = arr.filter((x): x is string => typeof x === 'string' && spec.values.includes(x))
      return words.length === arr.length ? words : undefined
    }
  }
}

// Every config block on a part → the node fields they configure, validated.
function configsToIr(
  configs: Record<string, Record<string, unknown>>,
  issues: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, block] of Object.entries(configs)) {
    const spec = PART_CONFIGS[name]
    if (!spec) {
      issues.push(`config block "${name}" is not a known configuration surface - dropped`)
      continue
    }
    // `severity`/`accordion` are single-valued surfaces stored under `value`.
    if (spec.single && spec.fields.value) {
      const v = configValue(spec.fields.value as ConfigFieldSpec, block.value)
      if (v !== undefined) out[spec.field] = v
      else issues.push(`${name}: value "${String(block.value)}" is not allowed - dropped`)
      continue
    }
    const cfg: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(block)) {
      const field = camel(key)
      const fieldSpec = spec.fields[field]
      if (!fieldSpec) {
        issues.push(`${name}: unknown setting "${key}" - dropped`)
        continue
      }
      const v = configValue(fieldSpec, raw)
      if (v === undefined)
        issues.push(`${name}.${key}: value "${JSON.stringify(raw)}" is not allowed - dropped`)
      else cfg[field] = v
    }
    if (Object.keys(cfg).length) out[spec.field] = cfg
  }
  return out
}

// A slot descriptor, complete (proposal 0041): `default` decides the positional-children
// slot, so losing it changed the generated component's call shape.
function slotToIr(slot: PartSlot): IrNodeSlot {
  return {
    arity: slot.arity,
    accepts: slot.accepts,
    ...(slot.default ? { default: true } : {}),
    ...(slot.keyedBy ? { keyedBy: slot.keyedBy } : {}),
    ...(slot.exposeAs ? { exposeAs: slot.exposeAs } : {}),
    ...(slot.role === 'trigger' || slot.role === 'panel' ? { role: slot.role } : {}),
    ...(slot.description ? { description: slot.description } : {}),
    ...(slot.sample ? { sample: sampleToIr(slot.sample) } : {}),
  }
}

function sampleToIr(s: PartSlotSample): SlotSample {
  if (s.kind === 'text') return { kind: 'text', text: s.text }
  if (s.kind === 'example') return { kind: 'example', exampleId: s.example }
  return { kind: 'list', items: s.items.map(sampleToIr) }
}

// A surface token word (`fast`, `motion.fast`) → the IR token id it references. A literal
// (`150ms`) is kept verbatim: the same rule the paint facets use, so a motion duration and
// a spacing value cross the boundary the same way.
const RAW_VALUE_RE = /^#|[(%]|\d(px|rem|em|ms|s)$/
function tokRef(word: string): string {
  return RAW_VALUE_RE.test(word) ? word : `tok.${word}`
}

// A component NAME → the id an imported component carries. Deterministic (and the same
// rule the parser uses for a component's own id), which is what makes an `instance`
// reference resolve to the component the file declares.
const cmpRefId = (name: string) => `cmp.${seg(name)}`

// A free behaviour (0041 §4): validated field by field against the kind's declared
// fields, so a malformed block cannot become a behaviour the generator then emits.
function behaviorToIr(
  b: PartBehavior,
  id: string,
  resolvePart: (path: string) => string | undefined,
  issues: string[],
  partName: string,
): NodeBehavior | null {
  const kind = camel(b.kind)
  const fields = BEHAVIOR_FIELDS[kind]
  if (!fields) {
    issues.push(`part "${partName}": unknown behavior "${b.kind}" - dropped`)
    return null
  }
  const out: Record<string, unknown> = { id, kind }
  for (const [key, raw] of Object.entries(b.config)) {
    const field = camel(key)
    const type = fields[field]
    if (!type) {
      issues.push(`part "${partName}" behavior ${b.kind}: unknown setting "${key}" - dropped`)
      continue
    }
    if (type === 'node') {
      const resolved = resolvePart(String(raw))
      if (resolved) out[field] = resolved
      else
        issues.push(
          `part "${partName}" behavior ${b.kind}.${key}: no part named "${String(raw)}" - dropped`,
        )
      continue
    }
    if (type === 'nodes') {
      const list = (Array.isArray(raw) ? raw : [raw])
        .map((x) => resolvePart(String(x)))
        .filter((x): x is string => !!x)
      out[field] = list
      continue
    }
    if (typeof raw === type) out[field] = raw
    else issues.push(`part "${partName}" behavior ${b.kind}.${key}: expected a ${type} - dropped`)
  }
  // The defaults fill any field the file left out, so the result is a COMPLETE behaviour
  // (the generator reads these fields unconditionally) rather than a partial one.
  return { ...defaultBehavior(kind as FreeBehaviorKind, id), ...out } as NodeBehavior
}

let ruleSeq = 0
function partStateRules(
  part: Part,
  issues: string[],
  resolvePart?: (path: string) => string | undefined,
): StateRule[] {
  const rules: StateRule[] = []
  for (const [name, ps] of Object.entries(part.states ?? {})) {
    if (!ps) continue
    const facets = facetMapToIr(ps.facets, issues)
    const layout = ps.layout ? layoutToIr(ps.layout, facets, issues) : undefined
    rules.push({
      id: `sr${ruleSeq++}`,
      props: {},
      states: [name as StateRule['states'][number]],
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
    })
  }
  for (const v of part.variants ?? []) {
    const facets = facetMapToIr(v.facets, issues)
    const layout = v.layout ? layoutToIr(v.layout, facets, issues) : undefined
    // A rich predicate (`when <predicate>`, 0032) is the canonical condition and lands in
    // `StateRule.when`; the flat single-condition `when prop=value` keeps its legacy home in
    // `props` (the representable fast path). Only one is ever set on a given variant.
    rules.push({
      id: `sr${ruleSeq++}`,
      props: v.when ? { [v.when.prop]: v.when.eq } : {},
      states: (v.states ?? []) as StateRule['states'],
      ...(v.whenPredicate ? { when: predicateToIr(v.whenPredicate, resolvePart) } : {}),
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
    })
  }
  return rules
}

// A type reference by NAME → the id of the language's builtin type of that name, if any.
// Compared on the normalized segment, because the surface name (`IconName`) and the parser's
// derived id (`st.iconname`) differ only in casing.
const BUILTIN_TYPE_IDS_BY_NAME = new Map(BUILTIN_SHARED_TYPES.map((t) => [seg(t.name), t.id]))
function builtinTypeId(ref: string): string | undefined {
  const local = ref.includes('.') ? ref.slice(ref.lastIndexOf('.') + 1) : ref
  return BUILTIN_TYPE_IDS_BY_NAME.get(seg(local))
}

// AST TypeExpr → editor PropType (a structural superset; recurse the shared subset).
function typeToIr(t: TypeExpr): PropType {
  switch (t.kind) {
    case 'string':
    case 'number':
    case 'boolean':
      return t
    case 'enum':
      return { kind: 'enum', values: t.values }
    // Carried, not flattened to the group's values as an enum: the values are the easy half, and
    // the BINDING is the half that makes a `variant` prop repaint anything (proposal 0001 §3).
    case 'context':
      return { kind: 'context', group: t.group }
    case 'union':
      return { kind: 'union', members: t.members.map(typeToIr) }
    case 'ref':
      // A reference to one of the language's BUILTIN types (`ref IconName`) resolves to the
      // builtin's id. The file cannot declare them - they are part of the language - so
      // without this the reference became a dangling `st.iconname` that matched no type and
      // reprinted under a different name on every pass (proposal 0041).
      return { kind: 'ref', ref: builtinTypeId(t.ref) ?? t.ref }
    case 'array':
      return { kind: 'array', item: typeToIr(t.item) }
    case 'object':
      return {
        kind: 'object',
        fields: t.fields.map((f) => ({
          id: f.id,
          name: f.name,
          type: typeToIr(f.type),
          required: f.required,
          ...(f.description ? { description: f.description } : {}),
        })),
      }
    case 'component':
      return { kind: 'component', ...(t.componentIds ? { componentIds: t.componentIds } : {}) }
    default:
      return { kind: 'any' }
  }
}

function propToIr(p: AstPropDef): IrPropDef {
  const out: IrPropDef = { id: p.id ?? `prop.${seg(p.name)}`, name: p.name, type: typeToIr(p.type) }
  if (p.global) out.global = true
  if (p.default !== undefined) out.default = p.default
  if (p.required !== undefined) out.required = p.required
  // Prop leaves only, so there is no part path to resolve (proposal 0052 §4).
  if (p.requiredWhen) out.requiredWhen = predicateToIr(p.requiredWhen)
  if (p.description) out.description = p.description
  if (p.binding) out.binding = p.binding
  // Prop metadata annotations (proposal 0026): AST meta map → typed core PropMeta.
  if (p.meta) {
    const pm: NonNullable<IrPropDef['meta']> = {}
    const st = p.meta.status
    if (st === 'stable' || st === 'beta' || st === 'experimental' || st === 'deprecated')
      pm.status = st
    if (p.meta.since != null) pm.since = String(p.meta.since)
    if (Object.keys(pm).length) out.meta = pm
  }
  return out
}

// The surface names a constraint by nothing but its members, so its id is derived from them: the
// same file always yields the same ids, and the editor's mutations still have a handle (0052 §4).
function constraintToIr(c: AstPropConstraint, i: number): IrPropConstraint {
  return {
    id: `pc.${i}.${c.kind}.${c.props.map(seg).join('.')}`,
    kind: c.kind,
    props: [...c.props],
  }
}

// ─── usage rules (proposal 0052 §5) ─────────────────────────────────────────────
// The AST and the IR shapes match 1:1 except where the two vocabularies differ: token types
// (`TYPE_TO_IR`, the same map a token declaration lowers through) and the predicate.

// `nameOf` turns the identifier a rule wrote (`ToggleButton`, the name a component is DECLARED
// by) into the component's authored name ("Toggle button"), which is what the IR names it by.
export function rulesToIr(
  rules: AstUsageRule[],
  nameOf: (written: string) => string = (n) => n,
): IrUsageRule[] {
  const ruleSubjectToIr = (s: AstRuleSubject): IrRuleSubject => ({
    kind: s.kind,
    name: s.kind === 'component' ? nameOf(s.name) : s.name,
    ...(s.where ? { where: predicateToIr(s.where) } : {}),
  })
  return rules.map((r): IrUsageRule => {
    const head = { id: r.id, severity: r.severity, rationale: r.rationale }
    switch (r.kind) {
      case 'count':
        return {
          ...head,
          kind: 'count',
          subject: ruleSubjectToIr(r.subject),
          within: ruleSubjectToIr(r.within),
          ...(r.min !== undefined ? { min: r.min } : {}),
          ...(r.max !== undefined ? { max: r.max } : {}),
        }
      case 'never':
        return {
          ...head,
          kind: 'never',
          subject: ruleSubjectToIr(r.subject),
          within: ruleSubjectToIr(r.within),
        }
      case 'only-within':
        return {
          ...head,
          kind: 'only-within',
          subject: ruleSubjectToIr(r.subject),
          within: r.within.map(ruleSubjectToIr),
        }
      case 'tokens-only':
        // A word this reader did not know stays as written (the parser warned): dropping it would
        // narrow the rule, and inventing a type would widen it.
        return {
          ...head,
          kind: 'tokens-only',
          types: [...new Set(r.types.map((t) => TYPE_TO_IR[t] ?? (t as unknown as IrTokenType)))],
        }
      case 'prefer':
        return {
          ...head,
          kind: 'prefer',
          component: nameOf(r.component),
          archetypes: [...r.archetypes],
        }
    }
  })
}

function eventToIr(e: AstEventDef): IrEventDef {
  const out: IrEventDef = { id: e.id ?? `ev.${seg(e.name)}`, name: e.name }
  if (e.payload) out.payload = typeToIr(e.payload)
  if (e.description) out.description = e.description
  return out
}

// A component recovered from a file carries the id the FILE implies (`cmp.<name>`), not a
// freshly minted one: an `instance` addresses the component it nests by name, and that
// reference can only resolve if the reader agrees on the id both sides derive (0041 §1.1).
export interface ImportedComponent extends ComponentIR {
  id: string
  /** The library group this component belongs to, by group id (proposal 0041). */
  group?: string
  /** Sibling order within its group - the file's declaration order. */
  order?: number
}

export interface ComponentToIrResult {
  component: ImportedComponent
  issues: string[]
}

// ─── What the archetype says a component's parts are ─────────────────────────
// The surface names a part only when it has something to SAY about it: `archetype Button`
// plus `part root { … }` is a complete Button, because the label is the archetype's, not the
// author's. Every other producer of a component reads the anatomy for the rest - `seedStructure`
// is what runs when the Studio creates one, and it is where a `label` becomes the default
// CONTENT SLOT and an `icon` becomes an icon node.
//
// This reader used to skip that step entirely and build the tree from declared parts alone, so
// an imported Radix Button arrived with a root and nothing else: no label, no `{children}` in the
// generated React, an empty rectangle on the canvas, and an anatomy that did not match the
// archetype it claimed - which is what "the archetype was not recognised" looks like from the
// outside. The archetype WAS carried; it just was not applied.
// The index itself is the language package's (`anatomyIndex`), because editor tooling asks the
// same question - which parts does this archetype require - and must get this reader's answer.
// It is keyed by the part's NAME, not its path: a file is free to nest an archetype's part
// deeper than the anatomy does (the Radix DropdownMenu writes `item` as `content.item`), and
// matching on the path once seeded a second copy of it one level up.
//
// Since 0055 the reader also leaves that question to the rule rather than to the file: the file
// no longer says which parts are `locked`, and `isLockedPart` answers it from the archetype.

// What a `gate ‹part› active when ‹expr›` says as a node condition. The expression is an atom
// OUTPUT (`Async.loading`, `S.selected`) - the composition algebra's own vocabulary, which the
// predicate model has no leaf for. What it CAN read is the UI state of the same name, and that
// is not a coincidence: an atom output and the state it drives are the same fact under two
// names (`async-state.loading` is what makes a node `loading`), which is why the surface lets a
// `state loading { … }` rule sit next to the gate. A bare word is read as the state or prop it
// names. Anything else returns null, and the caller says so rather than guessing.
const STATE_NAMES = new Set<string>(ALL_STATE_NAMES)

// A wire's `when ‹prop›` plus a `‹alias›.‹output›` source, read as a state binding: the prop is
// what makes that output hold, and an output named like a UI state IS that state. Only a BOOLEAN
// prop qualifies - a state is a boolean fact, and `when size` would not be one.
function wireStateBinding(
  from: string,
  when: string,
  c: AstComponent,
): { state: string; propName: string } | null {
  const output = from.includes('.') ? (from.split('.')[1] as string) : from
  const state = output.toLowerCase()
  if (!STATE_NAMES.has(state)) return null
  const prop = c.contract.props.find((p) => p.name === when)
  if (!prop || (prop.type as { kind?: string } | undefined)?.kind !== 'boolean') return null
  return { state, propName: prop.name }
}
function gatePresence(activeWhen: string): IrPredicate | null {
  const expr = activeWhen.trim()
  if (!/^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)?$/.test(expr)) return null
  const output = (expr.includes('.') ? expr.split('.')[1] : expr) as string
  const state = output.toLowerCase()
  if (!STATE_NAMES.has(state)) return null
  return { kind: 'cmp', ref: { kind: 'state', state: state as IrStateName }, op: 'set' }
}

export function componentToIr(c: AstComponent): ComponentToIrResult {
  const issues: string[] = []
  const entries = Object.entries(c.anatomy)
  const cid = c.id || `cmp.${seg(c.name)}`
  // One id per declared part PATH, assigned in declaration order. The slug lowercases, so two
  // distinct paths can share a slug - a root `Media` over a child `media` is the shape a
  // Studio-built Media component exports as - and an id derived per call made the second part
  // silently replace the first. A collision takes a numbered suffix instead; a path that collides
  // with nothing keeps exactly the id it always had.
  const idByPath = new Map<string, string>()
  const usedIds = new Set<string>()
  for (const [path] of entries) {
    const base = `${cid}:${seg(path)}`
    let id = base
    for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`
    usedIds.add(id)
    idByPath.set(path, id)
  }
  const nodeId = (partName: string) => idByPath.get(partName) ?? `${cid}:${seg(partName)}`
  // What the ARCHETYPE says this component's parts are. A file names only the parts it has
  // something to say about - `archetype Button` plus `part root` is a complete, legal Radix
  // Button - so the anatomy is where the rest of the answer lives: which parts exist, what
  // each one IS, and which of them is the content slot. See `anatomyIndex`.
  const anatomy = anatomyIndex(c.archetype)
  // Part paths by their own NAME. A part is addressed by path in the file, but referred to by
  // name from outside the anatomy (a `gate` names `spinner`, not `root.spinner`), and the seed
  // pass below adds to it - so both readings resolve against one map.
  const partPathByName = new Map(entries.map(([path]) => [path.split('.').pop() || path, path]))

  const nodes: Record<string, ComponentNode> = {}
  const rootName = entries[0]?.[0]
  // Nodes whose kind is SETTLED - the file declared it, or the archetype's anatomy answered
  // it. Inference below is the last resort for a part neither one names, and must not overwrite
  // either of them.
  const settledKinds = new Set<string>()

  // Resolve each part's parent: the longest dotted-prefix that is also a part;
  // else the first part (root); the root itself has no parent.
  const parentOf = (partName: string): string | null => {
    if (partName === rootName) return null
    if (partName.includes('.')) {
      const segs = partName.split('.')
      for (let i = segs.length - 1; i >= 1; i--) {
        const prefix = segs.slice(0, i).join('.')
        if (c.anatomy[prefix]) return prefix
      }
    }
    return rootName ?? null
  }

  // A part is addressed by PATH throughout the file (an `ancestor` leaf, an accessible
  // name's `labelled-by`, a behaviour's target). Resolving one is only valid for a part the
  // file actually declares - a path that names nothing is dropped with an issue rather than
  // becoming a pointer to a node that does not exist.
  const resolvePart = (path: string): string | undefined =>
    c.anatomy[path] ? nodeId(path) : undefined
  const resolveOrIssue = (path: string, where: string): string | undefined => {
    const id = resolvePart(path)
    if (!id) issues.push(`${where}: no part named "${path}" - reference dropped`)
    return id
  }
  // An emit names a declared EVENT; the node stores the event's id.
  const eventIdByName = new Map(c.contract.events.map((e) => [e.name, e.id ?? `ev.${seg(e.name)}`]))

  for (const [partName, part] of entries) {
    const facets = facetMapToIr(part.facets, issues)
    const layout = part.layout ? layoutToIr(part.layout, facets, issues) : undefined
    const states = partStateRules(part, issues, resolvePart)
    const isRoot = partName === rootName
    // The declared kind wins; `container` stays the placeholder for a file that predates
    // `kind` (it is refined by inference below, exactly as before).
    const declaredKind =
      part.kind && KNOWN_KINDS.has(part.kind) ? (part.kind as NodeKind) : undefined
    if (part.kind && !declaredKind)
      issues.push(`part "${partName}": unknown kind "${part.kind}" - inferred instead`)
    // The archetype's own entry for this part, when it has one. It answers two questions the
    // file leaves open: what the part IS (its role, a better answer than inferring from paint)
    // and WHO it belongs to.
    const known = anatomy.get(partName.split('.').pop() || partName)
    const node: ComponentNode = {
      id: nodeId(partName),
      name: partName.split('.').pop() || partName,
      // Declared > the archetype's role > inferred. The role is not a guess: the archetype
      // states it, and reading it keeps a `spinner`-style author part from being mistaken for
      // one of the archetype's own.
      kind: declaredKind ?? (known ? ROLE_TO_KIND[known.role] : 'container'),
      // The platform ELEMENT is deliberately not carried in the file (see the exclusion in
      // apps/studio/lib/format/coverage.test.ts): the target derives it from `kind`.
      tag: 'auto',
      part: partName,
      // A part the archetype does not declare is the AUTHOR's - the Radix Button's overlay
      // `spinner` is the case that named this. Stamping everything `archetype` told the editor
      // it was looking at anatomy it must not restructure, for a part the archetype never
      // heard of.
      // With no anatomy to consult (an archetype-less component), the old default stands: there
      // is nothing to be right or wrong against, and claiming `author` there would rewrite the
      // origin of every part in a Card or a Table on its way through the format.
      origin:
        part.origin ?? (isRoot ? 'root' : anatomy.size === 0 || known ? 'archetype' : 'author'),
      // Settled once the tree is whole (below): the archetype answers it, not the file.
      locked: false,
      parentId: null,
      childrenIds: [],
      ...(Object.keys(facets).length ? { facets } : {}),
      ...(layout && Object.keys(layout).length ? { layout } : {}),
      ...(states.length ? { states } : {}),
      ...(part.presence ? { presence: predicateToIr(part.presence, resolvePart) } : {}),
      ...(part.slot ? { slot: slotToIr(part.slot) } : {}),
    }
    if (declaredKind || known) settledKinds.add(node.id)

    if (part.content) node.content = contentToIr(part.content, resolvePart)
    if (part.a11y) {
      const a11y: NodeA11y = {}
      if (part.a11y.name) a11y.name = valueToContent(part.a11y.name)
      if (part.a11y.labelledBy) {
        const id = resolveOrIssue(part.a11y.labelledBy, `part "${partName}" labelled-by`)
        if (id) a11y.labelledBy = id
      }
      if (part.a11y.describedBy) {
        const id = resolveOrIssue(part.a11y.describedBy, `part "${partName}" described-by`)
        if (id) a11y.describedBy = id
      }
      if (Object.keys(a11y).length) node.a11y = a11y
    }
    if (part.emits?.length) {
      const emits: EventEmission[] = []
      part.emits.forEach((e, i) => {
        const eventId = eventIdByName.get(e.event)
        if (!eventId) {
          issues.push(
            `part "${partName}": emits "${e.event}", which the component does not declare - dropped`,
          )
          return
        }
        if (!KNOWN_INTERACTIONS.has(e.on)) {
          issues.push(`part "${partName}": unknown interaction "${e.on}" - emit dropped`)
          return
        }
        emits.push({
          id: `${nodeId(partName)}.emit.${i}`,
          eventId,
          on: e.on as EventEmission['on'],
          ...(e.payload ? { payload: valueToContent(e.payload) } : {}),
          ...(e.signal ? { signal: e.signal } : {}),
          ...(e.locked ? { locked: true } : {}),
        })
      })
      if (emits.length) node.emits = emits
    }
    if (part.stateBindings?.length) {
      node.stateBindings = part.stateBindings.map((b, i) => ({
        id: `${nodeId(partName)}.bind.${i}`,
        state: b.state,
        propName: b.prop,
      }))
    }
    if (part.valueBinding) node.valueBinding = { propName: part.valueBinding }
    if (part.value) node.value = { type: typeToIr(part.value) }
    if (part.repeat) {
      node.repeat = {
        source:
          part.repeat.source.kind === 'prop'
            ? { kind: 'prop', propName: part.repeat.source.prop }
            : { kind: 'static', items: part.repeat.source.items },
        itemAlias: part.repeat.itemAlias,
      }
    }
    if (part.cell) {
      node.cell = {
        ...(part.cell.header ? { header: true } : {}),
        ...(part.cell.scope ? { scope: part.cell.scope } : {}),
      }
    }
    if (part.control === 'checkbox' || part.control === 'switch')
      node.control = { as: part.control }
    else if (part.control)
      issues.push(`part "${partName}": unknown control "${part.control}" - dropped`)
    if (part.group === 'radio' || part.group === 'segmented') node.group = { as: part.group }
    else if (part.group)
      issues.push(`part "${partName}": unknown group realization "${part.group}" - dropped`)
    if (part.presentation) {
      if (camel(part.presentation) === 'accessibleName') node.presentation = 'accessibleName'
      else issues.push(`part "${partName}": unknown presentation "${part.presentation}" - dropped`)
    }
    if (part.media) {
      if (KNOWN_MEDIA.has(part.media)) node.media = part.media as ComponentNode['media']
      else issues.push(`part "${partName}": unknown media type "${part.media}" - dropped`)
    }
    if (part.mediaSource) {
      node.mediaSource =
        part.mediaSource.kind === 'static'
          ? { kind: 'static', assetId: part.mediaSource.asset }
          : {
              kind: 'bind',
              propName: part.mediaSource.prop,
              ...(part.mediaSource.sample
                ? {
                    sample:
                      part.mediaSource.sample.kind === 'asset'
                        ? { kind: 'asset', assetId: part.mediaSource.sample.asset }
                        : { kind: 'url', url: part.mediaSource.sample.url },
                  }
                : {}),
            }
    }
    if (part.mediaAlt) node.mediaAlt = valueToContent(part.mediaAlt)
    if (part.destination) node.destination = valueToContent(part.destination)
    if (part.motion?.length) {
      node.motion = {
        transitions: part.motion.map((t, i) => ({
          id: `${nodeId(partName)}.motion.${i}`,
          ...(t.facets?.length ? { facets: t.facets } : {}),
          duration: normId(tokRef(t.duration)),
          ...(t.easing ? { easing: normId(tokRef(t.easing)) } : {}),
          ...(t.delay ? { delay: normId(tokRef(t.delay)) } : {}),
        })),
      }
    }
    if (part.instance) {
      node.instance = {
        componentId: cmpRefId(part.instance.component),
        ...(part.instance.props.length
          ? {
              props: part.instance.props.map((p) => ({
                name: p.name,
                value: valueToContent(p.value),
              })),
            }
          : {}),
      }
    }
    if (part.behaviors?.length) {
      const behaviors: NodeBehavior[] = []
      part.behaviors.forEach((b, i) => {
        const lowered = behaviorToIr(
          b,
          `${nodeId(partName)}.bhv.${i}`,
          resolvePart,
          issues,
          partName,
        )
        if (lowered) behaviors.push(lowered)
      })
      if (behaviors.length) node.behaviors = behaviors
    }
    if (part.foreign) {
      // Quarantined, target-tagged content (0041 §4). A snippet for a target this reader
      // does not implement is KEPT (dropping authored code silently is the failure this
      // proposal exists to end) and the parser has already warned about it.
      node.foreign = {
        code: part.foreign.code,
        ...(part.foreign.label ? { label: part.foreign.label } : {}),
      }
    }
    if (part.actions?.length) {
      // Demo interactions (0021): only meaningful inside an example, but lowered here because
      // an example IS an anatomy - the same parts, the same printer, the same reader.
      const actions: DemoAction[] = []
      part.actions.forEach((a, i) => {
        if (!KNOWN_INTERACTIONS.has(a.on)) {
          issues.push(`part "${partName}": unknown interaction "${a.on}" - action dropped`)
          return
        }
        actions.push({
          id: `${nodeId(partName)}.act.${i}`,
          on: a.on as DemoAction['on'],
          op: a.op,
          variable: a.variable,
          ...(a.value !== undefined ? { value: a.value } : {}),
        })
      })
      if (actions.length) node.actions = actions
    }
    if (part.configs) Object.assign(node, configsToIr(part.configs, issues))

    nodes[node.id] = node
  }

  // Wire parent/child links.
  for (const [partName] of entries) {
    const parent = parentOf(partName)
    const node = nodes[nodeId(partName)]
    if (parent) {
      node.parentId = nodeId(parent)
      nodes[nodeId(parent)]?.childrenIds.push(node.id)
    }
  }

  // Seed the archetype parts the file left implicit. `seedStructure` is the reference answer -
  // the same function that runs when the Studio creates a component - so an imported Button and
  // a created Button have the same anatomy, including the `label` part being the default CONTENT
  // slot. Ids are re-derived from the part path (the file addresses parts by path, and a fresh
  // uuid would not survive a re-import), and only NON-optional parts are seeded: inventing a
  // Button's optional icon would put something in the author's tree they never asked for.
  if (anatomy.size && rootName) {
    // The walk is driven by the reference STRUCTURE rather than by the anatomy list, and that is
    // deliberate: the seed builds more than the anatomy names (a Tooltip gets a `description`
    // node, a value control is lowered into a hidden input), and it has already decided which
    // OPTIONAL parts to leave out. Reading its output means those decisions are made once.
    const reference = seedStructure(c.archetype || null, c.name)
    const leafOf = (n: ComponentNode) => (n.part ?? n.name).split('.').pop() as string
    // Reference id -> the id this tree will use, so a reference that points at a sibling node
    // (the Tooltip trigger's `described-by`) can be repointed instead of leaking a uuid that
    // names nothing here.
    const idByRef = new Map<string, string>()
    // The nodes this pass ADDED, which are the only ones whose copied references need
    // repointing: a declared node's `described-by` came from the file and already names a part.
    const seededIds = new Set<string>()
    // A part the file names in its OWN words - one the archetype does not know - that does the
    // job of an archetype part: same kind, same parent. A TextField whose author wrote
    // `part input { kind input }` has its control already; the archetype calling that part
    // `control` is no reason to give it a second one, which is what seeding by name alone did
    // to every Studio-built TextField and TextArea on their next read.
    //
    // Deliberately narrow: only a kind the FILE states, and only the form control. A part whose
    // kind was defaulted is no evidence of what it is for, and a second label or container is a
    // cosmetic surprise where a second input is a broken control.
    const standIns = new Map<string, string>()
    for (const [path, part] of entries) {
      if (path === rootName || part.kind !== 'input') continue
      const leaf = path.split('.').pop() || path
      const node = nodes[nodeId(path)]
      if (!node || anatomy.has(leaf)) continue
      const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : rootName
      const key = `${parentPath}\0${node.kind}`
      if (!standIns.has(key)) standIns.set(key, node.id)
    }
    // Every part path the tree has so far: the file's, then each one this pass seeds, so a seeded
    // part's own children attach to it. Without that, `option` was seeded and `option.label` was
    // not - and the NEXT import, seeing `option` in the file, seeded the label after all. One pass
    // has to reach a fixed point or every export grows the tree.
    const knownPaths = new Set(entries.map(([path]) => path))
    const walkRef = (refId: string, parentPath: string) => {
      const ref = reference.nodes[refId]
      if (!ref) return
      // A reference node with no `part` is not an anatomy part - it is a REALIZATION the seed
      // adds (a BooleanInput's hidden checkbox). The surface addresses parts by path, so there
      // is nothing to seed it as, and the file is the authority on how it lowers its own control.
      if (!ref.part) return
      const leaf = leafOf(ref)
      const repeated = anatomy.get(leaf)?.repeated ?? false
      const declared = findDeclaredPart(leaf, parentPath, rootName, knownPaths, repeated)
      if (!declared) {
        const standIn = standIns.get(`${parentPath}\0${ref.kind}`)
        if (standIn) {
          idByRef.set(refId, standIn)
          return
        }
      }
      const path = declared ?? (parentPath === rootName ? leaf : `${parentPath}.${leaf}`)
      const id = nodeId(path)
      idByRef.set(refId, id)
      if (!declared && !nodes[id]) {
        const parent = nodes[nodeId(parentPath)]
        if (parent) {
          nodes[id] = {
            ...ref,
            id,
            // The name a declared part would have: the leaf as the file spells it.
            // `seedStructure` prettifies for the Studio's own tree ("Label"), but that spelling
            // cannot survive an export - the file carries the part PATH and nothing else, so a
            // reader would have to invent the capital back and the round trip would not close.
            name: leaf,
            part: path,
            parentId: parent.id,
            childrenIds: [],
            // A design-time sample so the canvas shows a filled component instead of an empty
            // rectangle. It is never bound and never generated (the same standing a repeated
            // item's sample has), and the system's own name is the text a design system's own
            // docs put in this slot.
            ...(ref.slot && !ref.slot.sample
              ? { slot: { ...ref.slot, sample: { kind: 'text' as const, text: c.name } } }
              : {}),
          }
          parent.childrenIds.push(id)
          settledKinds.add(id)
          seededIds.add(id)
          knownPaths.add(path)
          // Found by a bare name elsewhere in this reader (a gate's machine) - but never at the
          // cost of the part the file itself named that way.
          if (!partPathByName.has(leaf)) partPathByName.set(leaf, path)
        }
      }
      for (const child of ref.childrenIds) walkRef(child, path)
    }
    for (const child of reference.nodes[reference.rootId]?.childrenIds ?? []) {
      walkRef(child, rootName)
    }
    // Repoint the copied node-id references now that every seeded node has an id here.
    for (const id of seededIds) {
      const node = nodes[id]
      if (!node?.a11y) continue
      const map = (v: string | undefined) => (v ? idByRef.get(v) : undefined)
      const labelledBy = map(node.a11y.labelledBy)
      const describedBy = map(node.a11y.describedBy)
      const a11y: NodeA11y = { ...node.a11y }
      if (node.a11y.labelledBy) {
        if (labelledBy) a11y.labelledBy = labelledBy
        else delete a11y.labelledBy
      }
      if (node.a11y.describedBy) {
        if (describedBy) a11y.describedBy = describedBy
        else delete a11y.describedBy
      }
      node.a11y = a11y
    }
  }

  // Infer node kind now that children are known: parents are containers; leaves with
  // text/ink paint are text, otherwise items. Only for parts that did NOT declare one -
  // inference is a guess, and it used to be the only source, which turned an `icon` into
  // an `item` and a `control` into a `container` on every import (proposal 0041).
  for (const node of Object.values(nodes)) {
    if (settledKinds.has(node.id)) continue
    if (node.origin === 'root') continue
    if (node.childrenIds.length) node.kind = 'container'
    // `ink` alone is not evidence of text - every painted node has a colour. It stays evidence
    // for a component with no anatomy to consult (a DataList's `label`/`value` carry nothing
    // else, and they really are text), but for a part the archetype does not name and that
    // carries no text facet, "text" was a guess that produced a visible label: the Radix
    // Button's overlay `spinner` shipped as `<span>spinner</span>`, the part's own name rendered
    // as the button's text.
    else if (
      node.facets?.['text.size'] ||
      (node.facets?.ink && (anatomy.size === 0 || anatomy.has(node.name)))
    ) {
      node.kind = 'text'
    } else if (node.facets?.ink) node.kind = 'container'
    else node.kind = 'item'
  }

  const rootId = rootName ? nodeId(rootName) : `${cid}:root`
  if (!rootName) {
    // An anatomy-less component still needs a root node to be editable.
    nodes[rootId] = {
      id: rootId,
      name: 'root',
      kind: 'container',
      tag: 'auto',
      origin: 'root',
      locked: false,
      parentId: null,
      childrenIds: [],
    }
    issues.push('component has no anatomy - synthesized an empty root node')
  }

  // Overlay realization (proposal 0034): fold the component's realize dismiss/backdrop
  // onto the root node's overlay config surface. (The generator doesn't yet consume
  // node.overlay - dismissability is currently behavior-derived - so this populates the
  // 0034 config surface and round-trips the intent; generator consumption is separate.)
  const overlayR = c.realize?.find((r) => r.dismiss !== undefined || r.backdrop !== undefined)
  if (overlayR && nodes[rootId]) {
    const overlay: NodeOverlay = {}
    if (overlayR.dismiss !== undefined) {
      overlay.dismiss = overlayR.dismiss.filter(
        (d): d is DismissTrigger => d === 'outside' || d === 'escape' || d === 'closeButton',
      )
    }
    if (
      overlayR.backdrop === 'none' ||
      overlayR.backdrop === 'scrim' ||
      overlayR.backdrop === 'blur'
    ) {
      overlay.backdrop = overlayR.backdrop
    }
    if (Object.keys(overlay).length) nodes[rootId].overlay = overlay
  }

  // The DISPLAY name, when the file carries one. The declaration is an identifier
  // (`component ColorPicker`) because references resolve against it; `meta { name … }` holds
  // what the author actually typed, so "Color picker" does not come back "ColorPicker" and
  // rename the library on import (proposal 0041). Removed from `meta` so a re-export writes it
  // once, from the name, rather than twice.
  const meta = { ...(c.meta ?? {}) } as Record<string, unknown>
  const displayName = typeof meta.name === 'string' && meta.name.trim() ? meta.name : undefined
  if (displayName) delete meta.name

  const structure: ComponentStructure = { rootId, nodes }
  // What the file used to say per part and no longer does (0055): the parts the archetype
  // requires are the ones the editor will not let go of.
  for (const id of Object.keys(nodes)) {
    nodes[id] = { ...nodes[id], locked: isLockedPart(c.archetype, structure, id) }
  }
  const component: ImportedComponent = {
    id: cid,
    name: displayName ?? c.name,
    ...(c.description ? { description: c.description } : {}),
    archetype: c.archetype || null,
    structure,
    contract: {
      props: c.contract.props.map(propToIr),
      events: c.contract.events.map(eventToIr),
      ...(c.contract.constraints?.length
        ? { constraints: c.contract.constraints.map(constraintToIr) }
        : {}),
    },
  }
  if (Object.keys(meta).length) component.meta = meta as ComponentIR['meta']

  // Authored behavior composition (proposal 0024): AST uses/coordination → editor IR.
  if (c.composition) {
    const composition: ComponentComposition = { uses: [], wires: [], gates: [] }
    c.composition.uses.forEach((u, i) =>
      composition.uses.push({
        id: `u${i}`,
        atom: u.atom,
        as: u.as,
        ...(u.params ? { params: u.params } : {}),
      }),
    )
    c.composition.coordination.forEach((e, i) => {
      if (e.kind === 'wire') {
        composition.wires.push({
          id: `w${i}`,
          from: e.from,
          to: e.to,
          ...(e.arg ? { arg: e.arg } : {}),
          ...(e.when ? { when: e.when } : {}),
        })
        // `wire Async.loading when loading -> A.disable` says the `loading` PROP is what makes
        // the atom's `loading` output hold - which is the same sentence as `bind state loading
        // loading`, in the algebra's vocabulary instead of the node's. Deriving the binding is
        // what makes the file's own `state loading { … }` rule and the spinner's gate live: the
        // generated CSS already carried `.root[data-loading]`, and nothing set the attribute.
        const bound = e.when && wireStateBinding(e.from, e.when, c)
        if (bound && nodes[rootId]) {
          const root = nodes[rootId]
          const already = (root.stateBindings ?? []).some((b) => b.state === bound.state)
          if (!already) {
            root.stateBindings = [
              ...(root.stateBindings ?? []),
              { id: `${rootId}.sb.${bound.state}`, state: bound.state, propName: bound.propName },
            ]
          }
        }
      } else if (e.kind === 'gate') {
        composition.gates.push({ id: `g${i}`, machine: e.machine, activeWhen: e.activeWhen })
        // `gate spinner active when Async.loading` names a PART, not a machine, and what it says
        // is "this node exists only while that holds" - which the IR has a field for
        // (`presence`, 0031/0032). Lowering it into the composition list alone left the Radix
        // Button's spinner rendered unconditionally: the generated React showed it always, and
        // the canvas did too. The composition entry stays, because the algebra is what the file
        // wrote; the presence is what makes it mean something to a target.
        const gated = nodes[nodeId(partPathByName.get(e.machine) ?? e.machine)]
        if (gated && !gated.presence) {
          const presence = gatePresence(e.activeWhen)
          if (presence) gated.presence = presence
          else
            issues.push(
              `gate on part "${e.machine}": "${e.activeWhen}" is not a condition a node can test - the part stays always present`,
            )
        }
      } else {
        issues.push(`composition ${e.kind} has no editor form - dropped`)
      }
    })
    if (composition.uses.length || composition.wires.length || composition.gates.length) {
      component.composition = composition
    }
  }
  return { component, issues }
}

// ─── The library around the components (proposal 0041) ────────────────────────

// A path as written, normalized for comparison: the surface may spell a group `Forms/Text`
// while a reference spells it `forms/text`, and both name the same group.
const normalizePath = (path: string) => path.split('/').map(seg).filter(Boolean).join('/')

// `group Forms/Text "prose"` declarations → the editor's flat, parent-linked group list.
// Ancestors are created implicitly (declaring `Forms/Text` without `Forms` still yields a
// tree), the same rule the token groups follow.
function componentGroupsToIr(decls: ComponentGroupDecl[]): {
  groups: IrComponentGroup[]
  idByPath: Map<string, string>
} {
  const groups: IrComponentGroup[] = []
  const idByPath = new Map<string, string>()
  const ensure = (segments: string[], names: string[]): string | null => {
    let parent: string | null = null
    for (let i = 0; i < segments.length; i++) {
      const key = segments.slice(0, i + 1).join('/')
      const existing = idByPath.get(key)
      if (existing) {
        parent = existing
        continue
      }
      const id = `cg.${key.replace(/\//g, '.')}`
      groups.push({ id, name: names[i] as string, parent, order: groups.length })
      idByPath.set(key, id)
      parent = id
    }
    return parent
  }
  for (const d of decls) {
    const names = d.path
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
    const segments = names.map(seg)
    const id = ensure(segments, names)
    if (id && d.description) {
      const g = groups.find((x) => x.id === id)
      if (g) g.description = d.description
    }
  }
  return { groups, idByPath }
}

// What a docs block needs in order to resolve a NAME back to the thing it points at.
interface DocsResolvers {
  componentId: (name: string) => string | undefined
  propId: (componentId: string | undefined, propName: string) => string | undefined
  exampleId: (name: string) => string | undefined
  groupId: (path: string) => string | undefined
  assetId: (name: string) => string | undefined
  tokenType: (word: string) => IrTokenType | undefined
  issues: string[]
}

const DOC_PROSE_KINDS = new Set(DOC_PROSE_KIND_LIST)

function docsToIr(decl: DocsDecl, r: DocsResolvers): DocsModel {
  // Page ids are derived from titles, so a `under "Home"` reference resolves without the
  // file having to carry a workspace id. Duplicate titles get a suffix rather than silently
  // merging into one page.
  const idByTitle = new Map<string, string>()
  const used = new Set<string>()
  for (const p of decl.pages) {
    const base = `page.${seg(p.title)}`
    let id = base
    let n = 2
    while (used.has(id)) id = `${base}-${n++}`
    used.add(id)
    idByTitle.set(p.title, id)
  }
  const pages: DocPage[] = decl.pages.map((p) => {
    const parentId = p.parent ? idByTitle.get(p.parent) : undefined
    if (p.parent && !parentId)
      r.issues.push(`docs page "${p.title}": no page titled "${p.parent}" - left at the top level`)
    return {
      id: idByTitle.get(p.title) as string,
      title: p.title,
      ...(p.group ? { group: p.group } : {}),
      ...(parentId ? { parentId } : {}),
      blocks: p.blocks
        .map((b, i) => docBlockToIr(b, `${idByTitle.get(p.title)}.b${i}`, r))
        .filter((b): b is DocBlock => !!b),
    }
  })
  const out: DocsModel = { pages }
  if (decl.site) out.site = { ...decl.site }
  if (decl.footer) {
    out.footer = {
      links: decl.footer.links.map((l, i) => ({ id: `fl${i}`, label: l.label, href: l.href })),
      ...(decl.footer.copyright ? { copyright: decl.footer.copyright } : {}),
    }
  }
  return out
}

function docBlockToIr(b: DocBlockDecl, id: string, r: DocsResolvers): DocBlock | null {
  const cmp = (name?: string) => (name ? r.componentId(name) : undefined)
  switch (b.kind) {
    case 'prose': {
      if (!DOC_PROSE_KINDS.has(b.prose)) {
        r.issues.push(`docs: unknown prose block "${b.prose}" - dropped`)
        return null
      }
      return {
        id,
        kind: b.prose as Extract<DocBlock, { text: string }>['kind'],
        text: b.text,
        ...(b.anchor ? { anchor: b.anchor } : {}),
      }
    }
    case 'divider':
      return { id, kind: 'divider' }
    case 'image': {
      const assetId = b.asset ? r.assetId(b.asset) : undefined
      if (b.asset && !assetId)
        r.issues.push(`docs image: no asset named "${b.asset}" - block kept empty`)
      return { id, kind: 'image', ...(assetId ? { assetId } : {}) }
    }
    case 'component':
    case 'componentProps':
    case 'componentEvents':
    case 'componentComposition': {
      const componentId = cmp(b.component)
      if (b.component && !componentId)
        r.issues.push(`docs ${b.kind}: no component named "${b.component}" - block kept empty`)
      return { id, kind: b.kind, ...(componentId ? { componentId } : {}) }
    }
    case 'componentProp': {
      const componentId = cmp(b.component)
      const propId = b.prop ? r.propId(componentId, b.prop) : undefined
      return {
        id,
        kind: 'componentProp',
        ...(componentId ? { componentId } : {}),
        ...(propId ? { propId } : {}),
      }
    }
    case 'componentEvent': {
      const componentId = cmp(b.component)
      return {
        id,
        kind: 'componentEvent',
        ...(componentId ? { componentId } : {}),
        ...(b.event ? { eventName: b.event } : {}),
      }
    }
    case 'example': {
      const exampleId = b.example ? r.exampleId(b.example) : undefined
      if (b.example && !exampleId)
        r.issues.push(`docs example: no example named "${b.example}" - block kept empty`)
      return { id, kind: 'example', ...(exampleId ? { exampleId } : {}) }
    }
    case 'componentGroup': {
      const groupId = b.group ? r.groupId(b.group) : undefined
      if (b.group && !groupId)
        r.issues.push(`docs component-group: no group "${b.group}" - block kept empty`)
      return { id, kind: 'componentGroup', ...(groupId ? { groupId } : {}) }
    }
    case 'tokens':
    case 'swatch': {
      const tokenType = b.tokenType ? r.tokenType(b.tokenType) : undefined
      if (b.tokenType && !tokenType)
        r.issues.push(`docs ${b.kind}: unknown token type "${b.tokenType}" - block kept empty`)
      return { id, kind: b.kind, ...(tokenType ? { tokenType } : {}) }
    }
  }
}

// The icon library. The file carries no ids, so each is derived from what the file says, in
// the spelling parts already use to name a glyph: a set by its prefix, a set glyph as
// `<prefix>-<name>`, a custom glyph as its kebab-cased name. A custom glyph's asset is named by
// NAME in the file and becomes that asset's id here.
function iconsToIr(
  decl: IconsDecl,
  assetId: (name: string) => string | undefined,
  issues: string[],
): IconLibrary {
  const sets = decl.sets.map((s) => ({
    id: s.prefix,
    prefix: s.prefix,
    name: s.name,
    provider: s.provider ?? '',
    license: s.license ?? '',
    ...(s.samples?.length === 4 ? { samples: s.samples as [string, string, string, string] } : {}),
  }))
  for (const s of decl.sets) {
    if (s.samples && s.samples.length !== 4)
      issues.push(`icon set "${s.prefix}": samples needs exactly four glyph names - dropped`)
  }
  const icons = decl.icons.map((i): Icon => {
    if (i.kind === 'set') {
      return {
        id: `${i.prefix}-${i.name}`,
        kind: 'set',
        prefix: i.prefix,
        name: i.name,
        ...(i.label ? { label: i.label } : {}),
        ...(i.svg ? { svg: i.svg } : {}),
      }
    }
    const id = i.asset ? assetId(i.asset) : undefined
    if (!id)
      issues.push(
        i.asset
          ? `custom icon "${i.name}": no asset named "${i.asset}" - it draws nothing`
          : `custom icon "${i.name}": names no asset - it draws nothing`,
      )
    return {
      id: seg(i.name),
      kind: 'custom',
      name: i.name,
      assetId: id ?? '',
      ...(i.label ? { label: i.label } : {}),
    }
  })
  return { sets, icons }
}

// The asset library (§1.2). Each asset's per-kind metadata is validated against its kind
// (ASSET_FIELDS, from the language's vocabulary), so a malformed entry cannot produce e.g. a
// font with no family that the CSS emitter then writes out as `font-family: undefined`.
const ASSET_DEFAULTS: Record<string, Record<string, unknown>> = {
  font: { fontFamily: '', fontStyle: 'normal', fontWeight: 400, formats: [] },
  image: { width: 0, height: 0, alt: '' },
  svg: { viewBox: '0 0 24 24', width: 24, height: 24 },
  video: { width: 0, height: 0, durationMs: 0 },
  animation: { format: 'lottie', durationMs: 0, loop: false },
}

function assetsToIr(decl: AssetsDecl, issues: string[]): AssetRegistry {
  const folders: Record<string, AssetFolder> = {}
  const idByPath = new Map<string, string>()
  for (const f of decl.folders) {
    const names = f.path
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
    let parentId: string | null = null
    for (let i = 0; i < names.length; i++) {
      const key = names
        .slice(0, i + 1)
        .map(seg)
        .join('/')
      const existing = idByPath.get(key)
      if (existing) {
        parentId = existing
        continue
      }
      const id = `fld.${key.replace(/\//g, '.')}`
      folders[id] = { id, name: names[i] as string, parentId, createdAt: EPOCH }
      idByPath.set(key, id)
      parentId = id
    }
  }

  const assets: Record<string, Asset> = {}
  for (const a of decl.assets) {
    const spec = ASSET_FIELDS[a.kind]
    if (!spec) {
      issues.push(`asset "${a.name}": unknown kind "${a.kind}" - dropped`)
      continue
    }
    const extra: Record<string, unknown> = { ...ASSET_DEFAULTS[a.kind] }
    for (const [key, raw] of Object.entries(a.props)) {
      const field = camel(key)
      const type = spec[field]
      if (!type) {
        issues.push(`asset "${a.name}": unknown ${a.kind} setting "${key}" - dropped`)
        continue
      }
      if (type === 'strings') extra[field] = (Array.isArray(raw) ? raw : [raw]).map(String)
      else if (typeof raw === type) extra[field] = raw
      else issues.push(`asset "${a.name}".${key}: expected a ${type} - dropped`)
    }
    const folderId = a.folder ? (idByPath.get(normalizePath(a.folder)) ?? null) : null
    if (a.folder && !folderId)
      issues.push(`asset "${a.name}": folder "${a.folder}" is not declared - placed at the root`)
    const id = `ast.${seg(a.name)}`
    assets[id] = {
      id,
      name: a.name,
      kind: a.kind,
      mimeType: a.mimeType ?? '',
      sizeBytes: a.sizeBytes ?? 0,
      uploadedAt: a.uploadedAt ?? EPOCH,
      url: a.url ?? '',
      tags: a.tags ?? [],
      folderId,
      ...extra,
    } as Asset
  }
  return { assets, folders }
}

// A fixed timestamp for anything the file does not carry one for. `Date.now()` would make
// two imports of the same file differ, which is exactly what the round-trip test forbids.
const EPOCH = '1970-01-01T00:00:00.000Z'

// A slot sample's `example` leg names a scene; the IR holds its id. An unresolvable name is
// reported and the leg is dropped, because a sample pointing at a scene that does not exist
// renders as an empty slot with no explanation.
function resolveSample(
  sample: SlotSample,
  idByName: Map<string, string>,
  where: string,
  issues: string[],
): SlotSample {
  if (sample.kind === 'text') return sample
  if (sample.kind === 'list') {
    return {
      kind: 'list',
      items: sample.items.map((i) => resolveSample(i, idByName, where, issues)),
    }
  }
  const id = idByName.get(sample.exampleId)
  if (id) return { kind: 'example', exampleId: id }
  issues.push(
    `${where}: slot sample names example "${sample.exampleId}", which the file does not declare - replaced with its text`,
  )
  return { kind: 'text', text: sample.exampleId }
}

// Document-level metadata recovered from the AST (proposal 0026) - the app applies
// this to the project record (name/version) since the document IR has no such field.
export interface DocumentIrMeta {
  name?: string
  version?: string
  description?: string
  milda?: string
  prelude?: string
  metadata: Record<string, unknown>
  // Library-wide output settings, recovered from the `output.<field>` keys the emitter writes
  // into the `meta {}` block. Separated from `metadata` so an import can restore
  // `MildaDocument.output` directly, and so a re-export does not print them twice.
  output?: Record<string, string | number | boolean>
}

// A demo scene recovered from a file (proposal 0021): the component-shaped tree plus the
// scene's own state, and the id of the component it demonstrates.
export interface ImportedExample extends ImportedComponent {
  for?: string
  state?: Record<string, { type: PropType; initial: PropValue }>
}

export interface DocumentToIrResult {
  foundations: DocumentFoundations
  sharedTypes: IrSharedType[]
  components: ImportedComponent[]
  meta: DocumentIrMeta
  // The library around the components (proposal 0041). Absent when the file declares none -
  // which is deliberately different from empty, because "no docs authored" and "docs
  // dropped on export" must not look the same.
  componentGroups?: IrComponentGroup[]
  examples?: ImportedExample[]
  docs?: DocsModel
  assets?: AssetRegistry
  issues: string[]
}

// A whole parsed AST document → the editor IR pieces the app loads: foundations +
// shared types + components + document metadata + the library around them (groups,
// examples, docs, assets).
export function documentToIr(doc: {
  milda?: string
  prelude?: string
  meta?: { name?: string; version?: string; description?: string }
  foundations: AstFoundations
  components: AstComponent[]
  componentGroups?: ComponentGroupDecl[]
  examples?: AstExample[]
  docs?: DocsDecl
  assets?: AssetsDecl
  icons?: IconsDecl
}): DocumentToIrResult {
  const f = foundationsToIr(doc.foundations)
  const issues = [...f.issues]
  const sharedTypes: IrSharedType[] = (doc.foundations.sharedTypes ?? []).map((st) => ({
    id: st.id,
    name: st.name,
    ...(st.description ? { description: st.description } : {}),
    definition: typeToIr(st.definition),
  }))
  // Library organisation first: a component's `group Forms/Text` resolves against these.
  const groupTree = componentGroupsToIr(doc.componentGroups ?? [])
  const components: ImportedComponent[] = []
  doc.components.forEach((c, i) => {
    const r = componentToIr(c)
    const groupId = c.group ? groupTree.idByPath.get(normalizePath(c.group)) : undefined
    if (c.group && !groupId)
      issues.push(`${c.name}: group "${c.group}" is not declared - component left ungrouped`)
    components.push({
      ...r.component,
      ...(groupId ? { group: groupId } : {}),
      // The file's ORDER is the library's order: position carries what an `order N` line
      // would have, so the sibling order survives without a synthetic field.
      order: i,
    })
    for (const issue of r.issues) issues.push(`${c.name}: ${issue}`)
  })

  // Usage rules (0052 §5) are lowered here rather than with the rest of the foundations, because
  // they name components by the identifier the file declares them with, and only the components
  // know which authored name that identifier stands for.
  if (doc.foundations.rules?.length) {
    const authored = new Map(doc.components.map((c, i) => [c.name, components[i]?.name ?? c.name]))
    f.foundations.rules = rulesToIr(doc.foundations.rules, (n) => authored.get(n) ?? n)
  }

  const examples: ImportedExample[] = []
  for (const ex of doc.examples ?? []) {
    const r = componentToIr({
      id: `ex.${seg(ex.name)}`,
      name: ex.name,
      archetype: '',
      contract: { params: {}, props: [], events: [] },
      anatomy: ex.anatomy,
      realize: [],
      ...(ex.description ? { description: ex.description } : {}),
    })
    const forId = ex.for ? cmpRefId(ex.for) : undefined
    if (ex.for && !components.some((c) => c.id === forId)) {
      issues.push(
        `example "${ex.name}": no component named "${ex.for}" - left as a freestanding fixture`,
      )
    }
    examples.push({
      ...r.component,
      ...(forId && components.some((c) => c.id === forId) ? { for: forId } : {}),
      ...(ex.demo
        ? {
            state: Object.fromEntries(
              Object.entries(ex.demo).map(([k, v]) => [
                k,
                { type: typeToIr(v.type), initial: v.initial },
              ]),
            ),
          }
        : {}),
    })
    for (const issue of r.issues) issues.push(`example "${ex.name}": ${issue}`)
  }

  // A slot's design-time sample can BE a demo scene (0021), and the file names it. Resolving
  // that has to happen here rather than in `componentToIr`, which knows nothing about examples:
  // until now the name was stored as if it were an id, so the sample pointed at nothing and the
  // canvas silently showed an empty slot.
  const exampleIdByName = new Map(examples.map((e) => [e.name, e.id]))
  for (const c of [...components, ...examples]) {
    for (const node of Object.values(c.structure?.nodes ?? {})) {
      if (!node.slot?.sample) continue
      node.slot = {
        ...node.slot,
        sample: resolveSample(node.slot.sample, exampleIdByName, c.name, issues),
      }
    }
  }

  // Runs once both consumers are lowered, because whether a hoisted literal may be inlined
  // depends on whether a component facet names it.
  // Not reported: `issues` is what went WRONG or was lost, and restoring a literal the parser
  // had to hoist is neither - the document simply holds what the file said.
  inlineHoistedLiterals(f.foundations, [components, examples])

  const assets = doc.assets ? assetsToIr(doc.assets, issues) : undefined
  if (doc.icons) {
    f.foundations.icons = iconsToIr(
      doc.icons,
      (name) => Object.values(assets?.assets ?? {}).find((a) => a.name === name)?.id,
      issues,
    )
  }
  const docsModel = doc.docs
    ? docsToIr(doc.docs, {
        componentId: (name) => {
          const id = cmpRefId(name)
          return components.some((c) => c.id === id) ? id : undefined
        },
        propId: (componentId, propName) =>
          components
            .find((c) => c.id === componentId)
            ?.contract?.props.find((p) => p.name === propName)?.id,
        exampleId: (name) => examples.find((e) => e.name === name)?.id,
        groupId: (path) => groupTree.idByPath.get(normalizePath(path)),
        assetId: (name) => Object.values(assets?.assets ?? {}).find((a) => a.name === name)?.id,
        tokenType: (word) => TYPE_TO_IR[word as AstTokenType],
        issues,
      })
    : undefined
  // Split the author's free-form metadata from the `output.*` namespace the emitter owns.
  const metadata: Record<string, unknown> = {}
  const output: Record<string, string | number | boolean> = {}
  for (const e of doc.foundations.metadata ?? []) {
    if (e.key.startsWith(OUTPUT_PREFIX)) {
      const field = e.key.slice(OUTPUT_PREFIX.length)
      const v = e.value
      if (field && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
        output[field] = v
      }
      continue
    }
    metadata[e.key] = e.value
  }
  const meta: DocumentIrMeta = {
    ...(doc.meta?.name ? { name: doc.meta.name } : {}),
    ...(doc.meta?.version ? { version: doc.meta.version } : {}),
    ...(doc.meta?.description ? { description: doc.meta.description } : {}),
    ...(doc.milda ? { milda: doc.milda } : {}),
    ...(doc.prelude ? { prelude: doc.prelude } : {}),
    metadata,
    ...(Object.keys(output).length ? { output } : {}),
  }
  return {
    foundations: f.foundations,
    sharedTypes,
    components,
    meta,
    ...(groupTree.groups.length ? { componentGroups: groupTree.groups } : {}),
    ...(examples.length ? { examples } : {}),
    ...(docsModel ? { docs: docsModel } : {}),
    ...(assets ? { assets } : {}),
    issues,
  }
}
