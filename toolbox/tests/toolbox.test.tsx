import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { columnChoices, gridLayout, modelLabel, rowsBottomUp, scrollWindow, splitTop, terminalBoxWidth } from '../hooks/toolbox'

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

function engine(on: On, log: { configSets: unknown[]; commands: string[] }, withThinkbar = false) {
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
    const { Box, Text } = $.ui.resolve(e)
    // Beneath Tools: with Thinkbar, its keyed progress row, then the rest of the band.
    if (withThinkbar) {
      return (
        <Box flexDirection="column">
          <Box key="top:thinkbar">
            <Text>thinking bar</Text>
          </Box>
          <Text>the rest of the band</Text>
        </Box>
      )
    }
    return <Text>the rest of the band</Text>
  })
}

test('model ids read as friendly names', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelLabel('something-else')).toBe('something-else')
})

test('the terminal box is half the prompt, never narrower than the MODEL row', () => {
  // The MODEL row with all four models takes 63 cells, the frame and its room 4 more.
  expect(terminalBoxWidth(200, false)).toBe(100)
  expect(terminalBoxWidth(100, false)).toBe(67)
  expect(terminalBoxWidth(100, true)).toBe(70)
  expect(terminalBoxWidth(60, false)).toBe(60)
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

test('each section takes at most three mods or two quick actions a row, fewer when its half is narrow', () => {
  // At most `most` columns, down to one; the last row may be short.
  expect(columnChoices(3, 3)).toEqual([3, 2, 1])
  expect(columnChoices(4, 3)).toEqual([3, 2, 1])
  expect(columnChoices(3, 2)).toEqual([2, 1])
  expect(columnChoices(2, 3)).toEqual([2, 1])
  expect(columnChoices(1, 3)).toEqual([1])

  const mods = [11, 18, 21] // three mods of these widths
  const quick = [20, 20, 11]
  // Four mods and three quick actions, wide: three and one, two and one.
  expect(gridLayout([...mods, 8], quick, 160)).toEqual({ isStacked: false, modColumns: 3, quickColumns: 2 })
  expect(gridLayout(mods, quick, 160)).toEqual({ isStacked: false, modColumns: 3, quickColumns: 2 })
  expect(gridLayout(mods, quick, 80)).toEqual({ isStacked: false, modColumns: 1, quickColumns: 1 })
  expect(gridLayout(mods, quick, 40).isStacked).toBe(true)
  // Six mods, as more get added: three columns of two rows, beside QUICK.
  expect(gridLayout([...mods, 14, 16, 12], quick, 160)).toEqual({ isStacked: false, modColumns: 3, quickColumns: 2 })
})

test('the first items stand on the bottom row and later ones on rows above, in the same columns', () => {
  expect(rowsBottomUp(['a', 'b', 'c', 'd'], 3)).toEqual([
    ['d', null, null],
    ['a', 'b', 'c'],
  ])
  expect(rowsBottomUp(['x', 'y', 'z'], 2)).toEqual([
    ['z', null],
    ['x', 'y'],
  ])
  expect(rowsBottomUp(['a', 'b'], 3)).toEqual([['a', 'b', null]])
})

test('in the app the line between the sections grows with the rows, and a line runs under the menu', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // All three mods are installed and on.
  on('state.get', (_$, e, next) =>
    (['infobar', 'prompt-upgrade', 'thinkbar'].includes((e as { plugin: string }).plugin)
      ? { value: { value: true, version: 1 } }
      : next(e)) as never,
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const height = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'desktop' })
    const divider = (await ui.findAll({ type: 'Svg' })).find(s => s.props.alt === 'divider')
    const underLine = (await ui.findAll({ type: 'Svg' })).some(s => s.props.alt === 'underline')
    await ui.unmount()
    return { height: divider?.props.height, underLine }
  }
  expect(await height(120)).toEqual({ height: 40, underLine: true })
  expect(await height(95)).toEqual({ height: 40, underLine: true })
  expect(await height(70)).toEqual({ height: 60, underLine: true })
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
  // The header no longer repeats the model and effort; its Close button is a framed, lit button.
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5 · High/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'close' })).toMatchObject({
    props: { label: '✕ Close', variant: 'primary' },
  })
  await ui.press({ key: 'quick:compact' })
  expect(log.commands).toContain('compact')
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  await ui.unmount()
})

test('Summary asks Claude to sum up the chat, in the mod’s name, and closes the box', async ($, on) => {
  const log = { configSets: [] as unknown[], commands: [] as string[] }
  engine(on, log)
  const submitted: { text: string; asUser?: boolean }[] = []
  on('prompt.submit', (_, e) => {
    submitted.push({ text: e.text, asUser: (e as { asUser?: boolean }).asUser })
    return { text: e.text }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'quick:summary' })
  expect(submitted).toHaveLength(1)
  expect(submitted[0]?.text).toMatch(/^Summarize briefly what this chat is about/)
  expect(submitted[0]?.asUser).toBeUndefined()
  expect(log.commands).toEqual([])
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  await ui.unmount()
})

test('Thinkbar gets a row once it has written its value, its name the switch', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // Thinkbar is installed and off; the other mods are not installed.
  on('state.get', (_$, e, next) =>
    ((e as { plugin: string }).plugin === 'thinkbar' ? { value: { value: false, version: 1 } } : next(e)) as never,
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Thinkbar$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'mod:thinkbar' })).toMatchObject({ props: { label: 'Thinkbar', dimColor: true } })
  expect((await ui.findAll({ type: 'Text' })).some(t => t.text === '○' && t.props.color === 'inactive')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /No mods installed yet/ })).toBeUndefined()
  await ui.unmount()
})

test('a row keyed top: (Thinkbar) stays above the open box, the rest goes under it', async ($, on) => {
  const bar = { type: 'Box', props: { key: 'top:thinkbar' }, children: [] }
  const infobar = { type: 'Text', children: ['the infobar'] }
  expect(splitTop({ type: 'Box', props: {}, children: [bar, infobar] })).toEqual({
    top: bar,
    below: { type: 'Box', props: {}, children: [infobar] },
  })
  expect(splitTop(infobar)).toEqual({ top: null, below: infobar })
  // As in the app: the Infobar's column wraps Thinkbar's column, which holds the keyed row.
  const thinkbar = { type: 'Box', props: { flexDirection: 'column' }, children: [bar] }
  const wrapped = { type: 'Box', props: { flexDirection: 'column' }, children: [thinkbar, infobar] }
  expect(splitTop(wrapped)).toEqual({
    top: bar,
    below: { type: 'Box', props: { flexDirection: 'column' }, children: [{ ...thinkbar, children: [] }, infobar] },
  })

  engine(on, { configSets: [], commands: [] }, true)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  await ui.unmount()
  const barAt = texts.findIndex(t => /thinking bar/.test(t))
  const modsAt = texts.findIndex(t => /M O D S/.test(t))
  const infobarAt = texts.findIndex(t => /the rest of the band/.test(t))
  expect(barAt).toBeGreaterThanOrEqual(0)
  expect(barAt).toBeLessThan(modsAt)
  expect(modsAt).toBeLessThan(infobarAt)
})
