import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fitParts, levelColor, limitsFrom, meter, meterSvg, modelLabel, parseGitStatus } from '../hooks/infobar'

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

/** `git status --porcelain=v1 -b` output, or null for a folder that is not a repository. */
const DIRTY = '## feature/git...origin/feature/git\n M infobar/hooks/infobar.tsx\n'
const CLEAN = '## main...origin/main\n'

type Setup = { commands?: string[]; usage?: unknown; stored?: Record<string, unknown>; git?: string | null }

function engine(on: On, { commands = ['toolbox'], usage = USAGE, stored = {}, git = null }: Setup = {}) {
  mock.store(on, stored)
  mock.clock(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: commands.map(name => ({ name, description: '', source: 'plugin' })) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: usage as typeof USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('agent.list', () => ({ value: [] }))
  on('process.run', () => ({
    value:
      git === null
        ? { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false }
        : { exitCode: 0, stdout: git, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('command.run', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine hint</Text>
  })
}

const TERMINAL = { ...HINT, surface: 'terminal' as const, viewport: { columns: 160, rows: 40 } }
const DESKTOP = { ...BAND, surface: 'desktop' as const }

test('small helpers', () => {
  expect(modelLabel('claude-sonnet-5-5')).toBe('Sonnet 5.5')
  expect(meter(18)).toBe('▰▰▱▱▱▱▱▱▱▱')
  expect(levelColor(10)).toBe('success')
  expect(levelColor(60)).toBe('warning')
  expect(levelColor(90)).toBe('error')
  expect(meterSvg(50)).toContain('width="16"')
  expect(meterSvg(0)).not.toContain('#3fb950')
  const parts = [
    { width: 10, priority: 1 },
    { width: 10, priority: 3 },
    { width: 10, priority: 2 },
  ]
  expect(fitParts(parts, 23).map(p => p.priority)).toEqual([1, 2])

  const now = Date.parse('2026-10-28T12:00:00Z')
  expect(
    limitsFrom(
      [
        { kind: 'five_hour', percentUsed: 40, resetsAt: '2026-10-28T11:00:00Z' },
        { kind: 'seven_day', percentUsed: 22.4, resetsAt: '2026-10-30T00:00:00Z' },
      ],
      now,
    ),
  ).toEqual([
    { name: '5h', percent: 0 },
    { name: '7d', percent: 22 },
  ])
})

test('git status: up to date only when committed and pushed', () => {
  expect(parseGitStatus(CLEAN)).toEqual({ branch: 'main', upToDate: true })
  expect(parseGitStatus(DIRTY)).toEqual({ branch: 'feature/git', upToDate: false })
  expect(parseGitStatus('## main...origin/main [ahead 1]\n')).toEqual({ branch: 'main', upToDate: false })
  expect(parseGitStatus('## main...origin/main [behind 2]\n')).toEqual({ branch: 'main', upToDate: true })
  expect(parseGitStatus('## new-branch\n')).toEqual({ branch: 'new-branch', upToDate: false })
  expect(parseGitStatus('## No commits yet on main\n')).toEqual({ branch: 'main', upToDate: false })
  expect(parseGitStatus('')).toBeNull()
})

test('before the first reply, effort, 5h and 7d show the last values seen', async ($, on) => {
  engine(on, {
    usage: { ...USAGE, rateLimits: [] },
    stored: {
      lastEffort: 'high',
      lastLimits: [
        { kind: 'five_hour', percentUsed: 31 },
        { kind: 'seven_day', percentUsed: 47 },
      ],
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const site of [TERMINAL, DESKTOP]) {
    const ui = await $.ui.mount(site as never)
    expect(await ui.find({ type: 'Text', text: /31%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /47%/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount(TERMINAL)
  expect(await ui.find({ type: 'Text', text: 'high' })).toBeDefined()
  await ui.unmount()
})

test('the terminal keeps model and effort; the desktop leaves them to its own corner', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'effort', args: 'medium', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 140 } })

  const term = await $.ui.mount(TERMINAL)
  expect(await term.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'medium' })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount(DESKTOP)
  expect(await desk.find({ type: 'Text', text: /Opus 5\.5/ })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: 'medium' })).toBeUndefined()
  await desk.unmount()

  for (const site of [TERMINAL, DESKTOP]) {
    const ui = await $.ui.mount(site as never)
    expect(await ui.find({ type: 'Text', text: /Subscription/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /54%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 agents/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'open-tools' })).toBeDefined()
    await ui.unmount()
  }
})

test('the git part shows the branch, yellow with changes and green when up to date', async ($, on) => {
  engine(on, { git: DIRTY })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const term = await $.ui.mount(TERMINAL)
  expect(await term.find({ type: 'Text', text: /feature\/git/ })).toBeDefined()
  expect((await term.findAll({ type: 'Text' })).some(t => t.text === '●' && t.props.color === 'yellow')).toBe(true)
  await term.unmount()

  const desk = await $.ui.mount(DESKTOP)
  expect(await desk.find({ type: 'Text', text: /feature\/git/ })).toBeDefined()
  expect((await desk.findAll({ type: 'Text' })).some(t => t.text === '●' && t.props.color === 'warning')).toBe(true)
  await desk.unmount()
})

test('a clean, pushed branch has a green dot', async ($, on) => {
  engine(on, { git: CLEAN })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const term = await $.ui.mount(TERMINAL)
  expect((await term.findAll({ type: 'Text' })).some(t => t.text === '●' && t.props.color === 'green')).toBe(true)
  await term.unmount()
  const desk = await $.ui.mount(DESKTOP)
  expect((await desk.findAll({ type: 'Text' })).some(t => t.text === '●' && t.props.color === 'success')).toBe(true)
  await desk.unmount()
})

test('outside a git repository the git part is hidden', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const site of [TERMINAL, DESKTOP]) {
    const ui = await $.ui.mount(site as never)
    expect(await ui.find({ type: 'Text', text: /⎇/ })).toBeUndefined()
    expect(await ui.find({ type: 'Svg', text: /branch/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the terminal uses glyph meters in terminal colors, the desktop a bar with no frame', async ($, on) => {
  engine(on, { git: DIRTY })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(TERMINAL)
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.some(t => t.text.includes('▰▰▱') && t.props.color === 'green')).toBe(true)
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(false)
  await ui.unmount()

  // About as wide as the app's prompt: every part should still fit.
  const desk = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 100 }, surface: 'desktop' })
  // The band's own background is the bar, so no border is drawn around it.
  expect((await desk.findAll({ type: 'Box' })).some(b => b.props.borderStyle !== undefined)).toBe(false)
  expect(await desk.find({ type: 'Text', text: '▰▰▱▱▱▱▱▱▱▱' })).toBeUndefined()
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /feature\/git/ })).toBeDefined()
  expect(await desk.find({ type: 'Text', text: /agents/ })).toBeDefined()
  await desk.unmount()
})

test('a narrow window drops the least important parts first', async ($, on) => {
  engine(on, { git: DIRTY })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal', viewport: { columns: 50, rows: 40 } })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  // Session (5h) and weekly (7d) usage come right after the model.
  expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '54%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /agents/ })).toBeUndefined()
  await ui.unmount()
})

test('/infobar off gives the normal hint back', async ($, on) => {
  engine(on, { commands: [] })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'infobar', args: 'off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /engine hint/ })).toBeDefined()
  await ui.unmount()
})

test('the desktop draws the bar under the rest of the band, the terminal leaves the band alone', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(DESKTOP)
  expect(await ui.find({ type: 'Text', text: /engine hint/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /agents/ })).toBeDefined()
  await ui.unmount()
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /agents/ })).toBeUndefined()
  await term.unmount()
})

test('the whole Tools part is one button: label and chevron press the same thing', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const desk = await $.ui.mount(DESKTOP)
  const tools = await desk.find({ type: 'Button', key: 'open-tools' })
  expect(tools).toBeDefined()
  expect(tools?.text).toContain('Tools')
  expect(tools?.text).toContain('∧')
  expect(await desk.findAll({ type: 'Button' })).toHaveLength(1)
  await desk.unmount()
})
