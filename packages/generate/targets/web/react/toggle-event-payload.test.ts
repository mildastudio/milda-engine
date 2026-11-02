import { describe, expect, it } from 'vitest'
import type { ComponentIR, ComponentNode, EventDef, PropType } from '@mildastudio/core'
import { toComponentSource } from './emit'
import { readEmitted } from './testkit'

function node(
  partial: Partial<ComponentNode> & Pick<ComponentNode, 'id' | 'kind' | 'parentId'>,
): ComponentNode {
  return {
    name: partial.id,
    tag: 'auto',
    origin: partial.parentId === null ? 'root' : 'author',
    locked: false,
    childrenIds: [],
    ...partial,
  } as ComponentNode
}

// A ToggleButton shaped like the editor emits one: root button bound to a boolean prop for
// its `pressed` state, emitting one contract event on activate.
function toggleButton(event: EventDef, emitPayload?: unknown): ComponentIR {
  const root = node({
    id: 'root',
    kind: 'button',
    tag: 'button',
    parentId: null,
    childrenIds: ['label'],
    stateBindings: [{ state: 'pressed', propName: 'pressed' }],
    emits: [{ on: 'activate', eventId: event.id, payload: emitPayload }],
  } as never)
  const label = node({
    id: 'label',
    kind: 'text',
    tag: 'span',
    parentId: 'root',
    content: { kind: 'static', text: 'Toggle' },
  })
  return {
    name: 'ToggleButton',
    archetype: 'ToggleButton',
    structure: { rootId: 'root', nodes: { root, label } },
    contract: {
      props: [{ id: 'p1', name: 'pressed', type: { kind: 'boolean' } as PropType }],
      events: [event],
    },
  } as ComponentIR
}

// A lowered custom toggle (switch/checkbox realization): the hidden input owns the change.
function switchControl(event: EventDef): ComponentIR {
  const root = node({
    id: 'root',
    kind: 'container',
    tag: 'div',
    parentId: null,
    childrenIds: ['input'],
  })
  const input = node({
    id: 'input',
    kind: 'input',
    parentId: 'root',
    value: { type: { kind: 'boolean' } as PropType },
    control: { as: 'switch' },
    valueBinding: { propName: 'pressed' },
    emits: [{ on: 'change', eventId: event.id }],
  } as never)
  return {
    name: 'Switch',
    archetype: 'ToggleButton',
    structure: { rootId: 'root', nodes: { root, input } },
    contract: {
      props: [{ id: 'p1', name: 'pressed', type: { kind: 'boolean' } as PropType }],
      events: [event],
    },
  } as ComponentIR
}

const handlerCall = (tsx: string) => tsx.match(/onPressedChange\?\.\([^)]*\)/)?.[0]
const handlerType = (tsx: string) => tsx.match(/onPressedChange\?: \(.*?\) => void/)?.[0]

describe('toggle root event payload matches the declared signature', () => {
  it('payload-less event ⇒ handler is called with no argument', () => {
    const tsx = toComponentSource(toggleButton({ id: 'e1', name: 'pressed-change' }))
    expect(handlerType(tsx)).toBe('onPressedChange?: () => void')
    expect(handlerCall(tsx)).toBe('onPressedChange?.()')
    // The toggle still owns its own state. A whole statement, so a `next` computed some
    // other way cannot satisfy this.
    expect(readEmitted({ tsx }).tsx.has('const next = !_pressed')).toBe(true)
  })

  it('boolean-payload event ⇒ handler is called with the next state', () => {
    const tsx = toComponentSource(
      toggleButton({ id: 'e1', name: 'pressed-change', payload: { kind: 'boolean' } }),
    )
    expect(handlerType(tsx)).toBe('onPressedChange?: (payload: boolean) => void')
    expect(handlerCall(tsx)).toBe('onPressedChange?.(next)')
  })

  it('non-boolean payload ⇒ handler is called with the emission payload', () => {
    const tsx = toComponentSource(
      toggleButton(
        { id: 'e1', name: 'pressed-change', payload: { kind: 'string' } },
        {
          kind: 'value',
          value: 'toggled',
        },
      ),
    )
    expect(handlerType(tsx)).toBe('onPressedChange?: (payload: string) => void')
    expect(handlerCall(tsx)).toBe('onPressedChange?.("toggled")')
  })

  it('declared payload with nothing authored ⇒ a value of the declared type, not a bare call', () => {
    const tsx = toComponentSource(
      toggleButton({
        id: 'e1',
        name: 'pressed-change',
        payload: { kind: 'enum', values: ['on', 'off'] },
      }),
    )
    expect(handlerType(tsx)).toBe('onPressedChange?: (payload: "on" | "off") => void')
    expect(handlerCall(tsx)).toBe('onPressedChange?.("on")')
  })
})

describe('lowered switch/checkbox change handler', () => {
  it('payload-less event ⇒ no argument and no unused event param', () => {
    const tsx = toComponentSource(switchControl({ id: 'e1', name: 'pressed-change' }))
    expect(handlerType(tsx)).toBe('onPressedChange?: () => void')
    expect(readEmitted({ tsx }).tsx.attr('input', 'onChange')).toBe('() => onPressedChange?.()')
  })

  it('boolean-payload event ⇒ forwards the checked state', () => {
    const tsx = toComponentSource(
      switchControl({ id: 'e1', name: 'pressed-change', payload: { kind: 'boolean' } }),
    )
    expect(readEmitted({ tsx }).tsx.attr('input', 'onChange')).toBe(
      '(e) => onPressedChange?.(e.target.checked)',
    )
  })
})
