import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { modelLabel, scrollWindow } from '../hooks/toolbox'

const BAND = {
  plugin: 'toolbox',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 30,
    bodyColumns: 90,
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 90 } } as const

function engine(on: On, log: { configSets: unknown[]; commands: string[] }) {
  let model = 'claude-opus-5-5'
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: model }))
  on('config.set', (_, e) => {
    log.configSets.push(e.value)
    model = `claude-${String(e.value)}-5-5`
    return { value: e.value }
  })
  on('command.run', (_, e) => {
    log.commands.push(`${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the rest of the band</Text>
  })
}

test('model ids read as friendly names', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelLabel('something-else')).toBe('something-else')
})

test('the window over the list stays inside it, and the thumb follows', () => {
  expect(scrollWindow(8, 20, 0)).toEqual({ windowRows: 8, offset: 0, scrolls: false, thumbAt: 0, thumbRows: 8 })
  expect(scrollWindow(10, 5, 0)).toMatchObject({ windowRows: 5, offset: 0, scrolls: true, thumbAt: 0 })
  expect(scrollWindow(10, 5, 99)).toMatchObject({ offset: 5, thumbAt: 2, thumbRows: 3 })
  expect(scrollWindow(10, 5, -3)).toMatchObject({ offset: 0 })
  // On a track of 3 rows between the arrows, the thumb ends at the bottom of the track.
  expect(scrollWindow(10, 5, 5, 3)).toMatchObject({ thumbAt: 1, thumbRows: 2 })
})

test('in the terminal a short band scrolls the list under its header, with a scrollbar', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const short = { ...BAND, props: { ...BAND.props, maxRows: 9 }, surface: 'terminal' as const }
  const ui = await $.ui.mount(short)
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'model:opus' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.backgroundColor === 'inactive')).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'scroll-up' })).toBeDefined()

  // ▼ moves the list a row at a time, under the header that stays.
  for (let i = 0; i < 6; i += 1) await ui.press({ key: 'scroll-down' })
  expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'model:opus' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeDefined()
  await ui.unmount()
})

test('in the app everything sits on one row, and a mod shows what it does under the pointer', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // The Infobar is installed and on.
  on('state.get', { plugin: 'infobar' } as never, () => ({ value: { value: true, version: 1 } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'close' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'scroll-up' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle !== undefined)).toBe(false)

  // A green dot, and the name as the switch.
  const name = await ui.find({ type: 'Button', key: 'mod:infobar' })
  expect(name?.text.trim()).toBe('Infobar')
  expect(name?.props.dimColor).toBe(false)
  expect((await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === 'on')).toBe(true)
  expect((await ui.findAll({ type: 'Button' })).some(b => /^(On|Off)$/.test(b.text.trim()))).toBe(false)

  // The description waits hidden in the row under the mods until the pointer rests on the mod.
  expect(await ui.find({ type: 'Box', key: 'mod-row:infobar' })).toBeDefined()
  const about = (await ui.findAll({ type: 'Box' })).find(b => b.props.display === 'none' && /Context, usage limits/.test(b.text))
  expect(about).toBeDefined()

  expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'quick:clear' })).toBeDefined()
  // With the Infobar on, its Tools button opens the box, so the box draws none of its own.
  expect(await ui.find({ type: 'Button', key: 'open-tools' })).toBeUndefined()
  await ui.unmount()
})

test('in the app the sections share a row with a line between them, and stack without it when narrow', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const wide = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await wide.findAll({ type: 'Svg' })).some(s => s.props.alt === 'divider')).toBe(true)
  await wide.unmount()

  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 40 }, surface: 'desktop' })
  expect((await narrow.findAll({ type: 'Svg' })).some(s => s.props.alt === 'divider')).toBe(false)
  expect(await narrow.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
  expect(await narrow.find({ type: 'Text', text: /Q U I C K/ })).toBeDefined()
  await narrow.unmount()
})

test('in the app, with the Infobar off, the box keeps its own Tools button', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // The Infobar is installed but turned off.
  on('state.get', { plugin: 'infobar' } as never, () => ({ value: { value: false, version: 1 } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeUndefined()
  await ui.press({ key: 'open-tools' })
  expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
  await ui.press({ key: 'open-tools' })
  expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeUndefined()
  await ui.unmount()
})

test('the box is closed until /toolbox opens it, and closes again', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /the rest of the band/ })).toBeDefined()
  await ui.unmount()

  const answer = await $.command.run({ command: 'toolbox', args: '', ...RUN })
  expect(answer.text).toBeUndefined()
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the rest of the band/ })).toBeDefined()
  await ui.unmount()

  // The terminal's ✕ closes it; in the app the Infobar's Tools button does.
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await term.press({ key: 'close' })
  expect(await term.find({ type: 'Text', text: /M O D S/ })).toBeUndefined()
  await term.unmount()
})

test('the box shows mods and quick actions, model and effort in the terminal only, and the buttons work', async ($, on) => {
  const log = { configSets: [] as unknown[], commands: [] as string[] }
  engine(on, log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No mods installed yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeDefined()
    await ui.unmount()
  }

  // The desktop app shows the model and effort itself.
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desk.find({ type: 'Button', key: 'model:opus' })).toBeUndefined()
  expect(await desk.find({ type: 'Button', key: 'effort:xhigh' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /Opus 5\.5/ })).toBeUndefined()
  await desk.unmount()

  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Button', key: 'model:opus' })).toMatchObject({ props: { variant: 'primary' } })
  expect(await term.find({ type: 'Button', key: 'model:haiku' })).toMatchObject({ props: { variant: 'secondary' } })
  expect(await term.find({ type: 'Button', key: 'effort:xhigh' })).toBeDefined()
  await term.unmount()

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'model:haiku' })
  expect(log.configSets).toEqual(['haiku'])
  expect(await ui.find({ type: 'Button', key: 'model:haiku' })).toMatchObject({ props: { variant: 'primary' } })
  await ui.press({ key: 'effort:high' })
  expect(log.commands).toContain('effort high')
  expect(await ui.find({ type: 'Button', key: 'effort:high' })).toMatchObject({ props: { variant: 'primary' } })
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5 · High/ })).toBeDefined()
  await ui.press({ key: 'quick:compact' })
  expect(log.commands).toContain('compact')
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  await ui.unmount()
})

test('Clean Info Agents gets a row once it has written its value, its name the switch', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // Clean Info Agents is installed and off; the other mods are not installed.
  on('state.get', (_$, e, next) =>
    ((e as { plugin: string }).plugin === 'clean-info-agents' ? { value: { value: false, version: 1 } } : next(e)) as never,
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Clean Info Agents$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'mod:clean-info-agents' })).toMatchObject({ props: { label: 'Clean Info Agents', dimColor: true } })
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === '○' && t.props.color === 'inactive')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /No mods installed yet/ })).toBeUndefined()
  await ui.unmount()
})
