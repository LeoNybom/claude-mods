import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fitParts, levelColor, meter, meterSvg, modelLabel } from '../hooks/infobar'

const HINT = {
  plugin: 'infobar',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
} as const

const BAND = {
  plugin: 'infobar',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 160, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const USAGE = {
  startedAt: 0,
  context: { tokens: 180_000, window: 1_000_000, percent: 18 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 12, source: 'api' },
    { kind: 'seven_day', percentUsed: 54, source: 'api' },
  ],
}

function engine(on: On, commands: string[] = ['toolbox']) {
  mock.store(on)
  mock.clock(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: commands.map(name => ({ name, description: '', source: 'plugin' })) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('agent.list', () => ({ value: [] }))
  on('command.run', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine hint</Text>
  })
}

test('small helpers', () => {
  expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(meter(18)).toBe('▰▰▱▱▱▱▱▱▱▱')
  expect(levelColor(10)).toBe('success')
  expect(levelColor(60)).toBe('warning')
  expect(levelColor(90)).toBe('error')
  expect(meterSvg(50)).toContain('width="20"')
  expect(meterSvg(0)).not.toContain('#3fb950')
  const parts = [
    { width: 10, priority: 1 },
    { width: 10, priority: 3 },
    { width: 10, priority: 2 },
  ]
  expect(fitParts(parts, 23).map(p => p.priority)).toEqual([1, 2])
})

test('the bar shows plan, model, effort, context, limits, agents and the Tools button', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'effort', args: 'medium', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })

  const sites = [
    { ...HINT, surface: 'terminal' as const, viewport: { columns: 160, rows: 40 } },
    { ...BAND, surface: 'desktop' as const },
  ]
  for (const site of sites) {
    const ui = await $.ui.mount(site as never)
    expect(await ui.find({ type: 'Text', text: /Subscription/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'medium' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /54%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 agents/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'open-tools' })).toBeDefined()
    await ui.unmount()
  }
})

test('the terminal uses glyph meters in terminal colors, the desktop one shared rounded frame', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  let ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 160, rows: 40 } })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.some(t => t.text.includes('▰▰▱') && t.props.color === 'green')).toBe(true)
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(false)
  await ui.unmount()

  // About as wide as the app's prompt: every part should still fit.
  const desk = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 100 }, surface: 'desktop' })
  expect((await desk.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(true)
  expect(await desk.find({ type: 'Text', text: '▰▰▱▱▱▱▱▱▱▱' })).toBeUndefined()
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /Subscription/ })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /agents/ })).toBeDefined()
  await desk.unmount()
})

test('a narrow window drops the least important parts first', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 50, rows: 40 } })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  // Session (5h) and weekly (7d) usage come right after the model.
  expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '54%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /agents/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Subscription/ })).toBeUndefined()
  await ui.unmount()
})

test('/infobar off gives the normal hint back', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'infobar', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /engine hint/ })).toBeDefined()
  await ui.unmount()
})

test('the desktop draws the bar under the rest of the band, the terminal leaves the band alone', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /engine hint/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()
  await ui.unmount()
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /Opus 5.5/ })).toBeUndefined()
  await term.unmount()
})
