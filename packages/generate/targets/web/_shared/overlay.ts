// Tier 2 (web) - where an overlay surface sits, in CSS (proposal 0045 phase 3).
//
// Which nodes an overlay is made of, and what opens it, is neutral and stays in
// `core/behavior/disclosure.ts`. Stacking order, `inset: 0`, `calc(100% + 4px)` and the
// centring `translate(-50%, -50%)` are not: they are the box model, and only the web has
// this one.
//
// The `RenderTarget = 'production' | 'preview'` enum that used to live in core came with
// them, and does not survive the move. It was never a statement about targets - it chose
// `position: fixed` or `position: absolute`, which is the question of what the surface is
// positioned AGAINST. The caller knows that and now says it: the generated app positions
// against the viewport, the Studio canvas against its own scrollable stage, and neither
// needs core to know the other exists.

import type { SurfaceKind } from '@mildastudio/core'
import type { StyleDecl } from './decl'

/**
 * `viewport` - the surface escapes every ancestor and covers the window (`fixed`).
 * `container` - it is contained by its positioned ancestor (`absolute`). The Studio canvas
 * uses this so a modal lands inside the stage rather than over the whole editor.
 */
export type Anchoring = 'viewport' | 'container'

const escaping = (anchoring: Anchoring): string => (anchoring === 'viewport' ? 'fixed' : 'absolute')

// Modal surfaces sit above the app; the scrim goes just under its own surface so a dialog
// stays clickable while the page behind it does not.
const SCRIM_Z = '1000'
const MODAL_Z = '1001'
const POPUP_Z = '50'

/** The gap between a popup and the trigger it hangs off. */
const POPUP_OFFSET = '4px'

export function backdropDecls(kind: SurfaceKind, anchoring: Anchoring = 'viewport'): StyleDecl[] {
  if (kind === 'dialog' || kind === 'sheet') {
    return [
      { prop: 'position', value: escaping(anchoring) },
      { prop: 'inset', value: '0' },
      { prop: 'zIndex', value: SCRIM_Z },
    ]
  }
  return []
}

/**
 * The trigger's own box, which a popup is positioned against. Always `relative` - a popover
 * is anchored to its trigger whatever the surface itself escapes to.
 */
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
  anchoring: Anchoring = 'viewport',
): StyleDecl[] {
  if (kind === 'popover' || kind === 'menu') {
    // Anchored to the trigger, so this one is `absolute` on every surface: the anchor above
    // is the containing block, and the viewport never enters into it.
    return [
      { prop: 'position', value: 'absolute' },
      { prop: 'top', value: `calc(100% + ${POPUP_OFFSET})` },
      { prop: 'left', value: '0' },
      { prop: 'minWidth', value: '100%' },
      { prop: 'zIndex', value: POPUP_Z },
    ]
  }
  if (kind === 'dialog') {
    return [
      { prop: 'position', value: escaping(anchoring) },
      { prop: 'top', value: '50%' },
      { prop: 'left', value: '50%' },
      { prop: 'transform', value: 'translate(-50%, -50%)' },
      { prop: 'maxWidth', value: 'calc(100% - 32px)' },
      { prop: 'maxHeight', value: '90%' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: MODAL_Z },
    ]
  }
  if (kind === 'sheet') {
    return [
      { prop: 'position', value: escaping(anchoring) },
      { prop: 'top', value: '0' },
      { prop: 'right', value: '0' },
      { prop: 'bottom', value: '0' },
      { prop: 'overflowY', value: 'auto' },
      { prop: 'zIndex', value: MODAL_Z },
    ]
  }
  return []
}
