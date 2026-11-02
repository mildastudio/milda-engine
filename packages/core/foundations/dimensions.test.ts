import { describe, expect, it } from 'vitest'
import {
  canonicalLength,
  formatLength,
  lengthOf,
  lengthToCss,
  lengthToDp,
  lengthValue,
  parseLength,
} from './dimensions'
import { migrateFoundations, type DocumentFoundations, type Token } from './document'

// ─── The neutral length model (proposal 0038) ─────────────────────────────────

describe('parseLength', () => {
  it('reads px and dp as the same density-independent unit', () => {
    expect(parseLength('12px')).toEqual({ kind: 'fixed', value: 12 })
    expect(parseLength('12dp')).toEqual({ kind: 'fixed', value: 12 })
  })

  it('reads rem, sp and scaled() as the same text-relative unit', () => {
    expect(parseLength('0.75rem')).toEqual({ kind: 'scaled', value: 0.75 })
    expect(parseLength('0.75sp')).toEqual({ kind: 'scaled', value: 0.75 })
    expect(parseLength('scaled(0.75)')).toEqual({ kind: 'scaled', value: 0.75 })
  })

  it('reads a legacy unit-less number as fixed', () => {
    // Everything the old unit-stripping normalisation wrote meant density-independent
    // units, so this is the reading that keeps stored documents correct.
    expect(parseLength('12')).toEqual({ kind: 'fixed', value: 12 })
    expect(parseLength('')).toEqual({ kind: 'fixed', value: 0 })
  })

  it('reads pill, percent and em', () => {
    expect(parseLength('pill')).toEqual({ kind: 'pill' })
    expect(parseLength('50%')).toEqual({ kind: 'percent', value: 50 })
    expect(parseLength('1.5em')).toEqual({ kind: 'em', value: 1.5 })
  })

  it('keeps anything irreducibly platform-shaped as the escape hatch', () => {
    expect(parseLength('100vw')).toEqual({ kind: 'relative', css: '100vw' })
    expect(parseLength('calc(100% - 8px)')).toEqual({ kind: 'relative', css: 'calc(100% - 8px)' })
    expect(parseLength('auto')).toEqual({ kind: 'relative', css: 'auto' })
  })
})

describe('canonical spelling', () => {
  it('normalises every accepted spelling to the canonical one', () => {
    expect(canonicalLength('12dp')).toBe('12px')
    expect(canonicalLength('0.75rem')).toBe('scaled(0.75)')
    expect(canonicalLength('0.75sp')).toBe('scaled(0.75)')
    expect(canonicalLength('12')).toBe('12px')
    expect(canonicalLength('pill')).toBe('pill')
  })

  it('round-trips: parse -> format -> parse is stable', () => {
    for (const raw of ['12px', 'scaled(0.75)', '50%', '1.5em', 'pill', '100vw']) {
      expect(formatLength(parseLength(raw))).toBe(raw)
    }
  })

  it('round-trips through the typed IR value', () => {
    for (const raw of ['12px', 'scaled(0.75)', '50%', '1.5em', 'pill']) {
      const typed = lengthValue(parseLength(raw))
      expect(typed).not.toBeNull()
      expect(formatLength(lengthOf(typed!))).toBe(raw)
    }
    // A viewport unit has no typed form and must stay a raw slot.
    expect(lengthValue(parseLength('100vw'))).toBeNull()
  })
})

describe('lengthToCss', () => {
  it('writes a fixed length per the unit policy', () => {
    expect(lengthToCss('12px')).toBe('12px')
    expect(lengthToCss('12px', { unit: 'rem', rootPx: 16 })).toBe('0.75rem')
    expect(lengthToCss('0px')).toBe('0')
  })

  it('always writes a text-scaled length as rem, whatever the policy', () => {
    // rem is the only web unit that tracks the user's text size, so the fixed-length
    // policy has no say here.
    expect(lengthToCss('scaled(0.75)')).toBe('0.75rem')
    expect(lengthToCss('scaled(0.75)', { unit: 'px', rootPx: 16 })).toBe('0.75rem')
  })

  it('lowers pill to the CSS idiom and passes the escape hatch through', () => {
    expect(lengthToCss('pill')).toBe('9999px')
    expect(lengthToCss('calc(100% - 8px)')).toBe('calc(100% - 8px)')
    expect(lengthToCss('50%')).toBe('50%')
  })
})

describe('lengthToDp', () => {
  it('collapses a text-scaled length at the target boundary, not before', () => {
    expect(lengthToDp('12px')).toBe(12)
    expect(lengthToDp('scaled(0.75)')).toBe(12)
    expect(lengthToDp('scaled(0.75)', { rootPx: 20 })).toBe(15)
  })

  it('returns null where a numeric target has no equivalent', () => {
    expect(lengthToDp('50%')).toBeNull()
    expect(lengthToDp('1.5em')).toBeNull()
    expect(lengthToDp('100vw')).toBeNull()
  })

  it('lowers pill to the radius every target clamps', () => {
    expect(lengthToDp('pill')).toBe(9999)
  })
})

// ─── The migration (this is what the drift bug lived in) ──────────────────────

describe('migrateFoundations - lengths become typed', () => {
  const load = (type: Token['type'], raw: string) => {
    const f = migrateFoundations({
      contextGroups: [],
      layers: [
        {
          id: 'l',
          name: 'L',
          order: 0,
          groups: [],
          tokens: [
            { id: 'tok.v', name: 'v', type, value: { base: { raw } }, group: null, order: 0 },
          ],
        },
      ],
      fonts: [],
      icons: { sets: [], icons: [] },
    } as DocumentFoundations)
    return f.layers[0].tokens[0].value
  }

  it('keeps fixed and text-scaled distinguishable', () => {
    // Before 0038 both of these loaded as the string "12".
    expect(load('spacing', '12px')).toEqual({ base: { dimension: { value: 12, unit: 'fixed' } } })
    expect(load('spacing', '0.75rem')).toEqual({
      base: { dimension: { value: 0.75, unit: 'scaled' } },
    })
  })

  it('reads a stored unit-less length as fixed', () => {
    expect(load('spacing', '12')).toEqual({ base: { dimension: { value: 12, unit: 'fixed' } } })
  })

  it('promotes the 9999px radius hack to the pill intent', () => {
    expect(load('radius', '9999px')).toEqual({ base: { dimension: { keyword: 'pill' } } })
    expect(load('radius', '9999')).toEqual({ base: { dimension: { keyword: 'pill' } } })
    // Only for a radius: 9999 spacing is a (silly) real length, not an intent.
    expect(load('spacing', '9999px')).toEqual({
      base: { dimension: { value: 9999, unit: 'fixed' } },
    })
  })

  it('leaves a non-neutral length as a raw slot', () => {
    expect(load('size', '100vw')).toEqual({ base: { raw: '100vw' } })
  })

  it('leaves non-length token types alone', () => {
    expect(load('opacity', '0.5')).toEqual({ base: { raw: '0.5' } })
  })
})
