import { describe, expect, it } from 'vitest'
import { resolveToken, resolveTokenColor, slotColor, slotsEqual, writeSlot } from './resolver'
import type { DocumentFoundations, Slot, Token, TokenValue } from '../foundations/document'

const tok = (id: string, value: TokenValue, type: Token['type'] = 'color'): Token => ({
  id,
  name: id,
  type,
  value,
  group: null,
})
const fixed = (slot: Slot): TokenValue => ({ base: slot })

const doc = (tokens: Token[], second: Token[] = []): DocumentFoundations => ({
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
    { id: 'base', name: 'Base', order: 0, groups: [], tokens },
    { id: 'semantic', name: 'Semantic', order: 1, groups: [], tokens: second },
  ],
})

// The typed colour slot is additive: `resolveToken` must keep returning CSS for every
// existing consumer, while the new typed reader gives operations something structured
// to work on. An un-migrated `raw` slot must behave identically to a typed one.
describe('typed colour slot - resolveToken still returns CSS', () => {
  it('serialises a typed slot at the boundary', () => {
    const f = doc([tok('c', fixed({ color: { space: 'oklch', channels: [0.62, 0.19, 268] } }))])
    expect(resolveToken('c', f, undefined, 'color')).toBe('oklch(0.62 0.19 268)')
  })

  it('serialises sRGB as hex, matching what raw slots hold today', () => {
    const f = doc([tok('c', fixed({ color: { space: 'srgb', channels: [1, 0, 0] } }))])
    expect(resolveToken('c', f, undefined, 'color')).toBe('#ff0000')
  })

  it('follows a reference to a typed slot', () => {
    const f = doc(
      [tok('base-c', fixed({ color: { space: 'display-p3', channels: [1, 0.2, 0.1] } }))],
      [tok('alias', fixed({ ref: 'base-c' }))],
    )
    expect(resolveToken('alias', f, undefined, 'color')).toBe('color(display-p3 1 0.2 0.1)')
  })

  it('resolves a typed colour inside a gradient stop', () => {
    const f = doc([
      tok(
        'g',
        {
          base: {
            gradient: {
              kind: 'linear',
              angle: 90,
              stops: [
                { color: { color: { space: 'srgb', channels: [1, 0, 0] } }, position: 0 },
                { color: { raw: '#0000ff' }, position: 100 },
              ],
            },
          },
        },
        'gradient',
      ),
    ])
    const css = resolveToken('g', f, undefined, 'gradient')
    expect(css).toContain('#ff0000')
    expect(css).toContain('#0000ff')
  })
})

describe('resolveTokenColor - the typed reader', () => {
  it('returns the structured value for a typed slot', () => {
    const f = doc([tok('c', fixed({ color: { space: 'oklch', channels: [0.62, 0.19, 268] } }))])
    expect(resolveTokenColor('c', f)).toEqual({ space: 'oklch', channels: [0.62, 0.19, 268] })
  })

  it('parses a legacy raw slot on demand, so no migration is needed', () => {
    const f = doc([tok('c', fixed({ raw: 'oklch(0.62 0.19 268)' }))])
    expect(resolveTokenColor('c', f)).toEqual({ space: 'oklch', channels: [0.62, 0.19, 268] })
  })

  it('parses a legacy hex slot into sRGB', () => {
    const f = doc([tok('c', fixed({ raw: '#ff0000' }))])
    expect(resolveTokenColor('c', f)).toEqual({ space: 'srgb', channels: [1, 0, 0] })
  })

  it('follows references', () => {
    const f = doc(
      [tok('base-c', fixed({ color: { space: 'srgb', channels: [0, 1, 0] } }))],
      [tok('alias', fixed({ ref: 'base-c' }))],
    )
    expect(resolveTokenColor('alias', f)).toEqual({ space: 'srgb', channels: [0, 1, 0] })
  })

  it('honours the context selection', () => {
    const f = doc([
      tok('c', {
        base: { color: { space: 'srgb', channels: [1, 1, 1] } },
        exceptions: [
          {
            group: 'scheme',
            context: 'dark',
            slot: { color: { space: 'srgb', channels: [0, 0, 0] } },
          },
        ],
      }),
    ])
    expect(resolveTokenColor('c', f, { contextSelections: { scheme: 'dark' } })?.channels).toEqual([
      0, 0, 0,
    ])
    expect(resolveTokenColor('c', f, { contextSelections: { scheme: 'light' } })?.channels).toEqual(
      [1, 1, 1],
    )
  })

  it('gives up rather than guessing on an untypeable colour', () => {
    const f = doc([tok('c', fixed({ raw: 'rebeccapurple' }))])
    expect(resolveTokenColor('c', f)).toBeUndefined()
  })

  it('terminates on a reference cycle', () => {
    const f = doc([tok('a', fixed({ ref: 'b' }))], [tok('b', fixed({ ref: 'a' }))])
    expect(resolveTokenColor('a', f)).toBeUndefined()
  })
})

describe('slotColor', () => {
  it('reads typed, raw and ref slots alike', () => {
    const f = doc([tok('base-c', fixed({ raw: '#ff0000' }))])
    expect(slotColor({ color: { space: 'srgb', channels: [0, 0, 1] } }, f)?.channels).toEqual([
      0, 0, 1,
    ])
    expect(slotColor({ raw: '#ff0000' }, f)?.channels).toEqual([1, 0, 0])
    expect(slotColor({ ref: 'base-c' }, f)?.channels).toEqual([1, 0, 0])
  })
})

// writeSlot drops an exception whose value has become equal to the base. A typed colour
// and its own CSS spelling ARE the same value, so a half-migrated token must still
// collapse - otherwise editing one context would strand it as varying forever.
describe('slotsEqual across the migration boundary', () => {
  it('treats a typed colour and its CSS spelling as equal', () => {
    expect(slotsEqual({ color: { space: 'srgb', channels: [1, 0, 0] } }, { raw: '#ff0000' })).toBe(
      true,
    )
    expect(slotsEqual({ raw: '#ff0000' }, { color: { space: 'srgb', channels: [1, 0, 0] } })).toBe(
      true,
    )
    expect(slotsEqual({ raw: '#00ff00' }, { color: { space: 'srgb', channels: [1, 0, 0] } })).toBe(
      false,
    )
  })

  it('compares two typed colours by their serialised form', () => {
    expect(
      slotsEqual(
        { color: { space: 'srgb', channels: [1, 0, 0] } },
        { color: { space: 'srgb', channels: [1, 0, 0] } },
      ),
    ).toBe(true)
  })

  it('drops an exception that has become equal to the base', () => {
    const token = tok('c', {
      base: { raw: '#ff0000' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#00ff00' } }],
    })
    // Writing the typed equivalent of the base value into dark makes them agree.
    const next = writeSlot(
      token,
      { kind: 'exception', group: 'scheme', context: 'dark' },
      {
        color: { space: 'srgb', channels: [1, 0, 0] },
      },
    )
    expect(next.exceptions ?? []).toEqual([])
  })
})
