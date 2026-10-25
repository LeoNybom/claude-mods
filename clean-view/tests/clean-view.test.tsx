import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cleanName } from '../hooks/clean-view'

const PLAN = 'mcp__clean-view__plan_steps'
const PROGRESS = 'mcp__clean-view__report_progress'

const BAND = {
  plugin: 'clean-view',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

/** Stands in for the engine beneath the plugin. */
async function setup($: Parameters<Parameters<typeof test>[1]>[0], on: On) {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  on('tool.register', (_, e) => ({ value: { tool: `mcp__clean-view__${e.name}` } }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'Build my landing page', usage: USAGE } }))
  on('classic.Notification', () => ({}))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  return clock
}

test('1. names are cleaned to plain words', () => {
  expect(cleanName('Build the pricing section in `src/Pricing.tsx`')).toBe('Build the pricing section in')
  expect(cleanName('Update the menu in src/components/Menu.tsx today')).toBe('Update the menu in today')
  expect(cleanName('fix the header.tsx layout')).toBe('Fix the layout')
  const long = cleanName('Make the whole website look calmer and friendlier for every visitor who comes by')
  expect(long.length).toBeLessThanOrEqual(40)
  expect(long).toEndWith('…')
  expect(cleanName('`npm test`')).toBe('Working on it')
})

test('2. a to-do list plus a 60% report draws done, active, next and up next', async ($, on) => {
  const clock = await setup($, on)
  await $.turn.start({ text: 'Build my landing page', turnId: 't1' })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read your brand notes', status: 'completed', activeForm: 'Reading' },
      { content: 'Build the pricing section', status: 'in_progress', activeForm: 'Building' },
      { content: 'Add the contact form', status: 'pending', activeForm: 'Adding' },
      { content: 'Polish the footer', status: 'pending', activeForm: 'Polishing' },
    ],
  } as never)
  await $.tool.call({ tool: PROGRESS, task: 'Build the pricing section', percent: 60 } as never)
  await clock.advance(10)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Build my landing page/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Done' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▶' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '60%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '██████░░░░' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ Next$/ }))?.text).toBe(' Next')
    expect(await ui.find({ type: 'Text', text: 'Up next' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'clean-view-toggle' })).toBeDefined()
    await ui.unmount()
  }
})

test('3. a permission prompt shows Needs you', async ($, on) => {
  await setup($, on)
  await $.turn.start({ text: 'Tidy up my photos', turnId: 't1' })
  await $.tool.call({ tool: PLAN, steps: ['Sort the photos', 'Remove duplicates'] } as never)
  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Needs you/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /needs your OK/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '‖' })).toBeDefined()
    await ui.unmount()
  }
})

test('4. /simple off hides the band, leaving only the button', async ($, on) => {
  await setup($, on)
  await $.turn.start({ text: 'Write a poem', turnId: 't1' })
  await $.tool.call({ tool: PLAN, steps: ['Write the poem'] } as never)
  await $.command.run({
    command: 'simple',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Write the poem/ })).toBeUndefined()
  const button = await ui.find({ type: 'Button', key: 'clean-view-toggle' })
  expect(button?.props.label).toBe('○ Clean View: OFF')
  await ui.unmount()
})

test('5. plan_steps then report_progress at 100 checks off step one and starts step two', async ($, on) => {
  await setup($, on)
  await $.turn.start({ text: 'Plan my trip', turnId: 't1' })
  const planned = await $.tool.call({ tool: PLAN, steps: ['Pick the dates', 'Book the hotel', 'Pack the bags'] } as never)
  expect(planned.result).toBe('Planned 3 steps. The first one has started.')
  const reported = await $.tool.call({ tool: PROGRESS, task: 'Pick the dates', percent: 100 } as never)
  expect(reported.result).toBe('Progress noted: 100%.')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const icons = (await ui.findAll({ type: 'Text', text: /^(✓|▶|○) $/ })).map(t => t.text.trim())
  expect(icons).toEqual(['✓', '▶', '○'])
  expect(await ui.find({ type: 'Text', text: /^Book the hotel/ })).toMatchObject({ props: { bold: true } })
  expect(await ui.find({ type: 'Text', text: 'Working' })).toBeDefined()
  await ui.unmount()
})

test('6. tools are denied before a plan exists and allowed after', async ($, on) => {
  await setup($, on)
  await $.turn.start({ text: 'List my files', turnId: 't1' })
  const before = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(String(before.deny ?? before.text ?? '')).toMatch(/plan_steps/)

  await $.tool.call({ tool: PLAN, steps: ['Look at your files'] } as never)
  const after = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(after.deny).toBeUndefined()
  expect(after.isError).toBeUndefined()
})

test('extra: All done shows the time, then shrinks to one line after 5 seconds', async ($, on) => {
  const clock = await setup($, on)
  await $.turn.start({ text: 'Write a poem', turnId: 't1' })
  await $.tool.call({ tool: PLAN, steps: ['Write the poem'] } as never)
  await clock.advance(134_000)
  await $.tool.call({ tool: PROGRESS, task: 'Write the poem', percent: 100 } as never)
  await $.turn.complete({ answer: 'Here it is', durationMs: 134_000, isAborted: false, turnId: 't1', reason: 'answer' })

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /✓ All done · .* · took 2m 14s/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Write the poem/ })).toBeDefined()
  await ui.unmount()

  await clock.advance(5_000)
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /All done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Write the poem/ })).toBeUndefined()
  await ui.unmount()
})

test('extra: tool rows are hidden while on and shown while off', async ($, on) => {
  await setup($, on)
  const ROW = {
    plugin: 'clean-view',
    component: 'ToolUse',
    props: { tool_use_id: 'x', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false },
  } as const
  let ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeUndefined()
  await ui.unmount()

  await $.command.run({ command: 'simple', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /engine row/ })).toBeDefined()
  await ui.unmount()
})

test('extra: its row in the Tools panel turns Clean View off', async ($, on) => {
  await setup($, on)
  const PANE = {
    plugin: 'clean-view',
    component: 'Pane',
    requestId: 'toolbox',
    props: { title: 'Tools', isFocused: true, bodyColumns: 70, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  } as const
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Button', key: 'toolbox-row:clean-view' }))?.props.label).toBe('● On')
  await ui.press({ key: 'toolbox-row:clean-view' })
  expect((await ui.find({ type: 'Button', key: 'toolbox-row:clean-view' }))?.props.label).toBe('○ Off')
  await ui.unmount()
})
