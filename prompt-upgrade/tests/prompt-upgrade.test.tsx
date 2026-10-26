import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bigNumber, parseQuestions, parseRewrite, routeSubmission } from '../hooks/logic'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const PANE = {
  plugin: 'prompt-upgrade',
  component: 'Pane',
  requestId: 'prompt-upgrade',
  props: {
    title: 'Prompt Upgrade',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const QUESTIONS_REPLY = JSON.stringify({
  questions: [
    { question: 'Who is the page for?', options: ['Local families', 'Office workers'] },
    { question: 'What should visitors do?', options: ['Order online', 'Visit the shop', 'Call us'] },
  ],
})

const REWRITE_REPLY = JSON.stringify({
  prompt: 'Build a landing page for my bakery [name] aimed at local families. The main goal is online orders.',
  added: ['A clear goal', 'Who it is for'],
})

type Log = { submitted: { text: string; asUser?: boolean }[]; filled: string[]; modelCalls: number; isOpen: boolean }

function engine(on: On, replies: string[], log: Log) {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000 })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => {
    log.isOpen = true
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: log.isOpen ? [{ id: 'prompt-upgrade', title: 'Prompt Upgrade', isShown: true, isFocused: true, isPlaced: true }] : [],
  }))
  on('ui.close', () => {
    log.isOpen = false
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('prompt.fill', (_, e) => {
    log.filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: 0 }
  })
  on('prompt.submit', (_, e) => {
    log.submitted.push({ text: e.text, asUser: (e as { asUser?: boolean }).asUser })
    return { text: e.text }
  })
  on('model.complete', () => {
    const text = replies[log.modelCalls] ?? ''
    log.modelCalls += 1
    return text === ''
      ? { value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }
      : { value: { isAnswered: true, text, usage: USAGE } }
  })
  return clock
}

function newLog(): Log {
  return { submitted: [], filled: [], modelCalls: 0, isOpen: false }
}

const typed = (text: string, extra: Partial<Parameters<typeof routeSubmission>[0]> = {}) =>
  routeSubmission({
    text,
    hasCommand: false,
    isMeta: false,
    hasAttachments: false,
    isDuringTurn: false,
    originKind: 'composer',
    ...extra,
  }).kind

test('which prompts are caught and which pass through', () => {
  expect(typed('build me a landing page for my bakery')).toBe('upgrade')
  expect(typed('/compact')).toBe('pass')
  expect(typed('fix the header', { hasCommand: true })).toBe('pass')
  expect(typed('look at this picture please', { hasAttachments: true })).toBe('pass')
  expect(typed('also add a footer to it', { isDuringTurn: true })).toBe('pass')
  expect(typed('yes')).toBe('pass')
  expect(typed('keep going')).toBe('pass')
  expect(typed('Sounds good!')).toBe('pass')
  expect(typed('a message from the plugin itself', { originKind: 'plugin' })).toBe('pass')
  expect(routeSubmission({ text: '> send this exactly as it is', hasCommand: false, isMeta: false, hasAttachments: false, isDuringTurn: false, originKind: 'composer' })).toEqual({
    kind: 'strip',
    text: 'send this exactly as it is',
  })
})

test('reading the questions and the rewrite', () => {
  const questions = parseQuestions('Here you go: ' + QUESTIONS_REPLY)
  expect(questions).toHaveLength(2)
  expect(questions?.[1]?.options).toEqual(['Order online', 'Visit the shop', 'Call us'])
  expect(parseQuestions('{"questions":[]}')).toEqual([])
  expect(parseQuestions('{"questions":[{"question":"Only one option?","options":["a"]}]}')).toEqual([])
  expect(parseQuestions('not json at all')).toBeUndefined()

  const rewrite = parseRewrite(REWRITE_REPLY)
  expect(rewrite?.upgraded).toContain('[name]')
  expect(rewrite?.added).toEqual(['A clear goal', 'Who it is for'])
  expect(parseRewrite('{"prompt":""}')).toBeUndefined()

  expect(bigNumber(12)).toEqual(['╺┓  ╺━┓', ' ┃  ┏━┛', '╺┻╸ ┗━╸'])
})

test('the full flow: /better, two answers, review, Run', async ($, on) => {
  const log = newLog()
  const clock = engine(on, [QUESTIONS_REPLY, REWRITE_REPLY], log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const answer = await $.command.run({ command: 'better', args: 'make a page for my bakery', ...RUN })
  expect(answer.text).toMatch(/Upgrading/)
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'PROMPT UPGRADE' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Who is the page for\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 of 2 answered/ })).toBeDefined()
    expect(await ui.find({ key: 'q0:other' })).toBeDefined()
    expect(await ui.find({ key: 'skip-rest' })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'q0:o0' })
  expect(await ui.find({ type: 'Text', text: /1 of 2 answered/ })).toBeDefined()
  await ui.press({ key: 'q1:o0' })
  await clock.settle()
  expect(log.modelCalls).toBe(2)
  expect(await ui.find({ key: 'run' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[name\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /A clear goal/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /details added/ })).toBeDefined()

  await ui.unmount()

  // The review draws at a narrow and a wide width, on both surfaces.
  for (const bodyColumns of [40, 160]) {
    for (const surface of ['terminal', 'desktop'] as const) {
      const sized = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
      expect(await sized.find({ key: 'run' })).toBeDefined()
      expect(await sized.find({ type: 'Text', text: /THE UPGRADE/ })).toBeDefined()
      await sized.unmount()
    }
  }

  const review = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await review.press({ key: 'run' })
  expect(log.submitted).toHaveLength(1)
  expect(log.submitted[0]?.text).toContain('local families')
  expect(log.isOpen).toBe(false)
  await review.unmount()
})

test('Cancel puts the original prompt back in the prompt box', async ($, on) => {
  const log = newLog()
  const clock = engine(on, [QUESTIONS_REPLY], log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'better', args: 'write a short story about a fox', ...RUN })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'cancel' })
  expect(log.filled).toEqual(['write a short story about a fox'])
  expect(log.submitted).toHaveLength(0)
  expect(log.isOpen).toBe(false)
  await ui.unmount()
})

test('a failed model call shows a calm error card with Try again', async ($, on) => {
  const log = newLog()
  const clock = engine(on, ['', QUESTIONS_REPLY], log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'better', args: 'plan a birthday party for my son', ...RUN })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Your prompt is safe/ })).toBeDefined()
  expect(await ui.find({ key: 'send-original' })).toBeDefined()
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: /Who is the page for\?/ })).toBeDefined()
  await ui.unmount()
})

test('the on and off switch', async ($, on) => {
  const log = newLog()
  const clock = engine(on, [QUESTIONS_REPLY], log)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const prompt = (text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false } as never)

  // Off at the start: a typed prompt goes straight through.
  await prompt('build me a landing page for my bakery')
  expect(log.submitted.map(s => s.text)).toEqual(['build me a landing page for my bakery'])

  await $.command.run({ command: 'better', args: 'on', ...RUN })
  const caught = await prompt('build me a landing page for my bakery')
  expect(caught.drop).toBeDefined()
  expect(log.submitted).toHaveLength(1)
  await clock.settle()
  expect(log.isOpen).toBe(true)

  await prompt('> send this one exactly as it is')
  expect(log.submitted.map(s => s.text)).toContain('send this one exactly as it is')

  await $.command.run({ command: 'better', args: 'off', ...RUN })
  await prompt('write a poem about the sea')
  expect(log.submitted.map(s => s.text)).toContain('write a poem about the sea')
})
