import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { modelLabel } from '../hooks/toolbox'

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

test('the box is closed until /toolbox opens it, and closes again', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /the rest of the band/ })).toBeDefined()
  await ui.unmount()

  const answer = await $.command.run({ command: 'toolbox', args: '', ...RUN })
  expect(answer.text).toBeUndefined()
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /the rest of the band/ })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeUndefined()
  await ui.unmount()
})

test('the box shows model, effort, mods and quick actions, and the buttons work', async ($, on) => {
  const log = { configSets: [] as unknown[], commands: [] as string[] }
  engine(on, log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Button', key: 'model:opus' })).toMatchObject({ props: { variant: 'primary' } })
    expect(await ui.find({ type: 'Button', key: 'model:haiku' })).toMatchObject({ props: { variant: 'secondary' } })
    expect(await ui.find({ type: 'Button', key: 'effort:xhigh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No mods installed yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeDefined()
    await ui.unmount()
  }

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

test('Clean Info Agents gets an on/off row once it has written its value', async ($, on) => {
  engine(on, { configSets: [], commands: [] })
  // Clean Info Agents is installed and off; the other mods are not installed.
  on('state.get', (_$, e, next) =>
    ((e as { plugin: string }).plugin === 'clean-info-agents' ? { value: { value: false, version: 1 } } : next(e)) as never,
  )
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'toolbox', args: '', ...RUN })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^Clean Info Agents$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'mod:clean-info-agents' })).toMatchObject({ props: { label: '○ Off' } })
  expect(await ui.find({ type: 'Text', text: /No mods installed yet/ })).toBeUndefined()
  await ui.unmount()
})
