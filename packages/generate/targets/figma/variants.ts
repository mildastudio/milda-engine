// ─── Variant/state matrix (proposal 0010 phase 2) ────────────────────────────
// The IR expresses variants as enum/boolean contract props and states as per-node
// StateRule[] conditions — neither is an orthogonal axis grid on its own. A Figma
// Component Set needs one flat list of named members, so this merges both sources
// into a bounded, deduped combo list: cartesian product of prop axes × the DISTINCT
// state-name combinations actually referenced anywhere in the tree (not the full
// ALL_STATE_NAMES product, which would explode combinatorially for no reason — most
// of those combinations never appear in any rule).

import type { ComponentIR, ComponentNode, PropCondition, PropDef, PropValue, StateName } from '@mildastudio/core'

export interface VariantCombo {
  name: string
  propCondition: PropCondition
  states: StateName[]
}

export interface VariantMatrixResult {
  combos: VariantCombo[]
  skipped: string[]
}

const DEFAULT_MAX_COMBOS = 64

function variantAxisProps(props: PropDef[]): PropDef[] {
  return props.filter((p) => p.type.kind === 'enum' || p.type.kind === 'boolean')
}

function axisValues(prop: PropDef): PropValue[] {
  return prop.type.kind === 'enum' ? prop.type.values : [false, true]
}

function cartesian(axes: { prop: PropDef; values: PropValue[] }[]): PropCondition[] {
  let combos: PropCondition[] = [{}]
  for (const axis of axes) {
    const next: PropCondition[] = []
    for (const combo of combos) {
      for (const v of axis.values) next.push({ ...combo, [axis.prop.name]: v })
    }
    combos = next
  }
  return combos
}

// Distinct `states[]` combinations referenced by any rule on any node, deduped by
// their sorted content, always including the empty (base/default) combo.
function collectDistinctStateCombos(nodes: Record<string, ComponentNode>): StateName[][] {
  const seen = new Map<string, StateName[]>()
  seen.set('', [])
  for (const node of Object.values(nodes)) {
    for (const rule of node.states ?? []) {
      const sorted = [...rule.states].sort()
      const key = sorted.join(',')
      if (!seen.has(key)) seen.set(key, sorted)
    }
  }
  return [...seen.values()]
}

function comboName(propCondition: PropCondition, states: StateName[]): string {
  const propPart = Object.entries(propCondition)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
  const statePart = states.length ? `State=${states.join('+')}` : 'State=default'
  return [propPart, statePart].filter(Boolean).join(', ')
}

export function buildVariantMatrix(
  ir: ComponentIR,
  options?: { maxCombos?: number },
): VariantMatrixResult {
  const maxCombos = options?.maxCombos ?? DEFAULT_MAX_COMBOS
  const axes = variantAxisProps(ir.contract?.props ?? []).map((prop) => ({
    prop,
    values: axisValues(prop),
  }))
  const propCombos = cartesian(axes)
  const stateCombos = collectDistinctStateCombos(ir.structure.nodes)

  const total = propCombos.length * stateCombos.length
  if (total > maxCombos) {
    return {
      combos: [{ name: comboName({}, []), propCondition: {}, states: [] }],
      skipped: [
        `Variant matrix has ${total} combination(s) (${propCombos.length} prop combo(s) × ` +
          `${stateCombos.length} state combo(s)), exceeding the cap of ${maxCombos}. Only the ` +
          `default variant was exported — narrow the contract's enum/boolean props or raise ` +
          `maxVariantsPerComponent.`,
      ],
    }
  }

  const combos: VariantCombo[] = []
  for (const propCondition of propCombos) {
    for (const states of stateCombos) {
      combos.push({ name: comboName(propCondition, states), propCondition, states })
    }
  }
  return { combos, skipped: [] }
}
