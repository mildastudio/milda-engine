import type {
  ComponentIR,
  ContextGroup,
  DocumentFoundations,
  Predicate,
  PropConstraintKind,
  PropType,
  PropValue,
  SharedType,
  Slot,
  Token,
  UsageRule,
} from '@mildastudio/core'
import {
  BUILTIN_SHARED_TYPES,
  collectSlots,
  colorToCss,
  formatLength,
  lengthOf,
  propConstraintSentence,
  propTypeLabel,
  requiredWhenSentence,
  ruleComponentNames,
  usageRuleSentence,
} from '@mildastudio/core'

// ─── Describing a design system to a reader ──────────────────────────────────
// One projection of the IR into "what does this system offer", in the two shapes a
// reader can consume: markdown for a human or an agent, and plain data for a tool.
//
// It reads the CONTRACT (props, events, slots, tokens) and nothing about realization,
// so the same description is true of the React package, the Mac canvas and the Figma
// library. Anything target-specific belongs where the target is known - see
// `artifacts.ts`, which composes these pieces with facts about the package it is
// writing into.
//
// The same projection is written out twice more today: `apps/mcp/src/server.ts` (the
// agent-facing MCP surface) and `packages/cli/src/ir.ts` (the terminal client). Both
// predate this module and both should end up importing it; a design system described
// three different ways by three of our own surfaces is a bug waiting for someone to
// notice the drift. This is the home to migrate them to, not a fourth copy.

export interface DescribedProp {
  name: string
  type: PropType
  typeLabel: string
  required: boolean
  /** Required while this holds (proposal 0052 §4). The IR's own predicate, unchanged. */
  requiredWhen?: Predicate
  default?: PropValue
  description?: string
}

/** A group constraint as data. The IR's `id` is an editor handle and does not leave the system. */
export interface DescribedConstraint {
  kind: PropConstraintKind
  props: string[]
}

export interface DescribedEvent {
  name: string
  payloadLabel?: string
  description?: string
}

export interface DescribedSlot {
  name: string
  arity: string
  accepts: string
}

export interface DescribedComponent {
  name: string
  /**
   * The identifier the generated package exports it as, when that differs from the
   * authored name ("Toggle button" is imported as `ToggleButton`). Filled in by whoever
   * knows the target, since turning a name into an identifier is a target's decision -
   * this module only knows the contract.
   */
  exportName?: string
  description?: string
  archetype: string | null
  status?: string
  since?: string
  props: DescribedProp[]
  /** Absent when the contract states none (0052 §4). */
  constraints?: DescribedConstraint[]
  events: DescribedEvent[]
  slots: DescribedSlot[]
}

export interface DescribedToken {
  /** The token's identity - what a reference resolves against, and what the DSL writes. */
  id: string
  name: string
  type: string
  value: string
  layer: string
  description?: string
}

export function describeComponent(
  comp: ComponentIR,
  types: SharedType[] = [],
  contextGroups: ContextGroup[] = [],
): DescribedComponent {
  const meta = comp.meta as { status?: string; since?: string } | undefined
  // The builtins are shared types too, and a caller that reads them off a document never
  // has them: they are declared in code, not in the design system. Without them every
  // `Color`/`Date`/`File`-typed prop labels itself `ref`, which tells a reader nothing.
  const sharedTypes = [...types, ...BUILTIN_SHARED_TYPES]
  return {
    name: comp.name,
    description: comp.description,
    archetype: comp.archetype,
    status: meta?.status,
    since: meta?.since,
    props: (comp.contract?.props ?? []).map((p) => ({
      name: p.name,
      type: p.type,
      typeLabel: propTypeLabel(p.type, sharedTypes, contextGroups),
      required: Boolean(p.required),
      ...(p.requiredWhen ? { requiredWhen: p.requiredWhen } : {}),
      default: p.default,
      description: p.description,
    })),
    ...(comp.contract?.constraints?.length
      ? {
          constraints: comp.contract.constraints.map((c) => ({
            kind: c.kind,
            props: [...c.props],
          })),
        }
      : {}),
    events: (comp.contract?.events ?? []).map((e) => ({
      name: e.name,
      payloadLabel: e.payload ? propTypeLabel(e.payload, sharedTypes, contextGroups) : undefined,
      description: e.description,
    })),
    slots: collectSlots(comp).map((s) => ({
      name: s.name,
      arity: s.slot.arity,
      accepts: s.slot.accepts.kind,
    })),
  }
}

// ─── Usage rules (proposal 0052 §5, §8) ───────────────────────────────────────
// The IR's rules, unchanged and in id order: the checker (0053) reads exactly these objects from
// `design-system.json`, from this function, or from the IR itself, and the three must not differ
// by so much as a renamed field. Sorting is the one thing done to them, so two releases of the
// same system print the same file.

export function describeRules(foundations?: DocumentFoundations): UsageRule[] {
  return [...(foundations?.rules ?? [])].sort((a, b) => a.id.localeCompare(b.id))
}

/** The rules that name a component, by its authored name - what its DESIGN.md section lists. */
export function rulesNaming(rules: UsageRule[], componentName: string): UsageRule[] {
  return rules.filter((r) => ruleComponentNames(r).includes(componentName))
}

/**
 * The rules as a list a person and an agent both read: errors first, each its sentence, its
 * severity, its id and its reason. `name` renders a component as the identifier the package
 * exports, which only the caller that knows the target can say.
 */
export function rulesMarkdown(rules: UsageRule[], name?: (authored: string) => string): string {
  const ordered = [...rules].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.id.localeCompare(b.id),
  )
  return ordered
    .map((r) => {
      const sentence = usageRuleSentence(r, name ? { name: (n) => code(name(n)) } : {})
      const why = r.rationale ? ` ${cell(r.rationale)}` : ''
      return `- **${r.severity}** ${code(r.id)}: ${sentence}${why}`
    })
    .join('\n')
}

// What a token's value IS, in one line. A token is one base value plus zero or more
// per-context exceptions (proposal 0042), and the exception count has to show: without
// it a brand- or scheme-dependent token reads as a single flat value, which is the one
// thing it is not.
function slotSummary(s: Slot): string {
  if ('raw' in s) return s.raw
  if ('ref' in s) return `→ ${s.ref}`
  if ('color' in s) return colorToCss(s.color)
  if ('dimension' in s) return formatLength(lengthOf(s.dimension))
  if ('compute' in s) return 'computed'
  if ('font' in s) return 'font-family'
  if ('gradient' in s) return 'gradient'
  if ('textStyle' in s) return 'text-style'
  return 'easing'
}

export function tokenValueSummary(t: Token): string {
  const base = slotSummary(t.value.base)
  const n = t.value.exceptions?.length ?? 0
  return n === 0 ? base : `${base} (+${n} by context)`
}

export function describeTokens(foundations?: DocumentFoundations): DescribedToken[] {
  const layers = [...(foundations?.layers ?? [])].sort((a, b) => a.order - b.order)
  return layers.flatMap((layer) =>
    (layer.tokens ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      value: tokenValueSummary(t),
      layer: layer.name,
      description: t.description,
    })),
  )
}

// ─── Markdown ────────────────────────────────────────────────────────────────
// A pipe table's cells cannot carry a raw `|` or a line break, and a description is
// free text an author typed. Escaping here rather than at each call site, because a
// broken table is a silently wrong document rather than a loud failure.
function cell(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim()
}

const code = (text: string): string => `\`${text.replace(/`/g, '')}\``

export function componentMarkdown(
  c: DescribedComponent,
  rules: UsageRule[] = [],
  name?: (authored: string) => string,
): string {
  const lines: string[] = [`## ${c.name}`]
  const badges = [
    // The name is the author's; the identifier is what you type. When they differ, saying so
    // is the difference between a reader writing `ToggleButton` and writing `Toggle button`.
    c.exportName && c.exportName !== c.name ? `imported as \`${c.exportName}\`` : null,
    c.archetype ? `archetype: ${c.archetype}` : null,
    c.status && c.status !== 'stable' ? c.status : null,
    c.since ? `since ${c.since}` : null,
  ].filter((b): b is string => b !== null)
  if (badges.length) lines.push(`_${badges.join(' · ')}_`)
  if (c.description) lines.push('', c.description)

  if (c.props.length) {
    lines.push(
      '',
      '### Props',
      '',
      '| Prop | Type | Required | Default | Description |',
      '| --- | --- | --- | --- | --- |',
    )
    for (const p of c.props) {
      const def = p.default === undefined ? '' : code(JSON.stringify(p.default))
      // A condition reads as the answer to "is it required": "when `loading`".
      const required = p.required
        ? 'yes'
        : p.requiredWhen
          ? requiredWhenSentence(p)
              .replace(/^Required /, '')
              .replace(/\.$/, '')
          : 'no'
      lines.push(
        `| ${code(p.name)} | ${code(p.typeLabel)} | ${cell(required)} | ${def} | ${cell(p.description)} |`,
      )
    }
  }

  // The group constraints (0052 §4). Part of the contract, so they sit with the props - a reader
  // who learns `label` is optional has to learn in the same place that it is one of two.
  if (c.constraints?.length) {
    lines.push('', '### Constraints', '')
    for (const k of c.constraints) lines.push(`- ${propConstraintSentence({ id: '', ...k })}`)
  }

  if (c.events.length) {
    lines.push('', '### Events', '', '| Event | Payload | Description |', '| --- | --- | --- |')
    for (const e of c.events) {
      lines.push(
        `| ${code(e.name)} | ${e.payloadLabel ? code(e.payloadLabel) : '-'} | ${cell(e.description)} |`,
      )
    }
  }

  if (c.slots.length) {
    lines.push(
      '',
      '### Composition (slots)',
      '',
      '| Slot | Arity | Accepts |',
      '| --- | --- | --- |',
    )
    for (const s of c.slots) lines.push(`| ${code(s.name)} | ${s.arity} | ${s.accepts} |`)
  }

  // The usage rules that name it (0052 §9), so a reader looking at `Dialog` learns what the
  // system says about where a Dialog may go without reading the whole list.
  const own = rulesNaming(rules, c.name)
  if (own.length) lines.push('', '### Usage rules', '', rulesMarkdown(own, name))

  return lines.join('\n')
}

export function tokensMarkdown(tokens: DescribedToken[]): string {
  if (tokens.length === 0) return ''
  const lines: string[] = []
  // Grouped by layer, in layer order: the chain is the teaching device (0042 §4), and a
  // flat alphabetical list of 300 tokens tells a reader nothing about which ones to reach
  // for first.
  const byLayer = new Map<string, DescribedToken[]>()
  for (const t of tokens) {
    const bucket = byLayer.get(t.layer)
    if (bucket) bucket.push(t)
    else byLayer.set(t.layer, [t])
  }
  for (const [layer, group] of byLayer) {
    // The id column is not redundant with the name: a reference prints as `→ blue.9`, and
    // without the id there is no row a reader can follow that arrow to.
    const named = group.some((t) => t.name !== t.id)
    lines.push(
      `### ${layer}`,
      '',
      named
        ? '| Token | Name | Type | Value | Description |'
        : '| Token | Type | Value | Description |',
      named ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |',
    )
    for (const t of group) {
      const name = named ? ` ${cell(t.name)} |` : ''
      lines.push(`| ${code(t.id)} |${name} ${t.type} | ${code(t.value)} | ${cell(t.description)} |`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
