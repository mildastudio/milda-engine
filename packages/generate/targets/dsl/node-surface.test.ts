import { describe, expect, it } from 'vitest'
import { MILDA_SURFACE_VERSION, parseMildaDocument } from '@mildastudio/milda'
import { documentToDsl } from './emit'
import { documentToIr } from './toIr'
import { dslLines, hasDslLine } from './testkit'

// ─── What a part IS, in the surface syntax (proposal 0041) ────────────────────
// Until 2026-07-27 a `part { … }` block could only say how a node was PAINTED. Everything
// that makes it a thing - its kind, its text, its accessible name, the events it raises, what
// it repeats over, the component it nests, its transitions, its behaviours - lived only in the
// editor IR. An export therefore described how a design system looked and not what it did:
// measured on the 50-component starter kit, 97 text contents, 36 event emissions, 19
// accessible names, 23 state bindings, 20 repetitions, 6 instances and 2 motion configs were
// dropped, and a five-level node tree came back two levels deep.
//
// This fixture is hand-authored so the SYNTAX is the thing under test (the starter-kit
// coverage test asserts the same fields survive from editor-authored IR, which exercises
// different paths - that difference is what found the 72-parse-error export in §1.1c).

const SOURCE = `
milda 0.1
prelude 0.0.2

meta {
  name "Node surface"
}

context-group ColorScheme { Light Dark }

foundations {
  layer Base {
    token accent : color = hex(3b82f6)
    token fast : duration = 150ms
    token standard : easing = raw "ease-out"
    token md : spacing = 8px
  }
}

group Forms "Things you type into."

component Field {
  archetype TextInput
  group Forms

  props {
    label : string
    value : string
    disabled : boolean = false
    items : array<string>
  }

  events {
    change
  }

  part root {
    kind container
    origin root
    locked
    bind state disabled disabled
    layout { stack column; gap md }
    motion {
      transition fill ink duration fast easing standard
    }
    behavior focus-trap { return-focus-on-close true; allow-escape-key true; initial-focus-node-id root.input }
  }

  part root.label {
    kind text
    content bind label
    a11y { name bind label }
    text 8px
  }

  part root.input {
    kind input
    bind value value
    value string
    emits {
      change on change payload bind value
    }
    a11y { labelled-by root.label; described-by root.hint }
    present when not disabled
  }

  part root.hint {
    kind text
    content {
      default "Optional"
      when disabled -> "Unavailable"
    }
  }

  part root.list {
    kind container
    repeat items as item
    slot many of content default keyed-by id sample ["One", "Two"] "The rows."
  }

  part root.preview {
    kind container
    slot single of content sample example "Field in a form"
  }

  part root.list.item {
    kind item
    content bind item.label
    cell header col
  }

  part root.badge {
    kind instance
    instance Chip {
      label = "New"
      tone = bind value
    }
  }

  part root.escape {
    kind foreign
    origin author
    foreign web-react "Keyboard hint" "<kbd>Cmd K</kbd>"
  }

  part root.picker {
    kind control
    control checkbox
    presentation accessible-name
    color-picker { formats [hex, rgb]; default-format hex; alpha true; layout inline }
    calendar { selection-mode range; week-starts-on 1; disabled-weekdays [0, 6] }
    severity danger
    accordion multiple
  }

  part root.image {
    kind content
    media img
    source bind src sample url "https://example.test/a.png"
    alt "A picture"
    destination bind href
  }
}

component Chip {
  archetype Badge
  props {
    label : string
    tone : enum(info, danger)
  }
  part root {
    kind container
  }
}

example "Field in a form" for Field {
  demo {
    open : boolean = false
  }

  part root {
    kind container
    action activate toggle open
  }

  part root.field {
    kind instance
    instance Field {
      label = "Email"
    }
  }
}

assets {
  folder Brand/Icons

  svg "logo" in Brand/Icons { mime "image/svg+xml"; size 512; view-box "0 0 24 24"; width 24; height 24; tags [brand]; url "https://example.test/logo.svg" }
}

docs {
  site { name "Node surface"; tagline "Everything, carried." }
  footer { copyright "(c) 2026"; link "Repo" "https://example.test" }

  page "Home" in Guides {
    heading "Fields" anchor fields
    paragraph "How to use a field."
    divider
    component Field
    component-props Field
    component-prop Field label
    component-event Field change
    example "Field in a form"
    component-group Forms
    tokens color
    image "logo"
  }

  page "Details" under "Home" {
    swatch color
  }
}
`

function read(source: string) {
  const parsed = parseMildaDocument(source)
  return {
    fatal: parsed.issues.filter((i) => i.severity === 'error'),
    ir: documentToIr(parsed.document),
    ast: parsed.document,
  }
}

type Read = ReturnType<typeof read>

function print({ ir, ast }: Read): string {
  return documentToDsl({
    components: ir.components,
    foundations: ir.foundations,
    sharedTypes: ir.sharedTypes,
    ...(ir.componentGroups ? { componentGroups: ir.componentGroups } : {}),
    ...(ir.examples ? { examples: ir.examples } : {}),
    ...(ir.assets ? { assets: ir.assets } : {}),
    ...(ir.docs ? { docs: ir.docs } : {}),
    meta: {
      ...(ast.meta?.name ? { name: ast.meta.name } : {}),
      milda: ast.milda,
      prelude: ast.prelude,
    },
  })
}

const first = read(SOURCE)
const field = first.ir.components.find((c) => c.name === 'Field')
const nodes = field?.structure?.nodes ?? {}
const byPath = (path: string) => Object.values(nodes).find((n) => n.part === path)

describe('the part surface', () => {
  it('parses with no errors - the fixture itself is valid', () => {
    expect(first.fatal.map((f) => `${f.line}:${f.col} ${f.code} ${f.message}`)).toEqual([])
  })

  it('reports no lowering issues - every reference in it resolves', () => {
    // A dangling reference is the failure mode that matters here: it does not throw, it just
    // silently produces a node pointing at nothing.
    expect(first.ir.issues).toEqual([])
  })

  it('rebuilds the TREE from the part paths', () => {
    const root = byPath('root')
    const input = byPath('root.input')
    const item = byPath('root.list.item')
    expect(root?.parentId).toBe(null)
    expect(input?.parentId).toBe(root?.id)
    expect(item?.parentId).toBe(byPath('root.list')?.id)
    // Three levels, which the flat-name printer could not express at all.
    expect(root?.childrenIds.length).toBeGreaterThan(3)
  })

  it('carries the declared node KIND rather than inferring one', () => {
    expect(byPath('root.label')?.kind).toBe('text')
    expect(byPath('root.input')?.kind).toBe('input')
    expect(byPath('root.picker')?.kind).toBe('control')
    expect(byPath('root.badge')?.kind).toBe('instance')
    expect(byPath('root.list.item')?.kind).toBe('item')
    // …and NOT the platform element: a `.milda` describes a design system, not a DOM.
    expect(byPath('root.label')?.tag).toBe('auto')
  })

  it('carries provenance, and takes the lock from the archetype rather than the file', () => {
    expect(byPath('root')?.origin).toBe('root')
    // The fixture is a 0.1 file and says `locked` on its root; since 0.9 the word is read and
    // dropped, and the root is locked because it is the root (0055).
    expect(byPath('root')?.locked).toBe(true)
    expect(byPath('root.label')?.locked).toBe(false)
  })

  it('carries content - bound, fixed, and predicate-conditioned', () => {
    expect(byPath('root.label')?.content).toEqual({
      kind: 'dynamic',
      default: { kind: 'bind', propName: 'label' },
      rules: [],
    })
    const hint = byPath('root.hint')?.content
    expect(hint?.kind).toBe('dynamic')
    if (hint?.kind === 'dynamic') {
      expect(hint.default).toEqual({ kind: 'value', value: 'Optional' })
      expect(hint.rules.length).toBe(1)
      expect(hint.rules[0]?.when).toBeTruthy()
      expect(hint.rules[0]?.value).toEqual({ kind: 'value', value: 'Unavailable' })
    }
  })

  it('carries accessible naming, with node references resolved to real nodes', () => {
    const a11y = byPath('root.input')?.a11y
    expect(a11y?.labelledBy).toBe(byPath('root.label')?.id)
    expect(a11y?.describedBy).toBe(byPath('root.hint')?.id)
    expect(byPath('root.label')?.a11y?.name).toEqual({ kind: 'bind', propName: 'label' })
  })

  it('carries event emissions, bound to the DECLARED event', () => {
    const emits = byPath('root.input')?.emits ?? []
    expect(emits.length).toBe(1)
    const eventId = field?.contract?.events.find((e) => e.name === 'change')?.id
    expect(emits[0]?.eventId).toBe(eventId)
    expect(emits[0]?.on).toBe('change')
    expect(emits[0]?.payload).toEqual({ kind: 'bind', propName: 'value' })
  })

  it('carries state bindings, value bindings and the declared value type', () => {
    expect(byPath('root')?.stateBindings?.[0]).toMatchObject({
      state: 'disabled',
      propName: 'disabled',
    })
    expect(byPath('root.input')?.valueBinding).toEqual({ propName: 'value' })
    expect(byPath('root.input')?.value).toEqual({ type: { kind: 'string' } })
  })

  it('carries repetition, cells and the complete slot descriptor', () => {
    expect(byPath('root.list')?.repeat).toEqual({
      source: { kind: 'prop', propName: 'items' },
      itemAlias: 'item',
    })
    expect(byPath('root.list.item')?.cell).toEqual({ header: true, scope: 'col' })
    const slot = byPath('root.list')?.slot
    expect(slot).toMatchObject({
      arity: 'many',
      default: true,
      keyedBy: 'id',
      description: 'The rows.',
    })
    expect(slot?.sample).toEqual({
      kind: 'list',
      items: [
        { kind: 'text', text: 'One' },
        { kind: 'text', text: 'Two' },
      ],
    })
  })

  it('resolves a slot sample that IS a demo scene, and reports one that is not', () => {
    // The reference is by NAME (a scene's name is free text), resolved to the example's id.
    // Storing the name as if it were an id left the sample pointing at nothing, which renders
    // as an empty slot with no explanation.
    expect(byPath('root.preview')?.slot?.sample).toEqual({
      kind: 'example',
      exampleId: first.ir.examples?.[0]?.id,
    })
    const bad = read(SOURCE.replace('sample example "Field in a form"', 'sample example "Nope"'))
    expect(bad.ir.issues.some((i) => i.includes('Nope'))).toBe(true)
  })

  it('carries motion, with duration and easing as TOKEN references', () => {
    const t = byPath('root')?.motion?.transitions?.[0]
    expect(t?.facets).toEqual(['fill', 'ink'])
    expect(t?.duration).toBe('fast')
    expect(t?.easing).toBe('standard')
  })

  it('carries a nested component instance, addressed by NAME', () => {
    const inst = byPath('root.badge')?.instance
    const chip = first.ir.components.find((c) => c.name === 'Chip')
    expect(inst?.componentId).toBe(chip?.id)
    expect(inst?.props).toEqual([
      { name: 'label', value: { kind: 'value', value: 'New' } },
      { name: 'tone', value: { kind: 'bind', propName: 'value' } },
    ])
  })

  it('carries a free behaviour, with its node reference resolved', () => {
    const b = byPath('root')?.behaviors?.[0]
    expect(b?.kind).toBe('focusTrap')
    expect(b).toMatchObject({ returnFocusOnClose: true, allowEscapeKey: true })
    if (b?.kind === 'focusTrap') expect(b.initialFocusNodeId).toBe(byPath('root.input')?.id)
  })

  it('carries foreign content, quarantined behind its target tag', () => {
    // Kept, not dropped: silently deleting authored code is the failure this closes. The
    // parser warns when the target is one it does not implement, which is how another reader
    // knows to skip the block rather than guess at it.
    expect(byPath('root.escape')?.foreign).toEqual({
      code: '<kbd>Cmd K</kbd>',
      label: 'Keyboard hint',
    })
  })

  it('carries the per-archetype config surfaces, validated', () => {
    const picker = byPath('root.picker')
    expect(picker?.control).toEqual({ as: 'checkbox' })
    expect(picker?.presentation).toBe('accessibleName')
    expect(picker?.colorPicker).toEqual({
      formats: ['hex', 'rgb'],
      defaultFormat: 'hex',
      alpha: true,
      layout: 'inline',
    })
    expect(picker?.calendar).toEqual({
      selectionMode: 'range',
      weekStartsOn: 1,
      disabledWeekdays: [0, 6],
    })
    expect(picker?.severity).toBe('danger')
    expect(picker?.accordion).toBe('multiple')
  })

  it('rejects a value outside a config surface’s vocabulary instead of trusting it', () => {
    // A `.milda` is untrusted input, and these fields drive code generation.
    const bad = read(SOURCE.replace('selection-mode range', 'selection-mode sideways'))
    expect(bad.ir.issues.some((i) => i.includes('selection-mode'))).toBe(true)
    const node = bad.ir.components
      .flatMap((c) => Object.values(c.structure?.nodes ?? {}))
      .find((n) => n.part === 'root.picker')
    expect(node?.calendar?.selectionMode).toBeUndefined()
  })

  it('carries media provenance and a link destination', () => {
    const image = byPath('root.image')
    expect(image?.media).toBe('img')
    expect(image?.mediaSource).toEqual({
      kind: 'bind',
      propName: 'src',
      sample: { kind: 'url', url: 'https://example.test/a.png' },
    })
    expect(image?.mediaAlt).toEqual({ kind: 'value', value: 'A picture' })
    expect(image?.destination).toEqual({ kind: 'bind', propName: 'href' })
  })
})

describe('the library around the components', () => {
  it('carries the group tree and each component’s membership', () => {
    expect(first.ir.componentGroups?.map((g) => g.name)).toEqual(['Forms'])
    expect(first.ir.componentGroups?.[0]?.description).toBe('Things you type into.')
    expect(field?.group).toBe(first.ir.componentGroups?.[0]?.id)
  })

  it('carries an example: its binding, its demo state, and its scene', () => {
    const ex = first.ir.examples?.[0]
    expect(ex?.name).toBe('Field in a form')
    expect(ex?.for).toBe(field?.id)
    expect(ex?.state).toEqual({ open: { type: { kind: 'boolean' }, initial: false } })
    const exNodes = Object.values(ex?.structure?.nodes ?? {})
    expect(exNodes.find((n) => n.part === 'root')?.actions?.[0]).toMatchObject({
      on: 'activate',
      op: 'toggle',
      variable: 'open',
    })
    expect(exNodes.find((n) => n.part === 'root.field')?.instance?.componentId).toBe(field?.id)
  })

  it('carries the asset library, its folders, and where the bytes are', () => {
    const asset = Object.values(first.ir.assets?.assets ?? {})[0]
    expect(asset).toMatchObject({
      name: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      sizeBytes: 512,
      url: 'https://example.test/logo.svg',
      viewBox: '0 0 24 24',
    })
    const folder = Object.values(first.ir.assets?.folders ?? {}).find((f) => f.name === 'Icons')
    expect(asset?.folderId).toBe(folder?.id)
    // The parent chain, from the path.
    const brand = Object.values(first.ir.assets?.folders ?? {}).find((f) => f.name === 'Brand')
    expect(folder?.parentId).toBe(brand?.id)
  })

  it('carries the docs overlay, with every transclusion still resolving', () => {
    const docs = first.ir.docs
    expect(docs?.site?.name).toBe('Node surface')
    expect(docs?.footer?.copyright).toBe('(c) 2026')
    expect(docs?.footer?.links).toEqual([
      { id: 'fl0', label: 'Repo', href: 'https://example.test' },
    ])
    expect(docs?.pages.map((p) => p.title)).toEqual(['Home', 'Details'])
    const [home, details] = docs?.pages ?? []
    expect(home?.group).toBe('Guides')
    expect(details?.parentId).toBe(home?.id)

    const kinds = (home?.blocks ?? []).map((b) => b.kind)
    expect(kinds).toEqual([
      'heading',
      'paragraph',
      'divider',
      'component',
      'componentProps',
      'componentProp',
      'componentEvent',
      'example',
      'componentGroup',
      'tokens',
      'image',
    ])
    // The references, resolved: a transclusion that points at nothing renders an empty box.
    const block = (kind: string) =>
      home?.blocks.find((b) => b.kind === kind) as Record<string, string>
    expect(block('component').componentId).toBe(field?.id)
    expect(block('componentProp').propId).toBe(
      field?.contract?.props.find((p) => p.name === 'label')?.id,
    )
    expect(block('componentEvent').eventName).toBe('change')
    expect(block('example').exampleId).toBe(first.ir.examples?.[0]?.id)
    expect(block('componentGroup').groupId).toBe(first.ir.componentGroups?.[0]?.id)
    expect(block('tokens').tokenType).toBe('color')
    expect(block('image').assetId).toBe(Object.values(first.ir.assets?.assets ?? {})[0]?.id)
    expect(block('heading').anchor).toBe('fields')
  })
})

describe('the round trip', () => {
  it('reprints a file the parser still accepts', () => {
    const second = read(print(first))
    expect(second.fatal.map((f) => `${f.line}:${f.col} ${f.code} ${f.message}`)).toEqual([])
    expect(second.ir.issues).toEqual([])
  })

  it('is idempotent: print, read, print again gives the same text', () => {
    const once = print(first)
    const twice = print(read(once))
    expect(twice).toBe(once)
  })

  it('leaves the root to its position, and prints every other provenance (0055 §3.1)', () => {
    const text = print(first)
    // The reader takes the first part as the root and the printer prints the root first, so
    // `origin root` was a line that told the reader nothing - in a component and a scene alike.
    expect(hasDslLine(text, 'origin root')).toBe(false)
    const second = read(text)
    const rootOf = (c?: {
      structure?: { rootId?: string; nodes: Record<string, { origin?: string }> }
    }) => c?.structure?.nodes[c.structure.rootId ?? '']?.origin
    expect(rootOf(second.ir.components.find((c) => c.name === 'Field'))).toBe('root')
    expect(rootOf(second.ir.examples?.find((e) => e.name === 'Field in a form'))).toBe('root')
    // A provenance the position does NOT imply is still written down.
    expect(hasDslLine(text, 'origin author')).toBe(true)
    const reread = second.ir.components.find((c) => c.name === 'Field')
    const escape = Object.values(reread?.structure?.nodes ?? {}).find((n) => n.name === 'escape')
    expect(escape?.origin).toBe('author')
  })

  it('preserves every node field through the reprint', () => {
    const second = read(print(first))
    const fields = (ir: Read['ir']) => {
      const counts: Record<string, number> = {}
      for (const c of ir.components) {
        for (const node of Object.values(c.structure?.nodes ?? {})) {
          for (const [k, v] of Object.entries(node)) {
            if (v == null) continue
            if (Array.isArray(v) && v.length === 0) continue
            counts[k] = (counts[k] ?? 0) + 1
          }
        }
      }
      return counts
    }
    expect(fields(second.ir)).toEqual(fields(first.ir))
  })
})

// ─── What a part is, said where it is named (proposal 0055 §3.2-§3.3) ─────────
// `part Button: container {` and `part Button { kind container }` are two spellings of one
// meaning. The reader lowers both to the same AST field, so everything below the parser - the
// IR, the editor, every target - cannot tell which one a file used. The printer writes only the
// header; the statement form keeps parsing for good, because every 0.3-0.8 file is written in it.
//
// The same step took `locked` out of the language: which parts may not be removed is what the
// archetype requires, so the reader derives it, the printer never writes it, and a file that
// still says it is read exactly as one that does not.

// One component around the given parts, read the way an import reads it.
function component(parts: string, archetype = 'Button') {
  const parsed = parseMildaDocument(`component Box {\n  archetype ${archetype}\n${parts}\n}\n`)
  const ir = documentToIr(parsed.document)
  const box = ir.components.find((c) => c.name === 'Box')
  const nodes = Object.values(box?.structure?.nodes ?? {})
  return {
    issues: parsed.issues.map((i) => `${i.severity} ${i.code}`),
    irIssues: ir.issues,
    components: ir.components,
    node: (name: string) => nodes.find((n) => n.name === name),
  }
}

describe('the part header (0055)', () => {
  const statements = component(`
  part Box {
    kind container
    layout { stack row }
  }
  part label {
    kind text
    content "Go"
  }
  part spinner {
    kind icon
    origin author
  }`)
  const header = component(`
  part Box: container {
    layout { stack row }
  }
  part label: text {
    content "Go"
  }
  part spinner: icon {
    origin author
  }`)

  it('lowers both spellings to an identical IR', () => {
    expect(statements.issues).toEqual([])
    expect(header.issues).toEqual([])
    expect(header.components).toEqual(statements.components)
  })

  it('prints the header and no kind or locked statement', () => {
    const text = documentToDsl({ components: statements.components })
    expect(hasDslLine(text, 'part Box: container {')).toBe(true)
    expect(hasDslLine(text, 'part label: text {')).toBe(true)
    expect(hasDslLine(text, 'part spinner: icon {')).toBe(true)
    // Provenance stays in the body: the header says what a part IS, not where it came from.
    expect(hasDslLine(text, 'origin author')).toBe(true)
    expect(dslLines(text).filter((l) => /^kind\b/.test(l) || /\blocked\b/.test(l))).toEqual([])
    expect(hasDslLine(text, `milda ${MILDA_SURFACE_VERSION}`)).toBe(true)
  })

  it('takes the kind from the header when only the header says it', () => {
    const r = component('  part Box: control {}')
    expect(r.issues).toEqual([])
    expect(r.node('Box')?.kind).toBe('control')
  })

  it('takes the kind from the statement when only the statement says it', () => {
    const r = component('  part Box {\n    kind control\n  }')
    expect(r.issues).toEqual([])
    expect(r.node('Box')?.kind).toBe('control')
  })

  it('warns when both say the same kind', () => {
    const r = component('  part Box: control {\n    kind control\n  }')
    expect(r.issues).toEqual(['warning part-kind-twice'])
    expect(r.node('Box')?.kind).toBe('control')
  })

  it('errors when they disagree, and the header wins', () => {
    const r = component('  part Box: control {\n    kind text\n  }')
    expect(r.issues).toEqual(['error part-kind-conflict'])
    expect(r.node('Box')?.kind).toBe('control')
  })

  it('reports an unknown header word and still reads the body', () => {
    const r = component('  part Box: container sealed {\n    layout { stack row }\n  }')
    expect(r.issues).toEqual(['error part-header-word'])
    const box = r.node('Box')
    expect(box?.kind).toBe('container')
    expect(box?.layout?.direction).toBe('row')
  })

  it('has no header flag: `locked` after the kind is an unknown header word', () => {
    // The header shipped without it, so there is no older file to be lenient with.
    const r = component('  part Box: container locked {}')
    expect(r.issues).toEqual(['error part-header-word'])
  })

  it('treats a header kind the language does not know as today’s unknown kind', () => {
    const r = component('  part Box: widget {}')
    expect(r.issues).toEqual([])
    expect(r.irIssues.some((i) => i.includes('unknown kind "widget"'))).toBe(true)
    expect(r.node('Box')?.kind).not.toBe('widget')
  })

  it('reports a colon with no kind after it', () => {
    const r = component('  part Box: {}')
    expect(r.issues).toEqual(['error part-header-kind'])
    expect(r.node('Box')).toBeDefined()
  })

  // The header is not self-delimiting, so a broken one must cost its own line and nothing more:
  // the measured 0.7 failure was a header that took every following part with it (0055 §5).
  it('does not let a header with no brace swallow the parts after it', () => {
    const r = component('  part Box: container\n  part label: text {\n    content "Go"\n  }')
    expect(r.issues).toContain('error part-lbrace')
    expect(r.node('label')?.kind).toBe('text')
  })
})

// ─── Which parts are locked is the archetype's answer (0055) ──────────────────
describe('the lock, derived', () => {
  it('reads an old `locked` and drops it, silently', () => {
    const said = component(
      '  part Box: container {}\n  part spinner {\n    kind icon\n    locked\n  }',
    )
    const unsaid = component('  part Box: container {}\n  part spinner: icon {}')
    expect(said.issues).toEqual([])
    expect(said.components).toEqual(unsaid.components)
    // `spinner` is not a Button part, so nothing requires it.
    expect(said.node('spinner')?.locked).toBe(false)
  })

  it('locks what the archetype requires, whether or not the file wrote it out', () => {
    const written = component('  part Box: container {}\n  part label: text {}')
    const left = component('  part Box: container {}')
    expect(written.node('label')?.locked).toBe(true)
    expect(left.node('label')?.locked).toBe(true)
    expect(written.node('Box')?.locked).toBe(true)
  })

  it('leaves an optional archetype part and an author part free', () => {
    const r = component(
      '  part Box: container {}\n  part icon: icon {}\n  part badge: text {\n    origin author\n  }',
    )
    expect(r.node('icon')?.locked).toBe(false)
    expect(r.node('badge')?.locked).toBe(false)
  })

  it('locks nothing but the root of a component with no archetype', () => {
    const parsed = parseMildaDocument(
      'component Card {\n  part Card: container {}\n  part body: container {}\n}\n',
    )
    const card = documentToIr(parsed.document).components[0]
    const nodes = Object.values(card.structure.nodes)
    expect(nodes.filter((n) => n.locked).map((n) => n.name)).toEqual(['Card'])
  })
})
