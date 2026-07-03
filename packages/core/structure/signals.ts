import type { InteractionKind } from './types'

const SIGNAL_INTERACTION: Record<string, InteractionKind> = {
  invoke: 'activate',
  change: 'change',
  input: 'input',
  select: 'select',
  activeChanged: 'select',
  opened: 'open',
  closed: 'close',
  dismissRequested: 'dismiss',
  commit: 'change',
}

export function interactionForSignal(signal: string): InteractionKind | undefined {
  return SIGNAL_INTERACTION[signal]
}

const DEFAULT_EVENT_NAME: Record<string, string> = { invoke: 'click' }
export function defaultEventName(signal: string): string {
  return DEFAULT_EVENT_NAME[signal] ?? signal
}
