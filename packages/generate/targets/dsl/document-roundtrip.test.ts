import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasDslLine } from './testkit'
import { LENGTH_TOKEN_TYPE_NAMES, TOKEN_TYPE_NAMES, parseMildaDocument } from '@mildastudio/milda'
import { predicateFromLegacy, resolveToken } from '@mildastudio/core'
import type { Predicate, StateRule } from '@mildastudio/core'
import { DSL_LENGTH_TYPE_OUTPUTS, DSL_TOKEN_TYPE_OUTPUTS, documentToDsl } from './emit'
import { documentToIr } from './toIr'

// ─── Document-level round-trip fidelity (proposal 0041) ───────────────────────
// The claim this measures: **a `.milda` file carries the design system**, so it can be
// imported back here or into another editor. That is the language's independence promise and
// the product's anti-lock-in position, so it needs a test that fails rather than a paragraph
// that decays.
//
//     .milda text  ->  parse  ->  IR  ->  documentToDsl  ->  parse  ->  IR'
//
// IR must equal IR'. This is the *fidelity* half of 0041's invariant: does everything the
// surface syntax CAN express survive a print-and-reparse? (The *coverage* half - whether every
// document field is even offered to the emitter - is asserted where the document type lives.)
//
// Existing tests cover fragments (predicate-roundtrip, value-literal-emit). Nothing covered a
// whole document, which is how five separate defects went unnoticed - see the inventory below.
//
// The fixtures are the real corpus under docs/dsl, not hand-written toys: a system built from
// the actual archetypes exercises far more of the printer than anything invented here.

// Resolved from this file, not from the working directory - the runner's cwd is its own
// package, not the repo root.
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const CORPUS = [
  'docs/dsl/walkthrough/walkthrough.milda',
  'docs/dsl/example-radix/foundations.milda',
  'docs/dsl/example-radix/actions.milda',
  'docs/dsl/example-radix/inputs.milda',
  'docs/dsl/example-radix/typography.milda',
  'docs/dsl/example-radix/layout.milda',
  'docs/dsl/example-radix/navigation.milda',
  'docs/dsl/example-radix/overlays.milda',
  'docs/dsl/example-radix/collections.milda',
  'docs/dsl/example-radix/palettes.milda',
  'docs/dsl/rules/usage-rules.milda',
]

// ─── The inventory of what is still broken ────────────────────────────────────
// Entries are registered with `it.fails`, so CI stays honest in both directions: a listed gap
// does not break the build, and **fixing one turns the test red** to say "this passes now,
// delete the entry". Do not add to this table to silence a new regression - it is a record of
// known gaps, not a suppression list.
//
// This test found nineteen failures from five causes on its first run (proposal 0041 §1.1a).
// Four are fixed; one remains:
//
//   FIXED  [casing]     `highContrast` came back as `highcontrast` - a renamed prop in every
//                       generated component. `nameSeg` now emits a legal identifier verbatim.
//   FIXED  [prefix]     `StSize` -> `StStsize` -> ... on every pass, because the namespaced id
//                       was pascal-cased into a name. `localOf` strips the namespace.
//   FIXED  [ctx-prefix] the same bug for context groups: `Component` -> `CgComponent` -> ...
//   FIXED  [tokentype]  a `fontFamily` token came back typed `dimension`, because the emitter
//                       printed `fontfamily` and the parser does not know that word. A SEMANTIC
//                       loss, now guarded by the vocabulary test at the bottom of this file.
//   FIXED  [spacing]    a legacy prop-map rule printed `a=b` while the canonical predicate
//                       printer emits `a = b`, so reprinting drifted.
//   FIXED  [inline]     inline (unnamed) colour values were materialised as NAMED tokens
//                       (`inline-color`, `inline-color-2`, ...), so exporting a system GREW its
//                       foundations with tokens the author never wrote. Owner decision
//                       2026-07-27: a design system cannot hold an anonymous value, and the
//                       file's inline literal is sugar over a token - which is what hoisting
//                       implements. So the printer restores the sugar: a hoisted token is not
//                       declared and each reference prints its value.
//
// The table is empty. It should stay that way: a new entry means a regression that was
// recorded instead of fixed.
const KNOWN_GAPS: Record<string, string> = {}

// Parse text, then lower to the editor IR - the same path the app's import takes
// (lib/projects/projects.ts and NewProjectChoice both call documentToIr on a parse result).
function toIr(source: string) {
  const parsed = parseMildaDocument(source)
  const fatal = parsed.issues.filter((i) => i.severity === 'error')
  return { ir: documentToIr(parsed.document), fatal, ast: parsed.document }
}

type Ir = ReturnType<typeof toIr>

// Print the IR back out through the production emitter.
function toDsl({ ir, ast }: Ir): string {
  return documentToDsl({
    components: ir.components,
    foundations: ir.foundations,
    sharedTypes: ir.sharedTypes,
    ...(ir.meta.output ? { output: ir.meta.output } : {}),
    // The library around the components (0041). Passed through so a fixture that declares
    // any of them round-trips through the same path the app's export uses.
    ...(ir.componentGroups ? { componentGroups: ir.componentGroups } : {}),
    ...(ir.examples ? { examples: ir.examples } : {}),
    ...(ir.assets ? { assets: ir.assets } : {}),
    ...(ir.docs ? { docs: ir.docs } : {}),
    meta: {
      ...(ast.meta?.name ? { name: ast.meta.name } : {}),
      ...(ast.meta?.version ? { version: ast.meta.version } : {}),
      ...(ast.meta?.description ? { description: ast.meta.description } : {}),
      ...(ast.milda ? { milda: ast.milda } : {}),
      ...(ast.prelude ? { prelude: ast.prelude } : {}),
    },
  })
}

// ─── A node's paint, addressed by path ────────────────────────────────────────
// Ids are excluded on purpose (0041 §3 lets them be re-derived), so a node is identified by
// its ADDRESS: the chain of names from the root. Everything else is sorted or canonicalised,
// because the round trip is allowed to normalise a REPRESENTATION and not a MEANING - a
// legacy `props` condition reprinting as the equivalent rich predicate is not a loss.

// Object → a sorted `key=value` list, so key order (which the IR does not promise) is not
// mistaken for a difference.
const entries = (o: Record<string, string> | undefined): string[] =>
  Object.entries(o ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .sort()

// A predicate as canonical text. `and`/`or` are commutative, so their items sort; an
// `ancestor` leaf names its target by PATH, since its nodeId is re-derived like any other.
function predKey(p: Predicate, addr: (nodeId: string) => string): string {
  if (p.kind === 'cmp') {
    const r = p.ref
    const name =
      r.kind === 'prop'
        ? `prop:${r.path}`
        : r.kind === 'state'
          ? `state:${r.state}`
          : r.kind === 'ancestor'
            ? `ancestor:${addr(r.nodeId)}:${r.state}`
            : `context:${r.group}`
    return `${name} ${p.op} ${JSON.stringify(p.value ?? null)}`
  }
  if (p.kind === 'not') return `not(${predKey(p.item, addr)})`
  // A one-item `all`/`any` IS its item - `predicateFromLegacy` wraps a lone condition and the
  // parser does not, which is a shape difference and not a condition difference.
  const items = p.items.map((i) => predKey(i, addr)).sort()
  return items.length === 1 ? items[0]! : `${p.kind}(${items.join(',')})`
}

// One state rule: its condition and what it paints. `when` is the canonical condition when
// present and SUPERSEDES props/states/ancestorStates (0032); otherwise the legacy triple IS
// the condition, and the same helper the IR uses turns it into one.
const ruleKey = (rule: StateRule, addr: (nodeId: string) => string) => {
  const cond = rule.when ?? predicateFromLegacy(rule.props, rule.states, rule.ancestorStates)
  return {
    when: cond ? predKey(cond, addr) : '',
    facets: entries(rule.facets),
    layout: entries(rule.layout),
    ...(rule.glyph ? { glyph: rule.glyph } : {}),
  }
}

function nodeShapes(ir: Ir['ir']) {
  return ir.components
    .map((c) => {
      const nodes = c.structure?.nodes ?? {}
      // id -> address, walked from the root so the address reflects nesting rather than
      // whatever the id happens to spell.
      const addrById = new Map<string, string>()
      const walk = (id: string, parent: string) => {
        const n = nodes[id]
        if (!n || addrById.has(id)) return
        const here = parent ? `${parent}.${n.name}` : n.name
        addrById.set(id, here)
        for (const child of n.childrenIds ?? []) walk(child, here)
      }
      if (c.structure?.rootId) walk(c.structure.rootId, '')
      const addr = (id: string) => addrById.get(id) ?? `?${id}`
      return {
        name: c.name,
        nodes: [...addrById.entries()]
          .map(([id, address]) => {
            const n = nodes[id]!
            return {
              address,
              // The authored part path, which is a NAME and not an id: `part spinner` under a
              // `root` reprinted as `part root.spinner`, and the reader then holds a part
              // called `root.spinner`. The address above cannot see that - the leaf name is
              // the same either way - so the spelling itself has to be compared.
              part: n.part ?? '',
              kind: n.kind,
              facets: entries(n.facets),
              layout: entries(n.layout),
              // Rules are unordered within a node (the cascade is by specificity, not by
              // position), so they sort by their own canonical text.
              states: (n.states ?? [])
                .map((r) => ruleKey(r, addr))
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
            }
          })
          .sort((a, b) => a.address.localeCompare(b.address)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

describe.each(CORPUS)('%s', (path) => {
  const source = readFileSync(`${REPO_ROOT}${path}`, 'utf8')

  // `it` for what should hold, `it.fails` for a gap the inventory already records.
  const check = (key: string, name: string, fn: () => void) => {
    const gap = KNOWN_GAPS[`${path}::${key}`]
    if (gap) it.fails(`${name} [known gap: ${gap}]`, fn)
    else it(name, fn)
  }

  check('parses', 'parses without fatal errors (the fixture itself must be valid)', () => {
    expect(toIr(source).fatal.map((f) => `${f.line}:${f.col} ${f.message}`)).toEqual([])
  })

  check('component-surface', 'survives print-and-reparse with the same component surface', () => {
    const first = toIr(source)
    const second = toIr(toDsl(first))

    // The reprinted file must itself be valid. A printer that emits something the parser
    // rejects is the worst failure mode: the export looks fine and is unusable.
    expect(second.fatal.map((f) => `${f.line}:${f.col} ${f.message}`)).toEqual([])

    // Component identity + the contract each one publishes. Ids are deliberately excluded:
    // the surface syntax is name/path-addressed, so ids may legitimately be re-derived
    // (0041 §3) - what must not change is the SHAPE consumers depend on.
    const surface = (ir: Ir['ir']) =>
      ir.components
        .map((c) => ({
          name: c.name,
          archetype: c.archetype,
          props: (c.contract?.props ?? []).map((p) => `${p.name}${p.required ? '!' : ''}`).sort(),
          events: (c.contract?.events ?? []).map((e) => e.name).sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

    expect(surface(second.ir)).toEqual(surface(first.ir))
  })

  check('foundations', 'survives print-and-reparse with the same foundations', () => {
    const first = toIr(source)
    const second = toIr(toDsl(first))

    // Token identity is (type, name) - the same rule the DSL export already depends on.
    //
    // Hoisted literals are excluded, and that is a statement about them rather than a
    // convenience: a `lit-…` token is not something an author wrote, it is an artifact of
    // spelling a literal INSIDE an alias slot, which the parser has to lower to a token id.
    // Their count is therefore not stable across a round trip, and correctly so. Since 0042
    // a token whose cases all hold the same value folds to one base, which prints as a plain
    // literal rather than an alias - so the second pass has nothing to hoist. Asserting on
    // the artifact count would forbid that simplification; asserting on the AUTHORED tokens
    // and on what they resolve to is the property actually worth keeping.
    const authored = (ir: Ir['ir']) =>
      ir.foundations.layers.flatMap((l) => l.tokens).filter((t) => !t.id.startsWith('lit-'))
    const tokens = (ir: Ir['ir']) =>
      authored(ir)
        .map((t) => `${t.type}:${t.name}`)
        .sort()

    expect(tokens(second.ir)).toEqual(tokens(first.ir))

    // The stronger half: every authored token resolves to the same value in every case of
    // every aspect. This is what "survives" has to mean once the representation is allowed
    // to normalise.
    const resolvedEverywhere = (ir: Ir['ir']) => {
      const f = ir.foundations
      const selections: Record<string, string>[] = f.contextGroups.length
        ? f.contextGroups.flatMap((g) => g.contexts.map((c) => ({ [g.id]: c.id })))
        : [{}]
      return authored(ir)
        .flatMap((t) =>
          selections.map(
            (contextSelections) =>
              `${t.type}:${t.name}@${JSON.stringify(contextSelections)}=${resolveToken(t.id, f, { contextSelections }, t.type) ?? ''}`,
          ),
        )
        .sort()
    }
    expect(resolvedEverywhere(second.ir)).toEqual(resolvedEverywhere(first.ir))

    expect(second.ir.foundations.contextGroups.map((g) => g.id).sort()).toEqual(
      first.ir.foundations.contextGroups.map((g) => g.id).sort(),
    )

    // The icon library is foundations too, and its ORDER is meaning (the first set answers a
    // bare glyph name), so it is compared whole rather than sorted.
    expect(second.ir.foundations.icons).toEqual(first.ir.foundations.icons)
  })

  // Both layers of proposal 0052: what a contract says about ONE instance (`required`, `required
  // when`, the group constraints, a prop's prose - the first two of which were dropped by every
  // export before 0052 gave them a spelling) and the usage rules the foundations carry.
  check('usage', 'survives print-and-reparse with the same constraints and rules', () => {
    const first = toIr(source)
    const second = toIr(toDsl(first))
    const iface = (ir: Ir['ir']) =>
      ir.components
        .map((c) => ({
          name: c.name,
          props: (c.contract?.props ?? []).map((p) => ({
            name: p.name,
            required: p.required ?? false,
            requiredWhen: p.requiredWhen ?? null,
            description: p.description ?? null,
          })),
          constraints: (c.contract?.constraints ?? []).map((k) => ({
            kind: k.kind,
            props: k.props,
          })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    expect(iface(second.ir)).toEqual(iface(first.ir))
    expect(second.ir.foundations.rules ?? []).toEqual(first.ir.foundations.rules ?? [])
  })

  check('shared-types', 'survives print-and-reparse with the same shared types', () => {
    const first = toIr(source)
    const second = toIr(toDsl(first))
    expect(second.ir.sharedTypes.map((t) => t.name).sort()).toEqual(
      first.ir.sharedTypes.map((t) => t.name).sort(),
    )
  })

  check('structure', 'survives print-and-reparse with the same node TREE', () => {
    // Not the node SET - the tree. Part paths carry nesting (0041); when the printer flattened
    // them, every node survived and every parent/child relationship did not, which is a
    // different design system that happens to have the same parts.
    const first = toIr(source)
    const second = toIr(toDsl(first))
    const shape = (ir: Ir['ir']) =>
      ir.components
        .map((c) => {
          const nodes = c.structure?.nodes ?? {}
          const depth = (id: string): number =>
            1 + Math.max(0, ...(nodes[id]?.childrenIds ?? []).map(depth))
          return {
            name: c.name,
            nodes: Object.keys(nodes).length,
            depth: c.structure?.rootId ? depth(c.structure.rootId) : 0,
            kinds: Object.values(nodes)
              .map((n) => n.kind)
              .sort(),
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    expect(shape(second.ir)).toEqual(shape(first.ir))
  })

  // ─── What each node PAINTS, not just where it sits ──────────────────────────
  // The three checks above compare the contract surface, the foundations and the tree's SHAPE.
  // None of them ever read a facet, a layout or a state rule, which is how four defects of
  // exactly that class sat in the corpus while this file was green:
  //
  //   [border]  a per-edge `border.inline-start accent.a6 thick` (proposal 0002's facet, the
  //             whole quote rule on the Radix Blockquote) was DROPPED - the printer knew only
  //             the all-sides pair, and the eight edges plus `style` had no branch at all.
  //   [stack]   `layout.direction: row` was INVENTED on four nodes that never stated one,
  //             because the printer emitted a default `stack row` whenever a layout block
  //             existed for any other reason.
  //   [state]   `state highContrast` came back `highcontrast`. The prop-name half of this was
  //             fixed in `nameSeg`; the state-ref path still went through `seg()`.
  //   [path]    a part one level below the root printed as `root.spinner`, which the reader
  //             turns into a differently-named node - the root's segment is not part of a
  //             descendant's address.
  //
  // Comparison is over a node's ADDRESS rather than its id (ids are re-derived, 0041 §3), and
  // over sorted keys and canonicalised conditions, so a representation that normalises is not
  // read as a loss. What must be identical is what the node paints and when.
  check('nodes', 'survives print-and-reparse with the same node facets, layout and states', () => {
    const first = toIr(source)
    const second = toIr(toDsl(first))
    expect(nodeShapes(second.ir)).toEqual(nodeShapes(first.ir))
  })

  check('idempotent', 'is idempotent: printing twice yields identical text', () => {
    // Not cosmetic. A printer whose output drifts on reprint makes the 0039 git mirror produce
    // diffs for releases that changed nothing, which trains everyone to ignore the diff - and
    // the diff is the entire point of mirroring the file.
    const once = toDsl(toIr(source))
    const twice = toDsl(toIr(once))
    expect(twice).toBe(once)
  })
})

// ─── A name, then its type: the printer writes the colon (milda 0.4) ──────────
// The reader now requires it in a props block and a demo block, as it always did for a token
// and an object field. The corpus tests above would catch a printer that emitted the old
// spelling (its own output would no longer parse), but only as "some error somewhere"; this
// names the rule, on the two blocks that changed.
describe('the one spelling of a declared type', () => {
  const SOURCE = `
context-group Size { S1 S2 }

component Card {
  props {
    size : Size = S2
    label : string
  }
  part root { kind container }
}

example "one" for Card {
  demo {
    open : boolean = false
  }
  part root { kind container }
}
`
  const printed = toDsl(toIr(SOURCE))

  it('writes `name : Type` in a props block and a demo block', () => {
    // `context Size`, not `ref Size`: the bare-ident type in the source is the SUGAR for a
    // context-group-typed prop (proposal 0001), and the printer writes the explicit form because
    // the sugar only reads that way while no shared type claims the name.
    expect(printed).toMatch(/^\s+size : context Size = "S2"$/m)
    expect(hasDslLine(printed, 'label : string')).toBe(true)
    expect(hasDslLine(printed, 'open : boolean = false')).toBe(true)
  })

  it('reads its own output back with no colon diagnostic', () => {
    expect(toIr(printed).fatal.map((f) => `${f.code} ${f.message}`)).toEqual([])
  })
})

// ─── A line height is a RATIO, and a ratio is not a length (0041 §4) ──────────
// The last of the missing-word defects. A lineHeight token had no surface keyword of its own:
// the printer wrote `number`, a word that said the value's shape rather than its kind, and
// before the AST gained the type the reader fell back to a length - so a leading of `1.5` came
// back as `1.5px`, a 1500% line height in the generated system. The canonical word is now
// `ratio`, and the two older spellings stay READABLE so an already-exported file does not rot.
describe('a line height survives as a ratio', () => {
  const SOURCE = `
foundations {
  token text/leading/normal : ratio = raw 1.5
  token text/leading/tight : line-height = raw 1.25
  token text/leading/legacy : number = raw 1.75
}
`
  const first = toIr(SOURCE)
  const printed = toDsl(first)
  const second = toIr(printed)

  const leadings = (ir: Ir['ir']) =>
    ir.foundations.layers
      .flatMap((l) => l.tokens)
      .map((t) => `${t.type}:${t.name}=${t.value.base.raw ?? JSON.stringify(t.value.base)}`)
      .sort()

  it('reads all three spellings as a lineHeight token holding the unitless number', () => {
    expect(first.fatal.map((f) => `${f.code} ${f.message}`)).toEqual([])
    expect(leadings(first.ir)).toEqual([
      'lineHeight:legacy=1.75',
      'lineHeight:normal=1.5',
      'lineHeight:tight=1.25',
    ])
  })

  it('prints the canonical word, and never the legacy one', () => {
    expect(printed).toMatch(/token text\/leading\/normal : ratio = 1\.5$/m)
    expect(printed).not.toMatch(/: number =/)
  })

  it('comes back unchanged: 1.5 stays 1.5, not 1.5px', () => {
    expect(second.fatal.map((f) => `${f.code} ${f.message}`)).toEqual([])
    expect(leadings(second.ir)).toEqual(leadings(first.ir))
  })

  // The word is additive vocabulary, and it still moved the surface version: a 0.4 reader parses
  // the statement and then mis-types the token, so the version is what tells a reader whether it
  // may meet the word (spec/FORMAT.md §6).
  it('declares the surface version that has the word', () => {
    // An export from the editor, where nothing carries a version yet - so the printer's default
    // is what the file claims.
    const fresh = documentToDsl({ components: [], foundations: first.ir.foundations })
    expect(fresh).toMatch(/^milda 0\.8$/m)
  })

  // Only the DEFAULT moved. A file that carries its own version keeps it (the header is read and
  // passed back through), so re-exporting an older system does not claim syntax it never used.
  it('keeps a version the document already declared', () => {
    expect(toDsl(toIr(`milda 0.4\n${SOURCE}`))).toMatch(/^milda 0\.4$/m)
  })

  // A file with NO header is not a 0.1 file, it is a file that did not say. The parser used to
  // invent `0.1` for it, which the printer then stamped on as though the document had claimed
  // it - false for every file in the `docs/dsl/` corpus, none of which carries a header while
  // all of them use current syntax. Absent now means "the current surface", the same default an
  // editor export gets.
  it('gives a header-less document the current surface, not an invented old one', () => {
    expect(printed).toMatch(/^milda 0\.8$/m)
    expect(toDsl(toIr(SOURCE))).toMatch(/^milda 0\.8$/m)
  })

  // The other half of the promise the version makes: a reader that meets a word from a LATER
  // surface has to say so. Reading it as a length in silence is the original defect, one version
  // later.
  it('reports a type word it does not know rather than reading it as a length', () => {
    const { issues } = documentToIr(
      parseMildaDocument('foundations {\n  token x/y : leading = raw 1.5\n}').document,
    )
    expect(issues.filter((i) => i.includes('unknown token type'))).toEqual([
      'token "x/y": unknown token type "leading" (a newer surface version?); read as "size", so its value may be misread',
    ])
  })
})

// ─── The emitter's token-type vocabulary must be a subset of the parser's ──────
// The [tokentype] defect above was not a typo, it was a missing entry in a translation table
// with a silent lowercasing fallback: `fontFamily` fell through to `fontfamily`, a word the
// parser does not accept, so the token came back typed `dimension`. One assertion closes the
// whole class - any future type the emitter can print but the parser cannot read fails here
// instead of quietly changing a token's type in someone's exported file.
describe('token-type vocabulary', () => {
  // Was `['number', 'gradient', 'easing']`: those three had no surface keyword, so a lineHeight
  // came back as a length and a ratio of `1.5` returned as `1.5px`. Closed 2026-07-27 by adding
  // the three missing AST token types (0041 §4) - the gap was a missing TYPE, not a missing word.
  // The list is empty and should stay empty: an entry here means the printer can emit something
  // the parser cannot read, which corrupts a token's type in an exported file.
  const NO_SURFACE_KEYWORD: string[] = []

  it('emits only words the parser accepts, apart from the documented grammar gaps', () => {
    const unknown = [...new Set(DSL_TOKEN_TYPE_OUTPUTS)]
      .filter((t) => !TOKEN_TYPE_NAMES.includes(t))
      .sort()
    expect(unknown).toEqual([...NO_SURFACE_KEYWORD].sort())
  })

  // The same class one level down: not "can the parser read this WORD" but "do the two agree
  // about what the word's VALUE looks like". Giving borderWidth/fontSize/letterSpacing their
  // own surface words taught the reader to demand a unit there and left the writer emitting a
  // bare number, so our own output failed to parse with `length-unit-required`.
  it('canonicalises a length for exactly the types the parser reads as a length', () => {
    const printedAsLength = [...new Set(DSL_LENGTH_TYPE_OUTPUTS)].sort()
    const readAsLength = [...new Set(DSL_TOKEN_TYPE_OUTPUTS)]
      .filter((t) => LENGTH_TOKEN_TYPE_NAMES.includes(t))
      .sort()
    expect(printedAsLength).toEqual(readAsLength)
  })
})

// ─── Output settings survive the file (proposal 0039 §2.3, 0041 §1) ───────────
// These shape the generated components' PUBLIC API - emission style, sub-component naming,
// the date/time/colour representations - so a file that omits them describes a different
// contract than the one that was published. They were dropped entirely: `documentToDsl` had
// nowhere to put them. They now travel as `output.<field>` keys in the `meta {}` block, which
// needed no grammar change because every field is a flat scalar.
describe('output settings', () => {
  const OUTPUT = {
    emitStyle: 'props',
    naming: 'flat',
    forwardRef: false,
    asChild: true,
    dateRepresentation: 'epochMs',
    dateRangeShape: 'tuple',
    timeRepresentation: 'minutes',
    colorRepresentation: 'hsl',
    behaviorDelivery: 'package',
  } as const

  // A minimal document: the settings are document-level, so no components are needed.
  const print = (output?: Record<string, string | number | boolean>) =>
    documentToDsl({ components: [], meta: { name: 'Probe' }, ...(output ? { output } : {}) })

  it('round-trips every field, with its type and casing intact', () => {
    const parsed = parseMildaDocument(print(OUTPUT))
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
    // Booleans must come back as booleans, not the strings "true"/"false": the generator
    // branches on them, so a string would be truthy either way and silently flip `forwardRef`.
    expect(documentToIr(parsed.document).meta.output).toEqual(OUTPUT)
  })

  it('emits nothing when there are no settings, so an untouched document is unchanged', () => {
    expect(print()).not.toContain('output.')
  })

  it("keeps the author's own metadata out of the output namespace", () => {
    const text = documentToDsl({
      components: [],
      meta: { name: 'Probe', metadata: { homepage: 'https://example.com' } },
      output: { naming: 'flat' },
    })
    const meta = documentToIr(parseMildaDocument(text).document).meta
    expect(meta.metadata).toEqual({ homepage: 'https://example.com' })
    expect(meta.output).toEqual({ naming: 'flat' })
  })
})
