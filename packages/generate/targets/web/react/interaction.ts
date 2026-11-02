import type { InteractionKind } from '@mildastudio/core'
import { INTERACTION_DOM_EVENT } from '../_shared/interaction'

// The React binding of the shared web answer (proposal 0050 slice 1). This is the whole
// of what is React-specific about an interaction: the DOM event name with `on` in front
// of it. Which event to bind is decided one tier down, once, for every web framework.
//
// Both React renderers call this - the emitter, which prints the returned prop name into
// the module it is writing, and the Studio canvas, which uses it as a key on a live
// props object. That is the split proposal 0050 §3 is about: the decision is shared, the
// realization is not.
export function reactHandlerProp(kind: InteractionKind): string {
  const event = INTERACTION_DOM_EVENT[kind]
  return `on${event[0].toUpperCase()}${event.slice(1)}`
}
