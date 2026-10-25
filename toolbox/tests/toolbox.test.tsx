import { expect, test } from 'claude-code/testing'

import { modelLabel } from '../hooks/toolbox'

const PANE = {
  plugin: 'toolbox',
  component: 'Pane',
  requestId: 'toolbox',
  props: {
    title: 'Tools',
    isFocused: true,
    bodyColumns: 70,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('model ids read as friendly names', () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelLabel('something-else')).toBe('something-else')
})

test('the panel shows the title, model, effort, quick actions and mods', async ($, on) => {
  let model = 'claude-opus-5-5'
  const configSets: unknown[] = []
  const commands: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: model }))
  on('config.set', (_, e) => {
    configSets.push(e.value)
    model = `claude-${String(e.value)}-5-5`
    return { value: e.value }
  })
  on('command.run', (_, e) => {
    commands.push(`${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>● Clean View row</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /T O O L S/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'model:haiku' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' Opus 5.5 ' })).toMatchObject({ props: { inverse: true } })
    expect(await ui.find({ type: 'Button', key: 'effort:xhigh' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'quick:compact' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /M O D S/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Clean View row/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'model:haiku' })
  expect(configSets).toEqual(['haiku'])
  await ui.press({ key: 'effort:high' })
  expect(commands).toContain('effort high')
  expect(await ui.find({ type: 'Text', text: ' High ' })).toMatchObject({ props: { inverse: true } })
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5 · High/ })).toBeDefined()
  await ui.press({ key: 'quick:compact' })
  expect(commands).toContain('compact')
  await ui.unmount()
})
