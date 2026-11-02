import type { InteractionKind } from '@mildastudio/core'

// ─── What an interaction binds to on the web (proposal 0050 slice 1) ─────────
// `InteractionKind` is the IR's neutral interaction vocabulary - `activate`, `open`,
// `dismiss` and six others. It says what the AUTHOR meant, deliberately without saying
// which event delivers it, because "activate" is a click on the web, a tap on iOS and a
// press on a game pad.
//
// The web answer to that question was written out twice: `INTERACTION_HANDLER` in the
// React emitter and `PREVIEW_INTERACTION_HANDLER` on the Studio canvas. Both were
// `Record<string, string>` with an `?? 'onClick'` fallback, so a tenth interaction kind
// would have compiled on both sides and silently become a click on both. This record is
// TOTAL over the union, which turns that into a build error - the same discipline
// `SlotCoverage` gives the facet slots (proposal 0048).
//
// The value is a DOM event name rather than a framework handler prop, because this tier
// is framework-agnostic by charter. React's `onClick` is one capitalization away and
// lives in the React tier (`reactHandlerProp`).
export const INTERACTION_DOM_EVENT: Record<InteractionKind, string> = {
  activate: 'click',
  change: 'change',
  input: 'input',
  focus: 'focus',
  blur: 'blur',
  // The four below are INTENTS carried by an activation, not events of their own: the
  // author says "this dismisses the toast", and on the web that is still a click. They
  // stay distinct in the IR because a target with a real dismiss gesture (a swipe on
  // iOS) has something better to do with them.
  select: 'click',
  open: 'click',
  close: 'click',
  dismiss: 'click',
}
