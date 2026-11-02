import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '@mildastudio/milda'
import { documentToIr } from '../../dsl/toIr'
import { generate, getComponentTarget } from '../../../index'
import { readCss, readEmitted } from './testkit'
import { themeCss } from './theme'
import { contextDataAttr } from '../_shared/context'

// ─── A prop typed by a context group actually does something (proposal 0001) ───
// Radix Themes' `variant` / `size` / `color` / `highContrast` / `radius` are per-instance props
// that re-point the tokens a component paints with. Proposal 0001 designed that as a prop TYPED BY
// a context group, and the spec was updated - but nothing below the spec implemented it: the
// parser lowered such a prop to a reference to a shared type nobody declared, so the IR held a
// dangling ref, the generated React typed it `unknown`, destructured it, and never read it. The
// entire Radix variant matrix generated as ONE painting.
//
// What makes it work is a mechanism that was already there: the theme stylesheet keys a block of
// token overrides on `[data-<group>="<context>"]`, so a component that sets the attribute on its
// own root re-points every token aliasing by that group - for that instance only.

const SOURCE = `
context-group Variant { Solid Soft }
context-group ColorScheme { Light Dark }

foundations {
  layer Base {
    token slate/3 : color = hex(f0f0f0)
    token slate/9 : color = hex(8b8d98)
  }
  layer Semantic {
    token variant/fill : color = alias by Variant { Solid -> slate.9; Soft -> slate.3 }
  }
}

component Button "Trigger an action" {
  archetype Button

  props {
    variant : Variant = Solid
    tone : enum(quiet, loud) = quiet
  }

  part root {
    fill variant.fill
  }
}
`

function emitted() {
  const parsed = parseMildaDocument(SOURCE, {})
  expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([])
  const ir = documentToIr(parsed.document)
  const button = ir.components.find((c) => c.name === 'Button')
  if (!button) throw new Error('the fixture lost its component')
  const files = getComponentTarget('react').emit(button, {
    sharedTypes: ir.sharedTypes,
    contextGroups: ir.foundations.contextGroups,
  })
  const modules = readEmitted(
    Object.fromEntries(files.filter((f) => /\.tsx?$/.test(f.path)).map((f) => [f.path, f.code])),
  )
  return { ir, modules: modules['Button.tsx']!, files }
}

describe('the prop type', () => {
  // The props INTERFACE is a type declaration rather than a statement, so it is read off the
  // source as whole lines - one line per prop, which is what the emitter writes.
  const propLines = () =>
    emitted()
      .modules.source.split('\n')
      .map((l) => l.trim())

  it('is the context list of its group, not `unknown`', () => {
    // Lowercased because names are neutral in the IR and the target owns the platform casing -
    // the same rule prop and event names follow.
    expect(propLines()).toContain('variant?: "solid" | "soft"')
  })

  it('leaves an ordinary enum prop alone', () => {
    expect(propLines()).toContain('tone?: "quiet" | "loud"')
  })
})

describe('the component', () => {
  it('carries its selection on the root, where the theme sheet can see it', () => {
    // `= Solid` is the system-wide value (0051 §5), so an unset prop still selects it.
    const { modules } = emitted()
    expect(modules.attr('button', 'data-variant')).toBe('variant ?? "solid"')
  })

  it('does not invent an attribute for a prop that is not context-typed', () => {
    const { modules } = emitted()
    expect(modules.one('button').attrs.has('data-tone')).toBe(false)
  })
})

describe('the theme stylesheet', () => {
  it('overrides the aliased token under a selector that can match', () => {
    const { ir } = emitted()
    const css = readCss(themeCss(ir.foundations))
    // A legal attribute selector. It used to be `[data-cg.variant="ctx.variant.soft"]`, whose
    // attribute name is not a CSS identifier - so every context block was dead CSS.
    expect(css.selectors).toContain('[data-variant="soft"]')
    expect(css.decl('[data-variant="soft"]', '--ds-color-variant-fill')).toBe('#f0f0f0')
  })

  it('resolves the base value at the root', () => {
    const { ir } = emitted()
    const css = readCss(themeCss(ir.foundations))
    expect(css.decl(':root', '--ds-color-variant-fill')).toBe('#8b8d98')
  })
})

describe('the attribute name', () => {
  it('is a legal CSS identifier whatever the author named the group', () => {
    // The name lands unquoted in `[data-…="…"]`; one illegal character voids the whole rule.
    for (const name of ['ColorScheme', 'Color scheme', 'Színséma (béta)', 'a.b', '  ', '***']) {
      expect(contextDataAttr(name)).toMatch(/^data-[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    expect(contextDataAttr('Color Scheme')).toBe('data-color-scheme')
    expect(contextDataAttr('HighContrast')).toBe('data-high-contrast')
    expect(contextDataAttr('Színséma (béta)')).toBe('data-szinsema-beta')
  })
})

// ─── Without a default, and through an instance ──────────────────────────────
// A context prop with no default must not shadow the ambient selection: the attribute is the bare
// prop, absent when unset. And a component that PLACES another passes the value the way the
// generated union spells it - the IR stores the author's `Soft`, which `"solid" | "soft"` rejects.

const PLACED = `
context-group Variant { Solid Soft }

foundations {
  layer Base {
    token slate/3 : color = hex(f0f0f0)
    token slate/9 : color = hex(8b8d98)
  }
  layer Semantic {
    token variant/fill : color = alias by Variant { Solid -> slate.9; Soft -> slate.3 }
  }
}

component Button {
  archetype Button
  props {
    variant : Variant
  }
  part root {
    fill variant.fill
  }
}

component Card {
  part root {
    kind container
  }
  part action {
    kind instance
    instance Button {
      variant = "Soft"
    }
  }
}
`

function emittedPlaced(name: string) {
  const ir = documentToIr(parseMildaDocument(PLACED, {}).document)
  const component = ir.components.find((c) => c.name === name)
  if (!component) throw new Error(`the fixture lost ${name}`)
  const files = getComponentTarget('react').emit(component, {
    sharedTypes: ir.sharedTypes,
    contextGroups: ir.foundations.contextGroups,
    componentsById: Object.fromEntries(ir.components.map((c) => [c.id, c])),
  })
  return readEmitted(
    Object.fromEntries(files.filter((f) => /\.tsx?$/.test(f.path)).map((f) => [f.path, f.code])),
  )[`${name}.tsx`]!
}

describe('a context prop with no default', () => {
  it('writes the bare prop, so an unset one shadows nothing', () => {
    expect(emittedPlaced('Button').attr('button', 'data-variant')).toBe('variant')
  })
})

describe('an instance passing a context prop', () => {
  it("spells the value as the target's union does", () => {
    expect(emittedPlaced('Card').attr('Button', 'variant')).toBe('"soft"')
  })
})

// ─── The same answer through generate() ──────────────────────────────────────
// `emit()` was handed the context groups explicitly by every test, and `generate()` - the road
// the release, the CLI and the MCP server take - handed it none, so a context-typed prop left
// the pipeline as `string` while every test said it was a union. The foundations already carry
// the groups; generate() forwards them.
describe('generate() types a context prop like emit() does', () => {
  it('passes the foundations’ context groups through', () => {
    const parsed = parseMildaDocument(SOURCE, {})
    const ir = documentToIr(parsed.document)
    const button = ir.components.find((c) => c.name === 'Button')!
    const files = generate(button, { foundations: ir.foundations })
    const source = files.find((f) => f.path === 'Button.tsx')!.code
    expect(source.split('\n').map((l) => l.trim())).toContain('variant?: "solid" | "soft"')
  })
})

// ─── A `when` on a context prop selects what the attribute carries ───────────
// The root sets `data-variant` once, from the context prop with its default as the fallback, and
// its value is the context's public spelling. A `when variant = Soft` rule therefore has to
// select `[data-variant="soft"]`: the author's `Soft` would be dead CSS, and a second
// `data-variant={variant}` from the variant path would be a duplicate attribute, which JSX
// rejects outright.
const WHEN = `
context-group Variant { Solid Soft }

foundations {
  layer Base {
    token slate/3 : color = hex(f0f0f0)
    token slate/9 : color = hex(8b8d98)
  }
}

component Button {
  archetype Button
  props {
    variant : Variant = Solid
  }
  part root {
    fill slate.9
    when variant = Soft {
      fill slate.3
    }
  }
  part label {
    kind text
    content "Save"
    when variant = Soft {
      ink slate.9
    }
  }
}
`

describe('a when-rule on a context prop', () => {
  const build = () => {
    const ir = documentToIr(parseMildaDocument(WHEN, {}).document)
    const button = ir.components.find((c) => c.name === 'Button')!
    return getComponentTarget('react').emit(button, {
      contextGroups: ir.foundations.contextGroups,
    })
  }

  it('selects the context value the attribute carries', () => {
    const css = readCss(build().find((f) => f.path === 'Button.module.css')!.code)
    expect(css.selectors.some((s) => s.includes('[data-variant="soft"]'))).toBe(true)
    expect(css.selectors.some((s) => s.includes('[data-variant="Soft"]'))).toBe(false)
  })

  it('sets data-variant on the root exactly once, with the default as fallback', () => {
    const modules = readEmitted(
      Object.fromEntries(
        build()
          .filter((f) => /\.tsx?$/.test(f.path))
          .map((f) => [f.path, f.code]),
      ),
    )
    const root = modules['Button.tsx']!.one('button')
    expect(root.attrs.get('data-variant')).toBe('variant ?? "solid"')
    // The reader keeps attributes in a map, which cannot see a duplicate; the root's opening
    // tag can.
    const opening = /<button[^>]*>/.exec(modules['Button.tsx']!.source)?.[0] ?? ''
    expect(opening.match(/data-variant=/g)?.length).toBe(1)
  })
})
