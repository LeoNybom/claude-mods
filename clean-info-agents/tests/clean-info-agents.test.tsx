import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ansiOf } from '../hooks/agents'

const PLUGIN = 'clean-info-agents'
const PROGRESS = 'mcp__clean-info-agents__progress'
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const HINT = {
  plugin: PLUGIN,
  component: 'PromptHint',
  props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' },
} as const

const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'savvy-agents',
  props: { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

type Setup = {
  /** Whether the Infobar is installed and on. */
  infobar?: boolean
  /** What the line under the prompt holds beneath this mod: another mod's row, or the engine's own hint. */
  beneath?: 'row' | 'engine'
  stored?: Record<string, unknown>
  /** Collects the prompts subagents are started with. */
  spawned?: string[]
  /** Collects the toasts shown. */
  toasts?: string[]
  /** Collects this mod's on/off writes. */
  writes?: unknown[]
}

async function start($: Engine, on: On, setup: Setup = {}) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-29T12:00:00Z') })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  mock.store(on, setup.stored)
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('tool.register', (_$, e) => ({ value: { tool: (e as { name: string }).name } }) as never)
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.toast', (_$, e) => {
    setup.toasts?.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  if (setup.infobar) {
    on('state.get', (_$, e, next) =>
      ((e as { plugin: string }).plugin === 'infobar' ? { value: { value: true, version: 1 } } : next(e)) as never,
    )
  }
  if (setup.writes) {
    const writes = setup.writes
    on('state.set', (_$, e, next) => {
      const w = e as { plugin: string; key: string; value: unknown }
      if (w.plugin === PLUGIN && w.key === 'enabled') writes.push(w.value)
      return next(e)
    })
  }
  if (setup.spawned) {
    const spawned = setup.spawned
    on('agent.spawn', (_$, e) => {
      spawned.push((e as { prompt: string }).prompt)
      return { model: 'claude-opus-5-5', agentId: 'a1' } as never
    })
  }
  // What the engine (or a mod beneath) draws in each place.
  on('ui.render', ($, e) => {
    if (e.component === 'PromptHint' && setup.beneath === 'row') {
      const { Text } = $.ui.resolve(e)
      return <Text>INFOBAR ROW</Text>
    }
    return { type: 'engine', ref: 0 } as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  await $.tool.call({ tool: PROGRESS, title: 'Ship it', total: 4, done: 1, phase: 'delegate' } as never)
  return clock
}

async function texts($: Engine, mounted: { findAll: (q: object) => Promise<{ text?: string; props: Record<string, unknown> }[]>; unmount: () => Promise<void> }) {
  const all = await mounted.findAll({ type: 'Text' })
  await mounted.unmount()
  return all
}

test('it starts on and writes its on/off value, so the Tools box gives it a row', async ($, on) => {
  const writes: unknown[] = []
  await start($, on, { writes })
  expect(writes).toEqual([true])
})

test('a saved off stays off in a new session', async ($, on) => {
  const writes: unknown[] = []
  await start($, on, { stored: { enabled: false }, writes })
  expect(writes).toEqual([false])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('/agents-info off hides the row, /agents-info on brings it back', async ($, on) => {
  await start($, on)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeDefined()
  await ui.unmount()

  await $.command.run({ command: 'agents-info', args: 'off', ...RUN })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'agents-info', args: 'on', ...RUN })
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('terminal: the bar is drawn in the terminal theme colors, not hex', async ($, on) => {
  await start($, on)
  const all = await texts($, await $.ui.mount({ ...BAND, surface: 'terminal' }))
  const colors = all.map(t => t.props.color).filter((c): c is string => typeof c === 'string')
  expect(colors).toContain('magenta')
  expect(colors).toContain('red')
  expect(colors.some(c => c.startsWith('#'))).toBe(false)
})

test('terminal: each tier has a theme color; other agents are drawn dim', () => {
  expect(ansiOf('fable')).toBe('magenta')
  expect(ansiOf('heavy')).toBe('red')
  expect(ansiOf('careful')).toBe('yellow')
  expect(ansiOf('medium')).toBe('blue')
  expect(ansiOf('light')).toBe('green')
  expect(ansiOf('other')).toBeUndefined()
  expect(ansiOf('constructor')).toBeUndefined()
})

test('terminal: the panel lists planned tasks in theme colors', async ($, on) => {
  await start($, on)
  await $.tool.call({
    tool: PROGRESS,
    tasks: [
      { title: 'Write the parser', tier: 'careful' },
      { title: 'Wire the CLI', tier: 'light', after: [1] },
    ],
  } as never)
  const all = await texts($, await $.ui.mount({ ...PANE, surface: 'terminal' }))
  const colors = all.map(t => t.props.color).filter((c): c is string => typeof c === 'string')
  expect(colors).toContain('yellow')
  expect(colors).toContain('green')
  expect(colors.some(c => c.startsWith('#'))).toBe(false)
})

test('terminal without the Infobar: the row stays above the prompt', async ($, on) => {
  await start($, on)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeDefined()
  await ui.unmount()
  ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeUndefined()
  await ui.unmount()
})

test('terminal with the Infobar: the row moves under the prompt, right above the Infobar', async ($, on) => {
  await start($, on, { infobar: true, beneath: 'row' })
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeUndefined()
  await ui.unmount()

  ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  const all = await texts($, ui)
  const order = all.map(t => t.text).join('|')
  expect(order).toMatch(/Tasks 1\/4.*INFOBAR ROW/)
})

test('terminal with the Infobar running first: only the row is handed up, never the engine hint', async ($, on) => {
  await start($, on, { infobar: true, beneath: 'engine' })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Tasks 1\/4$/ })).toBeDefined()
  expect(await ui.find({ type: 'engine' } as never)).toBeUndefined()
  await ui.unmount()
})

test('desktop: the row stays in the band above the prompt, Infobar or not', async ($, on) => {
  await start($, on, { infobar: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('plugin-named savvy agents get the step reminder, as bare ones do', async ($, on) => {
  const prompts: string[] = []
  await start($, on, { spawned: prompts })
  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Do the task.',
    description: 'Write the parser',
    subagentType: 'clean-info-agents:savvy-careful',
    provider: 'engine',
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  } as never)
  expect(prompts[0]).toContain('mcp__clean-info-agents__step')
})

test('/cia <task> runs the savvy-flow skill with the task, right after it answers', async ($, on) => {
  const runs: string[] = []
  on('command.run', { command: 'clean-info-agents:savvy-flow' }, (_$, e) => {
    runs.push(e.args)
    return { text: '' }
  })
  const toasts: string[] = []
  const clock = await start($, on, { toasts })
  const answer = await $.command.run({ command: 'cia', args: '  bygg kassaflödet  ', ...RUN })
  expect(answer.text).toBeUndefined()
  await clock.advance(1)
  expect(runs).toEqual(['bygg kassaflödet'])
  expect(toasts).toEqual([])

  const empty = await $.command.run({ command: 'cia', args: '', ...RUN })
  expect(empty.text).toContain('/cia <task>')
  await clock.advance(1)
  expect(runs).toHaveLength(1)
})
