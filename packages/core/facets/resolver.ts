import type {
  ComputeValue,
  ContextGroup,
  DocumentFoundations,
  GradientValue,
  Layer,
  Slot,
  TextStyleFamily,
  TextStyleValue,
  Token,
  RoleKey,
  TokenException,
  TokenType,
  TokenValue,
} from '../foundations/document'
import { baseCaseOf, isLengthOp } from '../foundations/document'
import { fontFamilyStack, type FontFamily } from '../foundations/typography'
import { easingToCss } from '../foundations/easing'
import {
  applyColorOps,
  colorToCss,
  parseCssColor,
  type ResolvedColorOp,
} from '../foundations/color'
import {
  ASSUMED_ROOT_PX,
  formatLength,
  isLengthType,
  lengthOf,
  parseLength,
  type Length,
} from '../foundations/dimensions'
import type { ColorValue } from '@mildastudio/milda'

export interface TokenResolverContext {
  contextSelections: Record<string, string>
}

export function findToken(f: DocumentFoundations, id: string, type?: TokenType): Token | undefined {
  const layers = [...f.layers].sort((a, b) => a.order - b.order)
  for (const layer of layers) {
    const t = layer.tokens.find((t) => t.id === id && (type === undefined || t.type === type))
    if (t) return t
  }
  return undefined
}

/**
 * Every exception that matches the selected contexts, in `contextGroups` order.
 *
 * The order IS the precedence rule (proposal 0042 §2.1): with both `scheme = dark` and
 * `brand = nova` selected, a token carrying an exception for each has two matches, and the
 * first one wins. Returning the whole list rather than just the winner is deliberate --
 * the editor tells the author when a value is contested, which is the only thing that
 * makes an implicit rule survive contact with a real system.
 */
export function matchingExceptions(
  v: TokenValue,
  groups: ContextGroup[],
  selections: Record<string, string> | undefined,
): TokenException[] {
  const exceptions = v.exceptions
  if (!exceptions || exceptions.length === 0 || !selections) return []
  const rank = new Map(groups.map((g, i) => [g.id, i]))
  return exceptions
    .filter((e) => selections[e.group] === e.context)
    .sort(
      (a, b) =>
        (rank.get(a.group) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.group) ?? Number.MAX_SAFE_INTEGER),
    )
}

/**
 * The slot in force right now: the winning exception, else the base.
 *
 * `groups` is optional so the many callers that resolve at the default context keep
 * working unchanged -- with no selections nothing can match, so the base is correct.
 */
export function activeSlotOf(
  v: TokenValue,
  groups: ContextGroup[] = [],
  selections?: Record<string, string>,
): Slot {
  return matchingExceptions(v, groups, selections)[0]?.slot ?? v.base
}

/**
 * The token that claims a role, searched from the highest layer down (proposal 0042 §2.3).
 *
 * Highest-first because a role claimed in a component-override layer is the more specific
 * answer. Returns undefined when nothing claims it - deliberately, since the alternative is
 * guessing from a name, which breaks on the first renamed system and is exactly the mistake
 * that made a contrast check crash on an empty document.
 */
export function tokenWithRole(f: DocumentFoundations, role: RoleKey): Token | undefined {
  const layers = [...f.layers].sort((a, b) => b.order - a.order)
  for (const layer of layers) {
    const hit = layer.tokens.find((t) => t.role === role)
    if (hit) return hit
  }
  return undefined
}

function activeSlot(
  v: TokenValue,
  context?: TokenResolverContext,
  groups: ContextGroup[] = [],
): Slot | undefined {
  return activeSlotOf(v, groups, context?.contextSelections)
}

export function tokenVaries(token: Token): boolean {
  return (token.value.exceptions?.length ?? 0) > 0
}

/** The exception for exactly this aspect + case, if the token has one. */
export function exceptionFor(
  v: TokenValue,
  group: string,
  context: string,
): TokenException | undefined {
  return v.exceptions?.find((e) => e.group === group && e.context === context)
}

export function slotsEqual(a: Slot, b: Slot): boolean {
  if ('raw' in a && 'raw' in b) return a.raw === b.raw
  if ('color' in a && 'color' in b) return colorToCss(a.color) === colorToCss(b.color)
  // A typed colour and its own CSS spelling are the same value, so a mixed pair must
  // compare equal - otherwise setTokenSlot would refuse to collapse a per-context
  // token back to fixed just because one context was migrated and another was not.
  if ('color' in a && 'raw' in b) return colorToCss(a.color) === b.raw
  if ('raw' in a && 'color' in b) return a.raw === colorToCss(b.color)
  // Same reasoning as the colour pair above: a typed length and its own spelling are
  // the same value, so a half-migrated per-context token can still collapse to fixed.
  if ('dimension' in a && 'dimension' in b)
    return lengthsEqual(lengthOf(a.dimension), lengthOf(b.dimension))
  if ('dimension' in a && 'raw' in b) return lengthsEqual(lengthOf(a.dimension), parseLength(b.raw))
  if ('raw' in a && 'dimension' in b) return lengthsEqual(parseLength(a.raw), lengthOf(b.dimension))
  if ('ref' in a && 'ref' in b) return a.ref === b.ref
  if ('font' in a && 'font' in b) return a.font.id === b.font.id
  if ('gradient' in a && 'gradient' in b) return gradientsEqual(a.gradient, b.gradient)
  if ('textStyle' in a && 'textStyle' in b) return textStylesEqual(a.textStyle, b.textStyle)
  if ('easing' in a && 'easing' in b) return easingToCss(a.easing) === easingToCss(b.easing)
  return false
}

function lengthsEqual(a: Length, b: Length): boolean {
  return formatLength(a) === formatLength(b)
}

function gradientsEqual(a: GradientValue, b: GradientValue): boolean {
  return (
    a.kind === b.kind &&
    (a.angle ?? 0) === (b.angle ?? 0) &&
    a.stops.length === b.stops.length &&
    a.stops.every(
      (s, i) => s.position === b.stops[i].position && slotsEqual(s.color, b.stops[i].color),
    )
  )
}

/** Two families are the same when they name the same thing the same WAY: a ref and the id it
 *  currently resolves to are different values, and collapsing them would silently rewrite an
 *  author's reference into a frozen id. */
function familiesEqual(a: TextStyleFamily, b: TextStyleFamily): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b
  return a.ref === b.ref
}

function textStylesEqual(a: TextStyleValue, b: TextStyleValue): boolean {
  return (
    familiesEqual(a.family, b.family) &&
    slotsEqual(a.size, b.size) &&
    slotsEqual(a.weight, b.weight) &&
    slotsEqual(a.lineHeight, b.lineHeight) &&
    slotsEqual(a.letterSpacing, b.letterSpacing)
  )
}

/**
 * What an in-place edit does when the author is not looking at every aspect's base case.
 *
 * A project-level setting, because the three answers are all defensible and which one is
 * right depends on how the team works (proposal 0042 §10.1):
 * - `precedence` writes the exception for the first off-base aspect in `contextGroups`
 *   order -- the same rule that decides resolution, so there is only one to learn.
 * - `ask` hands the ambiguity back to the author when more than one aspect is off-base.
 * - `baseOnly` refuses the in-place edit entirely; exceptions are then only ever created
 *   explicitly, from the value stack.
 */
export type ExceptionWritePolicy = 'precedence' | 'ask' | 'baseOnly'

export type WriteTarget =
  | { kind: 'base' }
  | { kind: 'exception'; group: string; context: string }
  /** More than one aspect is off-base and the policy says to ask which one. */
  | { kind: 'ambiguous'; candidates: { group: string; context: string }[] }
  /** The policy forbids creating an exception this way. */
  | { kind: 'blocked'; offBase: { group: string; context: string }[] }

/** Where an in-place edit should land, given what is being viewed and the policy. */
export function writeTargetFor(
  groups: ContextGroup[],
  selections: Record<string, string> | undefined,
  policy: ExceptionWritePolicy = 'precedence',
): WriteTarget {
  const offBase = groups
    .filter((g) => {
      const sel = selections?.[g.id]
      return sel !== undefined && sel !== baseCaseOf(g)
    })
    .map((g) => ({ group: g.id, context: selections![g.id] }))

  if (offBase.length === 0) return { kind: 'base' }
  if (policy === 'baseOnly') return { kind: 'blocked', offBase }
  if (policy === 'ask' && offBase.length > 1) return { kind: 'ambiguous', candidates: offBase }
  // `groups` is already in precedence order, so the first off-base aspect is the winner.
  return { kind: 'exception', group: offBase[0].group, context: offBase[0].context }
}

/**
 * Write a slot at a target, returning the new value.
 *
 * Two collapses keep the stored shape honest, so a token never claims to vary when it does
 * not: writing an exception whose value equals the base removes it instead of storing a
 * duplicate, and writing a base drops any exception that has just become redundant.
 */
export function writeSlot(token: Token, target: WriteTarget, slot: Slot): TokenValue {
  const cur = token.value
  const exceptions = cur.exceptions ?? []
  // A stored value can reach a writer without a base at all - a token saved by an interrupted
  // or pre-0042 write, the shape `migrateFoundations` repairs but that arrives unrepaired often
  // enough to have taken the dashboard down once. Reading it as an empty value repairs it on
  // the way through; comparing against `undefined` threw instead.
  const curBase = cur.base ?? { raw: '' }

  if (target.kind === 'base') {
    const kept = exceptions.filter((e) => !slotsEqual(e.slot, slot))
    return kept.length ? { base: slot, exceptions: kept } : { base: slot }
  }
  if (target.kind !== 'exception') return cur

  if (slotsEqual(slot, curBase)) {
    const kept = exceptions.filter(
      (e) => !(e.group === target.group && e.context === target.context),
    )
    return kept.length ? { base: curBase, exceptions: kept } : { base: curBase }
  }
  const existing = exceptions.some((e) => e.group === target.group && e.context === target.context)
  const next = existing
    ? exceptions.map((e) =>
        e.group === target.group && e.context === target.context ? { ...e, slot } : e,
      )
    : [...exceptions, { group: target.group, context: target.context, slot }]
  return { base: curBase, exceptions: next }
}

/** Remove one exception. */
export function clearException(token: Token, group: string, context: string): TokenValue {
  const kept = (token.value.exceptions ?? []).filter(
    (e) => !(e.group === group && e.context === context),
  )
  return kept.length ? { base: token.value.base, exceptions: kept } : { base: token.value.base }
}

export function resolveToken(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
  seen: Set<string> = new Set(),
): string | undefined {
  if (!id) return undefined
  const key = `${type ?? ''}:${id}`
  if (seen.has(key)) return undefined
  seen.add(key)

  const token = findToken(f, id, type)
  if (!token) return undefined

  const slot = activeSlot(token.value, context, f.contextGroups)
  if (!slot) return undefined

  if ('raw' in slot) return slot.raw
  // A typed colour serialises at the boundary, so every existing consumer keeps
  // receiving a CSS string and nothing had to change to accommodate the new variant.
  if ('color' in slot) return colorToCss(slot.color)
  // Same for a typed length (0038), except that it serialises to its CANONICAL spelling
  // (`12px`, `scaled(0.75)`, `pill`) rather than to CSS: the string still carries the
  // unit, so `lengthToCss` / `lengthToDp` can lower it per target instead of guessing.
  if ('dimension' in slot) return formatLength(lengthOf(slot.dimension))
  if ('compute' in slot) {
    // Which vocabulary the steps belong to follows the TOKEN'S TYPE (proposal 0044): a length
    // token computes numerically and serialises to its canonical spelling, a colour token
    // computes in a colour space and serialises to CSS.
    if (isLengthType(token.type)) {
      const length = computeLength(slot.compute, f, context, token.type, seen)
      return length ? formatLength(length) : undefined
    }
    const computed = computeColor(slot.compute, f, context, seen)
    return computed ? colorToCss(computed) : undefined
  }
  if ('ref' in slot) return resolveToken(slot.ref, f, context, token.type, seen)

  if ('gradient' in slot) return resolveGradient(slot.gradient, f, context)

  // A family lowers to its STACK - the family plus its fallbacks - which is what every
  // consumer of a resolved value wants and what `fontFamilyStack` already builds for the
  // font library. A family that has been deleted resolves to nothing, exactly like a
  // dangling ref: better an empty value than a stack for a font that is gone.
  if ('font' in slot) {
    const fam = f.fonts?.find((x) => x.id === slot.font.id)
    return fam ? fontFamilyStack(fam) : undefined
  }

  if ('easing' in slot) return easingToCss(slot.easing)

  return undefined
}

/**
 * The typed counterpart of `resolveToken` for colour tokens.
 *
 * `resolveToken` returns CSS because that is what almost every consumer wants, and
 * widening its return type would touch every generator at once. This resolves to the
 * structured value instead, which is what an operation on a colour needs (a modifier
 * cannot lighten a string). A slot still holding `raw` is parsed on demand, so an
 * un-migrated document works unchanged and no data migration is required.
 */
export function resolveTokenColor(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  seen: Set<string> = new Set(),
): ColorValue | undefined {
  if (!id || seen.has(id)) return undefined
  seen.add(id)

  const token = findToken(f, id, 'color')
  if (!token) return undefined
  const slot = activeSlot(token.value, context, f.contextGroups)
  if (!slot) return undefined
  return slotColor(slot, f, context, seen)
}

/**
 * The typed counterpart of `resolveToken` for length tokens (0038) - the same shape as
 * `resolveTokenColor`. Consumers that must lower a length themselves (the web unit
 * policy, Figma's numeric variables, the Studio's dimension editor) need the structure,
 * not a string; everything else keeps reading the canonical spelling.
 */
export function resolveTokenLength(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
  seen: Set<string> = new Set(),
): Length | undefined {
  if (!id) return undefined
  const key = `${type ?? ''}:${id}`
  if (seen.has(key)) return undefined
  seen.add(key)

  const token = findToken(f, id, type)
  if (!token) return undefined
  const slot = activeSlot(token.value, context, f.contextGroups)
  if (!slot) return undefined
  return slotLength(slot, f, context, token.type, seen)
}

/** A single slot's length, following one reference hop at a time. */
export function slotLength(
  slot: Slot,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
  seen: Set<string> = new Set(),
): Length | undefined {
  if ('dimension' in slot) return lengthOf(slot.dimension)
  // An un-migrated slot is parsed on demand, so a document written before 0038 reads
  // correctly: a bare number there always meant a fixed, density-independent length.
  if ('raw' in slot) return parseLength(slot.raw)
  if ('ref' in slot) return resolveTokenLength(slot.ref, f, context, type, seen)
  if ('compute' in slot) return computeLength(slot.compute, f, context, type, seen)
  return undefined
}

/**
 * Evaluate a computed LENGTH: resolve the base, then fold the numeric steps over it
 * (proposal 0044). The counterpart of `computeColor`, and deliberately its own function - the
 * two share the slot shape and the cycle guard, nothing else.
 *
 * The KIND survives where it can: scaling a text-scaled base keeps it text-scaled, because
 * "1.25× the body size" is still a multiple of the user's text size and flattening it to px
 * would silently opt the token out of Dynamic Type. `offset` and `round` are stated in dp, so
 * they force the result to fixed - measured in device-independent pixels, a step of "+2"
 * cannot mean anything else.
 *
 * Returns undefined when the base has no measurable length (a percentage, a viewport unit, a
 * missing reference) rather than inventing one: a scale of nothing is unknown, not zero.
 */
export function computeLength(
  compute: ComputeValue,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
  seen: Set<string> = new Set(),
): Length | undefined {
  const base = slotLength(compute.base, f, context, type, seen)
  if (!base) return undefined
  // Only the two kinds that carry a magnitude can be computed on. `pill` is an intent and a
  // relative length has no measure here, so both are left alone.
  if (base.kind !== 'fixed' && base.kind !== 'scaled') return undefined

  let kind: 'fixed' | 'scaled' = base.kind
  let value = base.value
  for (const op of compute.ops) {
    if (!isLengthOp(op)) continue // a colour step on a length token - skipped, see computeColor
    if (op.op === 'scale') {
      value = value * op.factor
      continue
    }
    // dp-denominated from here on, so a text-scaled magnitude is lowered first.
    if (kind === 'scaled') {
      value = value * ASSUMED_ROOT_PX
      kind = 'fixed'
    }
    if (op.op === 'offset') value = value + op.delta
    else if (op.op === 'round' && op.to > 0) value = Math.round(value / op.to) * op.to
  }
  return { kind, value: round3(value) }
}

const round3 = (n: number): number => +n.toFixed(3)

/** A single slot's colour, following one reference hop at a time. */
export function slotColor(
  slot: Slot,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  seen: Set<string> = new Set(),
): ColorValue | undefined {
  if ('color' in slot) return slot.color
  if ('raw' in slot) return parseCssColor(slot.raw) ?? undefined
  if ('ref' in slot) return resolveTokenColor(slot.ref, f, context, seen)
  if ('compute' in slot) return computeColor(slot.compute, f, context, seen)
  return undefined
}

/**
 * Evaluate a computed colour: resolve the base, resolve any operand the ops need, then
 * hand the concrete values to the pure maths in ../foundations/color.
 *
 * Returns undefined when the base cannot be typed (a named colour, a missing reference),
 * rather than inventing a fallback: a modifier on nothing is not black, it is unknown,
 * and the editor should say so.
 */
export function computeColor(
  compute: ComputeValue,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  seen: Set<string> = new Set(),
): ColorValue | undefined {
  const base = slotColor(compute.base, f, context, seen)
  if (!base) return undefined

  const resolved: ResolvedColorOp[] = []
  for (const op of compute.ops) {
    // A step from the LENGTH vocabulary on a colour token: skipped, not guessed at. It can
    // only get here by editing the file by hand or by changing a token's type under a
    // computed value, and inventing a colour meaning for "scale" would be worse than
    // ignoring it.
    if (isLengthOp(op)) continue
    if (op.op === 'mix') {
      // A mix operand shares the cycle guard: mixing with something that (transitively)
      // computes from this token must terminate, not recurse forever.
      const other = slotColor(op.with, f, context, new Set(seen))
      if (!other) continue // an unresolvable operand drops its step, not the whole value
      resolved.push({ op: 'mix', with: other, amount: op.amount })
      continue
    }
    resolved.push(op)
  }
  return applyColorOps(base, resolved, compute.space ?? 'oklch')
}

export function resolveGradient(
  g: GradientValue,
  f: DocumentFoundations,
  context?: TokenResolverContext,
): string {
  const colorOf = (s: Slot): string | undefined =>
    'raw' in s
      ? s.raw
      : 'color' in s
        ? colorToCss(s.color)
        : 'ref' in s
          ? resolveToken(s.ref, f, context, 'color')
          : undefined
  const stops = g.stops
    .map((s) => {
      const color = colorOf(s.color)
      return color ? `${color} ${s.position}%` : null
    })
    .filter((s): s is string => s !== null)
  if (stops.length === 0) return 'none'
  if (g.kind === 'linear') return `linear-gradient(${g.angle ?? 180}deg, ${stops.join(', ')})`
  if (g.kind === 'radial') return `radial-gradient(circle, ${stops.join(', ')})`
  return `conic-gradient(from ${g.angle ?? 0}deg, ${stops.join(', ')})`
}

export interface ResolvedTextStyle {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  letterSpacing?: string
}

/**
 * A text style's family → the CSS stack, whichever way it was named.
 *
 * A bare id is looked up in the font library; a ref goes through `resolveToken` as a fontFamily
 * token, which means it picks up that token's layering and its per-context exceptions for free -
 * the whole point of letting a text style point at a token instead of at the library.
 */
export function resolveTextStyleFamily(
  family: TextStyleFamily | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
): string | undefined {
  if (!family) return undefined
  if (typeof family !== 'string') return resolveToken(family.ref, f, context, 'fontFamily')
  const fam = f.fonts?.find((font) => font.id === family)
  return fam ? fontFamilyStack(fam) : undefined
}

/** The library entry a text style's family finally lands on - for the previews that need the
 *  FACE (its weights, its assets), not just the stack a resolved value carries. */
export function textStyleFontFamily(
  family: TextStyleFamily | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
  seen: Set<string> = new Set(),
): FontFamily | undefined {
  if (!family) return undefined
  if (typeof family === 'string') return f.fonts?.find((font) => font.id === family)
  if (seen.has(family.ref)) return undefined
  seen.add(family.ref)
  const token = findToken(f, family.ref, 'fontFamily')
  if (!token) return undefined
  const slot = activeSlot(token.value, context, f.contextGroups)
  if (!slot) return undefined
  if ('font' in slot) return f.fonts?.find((font) => font.id === slot.font.id)
  // A fontFamily token may itself alias another one; follow it the same way resolveToken does.
  if ('ref' in slot) return textStyleFontFamily({ ref: slot.ref }, f, context, seen)
  return undefined
}

export function resolveTextStyle(
  id: string | undefined,
  f: DocumentFoundations,
  context?: TokenResolverContext,
): ResolvedTextStyle | undefined {
  if (!id) return undefined
  const token = findToken(f, id, 'textStyle')
  if (!token) return undefined
  const slot = activeSlot(token.value, context)
  if (!slot || !('textStyle' in slot)) return undefined
  const ts = slot.textStyle
  // A typed length is a slot shape a text style's size can legitimately hold (0038); without
  // this branch it fell through to `undefined`, so a size authored as `15px` rather than as a
  // legacy bare string simply vanished from the resolved style.
  const leaf = (s: Slot, type: TokenType) =>
    'raw' in s
      ? s.raw
      : 'dimension' in s
        ? formatLength(lengthOf(s.dimension))
        : 'ref' in s
          ? resolveToken(s.ref, f, context, type)
          : undefined
  return {
    fontFamily: resolveTextStyleFamily(ts.family, f, context),
    fontSize: leaf(ts.size, 'fontSize'),
    fontWeight: leaf(ts.weight, 'fontWeight'),
    lineHeight: leaf(ts.lineHeight, 'lineHeight'),
    letterSpacing: leaf(ts.letterSpacing, 'letterSpacing'),
  }
}

export function makeContextResolver(
  f: DocumentFoundations,
  context?: TokenResolverContext,
  type?: TokenType,
) {
  return (id?: string): string | undefined => resolveToken(id, f, context, type)
}

export function defaultContextSelections(f: DocumentFoundations): Record<string, string> {
  const selections: Record<string, string> = {}
  for (const group of f.contextGroups) {
    if (group.contexts.length > 0) selections[group.id] = group.contexts[0].id
  }
  return selections
}

export interface TokenLayerGroup {
  layer: Layer
  tokens: Token[]
}

export function tokensByType(f: DocumentFoundations, type: TokenType): TokenLayerGroup[] {
  return [...f.layers]
    .sort((a, b) => a.order - b.order)
    .map((layer) => ({ layer, tokens: layer.tokens.filter((t) => t.type === type) }))
    .filter((g) => g.tokens.length > 0)
}
