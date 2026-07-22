import type { InteractionKind } from './types'

// A signal becomes a default contract event only when it maps to an interaction
// kind here. InteractionKind is a fixed vocabulary (activate/change/select/…), so
// semantically-distinct signals share a bucket (`on`) and are told apart by the
// event NAME (`defaultEventName`): a Form's `submitStart` is an `activate`-bucket
// event named `submit` → `onSubmit`.
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
  // Proposal 0034 §B — signals that previously produced no default event:
  toggle: 'change', // disclosure composite → onToggle
  submitStart: 'activate', // submission → onSubmit
  submitSuccess: 'change', // submission → onSubmitSuccess
  submitError: 'change', // submission → onSubmitError
  navigate: 'select', // navigation → onNavigate
  stepChange: 'select', // stepping-nav composite → onStepChange
  complete: 'change', // stepping-nav / progress → onComplete
  success: 'change', // async-state → onSuccess
  error: 'change', // async-state → onError
}

export function interactionForSignal(signal: string): InteractionKind | undefined {
  return SIGNAL_INTERACTION[signal]
}

const DEFAULT_EVENT_NAME: Record<string, string> = {
  invoke: 'click',
  submitStart: 'submit',
}
export function defaultEventName(signal: string): string {
  return DEFAULT_EVENT_NAME[signal] ?? signal
}
