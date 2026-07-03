import type { ComponentIR } from '../structure/types'
import { collectSlots } from '../structure/slots'

export interface CompoundPlan {
  valueField: string

  triggerSlotIds: Set<string>
  panelSlotIds: Set<string>
}

export function planCompound(component: ComponentIR): CompoundPlan | null {
  const slots = collectSlots(component)
  const triggers = slots.filter((s) => s.slot.role === 'trigger')
  const panels = slots.filter((s) => s.slot.role === 'panel')
  if (triggers.length === 0 || panels.length === 0) return null

  const valueField =
    triggers.find((s) => s.slot.keyedBy)?.slot.keyedBy ??
    panels.find((s) => s.slot.keyedBy)?.slot.keyedBy ??
    'value'

  return {
    valueField,
    triggerSlotIds: new Set(triggers.map((s) => s.nodeId)),
    panelSlotIds: new Set(panels.map((s) => s.nodeId)),
  }
}
