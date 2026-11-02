import { describe, expect, it } from 'vitest'
import type { InteractionKind } from '@mildastudio/core'
import { INTERACTION_DOM_EVENT } from '../_shared/interaction'
import { reactHandlerProp } from './interaction'

// The record's TOTALITY is checked by the compiler, not here - that is the whole point of
// proposal 0050 slice 1. What this file pins is the part a type cannot: that deriving the
// React prop from the DOM event still produces exactly the nine handler names the two
// renderers hard-coded before they shared one, so the slice is a refactor rather than a
// change in what a component does.
const BEFORE: Record<string, string> = {
  activate: 'onClick',
  change: 'onChange',
  input: 'onInput',
  focus: 'onFocus',
  blur: 'onBlur',
  select: 'onClick',
  open: 'onClick',
  close: 'onClick',
  dismiss: 'onClick',
}

describe('the React binding of an interaction', () => {
  it('produces the handler names both renderers used to hard-code', () => {
    for (const [kind, handler] of Object.entries(BEFORE)) {
      expect(reactHandlerProp(kind as InteractionKind), kind).toBe(handler)
    }
  })

  // The old maps were `Record<string, string>` with an `?? 'onClick'` fallback on both
  // sides, so a tenth kind would have silently become a click twice over. A missing entry
  // is now `undefined[0]`, which throws - but only if nothing else covers the union, so
  // assert the two lists are the same length as well as the same shape.
  it('covers exactly the interaction kinds, with nothing extra', () => {
    expect(Object.keys(INTERACTION_DOM_EVENT).sort()).toEqual(Object.keys(BEFORE).sort())
  })
})
