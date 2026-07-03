export type FreeBehaviorKind =
  | 'focusTrap'
  | 'typeahead'
  | 'cursorNavigation'
  | 'clickaway'
  | 'overlayManagement'
  | 'scrollLock'
  | 'rovingTabindex'
  | 'filter'

export interface FocusTrapBehavior {
  kind: 'focusTrap'
  initialFocusNodeId: string | null
  returnFocusOnClose: boolean
  allowEscapeKey: boolean
}

export interface TypeaheadBehavior {
  kind: 'typeahead'
  targetNodeId: string
  labelNodeId: string | null
  resetDelayMs: number
  caseSensitive: boolean
}

export interface CursorNavigationBehavior {
  kind: 'cursorNavigation'
  orientation: 'horizontal' | 'vertical' | 'both'
  wrap: boolean
  targetNodeId: string
  itemNodeId: string | null
}

export interface ClickawayBehavior {
  kind: 'clickaway'
  eventType: 'mousedown' | 'click' | 'pointerdown'
  excludeNodeIds: string[]
}

export type OverlayPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

export interface OverlayManagementBehavior {
  kind: 'overlayManagement'
  anchorNodeId: string | null
  placement: OverlayPlacement
  offsetPx: number
  flip: boolean
  sameWidth: boolean

  openPropName?: string
  closeOnSelect?: boolean
  commitFromBinding?: string
}

export interface ScrollLockBehavior {
  kind: 'scrollLock'
  target: 'body' | 'parent'
}

export interface RovingTabindexBehavior {
  kind: 'rovingTabindex'
  orientation: 'horizontal' | 'vertical' | 'both'
  targetNodeId: string
  itemNodeId: string | null
  loop: boolean
}

export interface FilterBehavior {
  kind: 'filter'
  queryPropName: string
  itemField: string | null
  matchMode: 'includes' | 'startsWith'
  caseSensitive: boolean
}

export type FreeBehavior =
  | FocusTrapBehavior
  | TypeaheadBehavior
  | CursorNavigationBehavior
  | ClickawayBehavior
  | OverlayManagementBehavior
  | ScrollLockBehavior
  | RovingTabindexBehavior
  | FilterBehavior

export type FreeBehaviorByKind = {
  focusTrap: FocusTrapBehavior
  typeahead: TypeaheadBehavior
  cursorNavigation: CursorNavigationBehavior
  clickaway: ClickawayBehavior
  overlayManagement: OverlayManagementBehavior
  scrollLock: ScrollLockBehavior
  rovingTabindex: RovingTabindexBehavior
  filter: FilterBehavior
}

export type NodeBehavior = FreeBehavior & { id: string }

export const FREE_BEHAVIOR_LABELS: Record<FreeBehaviorKind, string> = {
  focusTrap: 'Focus trap',
  typeahead: 'Typeahead',
  cursorNavigation: 'Cursor navigation',
  clickaway: 'Clickaway',
  overlayManagement: 'Overlay management',
  scrollLock: 'Scroll lock',
  rovingTabindex: 'Roving tabindex',
  filter: 'Filter',
}

export function matchesFilter(item: unknown, filter: FilterBehavior, query: string): boolean {
  if (!query) return true
  const raw = filter.itemField
    ? item != null && typeof item === 'object'
      ? (item as Record<string, unknown>)[filter.itemField]
      : undefined
    : item
  const hay0 = raw == null ? '' : String(raw)
  const hay = filter.caseSensitive ? hay0 : hay0.toLowerCase()
  const needle = filter.caseSensitive ? query : query.toLowerCase()
  return filter.matchMode === 'startsWith' ? hay.startsWith(needle) : hay.includes(needle)
}

export function defaultBehavior(kind: FreeBehaviorKind, id: string): NodeBehavior {
  switch (kind) {
    case 'focusTrap':
      return { id, kind, initialFocusNodeId: null, returnFocusOnClose: true, allowEscapeKey: true }
    case 'typeahead':
      return {
        id,
        kind,
        targetNodeId: '',
        labelNodeId: null,
        resetDelayMs: 500,
        caseSensitive: false,
      }
    case 'cursorNavigation':
      return { id, kind, orientation: 'vertical', wrap: true, targetNodeId: '', itemNodeId: null }
    case 'clickaway':
      return { id, kind, eventType: 'pointerdown', excludeNodeIds: [] }
    case 'overlayManagement':
      return {
        id,
        kind,
        anchorNodeId: null,
        placement: 'bottom-start',
        offsetPx: 6,
        flip: true,
        sameWidth: false,
      }
    case 'scrollLock':
      return { id, kind, target: 'body' }
    case 'rovingTabindex':
      return { id, kind, orientation: 'vertical', targetNodeId: '', itemNodeId: null, loop: true }
    case 'filter':
      return {
        id,
        kind,
        queryPropName: '',
        itemField: null,
        matchMode: 'includes',
        caseSensitive: false,
      }
  }
}
