import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { Told } from '../types'
import { RULES } from './rules'

// On/off, saved with $.store. Always written at start, so the Tools box knows
// the mod is installed and gives it a row.
const enabledAtom = atom({ plugin: 'adhd', key: 'enabled' } as const, false)
const STORE_KEY = 'enabled'

/** Sent with the first prompt after ADHD mode turns on, and again after the chat is compacted. */
export const FULL =
  'ADHD MODE IS ON. The reader has ADHD. Shape every response by the rules below until told ADHD mode is off.\n\n' + RULES

/** Sent with every later prompt while on, so the rules hold across topic changes. */
export const REMINDER = 'ADHD mode is still on: shape this response by the ADHD rules sent earlier.'

/** Sent once with the next prompt after ADHD mode turns off. */
export const OFF = 'ADHD mode is now off: return to your default style.'

let told: Told = 'nothing'

/** What to send with a prompt, given whether the mode is on and what the model was last told. */
export function contextFor(isOn: boolean, last: Told): { text: string | null; told: Told } {
  if (isOn) return last === 'rules' ? { text: REMINDER, told: 'rules' } : { text: FULL, told: 'rules' }
  return last === 'rules' ? { text: OFF, told: 'off' } : { text: null, told: last }
}

async function setEnabled($: EngineInterface, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_KEY, value)
  $.ui.toast(value ? 'ADHD mode is on. It applies from your next prompt.' : 'ADHD mode is off.')
}

export function registerAdhd(on: On): void {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    told = 'nothing'
    const saved = await $.store.get(STORE_KEY)
    await update($, enabledAtom, () => saved === true)
    return started
  })

  // Its row in the Tools box.
  on('ui.press', { plugin: 'toolbox', element: 'mod:adhd' }, async ($, e, next) => {
    await setEnabled($, !(await read($, enabledAtom)))
    return next(e)
  })

  // The rules ride along with the prompt, unseen by the person.
  on('prompt.submit', async ($, e, next) => {
    const { text, told: now } = contextFor(await read($, enabledAtom), told)
    told = now
    return next(text === null ? e : { ...e, context: [...(e.context ?? []), text] })
  }).catch(($, e, next) => (next.called ? {} : next(e)))

  // A compaction may drop the rules, so the next prompt sends them in full again.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (told === 'rules') told = 'nothing'
    return result
  }).catch(($, e, next) => (next.called ? {} : next(e)))
}
