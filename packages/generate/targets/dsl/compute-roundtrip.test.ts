import { describe, expect, it } from 'vitest'
import { dslLines } from './testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { resolveToken, type ComputeValue, type DocumentFoundations } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── Computed values through the file, both ways (proposal 0044) ───────────────
// A `{ compute }` slot is a RELATIONSHIP: "the accent, 20% lighter", "the body size × 1.25".
// Before this, the emitter had no branch for it and fell through to an empty `raw ""`, so
// every computed token in an exported `.milda` lost its base, its steps and its meaning -
// silently, which is the exact failure proposal 0041 exists to prevent. It had been that way
// for computed colours since 0036.
//
// What is asserted here is the property that matters, in both directions:
//
//     IR  ->  print  ->  parse  ->  IR'          the relationship survives, not just the number
//     text -> parse -> IR -> print -> parse      the file survives a second trip unchanged
//
// The resolved VALUE is checked too, but it is the weaker claim: a printer that baked the
// computed literal would pass that and fail every assertion about the base and the ops.

// ── IR fixtures, written the way the editor writes them ──

const layerOf = (
  tokens: DocumentFoundations['layers'][number]['tokens'],
  id: string,
  order: number,
) => ({
  id,
  name: id === 'base' ? 'Base' : 'Semantic',
  order,
  groups: [],
  tokens,
})

function irWith(
  computed: { id: string; type: 'color' | 'fontSize'; compute: ComputeValue }[],
): DocumentFoundations {
  return {
    contextGroups: [],
    layers: [
      layerOf(
        [
          {
            id: 'accent',
            name: 'accent',
            type: 'color',
            value: { base: { raw: '#7c3aed' } },
            group: null,
          },
          {
            id: 'white',
            name: 'white',
            type: 'color',
            value: { base: { raw: '#ffffff' } },
            group: null,
          },
          {
            id: 'body',
            name: 'body',
            type: 'fontSize',
            value: { base: { dimension: { value: 16, unit: 'fixed' } } },
            group: null,
          },
        ],
        'base',
        0,
      ),
      layerOf(
        computed.map((c) => ({
          id: c.id,
          name: c.id,
          type: c.type,
          value: { base: { compute: c.compute } },
          group: null,
        })),
        'semantic',
        1,
      ),
    ],
    fonts: [],
    icons: { sets: [], icons: [] },
  }
}

const print = (foundations: DocumentFoundations): string =>
  documentToDsl({ components: [], foundations, sharedTypes: [], meta: {} })

function reparse(text: string) {
  const parsed = parseMildaDocument(text)
  return {
    ir: documentToIr(parsed.document),
    fatal: parsed.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.line}:${i.col} ${i.message}`),
    issues: parsed.issues,
  }
}

/** The computed slot of one token in a re-parsed document, by name. */
function computeOf(ir: ReturnType<typeof reparse>['ir'], name: string): ComputeValue | undefined {
  for (const layer of ir.foundations.layers) {
    const tok = layer.tokens.find((t) => t.name === name)
    if (!tok) continue
    const slot = tok.value.base
    return 'compute' in slot ? slot.compute : undefined
  }
  return undefined
}

/** A base/operand ref, as a NAME - ids are re-derived from paths on the way through the file
 *  (0041 §3), so comparing ids would assert the wrong thing. */
function refName(ir: ReturnType<typeof reparse>['ir'], slot: unknown): string | undefined {
  if (!slot || typeof slot !== 'object' || !('ref' in slot)) return undefined
  const id = (slot as { ref: string }).ref
  for (const layer of ir.foundations.layers) {
    const tok = layer.tokens.find((t) => t.id === id)
    if (tok) return tok.name
  }
  return `(missing:${id})`
}

describe('a computed colour survives the file', () => {
  const foundations = irWith([
    {
      id: 'accent-soft',
      type: 'color',
      compute: { base: { ref: 'accent' }, ops: [{ op: 'lighten', amount: 0.2 }], space: 'oklch' },
    },
  ])

  it('prints as the relationship, not as the colour it happens to resolve to', () => {
    const text = print(foundations)
    // The regex below already states the whole form; a bare toContain('compute') on top
    // of it asserted only that the word occurs somewhere.
    expect(text).toMatch(/compute\s+\S+\s+in oklch\s*\{\s*lighten 20%\s*\}/)
    // The old behaviour, guarded against directly.
    expect(text).not.toContain('raw ""')
  })

  it('comes back with the same base, ops and space', () => {
    const back = reparse(print(foundations))
    expect(back.fatal).toEqual([])
    const c = computeOf(back.ir, 'accent-soft')
    expect(c).toBeDefined()
    expect(refName(back.ir, c!.base)).toBe('accent')
    expect(c!.ops).toEqual([{ op: 'lighten', amount: 0.2 }])
    expect(c!.space).toBe('oklch')
  })

  it('resolves to the same colour on both sides of the trip', () => {
    const before = resolveToken('accent-soft', foundations, undefined, 'color')
    const back = reparse(print(foundations))
    const id = back.ir.foundations.layers
      .flatMap((l) => l.tokens)
      .find((t) => t.name === 'accent-soft')!.id
    expect(resolveToken(id, back.ir.foundations, undefined, 'color')).toBe(before)
  })

  it('carries every colour step, including a mix whose operand is another token', () => {
    const f = irWith([
      {
        id: 'accent-mixed',
        type: 'color',
        compute: {
          base: { ref: 'accent' },
          ops: [
            { op: 'darken', amount: 0.1 },
            { op: 'saturate', amount: 0.25 },
            { op: 'desaturate', amount: 0.05 },
            { op: 'rotate', degrees: -30 },
            { op: 'alpha', amount: 0.5 },
            { op: 'mix', with: { ref: 'white' }, amount: 0.4 },
          ],
        },
      },
    ])
    const back = reparse(print(f))
    expect(back.fatal).toEqual([])
    const c = computeOf(back.ir, 'accent-mixed')!
    expect(c.ops.map((o) => o.op)).toEqual([
      'darken',
      'saturate',
      'desaturate',
      'rotate',
      'alpha',
      'mix',
    ])
    expect(c.ops[3]).toEqual({ op: 'rotate', degrees: -30 })
    expect(c.ops[5]).toMatchObject({ op: 'mix', amount: 0.4 })
    expect(refName(back.ir, (c.ops[5] as { with: unknown }).with)).toBe('white')
  })

  it('keeps a non-literal maths space - the ones no literal can be spelled in', () => {
    for (const space of ['oklab', 'lab', 'lch', 'srgb', 'display-p3', 'hsl'] as const) {
      const f = irWith([
        {
          id: 'c',
          type: 'color',
          compute: { base: { ref: 'accent' }, ops: [{ op: 'lighten', amount: 0.1 }], space },
        },
      ])
      const back = reparse(print(f))
      expect(back.fatal).toEqual([])
      expect(computeOf(back.ir, 'c')?.space).toBe(space)
    }
  })
})

describe('a computed measurement survives the file', () => {
  const foundations = irWith([
    {
      id: 'heading',
      type: 'fontSize',
      compute: {
        base: { ref: 'body' },
        ops: [
          { op: 'scale', factor: 1.5 },
          { op: 'offset', delta: -2 },
          { op: 'round', to: 2 },
        ],
      },
    },
  ])

  it('prints the numeric vocabulary with its unit, so the file says what it measures', () => {
    expect(print(foundations)).toMatch(
      /compute\s+\S+\s*\{\s*scale 1\.5; offset -2px; round 2px\s*\}/,
    )
  })

  it('comes back with the same base and steps, in order', () => {
    const back = reparse(print(foundations))
    expect(back.fatal).toEqual([])
    const c = computeOf(back.ir, 'heading')!
    expect(refName(back.ir, c.base)).toBe('body')
    expect(c.ops).toEqual([
      { op: 'scale', factor: 1.5 },
      { op: 'offset', delta: -2 },
      { op: 'round', to: 2 },
    ])
    expect(c.space).toBeUndefined()
  })

  it('resolves to the same length on both sides of the trip', () => {
    // 16 × 1.5 = 24, - 2 = 22, rounded to 2 = 22.
    expect(resolveToken('heading', foundations, undefined, 'fontSize')).toBe('22px')
    const back = reparse(print(foundations))
    const id = back.ir.foundations.layers
      .flatMap((l) => l.tokens)
      .find((t) => t.name === 'heading')!.id
    expect(resolveToken(id, back.ir.foundations, undefined, 'fontSize')).toBe('22px')
  })

  it('keeps a text-scaled base text-scaled through the file', () => {
    const f = irWith([
      {
        id: 'heading',
        type: 'fontSize',
        compute: { base: { ref: 'body' }, ops: [{ op: 'scale', factor: 1.25 }] },
      },
    ])
    // The base is fixed here, so re-point it at a text-scaled one.
    f.layers[0].tokens[2].value = { base: { dimension: { value: 1, unit: 'scaled' } } }
    const back = reparse(print(f))
    const id = back.ir.foundations.layers
      .flatMap((l) => l.tokens)
      .find((t) => t.name === 'heading')!.id
    expect(resolveToken(id, back.ir.foundations, undefined, 'fontSize')).toBe('scaled(1.25)')
  })
})

// The shape the EDITOR produces without anyone asking for it: a computed token edited while a
// non-base context is previewed writes the compute into that context's exception. The AST's
// slots hold ids, so a value in a slot is hoisted into a synthesized token - the mechanism an
// inline literal in an alias slot already uses - and the printer puts it back inline.
describe('a computed value inside a context exception', () => {
  const withScheme = (): DocumentFoundations => {
    const f = irWith([])
    f.contextGroups = [
      {
        id: 'scheme',
        name: 'Scheme',
        contexts: [
          { id: 'light', name: 'Light' },
          { id: 'dark', name: 'Dark' },
        ],
      },
    ]
    f.layers[1].tokens = [
      {
        id: 'surface',
        name: 'surface',
        type: 'color',
        value: {
          base: { ref: 'accent' },
          // Dark mode takes the accent, darkened - a relationship, in an exception.
          exceptions: [
            {
              group: 'scheme',
              context: 'dark',
              slot: { compute: { base: { ref: 'accent' }, ops: [{ op: 'darken', amount: 0.3 }] } },
            },
          ],
        },
        group: null,
      },
    ]
    return f
  }

  it('prints and re-parses without an error, and keeps the relationship', () => {
    const f = withScheme()
    const text = print(f)
    // A compute STATEMENT, not the word: the point of this case is that the relationship
    // survives printing, and only a real statement can be re-parsed into one.
    expect(dslLines(text).some((l) => /\bcompute\s+\S+/.test(l))).toBe(true)
    const back = reparse(text)
    expect(back.fatal).toEqual([])
    // The exception now points at a hoisted token whose value IS the compute.
    const tok = back.ir.foundations.layers
      .flatMap((l) => l.tokens)
      .find((t) => t.name === 'surface')!
    const dark = tok.value.exceptions?.find((e) => e.context.endsWith('dark'))
    expect(dark).toBeDefined()
    // The exception carries the relationship ITSELF, the way it was authored. The parser has to
    // hoist it into a synthesized token on the way in - the AST's alias slots hold ids only -
    // but that is an AST constraint, and the lowering undoes it (`inlineHoistedLiterals`), so
    // this is a fixed point rather than a document that grows a `(inline color)` token per pass.
    expect('compute' in dark!.slot).toBe(true)
    expect((dark!.slot as { compute: ComputeValue }).compute.ops).toEqual([
      { op: 'darken', amount: 0.3 },
    ])
    expect(
      back.ir.foundations.layers.flatMap((l) => l.tokens).some((t) => /^lit-/.test(t.id)),
    ).toBe(false)
  })

  it('resolves to the same colour in each context, before and after', () => {
    const f = withScheme()
    const before = {
      light: resolveToken('surface', f, { contextSelections: { scheme: 'light' } }, 'color'),
      dark: resolveToken('surface', f, { contextSelections: { scheme: 'dark' } }, 'color'),
    }
    // The dark case is the computed one, so this is the assertion that would fail if the
    // relationship had been dropped or baked.
    expect(before.dark).not.toBe(before.light)

    const back = reparse(print(f))
    const ir = back.ir.foundations
    const id = ir.layers.flatMap((l) => l.tokens).find((t) => t.name === 'surface')!.id
    const group = ir.contextGroups[0]!
    const ctx = (name: string) => group.contexts.find((c) => c.name === name)!.id
    expect(resolveToken(id, ir, { contextSelections: { [group.id]: ctx('Light') } }, 'color')).toBe(
      before.light,
    )
    expect(resolveToken(id, ir, { contextSelections: { [group.id]: ctx('Dark') } }, 'color')).toBe(
      before.dark,
    )
  })
})

describe('a nested compute (a mix operand that is itself computed)', () => {
  it('survives, because the surface reads `compute` in an operand rather than as a path', () => {
    const f = irWith([
      {
        id: 'blended',
        type: 'color',
        compute: {
          base: { ref: 'accent' },
          ops: [
            {
              op: 'mix',
              with: { compute: { base: { ref: 'white' }, ops: [{ op: 'alpha', amount: 0.5 }] } },
              amount: 0.4,
            },
          ],
        },
      },
    ])
    const before = resolveToken('blended', f, undefined, 'color')
    const back = reparse(print(f))
    expect(back.fatal).toEqual([])
    const id = back.ir.foundations.layers
      .flatMap((l) => l.tokens)
      .find((t) => t.name === 'blended')!.id
    expect(resolveToken(id, back.ir.foundations, undefined, 'color')).toBe(before)
  })
})

describe('a second trip changes nothing', () => {
  it('prints byte-identically the second time (the printer has a fixed point)', () => {
    const foundations = irWith([
      {
        id: 'accent-soft',
        type: 'color',
        compute: {
          base: { ref: 'accent' },
          ops: [
            { op: 'lighten', amount: 0.2 },
            { op: 'mix', with: { ref: 'white' }, amount: 0.4 },
          ],
          space: 'oklch',
        },
      },
      {
        id: 'heading',
        type: 'fontSize',
        compute: {
          base: { ref: 'body' },
          ops: [
            { op: 'scale', factor: 1.333 },
            { op: 'round', to: 1 },
          ],
        },
      },
    ])
    const once = print(foundations)
    const twice = print(reparse(once).ir.foundations)
    expect(twice).toBe(once)
  })
})

describe('what the surface says about a bad compute', () => {
  const parseTokens = (body: string) => parseMildaDocument(`foundations {\n${body}\n}`)
  const codes = (body: string) =>
    parseTokens(body)
      .issues.filter((i) => i.severity === 'error')
      .map((i) => i.code)

  it('accepts the authored spelling: a percentage, and a rotation with or without deg', () => {
    const doc = parseTokens(
      `  token accent : color = hex(7c3aed)\n` +
        `  token soft : color = compute accent in oklch { lighten 20%; rotate 30 }`,
    )
    expect(doc.issues.filter((i) => i.severity === 'error')).toEqual([])
    const v = doc.document.foundations.layers[0].tokens[1].value
    expect(v).toMatchObject({
      kind: 'compute',
      ops: [
        { op: 'lighten', amount: 0.2 },
        { op: 'rotate', degrees: 30 },
      ],
    })
  })

  it('refuses a step from the other vocabulary, naming the one that applies', () => {
    // `scale` on a colour, and `lighten` on a size: both plausible to try, so both are
    // reported rather than silently dropped.
    expect(
      codes(`  token a : color = hex(7c3aed)\n  token b : color = compute a { scale 2 }`),
    ).toEqual(['compute-op-type'])
    expect(
      codes(`  token a : font-size = 16px\n  token b : font-size = compute a { lighten 20% }`),
    ).toEqual(['compute-op-type'])
  })

  it('refuses an unknown step and an unknown space', () => {
    expect(
      codes(`  token a : color = hex(7c3aed)\n  token b : color = compute a { frobnicate 2 }`),
    ).toEqual(['compute-op'])
    expect(
      codes(
        `  token a : color = hex(7c3aed)\n  token b : color = compute a in cmyk { lighten 20% }`,
      ),
    ).toEqual(['compute-space'])
  })

  it('warns about a compute with no steps rather than accepting it as a value', () => {
    const doc = parseTokens(`  token a : color = hex(7c3aed)\n  token b : color = compute a { }`)
    expect(doc.issues.map((i) => i.code)).toContain('compute-empty')
  })
})
