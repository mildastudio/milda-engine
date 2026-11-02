// Test-only: reads the generator's OUTPUT as structure rather than as a string.
//
// The React target's tests used to assert with `toContain`, which is weak in both
// directions. It passes for the wrong reason - `toContain('<a')` matches `<article`,
// `toContain('||')` matches any disjunction anywhere in the module, and a declaration
// found "somewhere in the CSS" says nothing about which rule carries it. And it fails for
// no reason - reordering two attributes or changing indentation breaks an assertion about
// behavior that did not change.
//
// So: parse the emitted module and assert on elements, attributes and statements.
// `compile.test.ts` owns the question of whether the output typechecks; this kit only
// needs the syntax tree, and deliberately does no checking.
//
// typescript@7 is a native compiler with no in-process `createSourceFile`, so parsing goes
// through the same out-of-process API `compile.test.ts` uses. That costs a child process,
// which is why `readEmitted` takes every source a test file needs AT ONCE and is meant to
// be called once from `beforeAll` rather than per assertion.

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { API } from 'typescript/unstable/sync'
import { SyntaxKind } from 'typescript/unstable/ast'

export interface EmittedElement {
  /** Intrinsic tag name (`div`, `a`); a capitalized name is a component reference. */
  tag: string
  /**
   * Attribute name -> its value as normalized text:
   *   `data-x="1"`      -> `1`          (the literal's content)
   *   `href={url}`      -> `url`        (the expression source, whitespace collapsed)
   *   `disabled`        -> `true`       (a bare attribute)
   */
  attrs: Map<string, string>
  /** Enclosing intrinsic tags, outermost first - lets a test say WHERE a thing is. */
  ancestors: string[]
}

export interface EmittedImport {
  from: string
  named: string[]
  defaultName?: string
}

export interface EmittedModule {
  source: string
  elements: EmittedElement[]
  imports: EmittedImport[]
  /** True when the module opens with the `'use client'` directive. */
  isClientModule: boolean
  /**
   * Every statement in the module, at any depth, as normalized one-line text. Assert
   * equality against a whole statement - `has('const next = !_pressed')` - rather than a
   * substring of one.
   */
  statements: string[]

  /** Every element with this tag. Empty when there is none. */
  all(tag: string): EmittedElement[]
  /** The only element with this tag. Throws if there is not exactly one. */
  one(tag: string): EmittedElement
  /** The value of `attr` on the single element with this tag. */
  attr(tag: string, attr: string): string | undefined
  /** Whether some statement is exactly this text. */
  has(statement: string): boolean
  /**
   * The condition guarding an element - the `cond` of a `{cond && <tag …>}` wrapper -
   * as normalized expression text. This is the whole guard, so a test states the
   * predicate the generator lowered rather than four substrings that could co-occur in
   * an expression meaning something else entirely.
   */
  guardOf(tag: string): string | undefined
}

interface AstNode {
  kind: number
  pos: number
  end: number
  name?: { text?: string }
  tagName?: { text?: string }
  initializer?: AstNode
  forEachChild(cb: (child: AstNode) => void): void
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()

// `forEachChild` stops at the first callback that returns something truthy - it is a
// find, not a forEach. Collecting with `arr.push(c)` therefore yields ONE child, since
// push returns the new length. The braces are load-bearing.
const childrenOf = (n: AstNode): AstNode[] => {
  const out: AstNode[] = []
  n.forEachChild((c) => {
    out.push(c)
  })
  return out
}

// A node's range starts at its LEADING TRIVIA, so the slice can carry the comment above
// it, and a statement's range includes its terminating semicolon. Neither is part of what
// a test means by "this statement", so both come off - on the stored text and on the
// expectation alike, which is what keeps `has()` symmetric.
const normalizeStatement = (text: string): string =>
  collapse(text.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)+/, '').replace(/;\s*$/, ''))

function readModule(source: string, sf: AstNode): EmittedModule {
  const elements: EmittedElement[] = []
  const imports: EmittedImport[] = []
  const statements: string[] = []
  const guards: { tag: string; condition: string }[] = []

  const slice = (n: AstNode) => collapse(source.slice(n.pos, n.end))

  const readAttrs = (open: AstNode): Map<string, string> => {
    const attrs = new Map<string, string>()
    const visit = (n: AstNode) => {
      if (SyntaxKind[n.kind] === 'JsxAttribute') {
        const name = n.name?.text
        if (name) {
          const init = n.initializer
          if (!init) attrs.set(name, 'true')
          else if (SyntaxKind[init.kind] === 'StringLiteral') {
            // The literal's own text, without its quotes.
            attrs.set(name, slice(init).replace(/^["']|["']$/g, ''))
          } else {
            // A JsxExpression: drop the braces, keep what they wrapped.
            attrs.set(name, collapse(slice(init).replace(/^\{/, '').replace(/\}$/, '')))
          }
        }
        return
      }
      n.forEachChild(visit)
    }
    open.forEachChild(visit)
    return attrs
  }

  // A guarded element is `cond && <tag/>` - as a `{…}` container in JSX position, or as
  // the bare body of a `map` callback when the node repeats. Both are the same binary
  // `&&`, so matching the binary itself covers both without caring which wrapper it sits
  // in: left operand is the condition, right contains the element.
  const readGuard = (binary: AstNode) => {
    const operands = childrenOf(binary)
    if (!operands.some((o) => SyntaxKind[o.kind] === 'AmpersandAmpersandToken')) return
    const condition = operands[0]
    const guarded = operands[operands.length - 1]
    if (!condition || !guarded || condition === guarded) return
    let tag = ''
    const findTag = (n: AstNode) => {
      if (tag) return
      const k = SyntaxKind[n.kind]
      if (k === 'JsxOpeningElement' || k === 'JsxSelfClosingElement') {
        tag = n.tagName?.text ?? ''
        return
      }
      n.forEachChild(findTag)
    }
    findTag(guarded)
    if (tag) guards.push({ tag, condition: slice(condition) })
  }

  const walk = (n: AstNode, ancestors: string[]) => {
    const kind = SyntaxKind[n.kind]

    if (kind === 'BinaryExpression') readGuard(n)

    if (kind === 'ImportDeclaration') {
      const text = slice(n)
      const from = /from\s+['"]([^'"]+)['"]/.exec(text)?.[1] ?? ''
      const named = (/\{([^}]*)\}/.exec(text)?.[1] ?? '')
        .split(',')
        .map((s) => s.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
      const defaultName = /^import\s+(?!type\b)([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(text)?.[1]
      imports.push({ from, named, ...(defaultName ? { defaultName } : {}) })
    }

    if (kind.endsWith('Statement')) statements.push(normalizeStatement(slice(n)))

    // Elements are recorded at the JsxElement, not at its opening tag: a JsxElement's
    // children are SIBLINGS of the opening tag, so descending from the opening tag would
    // only ever reach its own attributes and every element would look top-level.
    let nextAncestors = ancestors
    if (kind === 'JsxSelfClosingElement') {
      const tag = n.tagName?.text ?? ''
      if (tag) elements.push({ tag, attrs: readAttrs(n), ancestors: [...ancestors] })
    } else if (kind === 'JsxElement') {
      const opening = childrenOf(n).find((c) => SyntaxKind[c.kind] === 'JsxOpeningElement')
      const tag = opening?.tagName?.text ?? ''
      if (opening && tag) {
        elements.push({ tag, attrs: readAttrs(opening), ancestors: [...ancestors] })
        nextAncestors = [...ancestors, tag]
      }
    }
    n.forEachChild((c) => walk(c, nextAncestors))
  }
  walk(sf, [])

  const all = (tag: string) => elements.filter((e) => e.tag === tag)
  const one = (tag: string) => {
    const found = all(tag)
    if (found.length !== 1) {
      throw new Error(`expected exactly one <${tag}>, found ${found.length}`)
    }
    return found[0]
  }

  return {
    source,
    elements,
    imports,
    isClientModule: /^\s*['"]use client['"]/.test(source),
    statements,
    all,
    one,
    attr: (tag, attr) => one(tag).attrs.get(attr),
    has: (statement) => statements.includes(normalizeStatement(statement)),
    guardOf: (tag) => guards.find((g) => g.tag === tag)?.condition,
  }
}

/**
 * Parse a batch of emitted modules. Keys are arbitrary labels; the returned record uses
 * the same ones. One temp project holds them all, so the compiler starts once.
 */
export function readEmitted(sources: Record<string, string>): Record<string, EmittedModule> {
  const workspace = mkdtempSync(join(tmpdir(), 'milda-emitted-'))
  const paths = new Map<string, string>()
  let i = 0
  for (const [label, code] of Object.entries(sources)) {
    // The label may be any string; the filename must be a valid module name, so it is
    // positional and the label is only a lookup key.
    const path = join(workspace, `M${i++}.tsx`)
    writeFileSync(path, code)
    paths.set(label, path)
  }
  writeFileSync(
    join(workspace, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { noEmit: true, jsx: 'react-jsx', skipLibCheck: true },
      include: ['**/*.tsx'],
    }),
  )
  const api = new API({ cwd: workspace })
  const project = api
    .updateSnapshot({ openProjects: [join(workspace, 'tsconfig.json')] })
    .getProjects()[0]
  if (!project) throw new Error('tsc did not open the emitted workspace as a project')

  const out: Record<string, EmittedModule> = {}
  for (const [label, path] of paths) {
    const sf = (project.program as unknown as { getSourceFile(p: string): AstNode }).getSourceFile(
      path,
    )
    if (!sf) throw new Error(`no source file for ${label}`)
    out[label] = readModule(sources[label], sf)
  }
  return out
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
// The same problem in the other artifact: `css.toContain('font-weight: …')` cannot say
// which rule declares it, so a declaration landing on the wrong selector still passes.

export interface CssRules {
  /** Selector -> its declarations, property -> value. */
  rules: Map<string, Map<string, string>>
  selectors: string[]
  /** The declared value of `prop` in `selector`, or undefined. */
  decl(selector: string, prop: string): string | undefined
}

/**
 * A deliberately small reader for the generator's own CSS-module output, which is always
 * flat `selector { prop: value; }` rules - no nesting, no at-rules with blocks other than
 * the ones below. It is not a general CSS parser and should not become one.
 */
export function readCss(css: string): CssRules {
  const rules = new Map<string, Map<string, string>>()
  // Strip at-rule wrappers (@media, @supports) but keep the rules inside them, since the
  // generator only uses them to scope otherwise-identical declarations.
  const flat = css.replace(/@[a-z-]+[^{]*\{/gi, '').replace(/\}\s*\}/g, '}')
  const RULE = /([^{}]+)\{([^{}]*)\}/g
  for (let m = RULE.exec(flat); m; m = RULE.exec(flat)) {
    const selector = collapse(m[1])
    if (!selector) continue
    const decls = rules.get(selector) ?? new Map<string, string>()
    for (const decl of m[2].split(';')) {
      const at = decl.indexOf(':')
      if (at < 0) continue
      decls.set(collapse(decl.slice(0, at)), collapse(decl.slice(at + 1)))
    }
    rules.set(selector, decls)
  }
  return {
    rules,
    selectors: [...rules.keys()],
    decl: (selector, prop) => rules.get(selector)?.get(prop),
  }
}
