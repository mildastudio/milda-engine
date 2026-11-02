import { describe, expect, it } from 'vitest'
import { hasDslLine, hasDslLineEnding } from './testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'
import { migrateFoundations, type DocumentFoundations, type Token } from '@mildastudio/core'

const token = (
  id: string,
  name: string,
  type: Token['type'],
  raw: string,
  order: number,
): Token => ({
  id,
  name,
  type,
  value: { base: { raw } },
  group: null,
  order,
})

const foundations = (tokens: Token[]): DocumentFoundations => ({
  contextGroups: [],
  layers: [{ id: 'l', name: 'L', order: 0, groups: [], tokens }],
  fonts: [],
  icons: { sets: [], icons: [] },
})

const base = (): DocumentFoundations =>
  foundations([
    token('tok.brand', 'brand', 'color', '#3b82f6', 0),
    token('tok.gap', 'gap', 'spacing', '0.5rem', 1),
  ])

describe('DSL emitter - first-class value literals', () => {
  const dsl = documentToDsl({ components: [], foundations: base() })

  it('emits colors as hex(...) rather than a raw quoted string', () => {
    expect(hasDslLine(dsl, 'token brand : color = hex(3b82f6)')).toBe(true)
    expect(dsl).not.toContain('raw "#3b82f6"')
  })

  // 0038: a length emits its CANONICAL spelling. `rem` is read but never written, so a
  // stored `0.5rem` comes out as `scaled(0.5)` - same value, no DOM concept in the name.
  it('emits lengths as canonical literals, never as rem or a bare number', () => {
    expect(hasDslLine(dsl, 'token gap : spacing = scaled(0.5)')).toBe(true)
    expect(dsl).not.toContain('0.5rem')
    expect(dsl).not.toContain('raw "0.5rem"')
  })

  it('round-trips: the emitted first-class literals parse back cleanly', () => {
    const { issues } = parseMildaDocument(dsl)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

// Every colour space the DSL claims to support has to survive emit -> parse as a
// FIRST-CLASS literal, not as an `escape` fallback, and with its channels intact.
// Regression cover for three shipped defects: percentage channels parsed as NaN and
// silently dropped (hsl/oklch), and `color(display-p3 …)` never round-tripping at all.
describe('DSL colour spaces - round-trip per space', () => {
  const parseTokenValue = (raw: string) => {
    const dsl = documentToDsl({
      components: [],
      foundations: foundations([token('tok.c', 'c', 'color', raw, 0)]),
    })
    const { document, issues } = parseMildaDocument(dsl)
    const parsed = document.foundations?.layers[0]?.tokens.find((t) => t.name === 'c')
    return { dsl, issues, value: parsed?.value }
  }

  it.each([
    ['hex', '#3b82f6', 'hex(3b82f6)'],
    ['hex with alpha', '#3b82f680', 'hex(3b82f680)'],
    ['oklch', 'oklch(0.62 0.19 268)', 'oklch(0.62 0.19 268)'],
    ['hsl', 'hsl(210 50% 40%)', 'hsl(210 50% 40%)'],
    ['display-p3', 'color(display-p3 0.5 0.2 0.1)', 'p3(0.5 0.2 0.1)'],
  ])('%s emits a first-class literal and parses without error', (_label, raw, expectedLiteral) => {
    const { dsl, issues, value } = parseTokenValue(raw)
    expect(hasDslLineEnding(dsl, `= ${expectedLiteral}`)).toBe(true)
    expect(dsl).not.toContain('raw "')
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(value?.kind).toBe('raw')
  })

  it('keeps hsl percentage channels instead of dropping them to zero', () => {
    // Before the fix: Number("50%") -> NaN -> channel skipped -> [210, 0, 0].
    const { value } = parseTokenValue('hsl(210 50% 40%)')
    expect(value).toMatchObject({ kind: 'raw', value: { space: 'hsl', channels: [210, 0.5, 0.4] } })
  })

  it('accepts both percentage and bare-number oklch lightness', () => {
    const dsl = (raw: string) =>
      documentToDsl({
        components: [],
        foundations: foundations([token('tok.c', 'c', 'color', raw, 0)]),
      })
    const pct = parseMildaDocument(dsl('oklch(62% 0.19 268)'))
    const bare = parseMildaDocument(dsl('oklch(0.62 0.19 268)'))
    const channels = (d: typeof pct) =>
      (d.document.foundations?.layers[0]?.tokens[0]?.value as { value: { channels: number[] } })
        .value.channels
    expect(channels(pct)[0]).toBeCloseTo(0.62, 5)
    expect(channels(bare)[0]).toBeCloseTo(0.62, 5)
    expect(channels(pct)[1]).toBeCloseTo(0.19, 5)
  })

  it('parses slash-separated alpha in both spaced and glued forms', () => {
    const alphaOf = (raw: string) => {
      const { value } = parseTokenValue(raw)
      return (value as { value: { alpha?: number } }).value.alpha
    }
    expect(alphaOf('oklch(0.62 0.19 268 / 0.5)')).toBeCloseTo(0.5, 5)
    expect(alphaOf('oklch(0.62 0.19 268 / 50%)')).toBeCloseTo(0.5, 5)
  })

  it('reports an unparseable channel instead of silently zeroing it', () => {
    const { issues } = parseTokenValue('oklch(0.62 nope 268)')
    expect(issues.some((i) => i.code === 'color-channel')).toBe(true)
  })
})

// ─── 0038 regression: the 16x length round-trip drift ─────────────────────────
// The bug: a stored length was unit-stripped on load ("12px" -> "12"), the emitter wrote
// the bare number, and the reader typed a bare number as `rem`. So one Studio round trip
// turned 12px into 12rem - a silent 16x. This test goes through the SAME normalisation
// the Studio applies at hydration (migrateFoundations), which is exactly what the older
// emitter test skipped by constructing IR slots by hand.
describe('DSL round-trip - lengths keep their kind (0038)', () => {
  const roundTrip = (type: Token['type'], raw: string) => {
    const f = migrateFoundations(foundations([token('tok.v', 'v', type, raw, 0)]))
    const dsl = documentToDsl({ components: [], foundations: f })
    const { document, issues } = parseMildaDocument(dsl)
    const value = document.foundations?.layers[0]?.tokens.find((t) => t.name === 'v')?.value
    return { dsl, errors: issues.filter((i) => i.severity === 'error'), value }
  }

  it('keeps a fixed length fixed', () => {
    const { dsl, errors, value } = roundTrip('spacing', '12px')
    expect(hasDslLine(dsl, 'token v : spacing = 12px')).toBe(true)
    expect(errors).toEqual([])
    expect(value).toEqual({ kind: 'raw', value: { value: 12, unit: 'fixed' } })
  })

  it('keeps a text-scaled length text-scaled', () => {
    const { dsl, errors, value } = roundTrip('spacing', '0.75rem')
    expect(hasDslLine(dsl, 'token v : spacing = scaled(0.75)')).toBe(true)
    expect(errors).toEqual([])
    expect(value).toEqual({ kind: 'raw', value: { value: 0.75, unit: 'scaled' } })
  })

  it('reads a legacy unit-less length as fixed, and writes the unit back', () => {
    const { dsl, value } = roundTrip('spacing', '12')
    expect(hasDslLine(dsl, 'token v : spacing = 12px')).toBe(true)
    expect(value).toEqual({ kind: 'raw', value: { value: 12, unit: 'fixed' } })
  })

  it('turns the 9999px pill hack into the pill intent', () => {
    const { dsl, errors, value } = roundTrip('radius', '9999px')
    expect(hasDslLine(dsl, 'token v : radius = pill')).toBe(true)
    expect(errors).toEqual([])
    expect(value).toEqual({ kind: 'raw', value: { keyword: 'pill' } })
  })

  it('keeps a viewport length as a raw escape value', () => {
    const { dsl, errors } = roundTrip('size', '100vw')
    expect(hasDslLineEnding(dsl, '= raw "100vw"')).toBe(true)
    expect(errors).toEqual([])
  })
})

// ─── A literal inside an alias slot comes back as a literal ───────────────────
// The canonical AST addresses an alias slot's value by token ID and nothing else, so the parser
// mints a `tok.lit-…` token per distinct inline literal. The editor IR has no such constraint -
// an exception slot holds a value directly - and the emitter already restores the sugar on the
// way out. Keeping the synthesized tokens in the document therefore invented foundations the
// author never wrote: the Radix Themes system imported as 2391 tokens instead of 969, 1422 of
// them named `(inline color)`.
describe('hoisted inline literals', () => {
  const SOURCE = `
context-group ColorScheme { Light Dark }

foundations {
  token surface : color = alias by ColorScheme { Light -> hex(ffffff); Dark -> hex(111111) }
  token named : color = hex(3b82f6)
}
`
  const irOf = (source: string) => {
    const parsed = parseMildaDocument(source, {})
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
    return documentToIr(parsed.document)
  }

  it('are not tokens in the document', () => {
    const tokens = irOf(SOURCE).foundations.layers.flatMap((l) => l.tokens)
    expect(tokens.map((t) => t.name)).toEqual(['surface', 'named'])
  })

  it('are the value the slot holds', () => {
    const surface = irOf(SOURCE)
      .foundations.layers.flatMap((l) => l.tokens)
      .find((t) => t.name === 'surface')
    expect(surface!.value.base).toEqual({ raw: '#ffffff' })
    expect(surface!.value.exceptions?.map((e) => e.slot)).toEqual([{ raw: '#111111' }])
  })

  it('stay tokens when a COMPONENT facet names one', () => {
    // A facet holds a token id and cannot hold a value, so inlining that one would leave the
    // facet pointing at nothing. Same escape the emitter takes (`inlineableHoisted`).
    const ir = irOf(`${SOURCE}
component Chip {
  part root {
    fill lit-color-1
  }
}
`)
    const tokens = ir.foundations.layers.flatMap((l) => l.tokens)
    expect(tokens.some((t) => t.id === 'lit-color-1')).toBe(true)
    // The one nothing references is still gone.
    expect(tokens.filter((t) => /^lit-/.test(t.id))).toHaveLength(1)
  })
})
