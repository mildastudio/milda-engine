import type { DocumentFoundations, IconSet } from '@mildastudio/core'
import type { GeneratedFile } from '@mildastudio/generate'

// ─── NOTICE: what came from somewhere else ───────────────────────────────────
// A released package vendors icon glyphs into its own source - that is the whole point of
// proposal 0019's provenance work, so the output has no CDN dependency and no runtime
// fetch. Vendoring is redistribution, and every one of those sets carries a licence that
// asks to travel with the copy.
//
// So the package carries a NOTICE naming exactly the sets it actually used. Not the sets
// the design system has available, and not a blanket list of everything Milda knows about:
// a notice that over-claims is as unhelpful as one that under-claims, and a reader
// checking their dependencies deserves the real answer.
//
// Custom uploads are the author's own asset and are deliberately NOT listed - Milda has no
// standing to make a licence claim about a file its user uploaded.

/** The sets at least one used icon actually belongs to, in stable order. */
export function usedIconSets(foundations?: DocumentFoundations): IconSet[] {
  const library = foundations?.icons
  if (!library) return []
  const usedPrefixes = new Set(
    library.icons.filter((i) => i.kind === 'set').map((i) => (i as { prefix: string }).prefix),
  )
  return library.sets.filter((s) => usedPrefixes.has(s.prefix))
}

/**
 * The NOTICE file, or null when the package vendors nothing third-party - an empty NOTICE
 * is a claim too, and the wrong one.
 */
export function noticeFile(foundations?: DocumentFoundations): GeneratedFile | null {
  const sets = usedIconSets(foundations)
  if (sets.length === 0) return null

  const lines = [
    '# Third-party notices',
    '',
    'This package includes icon artwork from the projects below. The components and design',
    'tokens are yours; these glyphs are theirs, and are redistributed here under the licence',
    'each project grants. Nothing in this file limits your use of the rest of the package.',
    '',
  ]
  for (const set of sets) {
    lines.push(`## ${set.name}`, '')
    lines.push(`- Licence: ${set.license}`)
    lines.push(`- Distributed via: ${set.provider}`)
    lines.push(`- Icon prefix in this package: \`${set.prefix}\``)
    lines.push('')
  }
  lines.push(
    'Full licence texts are published by each project. Where a licence requires its text to',
    'accompany the copy, retrieve it from that project and keep it beside this file.',
    '',
  )
  return { path: 'NOTICE.md', language: 'markdown', code: lines.join('\n') }
}
