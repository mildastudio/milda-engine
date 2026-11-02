// Generates the colour-parity fixture for the JetBrains plugin's Kotlin colour twin.
// Run: npm run gen:color-goldens
//
// The plugin draws a colour swatch in the gutter next to every colour literal and lets you
// pick a new one, which means it has to know what `oklch(0.62 0.19 256)` LOOKS like - and a
// JVM plugin cannot call this TypeScript. So `MildaColor.kt` is a second implementation of
// two things that already exist here: the DSL's literal grammar (@mildastudio/milda's
// parser) and the sRGB conversion + gamut mapping (./color).
//
// Rather than hope the copy stays honest, this writes a golden fixture - literal in, sRGB
// hex out, computed by the REAL parser and the REAL colour core - which
// MildaColorTest.kt replays. Same mechanism as the highlighter's vocabulary parity
// (packages/milda-lsp/tools/gen-highlight.ts): TypeScript is the source of truth, and the
// Kotlin side is tested against what it produced.

import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMildaDocument } from '@mildastudio/milda'
import type { ColorValue } from '@mildastudio/milda'
import { colorToHex } from './color'

// Every spelling the parser accepts, and the cases where a naive port would go wrong:
// percentage channels, both alpha forms, `deg` on a hue, short hex, and colours outside
// sRGB (where the swatch has to be gamut-mapped, not channel-clipped).
const LITERALS: readonly string[] = [
  'hex(3b82f6)',
  'hex(fff)',
  'hex(00000000)',
  'hex(ff000080)',
  'srgb(1 1 1)',
  'srgb(1 1 1 0.8)',
  'srgb(0 0.5 1 / 0.25)',
  'srgb(50% 50% 50%)',
  'rgb(255 128 0)',
  'rgb(59 130 246)',
  'rgb(255 0 0 / 0.5)',
  'rgb(100% 0% 0%)',
  'p3(1 0 0)',
  'p3(0.5 0.5 0.5)',
  'p3(1 0 0 / 0.5)',
  'oklch(0.62 0.19 256)',
  'oklch(62% 0.19 256)',
  'oklch(0.62 0.19 256deg)',
  'oklch(0.62 0.19 256 / 50%)',
  'oklch(0.9 0.4 140)', // outside sRGB: chroma has to be reduced, not clipped
  'oklch(0 0 0)',
  'oklch(1 0 0)',
  'hsl(210 1 0.5)',
  'hsl(210 50% 40%)',
  'hsl(0 0% 100%)',
  'hsl(120 100% 25% / 0.75)',
  // The spellings someone brings from CSS: the four-letter names, the shorthand with alpha, and
  // commas between channels. All read, none written - and the gutter swatch has to agree.
  'hex(f00c)',
  'rgba(59 130 246 0.5)',
  'rgba(59, 130, 246, 0.5)',
  'hsla(210 50% 40% / 0.5)',
  'rgb(59, 130, 246)',
]

/** The ColorValue the DSL parser produces for a literal, via a one-token document. */
function parseColor(literal: string): ColorValue {
  const { document } = parseMildaDocument(`foundations {\n  token c : color = ${literal}\n}\n`)
  const value = document.foundations.layers[0]?.tokens[0]?.value
  if (!value || value.kind !== 'raw')
    throw new Error(`${literal} did not parse as a raw token value`)
  const color = value.value as ColorValue
  if (typeof color !== 'object' || !('space' in color))
    throw new Error(`${literal} is not a colour`)
  return color
}

const goldens = LITERALS.map((literal) => {
  const color = parseColor(literal)
  return {
    literal,
    space: color.space,
    channels: color.channels,
    ...(color.alpha == null ? {} : { alpha: color.alpha }),
    hex: colorToHex(color),
  }
})

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'milda-jetbrains', 'src', 'test', 'resources')
if (!existsSync(out)) {
  // The standalone milda-engine mirror has no sibling plugin; nothing to generate there.
  console.log('no milda-jetbrains sibling - skipped')
} else {
  writeFileSync(join(out, 'color-goldens.json'), `${JSON.stringify(goldens, null, 2)}\n`)
  console.log(`generated ${goldens.length} colour goldens`)
}
