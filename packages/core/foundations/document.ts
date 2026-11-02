import { COLOR_TOKENS, COLOR_GROUPS } from './colorTokens'
import { SCALES, type ScaleName } from './scales'
import { EASINGS, type EasingCurve } from './easing'
import type { NamingConvention } from './naming'
import { isLengthType, lengthValue, parseLength } from './dimensions'
import { SYSTEM_STACKS, type FontFamily } from './typography'
import { ICON_SETS, type IconLibrary } from './icons'
import type { MessageCatalog } from './messages'
import type { GlobalProp } from '../contract/types'
import type { UsageRule } from '../rules/types'
import type { ColorValue, LengthValue } from '@mildastudio/milda'

export type TokenType = 'color' | ScaleName | 'gradient' | 'textStyle' | 'easing'

export const COMPOSITE_TYPES = ['gradient', 'textStyle', 'easing'] as const
export function isCompositeType(
  type: TokenType | string,
): type is 'gradient' | 'textStyle' | 'easing' {
  return type === 'gradient' || type === 'textStyle' || type === 'easing'
}

export type Slot =
  | { raw: string }
  // A typed, space-aware colour (proposal 0036). `raw` still holds every non-colour
  // scalar and stays the escape hatch for a colour we cannot type; this variant exists
  // so a wide-gamut or perceptual colour survives editing and resolution without being
  // flattened to a CSS string first. Read it with resolveTokenColor / slotColor.
  | { color: ColorValue }
  // A typed length (proposal 0038). Same reasoning as the colour above, plus one of its
  // own: the old representation was a unit-stripped number, so `12px` and `0.75rem` were
  // indistinguishable once loaded and a round trip multiplied fixed lengths by 16.
  // `raw` stays the escape hatch for the lengths that have no neutral form (vw, calc()).
  // Read it with resolveTokenLength / slotLength.
  | { dimension: LengthValue }
  | { ref: string }
  // A FONT FAMILY, named as one of the document's own font-library entries (`foundations.fonts`).
  // Not a `raw` CSS stack: the stack is a lowering of the family, and a token holding the string
  // could not say WHICH of the project's fonts it means - so nothing could show a specimen, and
  // renaming a family left the token behind. Read it with `slotFont` / resolveToken.
  | { font: FontSlot }
  // A value DERIVED from another value (proposal 0036): "the accent, 20% lighter".
  // The relationship is live -- editing the base updates every token computed from it --
  // which is the whole point of it being an authoring concept rather than a one-shot
  // generator that bakes a literal.
  | { compute: ComputeValue }
  | { gradient: GradientValue }
  | { textStyle: TextStyleValue }
  | { easing: EasingValue }

/**
 * One step of a computed colour. `mix` takes a full `Slot` so the thing being mixed in
 * can itself be a literal, a reference, or another computed value.
 *
 * Amounts are relative fractions (0..1), not absolute channel deltas: `lighten 0.2`
 * closes a fifth of the distance to white. See applyColorOps in ./color.
 */
export type ColorOp =
  | { op: 'lighten' | 'darken' | 'saturate' | 'desaturate'; amount: number }
  | { op: 'rotate'; degrees: number }
  | { op: 'alpha'; amount: number }
  | { op: 'mix'; with: Slot; amount: number }

/**
 * One step of a computed LENGTH - "the body size, 1.25 times, rounded to 2" (proposal 0044).
 *
 * A separate vocabulary from ColorOp, not an extension of it, because the two share no
 * operation: nothing lightens a length and nothing scales a hue. Deliberately three ops and
 * no arithmetic language: a scale, an offset in density-independent units, and a snap to a
 * grid, which is what a type scale is actually made of.
 *
 * `offset` and `round` are in dp (the neutral unit, per 0038), so a text-scaled base is
 * lowered through the assumed root size before they apply - the one lossy step, and it is
 * the same one `lengthToDp` already documents.
 */
export type LengthOp =
  { op: 'scale'; factor: number } | { op: 'offset'; delta: number } | { op: 'round'; to: number }

export function isLengthOp(op: ColorOp | LengthOp): op is LengthOp {
  return op.op === 'scale' || op.op === 'offset' || op.op === 'round'
}

export interface ComputeValue {
  /** What is being modified. A `ref` here is the common case. */
  base: Slot
  /**
   * Applied in order, so `darken` then `alpha` is well defined.
   *
   * Which vocabulary applies is decided by the TOKEN'S TYPE, not by a discriminant here: a
   * colour token computes with ColorOps, a length token with LengthOps. The union is what
   * lets one `{ compute }` slot serve both (and one cycle guard walk both); a step from the
   * wrong vocabulary is skipped by the resolver rather than guessed at.
   */
  ops: (ColorOp | LengthOp)[]
  /**
   * Which space the maths happens in. OKLCH by default, because perceptual lightness is
   * what an author means by "lighter".
   */
  space?: ComputeSpace
}

/** The spaces a modifier can compute in (a superset of the spaces the DSL can spell). */
export type ComputeSpace = 'srgb' | 'display-p3' | 'oklch' | 'hsl' | 'oklab' | 'lab' | 'lch'

export type GradientKind = 'linear' | 'radial' | 'conic'

export interface GradientStop {
  color: Slot
  position: number
}
export interface GradientValue {
  kind: GradientKind
  angle?: number
  stops: GradientStop[]
}

/** One of `foundations.fonts`, by id. Its own shape so the field can grow (a face, a weight
 *  range) without every reader having to change. */
export interface FontSlot {
  id: string
}

/**
 * What a text style's family IS: a font-library entry, or a fontFamily TOKEN that names one.
 *
 * The bare id came first and stays readable, so no document had to migrate. The ref is what
 * makes a family layerable and context-aware like every other value: a text style can now say
 * "the heading family", and the heading family can be a different face per brand.
 */
export type TextStyleFamily = string | { ref: string }

export interface TextStyleValue {
  family: TextStyleFamily
  size: Slot
  weight: Slot
  lineHeight: Slot
  letterSpacing: Slot
}

export type EasingValue = EasingCurve

/**
 * One exception to a token's base value (proposal 0042): "except when Color scheme is
 * dark". `context` is never the group's base case -- that case is what `base` means.
 */
export interface TokenException {
  /** A ContextGroup id. */
  group: string
  /** A Context id within that group. */
  context: string
  slot: Slot
}

/**
 * A token's value: one base, plus zero or more exceptions (proposal 0042).
 *
 * This replaced a discriminated `fixed | byContext` union whose `by` field held a SINGLE
 * ContextGroup id, so a token could only ever vary along one aspect. An accent that is
 * one hue per brand AND softer in dark mode needs two, which the old shape could not
 * hold at all. Exceptions may now span groups; when more than one matches at once, the
 * order of `DocumentFoundations.contextGroups` decides (see matchingExceptions).
 */
export interface TokenValue {
  base: Slot
  /** Absent or empty means "the same value everywhere". */
  exceptions?: TokenException[]
}

/**
 * The well-known semantic roles a token may claim (proposal 0042 §2.3).
 *
 * A role is what lets the editor group tokens ACROSS types (an "Accent" cluster holding a
 * colour and a radius), which `TokenGroup` cannot express because groups are type-scoped.
 * It is also the only reliable way to know which token *is* the surface, for contrast
 * checks -- inferring that from the name breaks on the first renamed system.
 */
export type RoleKey =
  | 'surface'
  | 'surfaceRaised'
  | 'surfaceSunken'
  | 'overlay'
  | 'textPrimary'
  | 'textSecondary'
  | 'textSubtle'
  | 'onAccent'
  | 'border'
  | 'borderStrong'
  | 'accent'
  | 'accentStrong'
  | 'accentSubtle'
  | 'focusRing'

export const ROLE_KEYS: readonly RoleKey[] = [
  'surface',
  'surfaceRaised',
  'surfaceSunken',
  'overlay',
  'textPrimary',
  'textSecondary',
  'textSubtle',
  'onAccent',
  'border',
  'borderStrong',
  'accent',
  'accentStrong',
  'accentSubtle',
  'focusRing',
]

/** Human labels for the role rail. Kept beside the keys so the two cannot drift. */
export const ROLE_LABELS: Record<RoleKey, string> = {
  surface: 'Surface',
  surfaceRaised: 'Surface raised',
  surfaceSunken: 'Surface sunken',
  overlay: 'Overlay',
  textPrimary: 'Text primary',
  textSecondary: 'Text secondary',
  textSubtle: 'Text subtle',
  onAccent: 'On accent',
  border: 'Border',
  borderStrong: 'Border strong',
  accent: 'Accent',
  accentStrong: 'Accent strong',
  accentSubtle: 'Accent subtle',
  focusRing: 'Focus ring',
}

export interface Token {
  id: string
  name: string
  type: TokenType
  value: TokenValue
  description?: string
  group?: string | null
  order?: number
  /**
   * The semantic role this token fills, if any. At most one token per layer claims a
   * given role. Primitives have none, and that is what makes them primitives.
   */
  role?: RoleKey
}

/** A token value that is the same everywhere. */
export function fixedValue(slot: Slot): TokenValue {
  return { base: slot }
}

/** The exceptions a token carries, in `contextGroups` order (never undefined). */
export function tokenExceptions(v: TokenValue): TokenException[] {
  return v.exceptions ?? []
}

export function defaultSlotForType(type: TokenType, rawDefault: string, fontId?: string): Slot {
  if (type === 'gradient') {
    return {
      gradient: {
        kind: 'linear',
        angle: 90,
        stops: [
          { color: { raw: '#7c3aed' }, position: 0 },
          { color: { raw: '#2563eb' }, position: 100 },
        ],
      },
    }
  }
  // A family is CHOSEN from the project's fonts, never typed as a CSS stack (proposal 0042 §5):
  // `rawDefault` is deliberately ignored here. An empty id is the "no family picked yet" state,
  // which the editor shows as such rather than resolving to a system stack behind the author's
  // back.
  if (type === 'fontFamily') {
    return { font: { id: fontId ?? '' } }
  }
  if (type === 'textStyle') {
    return {
      textStyle: {
        family: fontId ?? '',
        size: { raw: '16' },
        weight: { raw: '400' },
        lineHeight: { raw: '1.5' },
        letterSpacing: { raw: '0' },
      },
    }
  }
  if (type === 'easing') {
    return { easing: { kind: 'cubicBezier', points: [0.2, 0, 0, 1] } }
  }
  // A length is stored typed (0038), so a seeded "12" is a fixed 12 rather than a
  // unit-less string that a later round trip could read as text-scaled.
  if (isLengthType(type)) return canonicalizeSlot(type, { raw: rawDefault })
  return { raw: rawDefault }
}

export interface Context {
  id: string
  name: string
}

export interface ContextGroup {
  id: string
  name: string
  contexts: Context[]
  /**
   * The base case: the context that uses the token's base value, and therefore the one
   * case that is never an exception target (proposal 0042 §2.2). Optional so no existing
   * construction site had to change; read it through `baseCaseOf`, which falls back to
   * the first context -- what the resolver already assumed implicitly.
   */
  base?: string
}

/** The context that uses the base value. Falls back to the first context. */
export function baseCaseOf(group: ContextGroup): string | undefined {
  if (group.base && group.contexts.some((c) => c.id === group.base)) return group.base
  return group.contexts[0]?.id
}

export interface TokenGroup {
  id: string
  name: string
  parent: string | null
  order: number
  type?: TokenType
}

export interface Layer {
  id: string
  name: string
  order: number
  tokens: Token[]
  groups: TokenGroup[]
  /**
   * What this layer answers, in the author's own words (proposal 0042 §4): "which raw
   * values exist", "what do they mean". The chain can be any length, so a NAME alone stops
   * being enough to place a layer - the question is what makes an arbitrary chain
   * teachable, and it is restated wherever you stand in it.
   */
  question?: string
}

export interface DocumentFoundations {
  contextGroups: ContextGroup[]
  layers: Layer[]
  // Props the whole system declares once (proposal 0051 §5). Absent on every document that has
  // never declared one, so nothing changes for a system that does not use them.
  globalProps?: GlobalProp[]
  // How the system is meant to be put together (proposal 0052 §5): count, containment, token use
  // and preferred components. Here for the reason `globalProps` is - a system-wide declaration -
  // and because `foundations` already travels to every reader that needs it (release, `.milda`,
  // the checker, the kernel, the edge function). Absent on every document that declares none.
  rules?: UsageRule[]
  naming?: NamingConvention
  fonts?: FontFamily[]
  icons?: IconLibrary
  // Category-B translatable strings (proposal 0030). Additive/optional: absent on
  // every existing document, which generates exactly as before (single baked locale).
  messages?: MessageCatalog
}

const raw = (value: string): TokenValue => ({ base: { raw: value } })
const ref = (id: string): TokenValue => ({ base: { ref: id } })

// A seeded scale value: a length becomes a typed dimension slot, anything else stays a
// raw scalar (proposal 0038).
function lengthOrRaw(type: TokenType, value: string): TokenValue {
  return isLengthType(type) ? { base: canonicalizeSlot(type, { raw: value }) } : raw(value)
}
// Light is the ColorScheme base case, so dark is the one exception (proposal 0042).
const byScheme = (light: string, dark: string): TokenValue => ({
  base: { ref: light },
  exceptions: [{ group: 'ColorScheme', context: 'dark', slot: { ref: dark } }],
})

const easingVal = (curve: EasingCurve): TokenValue => ({ base: { easing: curve } })

/**
 * The role each seeded semantic token fills (proposal 0042 §2.3). Stamped on the seed so a
 * new project's rail can group by role immediately, and so the contrast lint knows which
 * token IS the surface without guessing from its name.
 *
 * Only the seed is opinionated here; a user's own tokens claim roles by hand, and a token
 * with no role is not lesser - a primitive has none, and that is what makes it a primitive.
 */
const SEED_ROLES: Record<string, RoleKey> = {
  surface: 'surface',
  'surface-raised': 'surfaceRaised',
  'surface-sunken': 'surfaceSunken',
  background: 'overlay',
  text: 'textPrimary',
  'text-muted': 'textSecondary',
  'text-subtle': 'textSubtle',
  border: 'border',
  'border-strong': 'borderStrong',
  accent: 'accent',
  'accent-strong': 'accentStrong',
  'accent-subtle': 'accentSubtle',
  'on-accent': 'onAccent',
  ring: 'focusRing',
}

const withOrder = (tokens: Omit<Token, 'group' | 'order'>[]): Token[] =>
  tokens.map((t, i) => ({
    ...t,
    group: null,
    order: i,
    ...(SEED_ROLES[t.id] ? { role: SEED_ROLES[t.id] } : {}),
  }))

function easingSeedTokens(): Omit<Token, 'group' | 'order'>[] {
  return EASINGS.map((e) => ({
    id: e.id,
    name: e.name,
    type: 'easing' as const,
    value: easingVal(e.curve),
  }))
}
function buildBaseColors(): { tokens: Token[]; groups: TokenGroup[] } {
  const perParent: Record<string, number> = {}
  const groups: TokenGroup[] = COLOR_GROUPS.map((g) => {
    const key = g.parent ?? '__root'
    const order = ((perParent[key] ??= 0), perParent[key]++)
    return { id: g.id, name: g.name, parent: g.parent, order, type: 'color' as const }
  })

  const perGroup: Record<string, number> = {}
  const tokens: Token[] = COLOR_TOKENS.filter((t) => t.layer === 'primitive').map((t) => {
    const group = t.group ?? null
    const order = ((perGroup[group ?? '__root'] ??= 0), perGroup[group ?? '__root']++)
    return { id: t.id, name: t.name, type: 'color' as const, value: raw(t.value), group, order }
  })

  return { tokens, groups }
}

const colorSchemeGroup = (): ContextGroup => ({
  id: 'ColorScheme',
  name: 'Color scheme',
  contexts: [
    { id: 'light', name: 'Light' },
    { id: 'dark', name: 'Dark' },
  ],
  // Light is the base case, so a themed token's dark value is its one exception.
  base: 'light',
})

export function defaultFoundations(): DocumentFoundations {
  const base = buildBaseColors()

  const semanticColors: Omit<Token, 'group' | 'order'>[] = [
    { id: 'accent', name: 'Accent', type: 'color', value: raw('#3F4A6B') },
    {
      id: 'accent-strong',
      name: 'Accent strong',
      type: 'color',
      value: byScheme('violet-600', 'violet-300'),
    },
    {
      id: 'accent-subtle',
      name: 'Accent subtle',
      type: 'color',
      value: byScheme('violet-50', 'violet-900'),
    },
    { id: 'on-accent', name: 'On accent', type: 'color', value: ref('white') },

    { id: 'background', name: 'Background', type: 'color', value: byScheme('gray-50', 'gray-950') },
    { id: 'surface', name: 'Surface', type: 'color', value: byScheme('white', 'gray-900') },
    {
      id: 'surface-raised',
      name: 'Surface raised',
      type: 'color',
      value: byScheme('white', 'gray-800'),
    },
    {
      id: 'surface-sunken',
      name: 'Surface sunken',
      type: 'color',
      value: byScheme('gray-100', 'gray-950'),
    },

    { id: 'text', name: 'Text', type: 'color', value: byScheme('gray-900', 'gray-50') },
    {
      id: 'text-muted',
      name: 'Text muted',
      type: 'color',
      value: byScheme('gray-500', 'gray-400'),
    },
    {
      id: 'text-subtle',
      name: 'Text subtle',
      type: 'color',
      value: byScheme('gray-400', 'gray-500'),
    },

    { id: 'border', name: 'Border', type: 'color', value: byScheme('gray-200', 'gray-800') },
    {
      id: 'border-strong',
      name: 'Border strong',
      type: 'color',
      value: byScheme('gray-300', 'gray-700'),
    },
    { id: 'ring', name: 'Ring', type: 'color', value: ref('violet-500') },

    { id: 'success', name: 'Success', type: 'color', value: ref('green-500') },
    { id: 'on-success', name: 'On success', type: 'color', value: ref('white') },
    {
      id: 'success-subtle',
      name: 'Success subtle',
      type: 'color',
      value: byScheme('green-50', 'green-900'),
    },

    { id: 'warning', name: 'Warning', type: 'color', value: ref('amber-500') },
    { id: 'on-warning', name: 'On warning', type: 'color', value: ref('gray-900') },
    {
      id: 'warning-subtle',
      name: 'Warning subtle',
      type: 'color',
      value: byScheme('amber-50', 'amber-900'),
    },

    { id: 'danger', name: 'Danger', type: 'color', value: ref('red-500') },
    { id: 'on-danger', name: 'On danger', type: 'color', value: ref('white') },
    {
      id: 'danger-subtle',
      name: 'Danger subtle',
      type: 'color',
      value: byScheme('red-50', 'red-900'),
    },

    { id: 'info', name: 'Info', type: 'color', value: ref('blue-500') },
    { id: 'on-info', name: 'On info', type: 'color', value: ref('white') },
    {
      id: 'info-subtle',
      name: 'Info subtle',
      type: 'color',
      value: byScheme('blue-50', 'blue-900'),
    },
  ]

  const scaleTokens: Omit<Token, 'group' | 'order'>[] = (Object.keys(SCALES) as ScaleName[])
    // A family is not a scale VALUE the way a radius is - it names one of the document's own
    // font-library entries, so its tokens are seeded below, beside the library they point at.
    // Left in the SCALES loop it seeded a CSS stack as a raw string: a platform leak that no
    // specimen could be drawn from and that no rename of the family would ever reach.
    .filter((scale) => scale !== 'fontFamily')
    .flatMap((scale) =>
      SCALES[scale].map((t) => ({
        id: t.id,
        name: t.name,
        type: scale,
        value: lengthOrRaw(scale, t.value),
      })),
    )

  // The three system stacks, as library entries and as the tokens that name them. `body` keeps
  // its id: the web theme and the editor preview both read the document's default family by
  // THAT id, and it is the one font id anything outside this file knows.
  const seededFonts: FontFamily[] = [
    {
      id: 'body',
      name: 'Sans',
      source: { kind: 'system', stack: SYSTEM_STACKS[0].stack },
      fallback: 'sans-serif',
    },
    {
      id: 'serif',
      name: 'Serif',
      source: { kind: 'system', stack: SYSTEM_STACKS[1].stack },
      fallback: 'serif',
    },
    {
      id: 'mono',
      name: 'Mono',
      source: { kind: 'system', stack: SYSTEM_STACKS[2].stack },
      fallback: 'monospace',
    },
  ]
  const familyTokens: Omit<Token, 'group' | 'order'>[] = seededFonts.map((f) => ({
    id: `font-${f.id}`,
    name: f.name,
    type: 'fontFamily' as const,
    value: { base: { font: { id: f.id } } },
  }))

  return {
    contextGroups: [colorSchemeGroup()],
    layers: [
      {
        id: 'base',
        name: 'Base',
        order: 0,
        tokens: base.tokens,
        groups: base.groups,
        question: 'Which raw values exist at all?',
      },
      {
        id: 'semantic',
        name: 'Semantic',
        order: 1,
        question: 'What do those values mean?',
        tokens: withOrder([
          ...semanticColors,
          ...scaleTokens,
          ...familyTokens,
          ...easingSeedTokens(),
        ]),
        groups: [],
      },
      {
        id: 'component',
        name: 'Component',
        order: 2,
        tokens: [],
        groups: [],
        question: 'Does one component need an exception?',
      },
    ],
    fonts: seededFonts,
    icons: { sets: [{ id: 'lucide', ...ICON_SETS[0] }], icons: [] },
  }
}

export function emptyFoundations(): DocumentFoundations {
  return { contextGroups: [], layers: [], fonts: [], icons: { sets: [], icons: [] } }
}

interface LegacyColorToken {
  id: string
  name: string
  value: string
  layer?: 'semantic' | 'primitive'
  alias?: string
}

/**
 * Every persisted token-value shape → the current one (proposal 0042). This is the FOURTH
 * shape this function has had to absorb, so the order matters: check the current shape
 * first, then the two `kind`-tagged ones, then the original flat string.
 *
 * `groups` is only needed to know which context of a `byContext` value was its base case;
 * without it (or when the group is gone) the stored `default` slot is used, which is what
 * the old resolver fell back to anyway.
 */
function normalizeValue(v: unknown, groups: ContextGroup[] = []): TokenValue {
  const val = v as {
    kind?: string
    value?: string
    by?: string
    refs?: Record<string, string>
    slot?: Slot
    slots?: Record<string, Slot>
    base?: Slot
    exceptions?: TokenException[]
  }

  // Already current.
  if (val && val.base && typeof val.base === 'object') {
    const exceptions = Array.isArray(val.exceptions)
      ? val.exceptions.filter((e) => e && e.group && e.context && e.slot)
      : []
    return exceptions.length ? { base: val.base, exceptions } : { base: val.base }
  }

  if (val && val.kind === 'fixed' && val.slot) return { base: val.slot }

  // `byContext`: the `default` slot (or the group's base case) becomes the base, and every
  // OTHER context becomes one exception. A value with only `default` -- the sugar form the
  // parser produces for a context-less alias -- collapses to a plain base with none.
  //
  // Both `kind` branches are gated on the payload they need (`slot` / `slots`): a value
  // missing it is malformed - an interrupted or pre-slots write - and falls through to the
  // raw scalar below rather than being handed on as a shape every resolver assumes it can
  // index into.
  if (val && val.kind === 'byContext' && val.slots) {
    return fromContextSlots(val.by ?? '', val.slots, groups)
  }

  if (val && val.kind === 'alias' && val.refs) {
    const slots: Record<string, Slot> = {}
    for (const [ctx, refId] of Object.entries(val.refs)) slots[ctx] = { ref: refId }
    return fromContextSlots(val.by ?? 'ColorScheme', slots, groups)
  }

  return { base: { raw: val?.value ?? '' } }
}

/**
 * A legacy/surface context-slot map → base + exceptions.
 *
 * Exported because the DSL importer needs exactly this conversion: the `.milda` surface
 * still spells a themed value as `alias by <Group> { default -> …; Dark -> … }`, and the
 * subtle part (which key is the base, and dropping the keys that merely repeat it) must
 * not be reimplemented there and drift.
 */
export function contextSlotsToValue(
  by: string,
  slots: Record<string, Slot>,
  groups: ContextGroup[] = [],
): TokenValue {
  return fromContextSlots(by, slots, groups)
}

function fromContextSlots(
  by: string,
  slots: Record<string, Slot>,
  groups: ContextGroup[],
): TokenValue {
  const group = groups.find((g) => g.id === by)
  const baseCase = group ? baseCaseOf(group) : undefined
  const base = slots.default ??
    (baseCase ? slots[baseCase] : undefined) ??
    Object.values(slots)[0] ?? { raw: '' }
  const exceptions: TokenException[] = []
  for (const [ctx, slot] of Object.entries(slots)) {
    if (ctx === 'default' || ctx === baseCase) continue
    // A context whose value equals the base carries no information; dropping it here is
    // what keeps a migrated document from showing exceptions the author never made.
    if (slotsEqualShallow(slot, base)) continue
    if (!by.trim()) continue
    exceptions.push({ group: by, context: ctx, slot })
  }
  return exceptions.length ? { base, exceptions } : { base }
}

/**
 * A deliberately shallow structural comparison, used only by migration to drop
 * context slots that merely repeat the base. The real comparison (`slotsEqual`, which
 * knows that a typed colour and its CSS spelling are the same value) lives in the
 * resolver and would be a circular import here.
 */
function slotsEqualShallow(a: Slot, b: Slot): boolean {
  if ('raw' in a && 'raw' in b) return a.raw === b.raw
  if ('ref' in a && 'ref' in b) return a.ref === b.ref
  return false
}

/**
 * A stored length string → a typed dimension slot (proposal 0038).
 *
 * This is a real migration, unlike 0036's colour: the stored form was lossy, so leaving
 * it alone would keep `12px` and `0.75rem` indistinguishable. A radius of 9999 or more
 * was only ever the CSS "fully rounded" idiom, so it becomes the `pill` intent that every
 * target can lower properly. Anything with no neutral form (a viewport unit, a calc())
 * stays a raw slot.
 */
function canonicalizeSlot(type: TokenType, slot: Slot): Slot {
  if (!('raw' in slot)) return slot
  const length = parseLength(slot.raw)
  if (type === 'radius' && length.kind === 'fixed' && length.value >= 9999) {
    return { dimension: { keyword: 'pill' } }
  }
  const typed = lengthValue(length)
  return typed ? { dimension: typed } : slot
}

function canonicalizeValue(type: TokenType, v: TokenValue): TokenValue {
  if (!isLengthType(type)) return v
  const base = canonicalizeSlot(type, v.base)
  const exceptions = tokenExceptions(v).map((e) => ({ ...e, slot: canonicalizeSlot(type, e.slot) }))
  return exceptions.length ? { base, exceptions } : { base }
}

function normalizeLayer(layer: Layer, groups: ContextGroup[]): Layer {
  return {
    id: layer.id,
    name: layer.name,
    order: layer.order,
    // Listed explicitly, so it survives every normalize. This function rebuilds the layer
    // field by field, which is how `naming` was silently wiped on every edit once (0041).
    ...(layer.question ? { question: layer.question } : {}),
    groups: Array.isArray(layer.groups) ? layer.groups : [],
    tokens: (layer.tokens ?? []).map((t, i) => ({
      ...t,
      value: canonicalizeValue(t.type, normalizeValue(t.value, groups)),
      group: t.group ?? null,
      order: typeof t.order === 'number' ? t.order : i,
      // A role that is not one we know is dropped rather than carried: it would show up
      // as a phantom rail group nothing can fill.
      ...(t.role && ROLE_KEYS.includes(t.role) ? { role: t.role } : { role: undefined }),
    })),
  }
}

/** Every context group gets an explicit base case, so `Everywhere` is always explainable. */
function normalizeContextGroups(groups: unknown): ContextGroup[] {
  if (!Array.isArray(groups)) return []
  return (groups as ContextGroup[])
    .filter((g) => g && Array.isArray(g.contexts))
    .map((g) => ({ ...g, base: baseCaseOf(g) }))
}

export function migrateFoundations(f: unknown): DocumentFoundations {
  const any = f as Partial<DocumentFoundations> & {
    colors?: LegacyColorToken[]
    scales?: Record<string, { id: string; name: string; value: string }[]>
  }

  if (any && Array.isArray(any.layers)) {
    const contextGroups = normalizeContextGroups(any.contextGroups)
    return {
      contextGroups,
      layers: any.layers.map((l) => normalizeLayer(l, contextGroups)),
      // Carried, not rebuilt: this function reconstructs the object field by field, so a field it
      // does not name is ERASED - on every load, and on every foundations mutation (`mapFoundations`
      // runs it first). Dropping the global props silently deleted the declarations, which the
      // dev harness caught the moment the add-prop dialog offered none (proposal 0051 §5).
      ...(Array.isArray(any.globalProps) ? { globalProps: any.globalProps } : {}),
      // The same trap, closed before it could spring (proposal 0052 §5.4).
      ...(Array.isArray(any.rules) ? { rules: any.rules } : {}),
      naming: any.naming,
      fonts: Array.isArray(any.fonts) ? any.fonts : [],
      icons: any.icons && Array.isArray(any.icons.sets) ? any.icons : { sets: [], icons: [] },
      messages: any.messages && Array.isArray(any.messages.messages) ? any.messages : undefined,
    }
  }

  if (!any || (!any.colors && !any.scales)) return defaultFoundations()

  const colors = any.colors ?? []
  const seed = defaultFoundations()

  const seedBase = seed.layers.find((l) => l.id === 'base')?.tokens ?? []
  const baseById = new Map<string, Token>(seedBase.map((t) => [t.id, { ...t }]))
  for (const t of colors.filter((t) => t.layer === 'primitive')) {
    baseById.set(t.id, { id: t.id, name: t.name, type: 'color', value: raw(t.value) })
  }
  const base = withOrder(
    [...baseById.values()].map(({ id, name, type, value }) => ({ id, name, type, value })),
  )

  const seedSemantic = new Map<string, TokenValue>()
  for (const layer of seed.layers) {
    for (const tok of layer.tokens) {
      if (tok.type === 'color' && (tok.value.exceptions?.length ?? 0) > 0)
        seedSemantic.set(tok.id, tok.value)
    }
  }

  const semantics: Omit<Token, 'group' | 'order'>[] = colors
    .filter((t) => t.layer !== 'primitive')
    .map((t) => {
      const known = seedSemantic.get(t.id)
      return {
        id: t.id,
        name: t.name,
        type: 'color' as const,
        value: known ? known : t.alias ? ref(t.alias) : raw(t.value),
      }
    })

  const scaleTokens: Omit<Token, 'group' | 'order'>[] = Object.entries(any.scales ?? {}).flatMap(
    ([scale, tokens]) =>
      (tokens ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        type: scale as TokenType,
        value: lengthOrRaw(scale as TokenType, t.value),
      })),
  )

  return {
    contextGroups: [colorSchemeGroup()],
    layers: [
      { id: 'base', name: 'Base', order: 0, tokens: base, groups: [] },
      {
        id: 'semantic',
        name: 'Semantic',
        order: 1,
        tokens: withOrder([...semantics, ...scaleTokens]),
        groups: [],
      },
      { id: 'component', name: 'Component', order: 2, tokens: [], groups: [] },
    ],
    fonts: [
      {
        id: 'body',
        name: 'Body',
        source: { kind: 'system', stack: SYSTEM_STACKS[0].stack },
        fallback: 'sans-serif',
      },
    ],
    icons: { sets: [{ id: 'lucide', ...ICON_SETS[0] }], icons: [] },
  }
}
