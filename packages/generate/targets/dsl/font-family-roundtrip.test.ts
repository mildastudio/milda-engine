import { describe, expect, it } from 'vitest'
import { hasDslLine } from './testkit'
import { parseMildaDocument } from '@mildastudio/milda'
import { resolveToken, resolveTextStyle, type DocumentFoundations } from '@mildastudio/core'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── A font family survives the file ──────────────────────────────────────────
// A `fontFamily` token names one of the document's own font-library entries. An id means
// nothing outside the workspace that minted it, so the file carries the family RECORD and the
// reader rebuilds the library from it. What this measures is that the rebuild is FAITHFUL:
// the same stack resolves on both sides, a bundled Google face is still a bundled Google face
// (and not a platform stack), and a text style that points AT a family token still points at
// one rather than at a frozen copy of what it resolved to.
//
// The whole-corpus fidelity test next door cannot cover this: no fixture in it holds a family
// token written the way the editor now writes one.

const FOUNDATIONS: DocumentFoundations = {
  contextGroups: [],
  fonts: [
    {
      id: 'body',
      name: 'Body',
      source: {
        kind: 'google',
        family: 'Inter',
        weights: [400, 700],
        italic: false,
        license: 'OFL-1.1',
      },
      fallback: 'sans-serif',
    },
    {
      id: 'code',
      name: 'Code',
      source: { kind: 'system', stack: 'ui-monospace, Menlo, monospace' },
      fallback: 'monospace',
    },
  ],
  layers: [
    {
      id: 'base',
      name: 'Base',
      order: 0,
      groups: [],
      tokens: [
        {
          id: 'font-body',
          name: 'Body',
          type: 'fontFamily',
          value: { base: { font: { id: 'body' } } },
          group: null,
          order: 0,
        },
        {
          id: 'font-code',
          name: 'Code',
          type: 'fontFamily',
          value: { base: { font: { id: 'code' } } },
          group: null,
          order: 1,
        },
      ],
    },
    {
      id: 'semantic',
      name: 'Semantic',
      order: 1,
      groups: [],
      tokens: [
        // A family that is another family - the thing a raw CSS stack could never be.
        {
          id: 'font-heading',
          name: 'Heading',
          type: 'fontFamily',
          value: { base: { ref: 'font-body' } },
          group: null,
          order: 0,
        },
        {
          id: 'text-body',
          name: 'BodyText',
          type: 'textStyle',
          value: {
            base: {
              textStyle: {
                family: { ref: 'font-heading' },
                size: { dimension: { value: 15, unit: 'fixed' } },
                weight: { raw: '400' },
                lineHeight: { raw: '1.5' },
                letterSpacing: { dimension: { value: 0, unit: 'fixed' } },
              },
            },
          },
          group: null,
          order: 1,
        },
      ],
    },
  ],
}

function roundTrip(foundations: DocumentFoundations) {
  const text = documentToDsl({ components: [], foundations })
  const parsed = parseMildaDocument(text)
  return {
    text,
    fatal: parsed.issues.filter((i) => i.severity === 'error'),
    ir: documentToIr(parsed.document),
  }
}

describe('a fontFamily token through the .milda file', () => {
  const { text, fatal, ir } = roundTrip(FOUNDATIONS)
  const back = ir.foundations
  const tokenNamed = (name: string) =>
    back.layers.flatMap((l) => l.tokens).find((t) => t.name === name)

  it('prints the family as a record, not as a bare CSS stack', () => {
    expect(
      hasDslLine(
        text,
        'token Body : font-family = raw { family: "Inter"; fallback: sans-serif; source: google; license: "OFL-1.1" }',
      ),
    ).toBe(true)
  })

  it('reparses without errors', () => {
    expect(fatal.map((f) => f.message)).toEqual([])
  })

  it('rebuilds the font library, one entry per family', () => {
    expect((back.fonts ?? []).map((f) => f.source.kind).sort()).toEqual(['google', 'system'])
    const google = (back.fonts ?? []).find((f) => f.source.kind === 'google')
    // The provenance, not just the name: it decides whether a generator emits a stylesheet
    // link, an @font-face, or nothing at all.
    expect(google?.source).toMatchObject({ kind: 'google', family: 'Inter', license: 'OFL-1.1' })
  })

  it('resolves every family to the same stack it started with', () => {
    for (const name of ['Body', 'Code', 'Heading']) {
      const before = resolveToken(
        FOUNDATIONS.layers.flatMap((l) => l.tokens).find((t) => t.name === name)!.id,
        FOUNDATIONS,
        undefined,
        'fontFamily',
      )
      expect(resolveToken(tokenNamed(name)!.id, back, undefined, 'fontFamily')).toBe(before)
    }
  })

  it('keeps a family that references another family a REFERENCE', () => {
    expect(tokenNamed('Heading')?.value.base).toHaveProperty('ref')
  })

  it('keeps a text style pointing AT the family token, and resolves it', () => {
    const style = tokenNamed('BodyText')
    const slot = style?.value.base
    expect(slot && 'textStyle' in slot ? slot.textStyle.family : null).toHaveProperty('ref')
    expect(resolveTextStyle(style!.id, back)).toMatchObject({
      fontFamily: '"Inter", sans-serif',
      fontSize: '15px',
      fontWeight: '400',
      lineHeight: '1.5',
    })
  })
})
