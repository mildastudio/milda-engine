import { archetypesByName } from '@mildastudio/milda'
import type { StyleDecl } from '../facets/facets'
import type { ComponentIR, ComponentNode } from '../structure/types'

// `inline` = an in-flow expand/collapse region (Disclosure/Accordion) — no
// positioning, no popup semantics; the trigger toggles the panel in place.
export type SurfaceKind = 'popover' | 'menu' | 'dialog' | 'sheet' | 'inline'

// What presents the surface: `activate` (click/Enter on the trigger — the default),
// `hover` (pointer hover / keyboard focus, with tap as the touch fallback — Tooltip),
// `context` (secondary activation on the component region — ContextMenu; realized as
// right-click on web, long-press on touch).
export type OpenTrigger = 'activate' | 'hover' | 'context'

export interface DisclosurePlan {
  kind: 'disclosure'
  surfaceKind: SurfaceKind
  openOn: OpenTrigger
  // A modal surface (dialog/sheet): focus moves into it while open and the page
  // behind is inert — realized as role="dialog" + aria-modal + a focus trap.
  modal: boolean
  // The surface has no trigger and simply IS the component (Menu): always presented,
  // open/close does not apply.
  standalone: boolean
  // The trigger is a text-entry control (Combobox): the surface opens on entry/focus
  // and the trigger reads as role="combobox" instead of a popup button.
  entry: boolean
  dismissable: boolean
  selectable: boolean
  // Multiple selection (MultiSelect): choosing an option must NOT close the surface,
  // and the listbox announces aria-multiselectable.
  multiSelectable: boolean
  browsable: boolean
  typeahead: boolean
  triggerId: string
  surfaceId: string

  triggerLabelId?: string
  backdropId?: string
  titleId?: string
  contentId?: string
  closeId?: string

  valueId?: string
  indicatorId?: string
  optionId?: string
  optionCheckId?: string
  optionLabelId?: string
}

// A one-of-N selection over the component's own items (no popup): ChoiceGroup,
// Tabs, List, Rating. Web-independent intent (which part is the selectable item,
// what the container/item announce); realized as roles + roving keyboard focus +
// an ephemeral selected index in the preview, and by the generator's selection
// emission when the author binds a value.
export interface SelectionPlan {
  kind: 'selection'
  containerRole: 'radiogroup' | 'tablist' | 'listbox'
  itemRole: 'radio' | 'tab' | 'option'
  checkedAttr: 'aria-checked' | 'aria-selected'
  containerId: string
  itemId: string
  // Tabs: the panel the selected tab controls.
  panelId?: string
  // The index selected at birth (a tablist always has a selected tab).
  defaultSelected: number | null
}

export type BehaviorPlan = DisclosurePlan | SelectionPlan | null

const leaf = (n: ComponentNode): string | undefined => n.part?.split('.').pop()

// The selection realization per archetype: which part is the item, which node
// carries the container role, and the WAI-ARIA pattern it announces as.
const SELECTION_PLANS: Record<
  string,
  {
    container?: string
    item: string
    panel?: string
    containerRole: SelectionPlan['containerRole']
    itemRole: SelectionPlan['itemRole']
    checkedAttr: SelectionPlan['checkedAttr']
    defaultSelected: number | null
  }
> = {
  ChoiceGroup: {
    item: 'option',
    containerRole: 'radiogroup',
    itemRole: 'radio',
    checkedAttr: 'aria-checked',
    defaultSelected: null,
  },
  Tabs: {
    container: 'list',
    item: 'tab',
    panel: 'panel',
    containerRole: 'tablist',
    itemRole: 'tab',
    checkedAttr: 'aria-selected',
    defaultSelected: 0,
  },
  List: {
    item: 'item',
    containerRole: 'listbox',
    itemRole: 'option',
    checkedAttr: 'aria-selected',
    defaultSelected: null,
  },
  Rating: {
    item: 'item',
    containerRole: 'radiogroup',
    itemRole: 'radio',
    checkedAttr: 'aria-checked',
    defaultSelected: null,
  },
}

function planSelection(component: ComponentIR): SelectionPlan | null {
  const spec = component.archetype ? SELECTION_PLANS[component.archetype] : undefined
  if (!spec) return null
  const nodes = component.structure.nodes
  const all = Object.values(nodes)
  const byLeaf = (name: string) => all.find((n) => leaf(n) === name)
  const item = byLeaf(spec.item)
  if (!item) return null
  const container = spec.container ? byLeaf(spec.container) : nodes[component.structure.rootId]
  if (!container) return null
  return {
    kind: 'selection',
    containerRole: spec.containerRole,
    itemRole: spec.itemRole,
    checkedAttr: spec.checkedAttr,
    containerId: container.id,
    itemId: item.id,
    panelId: spec.panel ? byLeaf(spec.panel)?.id : undefined,
    defaultSelected: spec.defaultSelected,
  }
}

function surfaceKindFrom(composes: string[]): SurfaceKind | null {
  for (const c of composes) {
    const m = /^presentation(?:\(([^)]+)\))?$/.exec(c)
    if (m) {
      const k = m[1]
      return k === 'menu' || k === 'dialog' || k === 'sheet' ? k : 'popover'
    }
  }
  // The `disclosure` composite (toggle + presentation(inline)) is an in-flow
  // expand/collapse — Disclosure, Accordion.
  if (composes.includes('disclosure')) return 'inline'
  return null
}

export function planBehavior(component: ComponentIR): BehaviorPlan {
  if (!component.archetype) return null
  const composes = archetypesByName[component.archetype]?.composes ?? []
  const surfaceKind = surfaceKindFrom(composes)
  if (!surfaceKind) return planSelection(component)

  const nodes = component.structure.nodes
  const all = Object.values(nodes)
  const byLeaf = (name: string) => all.find((n) => leaf(n) === name)
  const childByLeaf = (parent: ComponentNode | undefined, name: string) =>
    parent?.childrenIds.map((id) => nodes[id]).find((n) => n && leaf(n) === name)

  // `header` is the Accordion item's trigger; `control` the Combobox's entry field.
  const trigger = byLeaf('trigger') ?? byLeaf('header') ?? byLeaf('control')
  // An inline plan's surface is its `panel`.
  const surface = byLeaf('surface') ?? (surfaceKind === 'inline' ? byLeaf('panel') : undefined)
  if (!surface) return null

  // A trigger-less popup surface (Menu, ContextMenu): the component's own region
  // hosts the presentation. ContextMenu opens on secondary activation; a plain
  // Menu is standalone — the surface simply IS the component.
  const root = nodes[component.structure.rootId]
  const context = !trigger && component.archetype === 'ContextMenu'
  const standalone = !trigger && !context
  if (!trigger && !root) return null

  const option = surface.childrenIds.map((id) => nodes[id]).find((n) => n && n.kind === 'item')

  const openOn: OpenTrigger = context
    ? 'context'
    : component.archetype === 'Tooltip'
      ? 'hover'
      : 'activate'

  const triggerNode = trigger ?? root

  return {
    kind: 'disclosure',
    surfaceKind,
    openOn,
    modal: surfaceKind === 'dialog' || surfaceKind === 'sheet',
    standalone,
    entry: trigger?.kind === 'input',
    dismissable: composes.includes('dismiss'),
    selectable: composes.some((c) => c.startsWith('selection')),
    multiSelectable: composes.includes('selection.multiple'),
    browsable: composes.some((c) => c === 'browse' || c.startsWith('browse')),
    typeahead: composes.some((c) => c === 'typeahead' || c === 'typeahead?'),
    triggerId: triggerNode.id,
    surfaceId: surface.id,
    triggerLabelId: childByLeaf(trigger, 'label')?.id,
    backdropId: byLeaf('backdrop')?.id,
    titleId: childByLeaf(surface, 'title')?.id,
    contentId: childByLeaf(surface, 'content')?.id,
    closeId: childByLeaf(surface, 'close')?.id,
    valueId: childByLeaf(trigger, 'value')?.id,
    indicatorId: childByLeaf(trigger, 'indicator')?.id,
    optionId: option?.id,
    optionCheckId: option ? childByLeaf(option, 'check')?.id : undefined,
    optionLabelId: option ? childByLeaf(option, 'label')?.id : undefined,
  }
}

export type RenderTarget = 'production' | 'preview'

export function backdropDecls(kind: SurfaceKind, target: RenderTarget = 'production'): StyleDecl[] {
  if (kind === 'dialog' || kind === 'sheet') {
    return [
      { prop: 'position', value: target === 'preview' ? 'absolute' : 'fixed' },
      { prop: 'inset', value: '0' },
      { prop: 'zIndex', value: '1000' },
    ]
  }
  return []
}

export function anchorDecls(kind: SurfaceKind): StyleDecl[] {
  if (kind === 'popover' || kind === 'menu') {
    return [
      { prop: 'position', value: 'relative' },
      { prop: 'display', value: 'inline-block' },
    ]
  }
  return []
}

export function surfacePositionDecls(
  kind: SurfaceKind,
  target: RenderTarget = 'production',
): StyleDecl[] {
  const fixedOrAbsolute = target === 'preview' ? 'absolute' : 'fixed'
  if (kind === 'popover' || kind === 'menu') {
    return [
      { prop: 'position', value: 'absolute' },
      { prop: 'top', value: 'calc(100% + 4px)' },
      { prop: 'left', value: '0' },
      { prop: 'minWidth', value: '100%' },
      { prop: 'zIndex', value: '50' },
    ]
  }
  if (kind === 'dialog') {
    return [
      { prop: 'position', value: fixedOrAbsolute },
      { prop: 'top', value: '50%' },
      { prop: 'left', value: '50%' },
      { prop: 'transform', value: 'translate(-50%, -50%)' },
      { prop: 'maxWidth', value: 'calc(100% - 32px)' },
      { prop: 'maxHeight', value: '90%' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: '1001' },
    ]
  }
  if (kind === 'sheet') {
    return [
      { prop: 'position', value: fixedOrAbsolute },
      { prop: 'top', value: '0' },
      { prop: 'right', value: '0' },
      { prop: 'bottom', value: '0' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: '1001' },
    ]
  }
  return []
}
