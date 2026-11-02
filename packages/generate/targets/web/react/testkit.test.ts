import { beforeAll, describe, expect, it } from 'vitest'
import { readCss, readEmitted, type EmittedModule } from './testkit'

// The kit is now what every other assertion in this target stands on, so it needs its own
// floor. A reader that silently returns nothing would turn `expect(...).toBe(false)` into
// a test that passes for the worst possible reason, and the negative assertions
// (`attrs.has('href')` is false, no element carries `data-cond-`) are exactly the ones
// that would go quiet.

const SOURCE = `'use client'

import { useState } from 'react'
import styles from './W.module.css'
import { useMildaContext } from './MildaContext'

export function W({ url, items }: { url: string; items: { on: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ctx = useMildaContext()
  return (
    <div className={styles.root} data-kind="box">
      <a href={url} aria-hidden>link</a>
      <input disabled onChange={(e) => setOpen(e.target.checked)} />
      {(open && (ctx["Scheme"] === "dark")) && (
      <ul role="menu">
        {items.map((item, i) => (item.on === true) && <li key={i} role="menuitem" />)}
      </ul>
      )}
    </div>
  )
}
`

describe('readEmitted', () => {
  let m: EmittedModule

  beforeAll(() => {
    m = readEmitted({ w: SOURCE }).w
  })

  it('finds every element, including the ones inside a guard and a map', () => {
    expect(m.elements.map((e) => e.tag)).toEqual(['div', 'a', 'input', 'ul', 'li'])
  })

  it('records where an element sits, not only that it exists', () => {
    expect(m.one('li').ancestors).toEqual(['div', 'ul'])
    expect(m.one('div').ancestors).toEqual([])
  })

  it('reads string, expression and bare attributes in their three forms', () => {
    expect(m.attr('div', 'data-kind')).toBe('box')
    expect(m.attr('a', 'href')).toBe('url')
    expect(m.attr('input', 'disabled')).toBe('true')
    expect(m.attr('input', 'onChange')).toBe('(e) => setOpen(e.target.checked)')
  })

  it('reports an absent attribute as absent rather than as empty', () => {
    expect(m.one('a').attrs.has('onClick')).toBe(false)
    expect(m.attr('a', 'onClick')).toBeUndefined()
  })

  it('refuses to guess which element was meant when a tag is ambiguous or missing', () => {
    expect(() => m.one('span')).toThrow(/exactly one <span>, found 0/)
  })

  it('reads imports as declarations, with named and default bindings apart', () => {
    expect(m.imports).toContainEqual({ from: 'react', named: ['useState'] })
    expect(m.imports).toContainEqual({ from: './MildaContext', named: ['useMildaContext'] })
    expect(m.imports).toContainEqual({ from: './W.module.css', named: [], defaultName: 'styles' })
  })

  it('sees the use-client directive only when it opens the module', () => {
    expect(m.isClientModule).toBe(true)
    expect(readEmitted({ x: `const a = 1\n'use client'\n` }).x.isClientModule).toBe(false)
  })

  it('matches a whole statement, ignoring its semicolon and the comment above it', () => {
    expect(m.has('const [open, setOpen] = useState(false)')).toBe(true)
    // Not a statement of its own - the point of matching whole statements.
    expect(m.has('const [open, setOpen]')).toBe(false)
  })

  it('reads the guard of an element in JSX position and inside a map callback', () => {
    expect(m.guardOf('ul')).toBe('(open && (ctx["Scheme"] === "dark"))')
    expect(m.guardOf('li')).toBe('(item.on === true)')
  })

  it('reports no guard for an unconditional element', () => {
    expect(m.guardOf('a')).toBeUndefined()
  })
})

describe('readCss', () => {
  const css = readCss(`
    .root {
      display: flex;
      background: var(--ds-color-accent);
    }
    .label { font-weight: 700 }
    .root[data-cond-a1] { background: red; }
    @media (prefers-color-scheme: dark) {
      .dark { color: white; }
    }
  `)

  it('keeps each rule apart, so a declaration is attributed to its own selector', () => {
    expect(css.decl('.root', 'display')).toBe('flex')
    expect(css.decl('.label', 'font-weight')).toBe('700')
    // The same property on two selectors must not collapse into one answer.
    expect(css.decl('.root', 'background')).toBe('var(--ds-color-accent)')
    expect(css.decl('.root[data-cond-a1]', 'background')).toBe('red')
  })

  it('tolerates a missing final semicolon', () => {
    expect(css.decl('.label', 'font-weight')).toBe('700')
  })

  it('keeps rules nested in an at-rule', () => {
    expect(css.decl('.dark', 'color')).toBe('white')
  })

  it('reports an absent selector or property as undefined', () => {
    expect(css.decl('.missing', 'color')).toBeUndefined()
    expect(css.decl('.root', 'color')).toBeUndefined()
  })
})
