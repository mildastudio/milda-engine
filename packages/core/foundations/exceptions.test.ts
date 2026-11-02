import { describe, expect, it } from 'vitest'
import {
  baseCaseOf,
  defaultFoundations,
  migrateFoundations,
  type ContextGroup,
  type DocumentFoundations,
  type Token,
} from './document'
import { contrastRatio } from './color'
import { refsBrokenByReorder, reorderedLayerIndex, tokensAffectedByAspectOrder } from './references'
import {
  clearException,
  matchingExceptions,
  resolveToken,
  tokenVaries,
  tokenWithRole,
  writeSlot,
  writeTargetFor,
} from '../facets/resolver'

const scheme: ContextGroup = {
  id: 'scheme',
  name: 'Color scheme',
  contexts: [
    { id: 'light', name: 'Light' },
    { id: 'dark', name: 'Dark' },
  ],
  base: 'light',
}
const brand: ContextGroup = {
  id: 'brand',
  name: 'Brand',
  contexts: [
    { id: 'acme', name: 'Acme' },
    { id: 'nova', name: 'Nova' },
  ],
  base: 'acme',
}

function tok(id: string, value: Token['value']): Token {
  return { id, name: id, type: 'color', value, group: null, order: 0 }
}

function doc(tokens: Token[], groups: ContextGroup[] = [scheme, brand]): DocumentFoundations {
  return {
    contextGroups: groups,
    layers: [{ id: 'l', name: 'L', order: 0, groups: [], tokens }],
    fonts: [],
    icons: { sets: [], icons: [] },
  }
}

describe('migration from byContext to base + exceptions', () => {
  it('turns the default slot into the base and every other context into an exception', () => {
    const migrated = migrateFoundations({
      contextGroups: [scheme],
      layers: [
        {
          id: 'l',
          name: 'L',
          order: 0,
          groups: [],
          tokens: [
            {
              id: 'surface',
              name: 'surface',
              type: 'color',
              value: {
                kind: 'byContext',
                by: 'scheme',
                slots: {
                  light: { raw: '#fff' },
                  dark: { raw: '#000' },
                  default: { raw: '#fff' },
                },
              },
            },
          ],
        },
      ],
    })
    expect(migrated.layers[0].tokens[0].value).toEqual({
      base: { raw: '#fff' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
    })
  })

  it('drops a context slot that merely repeats the base', () => {
    const migrated = migrateFoundations({
      contextGroups: [scheme],
      layers: [
        {
          id: 'l',
          name: 'L',
          order: 0,
          groups: [],
          tokens: [
            {
              id: 'c',
              name: 'c',
              type: 'color',
              value: {
                kind: 'byContext',
                by: 'scheme',
                slots: { light: { raw: '#fff' }, dark: { raw: '#fff' }, default: { raw: '#fff' } },
              },
            },
          ],
        },
      ],
    })
    // The author never made an exception here, so the migrated token must not claim one.
    expect(migrated.layers[0].tokens[0].value).toEqual({ base: { raw: '#fff' } })
  })

  it('collapses the context-less sugar form to a plain base', () => {
    const migrated = migrateFoundations({
      contextGroups: [],
      layers: [
        {
          id: 'l',
          name: 'L',
          order: 0,
          groups: [],
          tokens: [
            {
              id: 'c',
              name: 'c',
              type: 'color',
              value: { kind: 'byContext', by: '', slots: { default: { ref: 'gray-12' } } },
            },
          ],
        },
      ],
    })
    expect(migrated.layers[0].tokens[0].value).toEqual({ base: { ref: 'gray-12' } })
  })

  it('is idempotent on the current shape', () => {
    const once = migrateFoundations(defaultFoundations())
    const twice = migrateFoundations(once)
    expect(twice).toEqual(once)
  })

  it('gives every context group an explicit base case', () => {
    const migrated = migrateFoundations({
      contextGroups: [
        {
          id: 'g',
          name: 'G',
          contexts: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
        },
      ],
      layers: [],
    })
    expect(migrated.contextGroups[0].base).toBe('a')
  })

  it('drops a role that is not one we know', () => {
    const migrated = migrateFoundations({
      contextGroups: [],
      layers: [
        {
          id: 'l',
          name: 'L',
          order: 0,
          groups: [],
          tokens: [
            { id: 'a', name: 'a', type: 'color', value: { base: { raw: '#fff' } }, role: 'accent' },
            {
              id: 'b',
              name: 'b',
              type: 'color',
              value: { base: { raw: '#fff' } },
              role: 'nonsense',
            },
          ],
        },
      ],
    })
    expect(migrated.layers[0].tokens[0].role).toBe('accent')
    expect(migrated.layers[0].tokens[1].role).toBeUndefined()
  })
})

describe('baseCaseOf', () => {
  it('falls back to the first context when none is marked', () => {
    expect(baseCaseOf({ id: 'g', name: 'G', contexts: [{ id: 'x', name: 'X' }] })).toBe('x')
  })

  it('ignores a base that names a context which no longer exists', () => {
    expect(baseCaseOf({ ...scheme, base: 'gone' })).toBe('light')
  })
})

describe('precedence when several exceptions match', () => {
  const contested = tok('accent', {
    base: { raw: '#violet' },
    exceptions: [
      { group: 'scheme', context: 'dark', slot: { raw: '#soft' } },
      { group: 'brand', context: 'nova', slot: { raw: '#teal' } },
    ],
  })

  it('reports every match so the editor can say a value is contested', () => {
    const matches = matchingExceptions(contested.value, [scheme, brand], {
      scheme: 'dark',
      brand: 'nova',
    })
    expect(matches.map((m) => m.group)).toEqual(['scheme', 'brand'])
  })

  it('resolves to the first matching aspect in contextGroups order', () => {
    const f = doc([contested])
    expect(
      resolveToken('accent', f, { contextSelections: { scheme: 'dark', brand: 'nova' } }, 'color'),
    ).toBe('#soft')
  })

  it('follows a reordered aspect list', () => {
    const f = doc([contested], [brand, scheme])
    expect(
      resolveToken('accent', f, { contextSelections: { scheme: 'dark', brand: 'nova' } }, 'color'),
    ).toBe('#teal')
  })

  it('resolves to the base when nothing matches', () => {
    const f = doc([contested])
    expect(
      resolveToken('accent', f, { contextSelections: { scheme: 'light', brand: 'acme' } }, 'color'),
    ).toBe('#violet')
  })

  it('resolves to the base with no selections at all', () => {
    expect(resolveToken('accent', doc([contested]), undefined, 'color')).toBe('#violet')
  })
})

describe('writeTargetFor', () => {
  const groups = [scheme, brand]

  it('targets the base when every aspect shows its base case', () => {
    expect(writeTargetFor(groups, { scheme: 'light', brand: 'acme' })).toEqual({ kind: 'base' })
  })

  it('targets the one off-base aspect', () => {
    expect(writeTargetFor(groups, { scheme: 'dark', brand: 'acme' })).toEqual({
      kind: 'exception',
      group: 'scheme',
      context: 'dark',
    })
  })

  it('under precedence, picks the first off-base aspect', () => {
    expect(writeTargetFor(groups, { scheme: 'dark', brand: 'nova' }, 'precedence')).toEqual({
      kind: 'exception',
      group: 'scheme',
      context: 'dark',
    })
  })

  it('under ask, hands back both candidates', () => {
    expect(writeTargetFor(groups, { scheme: 'dark', brand: 'nova' }, 'ask')).toEqual({
      kind: 'ambiguous',
      candidates: [
        { group: 'scheme', context: 'dark' },
        { group: 'brand', context: 'nova' },
      ],
    })
  })

  it('under ask, does not ask when only one aspect is off-base', () => {
    expect(writeTargetFor(groups, { scheme: 'dark', brand: 'acme' }, 'ask')).toEqual({
      kind: 'exception',
      group: 'scheme',
      context: 'dark',
    })
  })

  it('under baseOnly, refuses and says which aspects are off-base', () => {
    expect(writeTargetFor(groups, { scheme: 'dark', brand: 'acme' }, 'baseOnly')).toEqual({
      kind: 'blocked',
      offBase: [{ group: 'scheme', context: 'dark' }],
    })
  })
})

describe('writeSlot', () => {
  it('adds an exception', () => {
    const t = tok('c', { base: { raw: '#fff' } })
    const next = writeSlot(
      t,
      { kind: 'exception', group: 'scheme', context: 'dark' },
      { raw: '#000' },
    )
    expect(next).toEqual({
      base: { raw: '#fff' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
    })
  })

  it('updates an existing exception in place rather than appending a second', () => {
    const t = tok('c', {
      base: { raw: '#fff' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
    })
    const next = writeSlot(
      t,
      { kind: 'exception', group: 'scheme', context: 'dark' },
      { raw: '#111' },
    )
    expect(next.exceptions).toEqual([{ group: 'scheme', context: 'dark', slot: { raw: '#111' } }])
  })

  it('drops an exception that becomes equal to the base', () => {
    const t = tok('c', {
      base: { raw: '#fff' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
    })
    const next = writeSlot(
      t,
      { kind: 'exception', group: 'scheme', context: 'dark' },
      { raw: '#fff' },
    )
    expect(next).toEqual({ base: { raw: '#fff' } })
    expect(tokenVaries({ ...t, value: next })).toBe(false)
  })

  it('drops an exception that a new base value has made redundant', () => {
    const t = tok('c', {
      base: { raw: '#fff' },
      exceptions: [
        { group: 'scheme', context: 'dark', slot: { raw: '#000' } },
        { group: 'brand', context: 'nova', slot: { raw: '#teal' } },
      ],
    })
    const next = writeSlot(t, { kind: 'base' }, { raw: '#000' })
    expect(next.exceptions).toEqual([{ group: 'brand', context: 'nova', slot: { raw: '#teal' } }])
  })

  it('leaves the value alone for a target that is not writable', () => {
    const t = tok('c', { base: { raw: '#fff' } })
    expect(writeSlot(t, { kind: 'blocked', offBase: [] }, { raw: '#000' })).toEqual(t.value)
  })
})

describe('clearException', () => {
  it('removes one exception and keeps the rest', () => {
    const t = tok('c', {
      base: { raw: '#fff' },
      exceptions: [
        { group: 'scheme', context: 'dark', slot: { raw: '#000' } },
        { group: 'brand', context: 'nova', slot: { raw: '#teal' } },
      ],
    })
    expect(clearException(t, 'scheme', 'dark').exceptions).toEqual([
      { group: 'brand', context: 'nova', slot: { raw: '#teal' } },
    ])
  })

  it('leaves no empty array behind when the last one goes', () => {
    const t = tok('c', {
      base: { raw: '#fff' },
      exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#000' } }],
    })
    expect(clearException(t, 'scheme', 'dark')).toEqual({ base: { raw: '#fff' } })
  })
})

describe('the seeded system', () => {
  it('themes its semantic colours with a single dark exception', () => {
    const f = defaultFoundations()
    const surface = f.layers.flatMap((l) => l.tokens).find((t) => t.id === 'surface')
    expect(surface?.value.exceptions).toHaveLength(1)
    expect(surface?.value.exceptions?.[0]).toMatchObject({ group: 'ColorScheme', context: 'dark' })
  })

  it('still resolves light and dark to different values', () => {
    const f = defaultFoundations()
    const light = resolveToken(
      'surface',
      f,
      { contextSelections: { ColorScheme: 'light' } },
      'color',
    )
    const dark = resolveToken('surface', f, { contextSelections: { ColorScheme: 'dark' } }, 'color')
    expect(light).toBeTruthy()
    expect(dark).toBeTruthy()
    expect(light).not.toBe(dark)
  })
})

describe('the layer chain', () => {
  it('keeps a layer question across a normalize', () => {
    const once = migrateFoundations(defaultFoundations())
    expect(once.layers.map((l) => l.question)).toEqual([
      'Which raw values exist at all?',
      'What do those values mean?',
      'Does one component need an exception?',
    ])
    // The field is rebuilt explicitly in normalizeLayer, so a second pass is the real test:
    // this is exactly how `naming` was once wiped on every edit.
    expect(migrateFoundations(once).layers.map((l) => l.question)).toEqual(
      once.layers.map((l) => l.question),
    )
  })

  it('stamps a role on every seeded semantic colour that fills one', () => {
    const f = defaultFoundations()
    const roled = f.layers.flatMap((l) => l.tokens).filter((t) => t.role)
    expect(roled.length).toBe(14)
    // The one the contrast lint depends on, and the one that used to be guessed by name.
    expect(f.layers.flatMap((l) => l.tokens).find((t) => t.id === 'surface')?.role).toBe('surface')
    // A primitive claims none, which is what makes it a primitive.
    expect(
      f.layers.flatMap((l) => l.tokens).find((t) => t.id === 'violet-500')?.role,
    ).toBeUndefined()
  })

  it('keeps roles across a normalize', () => {
    const once = migrateFoundations(defaultFoundations())
    expect(once.layers.flatMap((l) => l.tokens).filter((t) => t.role).length).toBe(14)
  })
})

describe('contrast, for the lint that needs a surface', () => {
  it('grades any colour spelling, not just hex', () => {
    // The maximum, as a sanity anchor.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2)
    expect(contrastRatio('rgb(0 0 0)', 'rgb(255 255 255)')).toBeCloseTo(21, 2)
    // A typed colour (0036) has no hex spelling until it is converted, so a hex-only
    // implementation would have returned NaN here.
    expect(contrastRatio('oklch(0.2 0.01 250)', 'oklch(0.98 0.01 250)')).toBeGreaterThan(15)
    expect(contrastRatio('color(display-p3 1 0 0)', '#ffffff')).toBeGreaterThan(3)
  })

  it('returns null rather than a wrong number when a colour cannot be parsed', () => {
    expect(contrastRatio('not-a-colour', '#ffffff')).toBeNull()
  })

  it('finds the surface by ROLE, never by name', () => {
    const f = defaultFoundations()
    expect(tokenWithRole(f, 'surface')?.id).toBe('surface')
    // Renaming the token must not break the lookup - that is the whole point of the field.
    const renamed: DocumentFoundations = {
      ...f,
      layers: f.layers.map((l) => ({
        ...l,
        tokens: l.tokens.map((t) =>
          t.role === 'surface' ? { ...t, id: 'canvas', name: 'Canvas' } : t,
        ),
      })),
    }
    expect(tokenWithRole(renamed, 'surface')?.id).toBe('canvas')
  })

  it('returns undefined when nothing claims the role, instead of guessing', () => {
    expect(tokenWithRole({ contextGroups: [], layers: [] }, 'surface')).toBeUndefined()
  })
})

describe('reordering the chain', () => {
  // prim(0) -> brand(1) -> dec(2). `accent` in dec points at `brand-primary` in brand,
  // which points at `violet` in prim.
  const chained: DocumentFoundations = {
    contextGroups: [],
    layers: [
      {
        id: 'prim',
        name: 'Primitives',
        order: 0,
        groups: [],
        tokens: [
          {
            id: 'violet',
            name: 'violet',
            type: 'color',
            value: { base: { raw: '#6d5ae0' } },
            group: null,
            order: 0,
          },
        ],
      },
      {
        id: 'brand',
        name: 'Brand',
        order: 1,
        groups: [],
        tokens: [
          {
            id: 'brand-primary',
            name: 'brand-primary',
            type: 'color',
            value: { base: { ref: 'violet' } },
            group: null,
            order: 0,
          },
        ],
      },
      {
        id: 'dec',
        name: 'Decisions',
        order: 2,
        groups: [],
        tokens: [
          {
            id: 'accent',
            name: 'accent',
            type: 'color',
            value: { base: { ref: 'brand-primary' } },
            group: null,
            order: 0,
          },
        ],
      },
    ],
  }

  it('reindexes every layer for a move', () => {
    const next = reorderedLayerIndex(chained, 'brand', 2)
    expect([...next].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual([
      'prim',
      'dec',
      'brand',
    ])
  })

  it('breaks nothing when the move keeps every reference pointing down', () => {
    // Moving Decisions to the top is where it already is.
    expect(refsBrokenByReorder(chained, 'dec', 2)).toEqual([])
  })

  it('names exactly the references a move would break', () => {
    // Brand above Decisions: accent -> brand-primary would point UP.
    const broken = refsBrokenByReorder(chained, 'brand', 2)
    expect(broken.map((b) => `${b.from.id} -> ${b.to.id}`)).toEqual(['accent -> brand-primary'])
  })

  it('reports both when a move breaks two references at once', () => {
    // Primitives to the top: brand-primary -> violet and nothing else, since accent's
    // target stays below it.
    const broken = refsBrokenByReorder(chained, 'prim', 2)
    expect(broken.map((b) => `${b.from.id} -> ${b.to.id}`)).toEqual(['brand-primary -> violet'])
  })

  it('does not blame a move for a reference that was already broken', () => {
    // A same-layer reference is invalid before AND after, so it is not collateral of the move.
    const alreadyBad: DocumentFoundations = {
      ...chained,
      layers: chained.layers.map((l) =>
        l.id === 'dec'
          ? {
              ...l,
              tokens: [
                ...l.tokens,
                {
                  id: 'self',
                  name: 'self',
                  type: 'color' as const,
                  value: { base: { ref: 'accent' } },
                  group: null,
                  order: 1,
                },
              ],
            }
          : l,
      ),
    }
    const broken = refsBrokenByReorder(alreadyBad, 'brand', 2)
    expect(broken.map((b) => `${b.from.id} -> ${b.to.id}`)).toEqual(['accent -> brand-primary'])
  })

  it('sees a reference that only an exception makes', () => {
    const viaException: DocumentFoundations = {
      ...chained,
      layers: chained.layers.map((l) =>
        l.id === 'dec'
          ? {
              ...l,
              tokens: [
                {
                  id: 'accent',
                  name: 'accent',
                  type: 'color' as const,
                  value: {
                    base: { raw: '#000' },
                    exceptions: [{ group: 'g', context: 'dark', slot: { ref: 'brand-primary' } }],
                  },
                  group: null,
                  order: 0,
                },
              ],
            }
          : l,
      ),
    }
    expect(
      refsBrokenByReorder(viaException, 'brand', 2).map((b) => `${b.from.id} -> ${b.to.id}`),
    ).toEqual(['accent -> brand-primary'])
  })
})

describe('aspect order as the precedence rule', () => {
  const scheme2: ContextGroup = {
    id: 'scheme',
    name: 'Color scheme',
    contexts: [
      { id: 'light', name: 'L' },
      { id: 'dark', name: 'D' },
    ],
    base: 'light',
  }
  const brand2: ContextGroup = {
    id: 'brand',
    name: 'Brand',
    contexts: [
      { id: 'acme', name: 'A' },
      { id: 'nova', name: 'N' },
    ],
    base: 'acme',
  }
  const density: ContextGroup = {
    id: 'density',
    name: 'Density',
    contexts: [
      { id: 'cosy', name: 'C' },
      { id: 'tight', name: 'T' },
    ],
    base: 'cosy',
  }

  const contested = tok('accent', {
    base: { raw: '#a' },
    exceptions: [
      { group: 'scheme', context: 'dark', slot: { raw: '#b' } },
      { group: 'brand', context: 'nova', slot: { raw: '#c' } },
    ],
  })
  const single = tok('surface', {
    base: { raw: '#d' },
    exceptions: [{ group: 'scheme', context: 'dark', slot: { raw: '#e' } }],
  })

  it('names only the tokens whose winner can flip', () => {
    const f = doc([contested, single], [scheme2, brand2, density])
    const affected = tokensAffectedByAspectOrder(f, 'brand', 0)
    expect(affected.map((a) => a.token.id)).toEqual(['accent'])
  })

  it('leaves a token alone when its own aspects keep their relative order', () => {
    // Moving Density around cannot change scheme-vs-brand for `accent`.
    const f = doc([contested, single], [scheme2, brand2, density])
    expect(tokensAffectedByAspectOrder(f, 'density', 0)).toEqual([])
  })

  it('is empty when no token varies on two aspects at once', () => {
    const f = doc([single], [scheme2, brand2])
    expect(tokensAffectedByAspectOrder(f, 'brand', 0)).toEqual([])
  })
})
