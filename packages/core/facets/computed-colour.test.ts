import { describe, expect, it } from 'vitest'
import { computeColor, resolveToken, resolveTokenColor } from './resolver'
import { applyColorOps, colorToHex, convertColor } from '../foundations/color'
import { collectEdges, wouldCycle } from '../foundations/references'
import type { ColorValue } from '@mildastudio/milda'
import type { DocumentFoundations, Slot, Token, TokenValue } from '../foundations/document'

const tok = (id: string, value: TokenValue, type: Token['type'] = 'color'): Token => ({
  id,
  name: id,
  type,
  value,
  group: null,
})
const fixed = (slot: Slot): TokenValue => ({ base: slot })

const doc = (base: Token[], derived: Token[] = []): DocumentFoundations => ({
  contextGroups: [
    {
      id: 'scheme',
      name: 'Scheme',
      contexts: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
    },
  ],
  layers: [
    { id: 'base', name: 'Base', order: 0, groups: [], tokens: base },
    { id: 'semantic', name: 'Semantic', order: 1, groups: [], tokens: derived },
  ],
})

const L = (c: ColorValue): number => convertColor(c, 'oklch').channels[0]
const C = (c: ColorValue): number => convertColor(c, 'oklch').channels[1]
const H = (c: ColorValue): number => convertColor(c, 'oklch').channels[2]

// Amounts are RELATIVE: lighten(0.2) closes a fifth of the distance to white. That is
// what keeps every op monotonic and in-range regardless of the starting colour.
describe('applyColorOps - the maths', () => {
  const mid: ColorValue = { space: 'oklch', channels: [0.5, 0.15, 250] }

  it('lighten raises lightness, darken lowers it, both staying in range', () => {
    expect(L(applyColorOps(mid, [{ op: 'lighten', amount: 0.2 }]))).toBeGreaterThan(0.5)
    expect(L(applyColorOps(mid, [{ op: 'darken', amount: 0.2 }]))).toBeLessThan(0.5)
    expect(L(applyColorOps(mid, [{ op: 'lighten', amount: 1 }]))).toBeCloseTo(1, 5)
    expect(L(applyColorOps(mid, [{ op: 'darken', amount: 1 }]))).toBeCloseTo(0, 5)
  })

  it('never overshoots, however extreme the base or the amount', () => {
    const nearWhite: ColorValue = { space: 'oklch', channels: [0.98, 0.02, 100] }
    const nearBlack: ColorValue = { space: 'oklch', channels: [0.03, 0.02, 100] }
    expect(L(applyColorOps(nearWhite, [{ op: 'lighten', amount: 0.9 }]))).toBeLessThanOrEqual(
      1.0001,
    )
    expect(L(applyColorOps(nearBlack, [{ op: 'darken', amount: 0.9 }]))).toBeGreaterThanOrEqual(
      -0.0001,
    )
  })

  it('is monotonic: a bigger amount is always lighter', () => {
    const a = L(applyColorOps(mid, [{ op: 'lighten', amount: 0.1 }]))
    const b = L(applyColorOps(mid, [{ op: 'lighten', amount: 0.5 }]))
    const c = L(applyColorOps(mid, [{ op: 'lighten', amount: 0.9 }]))
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
  })

  it('lighten preserves hue', () => {
    const out = applyColorOps(mid, [{ op: 'lighten', amount: 0.3 }])
    expect(H(out)).toBeCloseTo(250, 1)
  })

  it('saturate and desaturate scale chroma', () => {
    expect(C(applyColorOps(mid, [{ op: 'saturate', amount: 0.5 }]))).toBeCloseTo(0.225, 3)
    expect(C(applyColorOps(mid, [{ op: 'desaturate', amount: 0.5 }]))).toBeCloseTo(0.075, 3)
    expect(C(applyColorOps(mid, [{ op: 'desaturate', amount: 1 }]))).toBeCloseTo(0, 5)
  })

  it('rotate moves the hue and wraps', () => {
    expect(H(applyColorOps(mid, [{ op: 'rotate', degrees: 60 }]))).toBeCloseTo(310, 1)
    expect(H(applyColorOps(mid, [{ op: 'rotate', degrees: 180 }]))).toBeCloseTo(70, 1)
    expect(H(applyColorOps(mid, [{ op: 'rotate', degrees: -250 }]))).toBeCloseTo(0, 1)
  })

  it('alpha sets rather than scales, and clamps', () => {
    expect(applyColorOps(mid, [{ op: 'alpha', amount: 0.4 }]).alpha).toBeCloseTo(0.4, 5)
    expect(applyColorOps(mid, [{ op: 'alpha', amount: 2 }]).alpha).toBe(1)
    expect(applyColorOps(mid, [{ op: 'alpha', amount: -1 }]).alpha).toBe(0)
  })

  it('applies ops in order, so darken-then-alpha differs from alpha-then-darken only where it should', () => {
    const a = applyColorOps(mid, [
      { op: 'darken', amount: 0.5 },
      { op: 'alpha', amount: 0.5 },
    ])
    const b = applyColorOps(mid, [
      { op: 'alpha', amount: 0.5 },
      { op: 'darken', amount: 0.5 },
    ])
    expect(L(a)).toBeCloseTo(L(b), 5)
    expect(a.alpha).toBeCloseTo(0.5, 5)
    expect(b.alpha).toBeCloseTo(0.5, 5)
    // But two lightens in sequence compound, unlike one big one.
    const twice = L(
      applyColorOps(mid, [
        { op: 'lighten', amount: 0.5 },
        { op: 'lighten', amount: 0.5 },
      ]),
    )
    const once = L(applyColorOps(mid, [{ op: 'lighten', amount: 0.5 }]))
    expect(twice).toBeGreaterThan(once)
  })

  it('mix interpolates, with 0 and 1 as the endpoints', () => {
    const red: ColorValue = { space: 'srgb', channels: [1, 0, 0] }
    const blue: ColorValue = { space: 'srgb', channels: [0, 0, 1] }
    expect(colorToHex(applyColorOps(red, [{ op: 'mix', with: blue, amount: 0 }]))).toBe('#ff0000')
    expect(colorToHex(applyColorOps(red, [{ op: 'mix', with: blue, amount: 1 }]))).toBe('#0000ff')
    const half = applyColorOps(red, [{ op: 'mix', with: blue, amount: 0.5 }])
    // A perceptual half-mix of red and blue is a purple: both ends present.
    const srgb = convertColor(half, 'srgb')
    expect(srgb.channels[0]).toBeGreaterThan(0.2)
    expect(srgb.channels[2]).toBeGreaterThan(0.2)
  })

  it('mix takes the shorter arc round the hue wheel', () => {
    // 350 to 10 must pass through 0, not travel backwards through 180.
    const a: ColorValue = { space: 'oklch', channels: [0.6, 0.15, 350] }
    const b: ColorValue = { space: 'oklch', channels: [0.6, 0.15, 10] }
    const mid2 = applyColorOps(a, [{ op: 'mix', with: b, amount: 0.5 }], 'oklch')
    const h = mid2.channels[2]
    expect(h > 355 || h < 5).toBe(true)
  })

  it('mix blends alpha too', () => {
    const opaque: ColorValue = { space: 'srgb', channels: [1, 0, 0] }
    const ghost: ColorValue = { space: 'srgb', channels: [1, 0, 0], alpha: 0 }
    expect(applyColorOps(opaque, [{ op: 'mix', with: ghost, amount: 0.5 }]).alpha).toBeCloseTo(
      0.5,
      3,
    )
  })

  it('falls back to OKLCH when asked to lighten in a space with no lightness channel', () => {
    const red: ColorValue = { space: 'srgb', channels: [1, 0, 0] }
    const out = applyColorOps(red, [{ op: 'lighten', amount: 0.5 }], 'srgb')
    expect(L(out)).toBeGreaterThan(L(red))
  })

  it('can compute in HSL when the author asks for it', () => {
    const c: ColorValue = { space: 'hsl', channels: [200, 0.5, 0.5] }
    const out = applyColorOps(c, [{ op: 'lighten', amount: 0.5 }], 'hsl')
    expect(out.space).toBe('hsl')
    expect(out.channels[2]).toBeCloseTo(0.75, 3) // halfway to 1
  })

  it('returns the result in the space the maths happened in', () => {
    const red: ColorValue = { space: 'srgb', channels: [1, 0, 0] }
    expect(applyColorOps(red, [{ op: 'lighten', amount: 0.1 }], 'oklch').space).toBe('oklch')
    expect(applyColorOps(red, [{ op: 'lighten', amount: 0.1 }], 'lch').space).toBe('lch')
  })
})

// The point of computed colour being an authoring concept: the relationship is LIVE.
describe('computeColor - resolution through the document', () => {
  const derivedDoc = (
    ops: Parameters<typeof computeColor>[0]['ops'] = [{ op: 'lighten', amount: 0.2 }],
  ) =>
    doc(
      [tok('accent', fixed({ color: { space: 'oklch', channels: [0.5, 0.15, 250] } }))],
      [tok('accent-soft', fixed({ compute: { base: { ref: 'accent' }, ops } }))],
    )

  it('derives from a referenced base', () => {
    const f = derivedDoc()
    const out = resolveTokenColor('accent-soft', f)!
    expect(L(out)).toBeGreaterThan(0.5)
    expect(H(out)).toBeCloseTo(250, 1)
  })

  it('tracks a change to the base, which is the whole point', () => {
    const f = derivedDoc()
    const before = L(resolveTokenColor('accent-soft', f)!)

    // Darken the base; the derived token must follow without being touched.
    f.layers[0].tokens[0].value = fixed({ color: { space: 'oklch', channels: [0.2, 0.15, 250] } })
    const after = L(resolveTokenColor('accent-soft', f)!)
    expect(after).toBeLessThan(before)
  })

  it('serialises through resolveToken like any other colour', () => {
    const f = derivedDoc()
    const css = resolveToken('accent-soft', f, undefined, 'color')
    expect(css).toMatch(/^oklch\(/)
  })

  it('works on a legacy raw base, no migration needed', () => {
    const f = doc(
      [tok('accent', fixed({ raw: '#3b82f6' }))],
      [
        tok(
          'soft',
          fixed({ compute: { base: { ref: 'accent' }, ops: [{ op: 'lighten', amount: 0.3 }] } }),
        ),
      ],
    )
    expect(L(resolveTokenColor('soft', f)!)).toBeGreaterThan(
      L({ space: 'srgb', channels: [0.231, 0.51, 0.965] }),
    )
  })

  it('honours the context selection of its base', () => {
    const f = doc(
      [
        tok('surface', {
          base: { color: { space: 'oklch', channels: [0.95, 0.01, 250] } },
          exceptions: [
            {
              group: 'scheme',
              context: 'dark',
              slot: { color: { space: 'oklch', channels: [0.2, 0.01, 250] } },
            },
          ],
        }),
      ],
      [
        tok(
          'surface-hover',
          fixed({ compute: { base: { ref: 'surface' }, ops: [{ op: 'darken', amount: 0.1 }] } }),
        ),
      ],
    )
    const light = L(
      resolveTokenColor('surface-hover', f, { contextSelections: { scheme: 'light' } })!,
    )
    const dark = L(
      resolveTokenColor('surface-hover', f, { contextSelections: { scheme: 'dark' } })!,
    )
    expect(light).toBeGreaterThan(dark)
  })

  it('nests: a computed value can build on another computed value', () => {
    const f = doc(
      [tok('accent', fixed({ color: { space: 'oklch', channels: [0.5, 0.15, 250] } }))],
      [
        tok(
          'step1',
          fixed({ compute: { base: { ref: 'accent' }, ops: [{ op: 'lighten', amount: 0.2 }] } }),
        ),
        tok(
          'step2',
          fixed({ compute: { base: { ref: 'step1' }, ops: [{ op: 'lighten', amount: 0.2 }] } }),
        ),
      ],
    )
    expect(L(resolveTokenColor('step2', f)!)).toBeGreaterThan(L(resolveTokenColor('step1', f)!))
  })

  it('resolves a mix whose operand is itself a reference', () => {
    const f = doc(
      [
        tok('a', fixed({ color: { space: 'srgb', channels: [1, 0, 0] } })),
        tok('b', fixed({ color: { space: 'srgb', channels: [0, 0, 1] } })),
      ],
      [
        tok(
          'blend',
          fixed({
            compute: { base: { ref: 'a' }, ops: [{ op: 'mix', with: { ref: 'b' }, amount: 0.5 }] },
          }),
        ),
      ],
    )
    const out = convertColor(resolveTokenColor('blend', f)!, 'srgb')
    expect(out.channels[0]).toBeGreaterThan(0.2)
    expect(out.channels[2]).toBeGreaterThan(0.2)
  })

  it('gives up rather than inventing a colour when the base cannot be typed', () => {
    const f = doc(
      [tok('named', fixed({ raw: 'rebeccapurple' }))],
      [
        tok(
          'soft',
          fixed({ compute: { base: { ref: 'named' }, ops: [{ op: 'lighten', amount: 0.2 }] } }),
        ),
      ],
    )
    expect(resolveTokenColor('soft', f)).toBeUndefined()
    expect(resolveToken('soft', f, undefined, 'color')).toBeUndefined()
  })

  it('drops an unresolvable mix step instead of the whole value', () => {
    const f = doc(
      [tok('a', fixed({ color: { space: 'srgb', channels: [1, 0, 0] } }))],
      [
        tok(
          'partly',
          fixed({
            compute: {
              base: { ref: 'a' },
              ops: [
                { op: 'mix', with: { ref: 'missing' }, amount: 0.5 },
                { op: 'darken', amount: 0.5 },
              ],
            },
          }),
        ),
      ],
    )
    // The darken still applies even though the mix operand was missing.
    const out = resolveTokenColor('partly', f)
    expect(out).toBeDefined()
    expect(L(out!)).toBeLessThan(L({ space: 'srgb', channels: [1, 0, 0] }))
  })

  it('terminates on a computed cycle', () => {
    const f = doc(
      [tok('a', fixed({ compute: { base: { ref: 'b' }, ops: [{ op: 'lighten', amount: 0.1 }] } }))],
      [tok('b', fixed({ compute: { base: { ref: 'a' }, ops: [{ op: 'lighten', amount: 0.1 }] } }))],
    )
    expect(resolveTokenColor('a', f)).toBeUndefined()
  })
})

// A computed value's dependencies are real graph edges, or the cycle guard and the flow
// view would both be blind to them.
describe('computed colour in the reference graph', () => {
  const f = doc(
    [
      tok('accent', fixed({ color: { space: 'oklch', channels: [0.5, 0.15, 250] } })),
      tok('white', fixed({ color: { space: 'srgb', channels: [1, 1, 1] } })),
    ],
    [
      tok(
        'tint',
        fixed({
          compute: {
            base: { ref: 'accent' },
            ops: [{ op: 'mix', with: { ref: 'white' }, amount: 0.3 }],
          },
        }),
      ),
    ],
  )

  it('reports both the base and the mix operand as edges', () => {
    expect(collectEdges(f)).toEqual([
      { from: 'tint', to: 'accent', via: { via: 'computeBase' } },
      { from: 'tint', to: 'white', via: { via: 'computeMix', index: 0 } },
    ])
  })

  it('refuses a cycle that would form through a computed base', () => {
    expect(wouldCycle(f, 'accent', 'tint')).toBe(true)
  })

  it('refuses a cycle that would form through a mix operand', () => {
    expect(wouldCycle(f, 'white', 'tint')).toBe(true)
  })
})
