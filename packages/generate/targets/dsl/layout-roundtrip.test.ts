import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── Every layout word is a fixed point (proposal 0056) ───────────────────────
// The corpus round-trip compares the IR to the IR, which is how `position` was parsed into the
// AST and never read out of it for a year while that file stayed green: the loss happened before
// either side of the comparison. This file starts from TEXT, states the record each spelling
// must produce, and then prints it and reads it back - so a word the lowering drops, the printer
// invents or the reader rewrites is a red test here, named by its word.

const doc = (layout: string) => `
milda 0.8
prelude 0.0.2

foundations {
  layer Base {
    token sm : size = 120px
    token lg : size = 480px
  }
}

component Box {
  part root {
    kind container
    layout { ${layout} }
  }
}
`

function read(source: string) {
  const parsed = parseMildaDocument(source)
  const ir = documentToIr(parsed.document)
  const component = ir.components[0]!
  const root = component.structure.nodes[component.structure.rootId]!
  return {
    layout: root.layout ?? {},
    warnings: parsed.issues.map((i) => i.code),
    print: () => documentToDsl(ir as Parameters<typeof documentToDsl>[0]),
  }
}

/** Text → IR, then printed and read again: the record must survive and the print must settle. */
function fixedPoint(layout: string, expected: Record<string, string>) {
  const first = read(doc(layout))
  expect(first.layout).toEqual(expected)
  const printed = first.print()
  const second = read(printed)
  expect(second.layout).toEqual(expected)
  expect(second.warnings).toEqual([])
  expect(second.print()).toBe(printed)
  return printed
}

describe('the layout words, text to IR and back', () => {
  it('stack, including layers, which used to come back as a row', () => {
    fixedPoint('stack row', { direction: 'row' })
    fixedPoint('stack column', { direction: 'column' })
    fixedPoint('stack layers', { direction: 'layers' })
  })

  it('align and distribute, including the two words only the parser knew', () => {
    fixedPoint('align baseline', { align: 'baseline' })
    fixedPoint('distribute evenly', { distribute: 'evenly' })
    fixedPoint('align stretch; distribute between', { align: 'stretch', distribute: 'between' })
  })

  it('wrap, including wrap-reverse, which used to be rewritten to wrap', () => {
    fixedPoint('wrap wrap', { wrap: 'wrap' })
    fixedPoint('wrap wrap-reverse', { wrap: 'wrap-reverse' })
    // The default has no line of its own.
    expect(fixedPoint('stack row; wrap nowrap', { direction: 'row' })).not.toMatch(/nowrap/)
  })

  it('every axis intent, on both axes', () => {
    fixedPoint('size fit fill', { width: 'fit', height: 'fill' })
    fixedPoint('size weight(2) fit', { width: 'weight(2)', height: 'fit' })
    fixedPoint('size fixed(sm) fixed(240)', { width: 'sm', height: '240' })
    fixedPoint('size fill ratio(16:9)', { width: 'fill', height: 'ratio(16:9)' })
    fixedPoint('size ratio(1:1) fixed(lg)', { width: 'ratio(1:1)', height: 'lg' })
  })

  it('one axis, named or positional', () => {
    fixedPoint('size fill', { width: 'fill' })
    fixedPoint('size width weight(3)', { width: 'weight(3)' })
    fixedPoint('size height fit', { height: 'fit' })
  })

  it('clamps follow the intent they clamp, on either axis', () => {
    fixedPoint('size fill min(sm) max(lg) fit', {
      width: 'fill',
      widthMin: 'sm',
      widthMax: 'lg',
      height: 'fit',
    })
    fixedPoint('size fit fill max(480)', { width: 'fit', height: 'fill', heightMax: '480' })
    fixedPoint('size height fit min(sm)', { height: 'fit', heightMin: 'sm' })
    fixedPoint('size width fixed(lg) max(lg) height fill min(sm)', {
      width: 'lg',
      widthMax: 'lg',
      height: 'fill',
      heightMin: 'sm',
    })
  })

  it('position survives - overlay used to be dropped on the way to the IR', () => {
    fixedPoint('position overlay', { position: 'overlay' })
    fixedPoint('position pinned block-start', { position: 'pinned block-start' })
    fixedPoint('position pinned block inline-end', { position: 'pinned block inline-end' })
    fixedPoint('position bleed all', { position: 'bleed all' })
    fixedPoint('position bleed inline', { position: 'bleed inline' })
    // `flow` is the default: not stored, not printed.
    expect(fixedPoint('position flow', {})).not.toMatch(/position/)
  })

  it('the whole block at once, in the printer’s order', () => {
    const printed = fixedPoint(
      'position overlay; size fill min(sm) ratio(4:3); distribute center; align center; wrap wrap; stack layers',
      {
        direction: 'layers',
        align: 'center',
        distribute: 'center',
        wrap: 'wrap',
        width: 'fill',
        widthMin: 'sm',
        height: 'ratio(4:3)',
        position: 'overlay',
      },
    )
    expect(printed).toMatch(
      /layout \{ stack layers; align center; distribute center; wrap wrap; size fill min\(sm\) ratio\(4:3\); position overlay \}/,
    )
  })
})

describe('the spellings read for compatibility and never written', () => {
  it('a physical edge is read as the logical edge it names, and said so', () => {
    const r = read(doc('position pinned top'))
    expect(r.layout).toEqual({ position: 'pinned block-start' })
    expect(r.warnings).toContain('edge-physical')
    expect(r.print()).toMatch(/position pinned block-start/)
  })

  it('the pre-0056 `position top` is a pin to the block start', () => {
    const r = read(doc('position top'))
    expect(r.layout).toEqual({ position: 'pinned block-start' })
    expect(r.warnings).toContain('position-physical')
  })

  it('the `ratio w h` key means the height follows the width', () => {
    const r = read(doc('size fill; ratio 16 9'))
    expect(r.layout).toEqual({ width: 'fill', height: 'ratio(16:9)' })
    expect(r.warnings).toContain('layout-ratio-key')
    expect(r.print()).toMatch(/size fill ratio\(16:9\)/)
  })

  it('`flow` is `wrap wrap`', () => {
    const r = read(doc('stack row; flow'))
    expect(r.layout).toEqual({ direction: 'row', wrap: 'wrap' })
    expect(r.print()).toMatch(/wrap wrap/)
  })

  it('`grid` is reserved: read, reported by name, and not in the IR', () => {
    const r = read(doc('grid cols 2; stack column'))
    expect(r.layout).toEqual({ direction: 'column' })
    expect(r.warnings).toContain('layout-grid')
    expect(r.warnings).not.toContain('layout-key')
  })

  it('an unknown word in a closed slot is reported and skipped, not stored', () => {
    const r = read(doc('distribute space-between; align start'))
    expect(r.layout).toEqual({ align: 'start' })
    expect(r.warnings).toContain('layout-distribute')
  })
})
