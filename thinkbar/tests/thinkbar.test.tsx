import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { barText, creep, estimate, listOf, phaseOf } from '../hooks/thinkbar'
import type { Run } from '../types'

const PLUGIN = 'thinkbar'
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 100 } as never } as const

// What the model streams in each step of a test.
let streamed: unknown[] = []

async function session($: Engine, on: On, stored: Record<string, unknown> = {}) {
  streamed = []
  const clock = mock.clock(on, { now: Date.parse('2026-11-02T10:00:00Z') })
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('turn.start', (_$, e) => ({ turnId: (e as { turnId: string }).turnId }) as never)
  mock.store(on, stored)
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('ui.press', () => ({}) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('turn.step', async function* () {
    for (const chunk of streamed) yield chunk as never
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'tool_use', usage: null } as never
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  return clock
}

const start = ($: Engine, turnId = 't1') => ($.turn.start as (e: unknown) => Promise<unknown>)({ text: 'fix it', turnId })
const complete = ($: Engine, reason = 'answer') =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ turnId: 't1', reason, answer: 'ok', durationMs: 10, isAborted: reason === 'aborted' })
const step = async ($: Engine) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of stream) void _
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: nothing shows before a prompt`, async ($, on) => {
    await session($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...BAND })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeUndefined()
    await ui.unmount()
  })
}

test('terminal: a prompt shows the bar as text, with the phase', async ($, on) => {
  await session($, on)
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Reading/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('desktop: the bar is one Svg, without crabs', async ($, on) => {
  await session($, on)
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  const source = String((svg?.props as { source?: string }).source)
  expect(source).toContain('#8f8cf4')
  expect(source).toContain('Thinking')
  expect(source).not.toContain('c-other')
  await ui.unmount()
})

test("the bar follows Claude's task list", async ($, on) => {
  await session($, on)
  await start($)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ status: 'completed' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }] } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /^2\/4$/ })).toBeDefined()
  await ui.unmount()
})

test('the answer fills the bar, and it leaves a few seconds later', async ($, on) => {
  const clock = await session($, on)
  await start($)
  await step($)
  await complete($)
  let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /✓ Done/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /100%/ })).toBeDefined()
  await ui.unmount()

  await clock.advance(7000)
  ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Done/ })).toBeUndefined()
  await ui.unmount()
})

test('writing the answer moves the bar by the text streamed, up to 95%', () => {
  const writing = run({ phase: 'writing', ratio: 0.04 })
  // A short line before a tool call barely moves it; a long answer takes it far.
  expect(creep(writing, 100).ratio).toBeLessThan(0.15)
  const long = creep(creep(writing, 1500), 1500)
  expect(long.ratio).toBeGreaterThan(0.8)
  expect(long.ratio).toBeLessThan(0.95)
  // While thinking, text streamed does nothing and the ceiling is a third.
  expect(creep(run({ ratio: 0.04 }), 1500).ratio).toBeLessThan(0.06)
  // With steps still to come it stays under the next one.
  expect(creep(run({ phase: 'writing', total: 3, done: 0, ratio: 0.04, listBase: 0.04 }), 5000).ratio).toBeLessThan(0.35)
})

test('the bar says Writing while the answer streams', async ($, on) => {
  await session($, on)
  await start($)
  streamed = [{ kind: 'thinking', index: 0, text: 'hmm' }]
  await step($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeDefined()
  streamed = [{ kind: 'thinking', index: 0, text: 'hmm' }, { kind: 'text', index: 1, text: 'Here is' }, { kind: 'text', index: 1, text: ' the answer' }]
  await step($)
  expect(await ui.find({ type: 'Text', text: /Writing/ })).toBeDefined()
  // A line, then a tool call: the bar leaves Writing as the call starts.
  streamed = [{ kind: 'text', index: 0, text: 'Let me check.' }, { kind: 'tool', index: 1, id: 'tu1', name: 'Grep' }]
  await step($)
  expect(await ui.find({ type: 'Text', text: /Reading/ })).toBeDefined()
  await ui.unmount()
})

test("a subagent's tool calls don't move the bar", async ($, on) => {
  await session($, on)
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/a', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeDefined()
  await ui.unmount()
})


const run = (over: Partial<Run> = {}): Run => ({ turnId: 't', phase: 'thinking', steps: 0, total: 0, done: 0, ratio: 0, isFinished: false, ...over })

test('between events the bar creeps on, slower and slower, never to its ceiling', () => {
  let r = run({ ratio: 0.04 })
  r = creep(r)
  expect(r.ratio).toBeGreaterThan(0.04)
  for (let i = 0; i < 3600; i++) r = creep(r)
  expect(r.ratio).toBeLessThan(1 / 3)
  expect(r.ratio).toBeGreaterThan(0.3)
  // With a task list it stays under the next step.
  let listed = run({ total: 4, done: 1, ratio: 0.2375 })
  for (let i = 0; i < 3600; i++) listed = creep(listed)
  expect(listed.ratio).toBeLessThan(0.475)
  expect(creep(run({ isFinished: true, ratio: 1 })).ratio).toBe(1)
  // A list made late starts from where the bar is, and still moves.
  expect(creep(run({ total: 4, done: 0, ratio: 0.6, listBase: 0.6 })).ratio).toBeGreaterThan(0.6)
})

test('a task list that comes late shares the rest of the bar evenly, with a jump at each step', async ($, on) => {
  const clock = await session($, on)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const percent = async () => Number(/(\d+)%$/.exec(String(((await ui.find({ type: 'Svg' }))?.props as { alt?: string }).alt))?.[1])
  const todos = (done: number) => ({ tool: 'TodoWrite', todos: [0, 1, 2].map(i => ({ status: i < done ? 'completed' : 'pending' })) }) as never
  await $.tool.call(todos(0))
  const atStart = await percent()
  expect(atStart).toBe(25)
  await clock.advance(5000)
  const creptInStep1 = await percent()
  expect(creptInStep1).toBeGreaterThan(atStart)
  await $.tool.call(todos(1))
  // Each step is a third of what was left: 25% + 70% / 3.
  expect(await percent()).toBe(48)
  await $.tool.call(todos(2))
  expect(await percent()).toBe(72)
  await ui.unmount()
})

test('with a task list the bar keeps creeping while Claude runs commands', async ($, on) => {
  const clock = await session($, on)
  await start($)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ status: 'in_progress' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }] } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
  const percent = async () => Number(/(\d+)%$/.exec(String(((await ui.find({ type: 'Svg' }))?.props as { alt?: string }).alt))?.[1])
  const before = await percent()
  expect(before).toBeLessThan(24)
  await clock.advance(10_000)
  const after = await percent()
  expect(after).toBeGreaterThan(before)
  expect(after).toBeLessThan(24)
  await ui.unmount()
})

test('the bar moves while Claude thinks, and stops at the answer', async ($, on) => {
  const clock = await session($, on)
  const shown = async () => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', ...BAND })
    const alt = String(((await ui.find({ type: 'Svg' }))?.props as { alt?: string }).alt)
    await ui.unmount()
    return Number(/(\d+)%$/.exec(alt)?.[1])
  }
  await start($)
  expect(await shown()).toBe(4)
  await clock.advance(20_000)
  const moved = await shown()
  expect(moved).toBeGreaterThan(4)
  expect(moved).toBeLessThan(30)
  await complete($, 'aborted')
  await clock.advance(3000)
  expect(await shown()).toBe(moved)
})

test('the estimate never goes back and waits under a third for the answer, without a list', () => {
  expect(estimate(run({ ratio: 0.5, phase: 'reading' }))).toBe(0.5)
  expect(estimate(run({ steps: 200, phase: 'running' }))).toBeLessThanOrEqual(1 / 3)
  expect(estimate(run({ isFinished: true }))).toBe(1)
  expect(estimate(run({ total: 4, done: 2 }))).toBe(0.475)
})

test('tools map to phases and task lists', () => {
  expect(phaseOf('Grep')).toBe('reading')
  expect(phaseOf('Write')).toBe('editing')
  expect(phaseOf('PowerShell')).toBe('running')
  expect(phaseOf('mcp__ccd_turn__wrap_up')).toBeUndefined()
  expect(listOf('mcp__ccd_turn__update_plan', { items: [{ status: 'completed' }, { status: 'pending' }] }, { total: 0, done: 0 })).toEqual({ total: 2, done: 1 })
  expect(listOf('mcp__ccd_turn__update_plan', { advance: true }, { total: 3, done: 1 })).toEqual({ total: 3, done: 2 })
})

test('the terminal bar is as wide as asked', () => {
  const { filled, rest } = barText(run({ ratio: 0.5 }), 20)
  expect([...filled].length + rest.length).toBe(20)
})

test('turned off (from the Tools box), the bar stays hidden', async ($, on) => {
  await session($, on, { enabled: false })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Thinking/ })).toBeUndefined()
  await ui.unmount()
})
