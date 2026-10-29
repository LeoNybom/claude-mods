import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { CleanViewChecklist, CleanViewTask } from '../types'

type Engine = EngineInterface

// ---------------------------------------------------------------------------
// Names and constants
// ---------------------------------------------------------------------------

const PLAN_TOOL = 'mcp__clean-view__plan_steps'
const PROGRESS_TOOL = 'mcp__clean-view__report_progress'
const STORE_KEY = 'cleanViewEnabled'
const METER = 10
const LABEL_WIDTH = 7 // "Up next" / "Working" are the longest labels
const MAX_NAME = 40

/** Tools that may always run, even before a plan exists. */
const ALWAYS_ALLOWED = new Set([
  'ToolSearch',
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'AskUserQuestion',
  PLAN_TOOL,
  PROGRESS_TOOL,
])

const PLAN_SPEC = {
  name: 'plan_steps',
  description:
    'Lay out every step of the job up front, before any other tool: 2 to 8 short steps in order, ' +
    'each in plain English a non-technical person understands, under 40 characters, starting with a verb ' +
    '(like "Build the pricing section"). Never put file paths, file names, commands, code or tool names in a step. ' +
    'The first step starts right away.',
  inputSchema: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 8 },
    },
    required: ['steps'],
  },
  isDeferred: false,
}

const PROGRESS_SPEC = {
  name: 'report_progress',
  description:
    'Report progress on the current step of the plan: its plain-English name and a percent from 0 to 100. ' +
    'Call it as real progress happens, and with 100 the moment a step finishes; the next step then starts by itself.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string' },
      percent: { type: 'number', minimum: 0, maximum: 100 },
    },
    required: ['task', 'percent'],
  },
  isDeferred: false,
}

const PLACEHOLDERS = ['Understand your request', 'Plan the steps']

const EMPTY: CleanViewChecklist = {
  jobId: 0,
  title: '',
  phase: 'idle',
  tasks: [],
  isPlanned: false,
  needsYouReason: null,
  stuckReason: null,
  startedAt: null,
  finishedAt: null,
  isCollapsed: false,
}

const enabledAtom = atom({ plugin: 'clean-view', key: 'cleanViewEnabled' } as const, true)
const checklistAtom = atom({ plugin: 'clean-view', key: 'checklist' } as const, EMPTY)
const tickAtom = atom({ plugin: 'clean-view', key: 'tick' } as const, 0)

const REASON = {
  permission: 'Claude needs your OK to continue',
  question: 'Claude has a question for you',
  reply: 'Claude is waiting for your reply',
  saidNo: 'you said no to a step, so Claude paused',
  failing: 'a step keeps failing, Claude is trying another way',
  refusal: "Claude couldn't help with that request",
} as const

// ---------------------------------------------------------------------------
// The name cleaner: every step name and job name goes through here
// ---------------------------------------------------------------------------

const CODE_FILE =
  /\b[\w.-]+\.(tsx?|jsx?|mjs|cjs|mts|cts|py|rb|go|rs|java|kt|cs|csproj|sln|cpp|cc|c|h|hpp|json|ya?ml|toml|md|html?|css|scss|less|sh|ps1|bat|cmd|sql|xml|lock|env|ini|cfg|txt|vue|svelte|swift|php|dart|lua|r)\b/gi

/** Makes a step name plain: no code, paths or file names, at most 40 characters. */
export function cleanName(raw: unknown): string {
  let text = typeof raw === 'string' ? raw : ''
  text = text.replace(/`[^`]*`/g, ' ').replace(/`/g, ' ')
  text = text
    .split(/\s+/)
    .filter(word => !word.includes('/') && !word.includes('\\'))
    .join(' ')
  text = text.replace(CODE_FILE, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (text === '') return 'Working on it'
  text = text.charAt(0).toUpperCase() + text.slice(1)
  if (text.length > MAX_NAME) {
    const cut = text.slice(0, MAX_NAME - 1)
    const space = cut.lastIndexOf(' ')
    const head = space > 0 ? cut.slice(0, space) : cut
    text = head.replace(/[\s,.;:!?-]+$/, '') + '…'
  }
  return text
}

/** Cuts a name to fit a column, ending in "…" when it had to be cut. */
function fit(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length <= width) return text.padEnd(width)
  if (width === 1) return '…'
  return text.slice(0, width - 1) + '…'
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** One calm sentence for an API error. */
export function apiErrorSentence(kind: string | undefined, details: string | undefined): string {
  const d = (details ?? '').toLowerCase()
  if (/prompt is too long|too many tokens|context (window|length)|context.*(limit|exceed)/.test(d)) {
    return 'this chat got too long, type /compact and try again'
  }
  if (kind === 'rate_limit' || kind === 'billing_error' || /rate.?limit|usage limit/.test(d)) {
    return 'you hit your usage limit, try again a little later'
  }
  if (kind === 'overloaded' || /overloaded/.test(d)) {
    return "Claude's servers are busy, try again in a minute"
  }
  if (
    kind === 'authentication_failed' ||
    kind === 'oauth_org_not_allowed' ||
    kind === 'cloud_credential_error' ||
    /auth|login|api key|credential/.test(d)
  ) {
    return 'you need to sign in again, type /login'
  }
  if (/network|connect|econn|enotfound|socket|fetch failed|timed? ?out|offline/.test(d)) {
    return 'the internet connection dropped'
  }
  if (kind === 'server_error') return "Claude's servers are busy, try again in a minute"
  if (kind === 'unknown') return 'the internet connection dropped'
  return 'something went wrong, try again'
}

// ---------------------------------------------------------------------------
// Checklist changes (pure functions)
// ---------------------------------------------------------------------------

let nextTaskId = 1
function makeTask(name: string, status: CleanViewTask['status']): CleanViewTask {
  return { id: `t${nextTaskId++}`, name: cleanName(name), status, percent: status === 'done' ? 100 : 0, hasReported: false }
}

function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Makes sure exactly one step is active while any is unfinished. */
function ensureActive(tasks: CleanViewTask[]): CleanViewTask[] {
  if (tasks.some(t => t.status === 'active')) return tasks
  const first = tasks.findIndex(t => t.status === 'upcoming')
  if (first < 0) return tasks
  return tasks.map((t, i) => (i === first ? { ...t, status: 'active', percent: 0, hasReported: false } : t))
}

function planSteps(list: CleanViewChecklist, names: string[]): CleanViewChecklist {
  const tasks = names.map((name, i) => makeTask(name, i === 0 ? 'active' : 'upcoming'))
  return {
    ...list,
    phase: list.phase === 'idle' || list.phase === 'done' ? 'working' : list.phase,
    tasks,
    isPlanned: true,
    isCollapsed: false,
  }
}

function reportProgress(list: CleanViewChecklist, rawName: string, percent: number): CleanViewChecklist {
  const name = cleanName(rawName)
  let tasks = [...list.tasks]
  let index = tasks.findIndex(t => sameName(t.name, name))
  if (index < 0) {
    // A step not in the plan: add it right after the finished steps.
    const insertAt = tasks.filter(t => t.status === 'done').length
    tasks = tasks.map(t => (t.status === 'active' ? { ...t, status: 'upcoming' } : t))
    tasks.splice(insertAt, 0, makeTask(name, 'active'))
    index = insertAt
  }
  tasks = tasks.map((t, i) => {
    if (i < index) return t.status === 'done' ? t : { ...t, status: 'done', percent: 100 }
    if (i === index) return { ...t, status: 'active', percent, hasReported: true }
    return t.status === 'active' ? { ...t, status: 'upcoming' } : t
  })
  if (percent >= 100) {
    tasks = tasks.map((t, i) => (i === index ? { ...t, status: 'done', percent: 100 } : t))
    tasks = ensureActive(tasks)
  }
  return { ...list, tasks, isPlanned: true }
}

type Todo = { content?: unknown; status?: unknown; activeForm?: unknown }

function applyTodos(list: CleanViewChecklist, todos: unknown): CleanViewChecklist {
  if (!Array.isArray(todos)) return list
  const tasks = (todos as Todo[]).map(todo => {
    const name = cleanName(todo.content)
    const status: CleanViewTask['status'] =
      todo.status === 'completed' ? 'done' : todo.status === 'in_progress' ? 'active' : 'upcoming'
    const old = list.tasks.find(t => sameName(t.name, name))
    const percent = status === 'done' ? 100 : status === 'active' && old?.status === 'active' ? old.percent : 0
    return {
      id: old?.id ?? `t${nextTaskId++}`,
      name,
      status,
      percent,
      hasReported: status === 'active' && old?.status === 'active' ? old.hasReported : false,
    }
  })
  if (tasks.length === 0) return list
  return { ...list, tasks: ensureActive(tasks), isPlanned: true }
}

function isPlaceholderList(list: CleanViewChecklist): boolean {
  return !list.isPlanned
}

function addCreatedTask(list: CleanViewChecklist, subject: unknown, taskId: string | undefined): CleanViewChecklist {
  const base = isPlaceholderList(list) ? [] : list.tasks
  const task = makeTask(String(subject ?? ''), 'upcoming')
  if (taskId !== undefined) task.id = `task-${taskId}`
  return { ...list, tasks: ensureActive([...base, task]), isPlanned: true }
}

function applyTaskUpdate(list: CleanViewChecklist, input: Record<string, unknown>): CleanViewChecklist {
  const id = `task-${String(input.taskId ?? '')}`
  const index = list.tasks.findIndex(t => t.id === id)
  if (index < 0) return list
  let tasks = [...list.tasks]
  const task = tasks[index]!
  let next: CleanViewTask = { ...task }
  if (typeof input.subject === 'string') next.name = cleanName(input.subject)
  if (input.status === 'completed') next = { ...next, status: 'done', percent: 100 }
  if (input.status === 'in_progress') {
    tasks = tasks.map(t => (t.status === 'active' ? { ...t, status: 'upcoming' } : t))
    next = { ...next, status: 'active' }
  }
  if (input.status === 'deleted') {
    tasks.splice(index, 1)
    return { ...list, tasks: ensureActive(tasks) }
  }
  tasks[index] = next
  return { ...list, tasks: ensureActive(tasks) }
}

function newJob(jobId: number, now: number): CleanViewChecklist {
  return {
    ...EMPTY,
    jobId,
    title: 'Working on your request',
    phase: 'working',
    tasks: PLACEHOLDERS.map((name, i) => makeTask(name, i === 0 ? 'active' : 'upcoming')),
    startedAt: now,
  }
}

// ---------------------------------------------------------------------------
// The mod
// ---------------------------------------------------------------------------

// Module variables reset on a reload; everything shown lives in $.state.
let ticker: { cancel: () => void } | undefined
let hasToolbox = false

/** True once the Tools box (the Toolbox mod) is found among the commands. */
async function checkToolbox($: Engine): Promise<boolean> {
  if (!hasToolbox) hasToolbox = (await $.command.list()).some(c => c.name === 'toolbox')
  return hasToolbox
}
let collapseTimer: { cancel: () => void } | undefined
let failuresInARow = 0
let lastApiError: string | undefined
let toolsRegistered = false

/** Gives Claude its two tools. Only done while Clean View is on, so they cost no tokens while it is off. */
async function registerTools($: Engine): Promise<void> {
  if (toolsRegistered) return
  await $.tool.register(PLAN_SPEC)
  await $.tool.register(PROGRESS_SPEC)
  toolsRegistered = true
}

/** Runs the 250ms clock only while a job is working or waiting on you. */
function syncTicker($: Engine, list: CleanViewChecklist): void {
  const isLive = list.phase === 'working' || list.phase === 'needs-you'
  if (isLive && ticker === undefined) {
    ticker = $.clock.every(250, () => {
      void update($, tickAtom, n => (n ?? 0) + 1)
    })
  } else if (!isLive && ticker !== undefined) {
    ticker.cancel()
    ticker = undefined
  }
}

async function change($: Engine, fn: (list: CleanViewChecklist) => CleanViewChecklist): Promise<void> {
  await update($, checklistAtom, list => fn(list ?? EMPTY))
  syncTicker($, await read($, checklistAtom))
}

async function setEnabled($: Engine, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_KEY, value)
  if (value) await registerTools($)
  // Asks the tool.describe hook again: the two tools come back in front, or wait behind ToolSearch.
  $.ui.invalidate('tool.describe')
  $.ui.toast(value ? 'Clean View is on: tool rows are hidden.' : 'Clean View is off: everything is shown again.')
}

async function toggle($: Engine): Promise<void> {
  await setEnabled($, !(await read($, enabledAtom)))
}

async function finishJob($: Engine): Promise<void> {
  const now = await $.clock.now()
  let jobId = 0
  await change($, list => {
    jobId = list.jobId
    return {
      ...list,
      phase: 'done',
      tasks: list.tasks.map(t => ({ ...t, status: 'done', percent: 100 })),
      needsYouReason: null,
      stuckReason: null,
      finishedAt: now,
      isCollapsed: false,
    }
  })
  collapseTimer?.cancel()
  collapseTimer = $.clock.after(5000, () => {
    void change($, list => (list.jobId === jobId && list.phase === 'done' ? { ...list, isCollapsed: true } : list))
  })
}

async function nameJob($: Engine, jobId: number, request: string): Promise<void> {
  const reply = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 30,
    timeoutMs: 20000,
    prompt:
      'Give this job a name of 2 to 6 plain words that starts with a verb, ' +
      'for a person who is not technical. No file names, no code, no punctuation. ' +
      'Reply with the name only.\n\nRequest:\n' +
      request.slice(0, 2000),
  })
  if (!reply.isAnswered) return
  const firstLine = reply.text.split('\n')[0] ?? ''
  const title = cleanName(firstLine.replace(/["'*.]/g, ''))
  await change($, list => (list.jobId === jobId ? { ...list, title } : list))
}

export function registerCleanView(on: On): void {
  // --- Session start: tools, command, saved setting, timers after a reload ---
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'simple',
      description: 'Turn Clean View on or off (no argument flips it)',
      argumentHint: 'on|off',
    })
    // Always written, so the Tools box knows Clean View is installed.
    const saved = await $.store.get(STORE_KEY)
    const enabled = typeof saved === 'boolean' ? saved : true
    await update($, enabledAtom, () => enabled)
    if (enabled) {
      await registerTools($)
      // A resumed chat keeps the placement it recorded, so ask again.
      $.ui.invalidate('tool.describe')
    }
    syncTicker($, await read($, checklistAtom))
    return next(e)
  })

  // --- Tools registered earlier stay, so while off they wait behind ToolSearch ---
  for (const tool of [PLAN_TOOL, PROGRESS_TOOL]) {
    on('tool.describe', { tool }, async ($, e, next) => {
      const described = await next(e)
      return (await read($, enabledAtom)) ? described : { ...described, isDeferred: true }
    })
  }

  // --- The /simple command ---
  on('command.run', { command: 'simple' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const value = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabledAtom))
    await setEnabled($, value)
    return { text: value ? 'Clean View is on.' : 'Clean View is off.' }
  })

  // --- Make Claude plan in plain words ---
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, enabledAtom))) return composed
    const hasTodos = e.tools.includes('TodoWrite') || e.tools.includes('TaskCreate')
    const text = [
      '# Clean View',
      'The person sees a simple checklist of your plan instead of tool calls. Keep it accurate and friendly:',
      `- For every request, even a quick question, call \`${PLAN_TOOL}\` first, before any other tool. If it is deferred, load it with ToolSearch.`,
      `- Then call \`${PROGRESS_TOOL}\` as real progress happens, and with 100 the moment a step finishes.`,
      '- Write every step name in plain English a non-technical person understands. Keep it under 40 characters and start it with a verb, like "Build the pricing section".',
      '- Never put file paths, file names, commands, code or tool names in a step name.',
      hasTodos
        ? '- You may use your to-do list (TodoWrite or TaskCreate) as the plan instead; the same naming rules apply.'
        : '',
    ]
      .filter(Boolean)
      .join('\n')
    return {
      ...composed,
      sections: [...composed.sections, { id: 'clean-view:plan', text, scope: 'session' as const }],
    }
  })

  // --- A new job starts with a real prompt ---
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const text = e.text.trim()
    const isCommand = text.startsWith('/') || text.includes('<command-name>')
    const list = await read($, checklistAtom)
    if (text !== '' && !isCommand) {
      if (list.phase === 'needs-you') {
        // Your reply continues the job that was waiting on you.
        await change($, l => ({ ...l, phase: 'working', needsYouReason: null }))
      } else {
        const jobId = list.jobId + 1
        const now = await $.clock.now()
        failuresInARow = 0
        lastApiError = undefined
        collapseTimer?.cancel()
        await change($, () => newJob(jobId, now))
        // Ask Haiku for a name outside this hook, so the turn never waits.
        // Only while on: the name shows nowhere else, and the call costs tokens.
        if (await read($, enabledAtom)) {
          $.clock.after(0, () => {
            void nameJob($, jobId, text).catch(() => undefined)
          })
        }
      }
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const list = await read($, checklistAtom)
    if (list.phase === 'needs-you' && list.needsYouReason !== REASON.reply) {
      await change($, l => ({ ...l, phase: 'working', needsYouReason: null }))
    }
    return next(e)
  })

  // --- Claude's own two tools ---
  on('tool.call', { tool: PLAN_TOOL }, async ($, e) => {
    const input = e as unknown as { steps?: unknown }
    const raw = Array.isArray(input.steps) ? input.steps : []
    const names = raw.map(cleanName).slice(0, 8)
    if (names.length === 0) return { deny: 'plan_steps needs at least one step name.' }
    await change($, list => planSteps(list.phase === 'idle' ? { ...list, title: list.title || 'Working on your request' } : list, names))
    return { result: `Planned ${names.length} steps. The first one has started.` }
  })

  on('tool.call', { tool: PROGRESS_TOOL }, async ($, e) => {
    const input = e as unknown as { task?: unknown; percent?: unknown }
    const percent = clampPercent(input.percent)
    await change($, list => reportProgress(list, String(input.task ?? ''), percent))
    return { result: `Progress noted: ${percent}%.` }
  })

  // --- Plan first, track to-do lists, Needs you and Stuck ---
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const tool = String(e.tool)
    if (tool === PLAN_TOOL || tool === PROGRESS_TOOL) return next(e)

    const enabled = await read($, enabledAtom)
    const list = await read($, checklistAtom)
    if (enabled && !list.isPlanned && !ALWAYS_ALLOWED.has(tool)) {
      return {
        deny:
          `Clean View: call ${PLAN_TOOL} first to lay out the plan in plain words ` +
          '(load it with ToolSearch if it is deferred), then try this again.',
      }
    }

    const isQuestion = tool === 'AskUserQuestion'
    if (isQuestion) {
      await change($, l => (l.phase === 'idle' ? l : { ...l, phase: 'needs-you', needsYouReason: REASON.question }))
    } else if (list.phase === 'needs-you') {
      await change($, l => ({ ...l, phase: 'working', needsYouReason: null }))
    }

    const ran = await next(e)

    if (isQuestion) {
      await change($, l => (l.phase === 'needs-you' ? { ...l, phase: 'working', needsYouReason: null } : l))
    }
    if (ran.deny !== undefined) return ran

    const input = e as unknown as Record<string, unknown>
    if (ran.isError !== true) {
      if (tool === 'TodoWrite') await change($, l => applyTodos(l, input.todos))
      if (tool === 'TaskCreate') {
        const found = /#?(\d+)/.exec(ran.text ?? '')
        await change($, l => addCreatedTask(l, input.subject, found?.[1]))
      }
      if (tool === 'TaskUpdate') await change($, l => applyTaskUpdate(l, input))
    }

    if (ran.isError === true) {
      const said = (ran.text ?? '').toLowerCase()
      if (/doesn't want to proceed|does not want to proceed|user rejected|rejected by the user|user denied|permission denied by user/.test(said)) {
        await change($, l => ({ ...l, phase: 'stuck', stuckReason: REASON.saidNo, needsYouReason: null }))
      } else {
        failuresInARow += 1
        if (failuresInARow >= 3) {
          await change($, l => ({ ...l, phase: 'stuck', stuckReason: REASON.failing, needsYouReason: null }))
        }
      }
    } else {
      failuresInARow = 0
      const now = await read($, checklistAtom)
      if (now.phase === 'stuck') await change($, l => ({ ...l, phase: 'working', stuckReason: null }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // --- Permission prompts ---
  on('classic.Notification', async ($, e, next) => {
    const kind = String(e.notification_type ?? '')
    const isAsking = kind === 'permission_prompt' || kind === 'elicitation_dialog' || /permission/i.test(e.message ?? '')
    if (isAsking) {
      const list = await read($, checklistAtom)
      if (list.phase !== 'idle') {
        await change($, l => ({ ...l, phase: 'needs-you', needsYouReason: REASON.permission }))
      }
    }
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await change($, l => (l.phase === 'idle' ? l : { ...l, phase: 'stuck', stuckReason: REASON.saidNo, needsYouReason: null }))
    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    lastApiError = apiErrorSentence(e.error, e.error_details)
    await change($, l => (l.phase === 'idle' ? l : { ...l, phase: 'stuck', stuckReason: lastApiError ?? null, needsYouReason: null }))
    return next(e)
  })

  // --- The end of a turn ---
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const list = await read($, checklistAtom)
    if (list.phase === 'idle') return result

    if (e.reason === 'error') {
      const reason = lastApiError ?? 'something went wrong, try again'
      await change($, l => ({ ...l, phase: 'stuck', stuckReason: reason, needsYouReason: null }))
    } else if (e.reason === 'refusal') {
      await change($, l => ({ ...l, phase: 'stuck', stuckReason: REASON.refusal, needsYouReason: null }))
    } else if (e.reason === 'aborted' || e.isAborted) {
      await change($, l => ({ ...l, phase: 'stopped', needsYouReason: null }))
    } else if (list.phase === 'stuck' && list.stuckReason === REASON.saidNo) {
      // Keep showing that Claude paused because you said no.
    } else if (list.isPlanned && list.tasks.some(t => t.status !== 'done')) {
      await change($, l => ({ ...l, phase: 'needs-you', needsYouReason: REASON.reply, stuckReason: null }))
    } else {
      await finishJob($)
    }
    lastApiError = undefined
    return result
  })

  // --- Hide the technical rows (ctrl+o still shows everything) ---
  for (const component of ['ToolUse', 'ToolResult', 'ToolGroup'] as const) {
    on('ui.render', { component }, async ($, e, next) => {
      const props = e.props as { isExpanded?: boolean }
      if (props.isExpanded === true || !(await read($, enabledAtom))) return next(e)
      const { Box } = $.ui.resolve(e)
      return <Box display="none" />
    })
  }

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, enabledAtom))) return next(e)
    return next({ ...e, props: { ...e.props, hint: '' } })
  })

  // --- Its row in the Tools box (the Toolbox mod) ---
  on('ui.press', { plugin: 'toolbox', element: 'mod:clean-view' }, async ($, e, next) => {
    await toggle($)
    return next(e)
  })

  // --- The checklist band above the prompt, shared with the other mods ---
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey) return rest
    const { Box } = $.ui.resolve(e)
    const mine = await drawBand($, e)
    if (mine === null) return rest
    return (
      <Box flexDirection="column">
        {mine}
        {rest ?? null}
      </Box>
    )
  })
}

/** Clean View's own part of the band: the button, and the checklist while a job runs. */
async function drawBand($: Engine, e: RenderInput<'AbovePrompt'>): Promise<unknown> {
  {
    const { Box, Text, Button } = $.ui.resolve(e)
    const enabled = await read($, enabledAtom)
    const columns = Math.max(20, e.props.bodyColumns)
    // With the Tools box installed, its row is the switch, so this button stays away.
    const showButton = !(await checkToolbox($))
    const label = enabled ? '● Clean View: ON' : '○ Clean View: OFF'
    const button = showButton ? (
      <Button key="clean-view-toggle" label={label} variant={enabled ? 'primary' : 'secondary'} onPress={() => toggle($)} />
    ) : null
    const headerWidth = Math.max(0, columns - (showButton ? label.length + 4 : 0) - 1)

    const list = await read($, checklistAtom)
    if (!enabled || list.phase === 'idle') {
      if (!showButton) return null
      return (
        <Box flexDirection="row" justifyContent="flex-end">
          {button}
        </Box>
      )
    }

    const isLive = list.phase === 'working' || list.phase === 'needs-you'
    const tick = isLive ? await read($, tickAtom) : 0
    const now = await $.clock.now()
    const started = list.startedAt ?? now
    const elapsed = formatDuration((list.finishedAt ?? now) - started)

    let header: unknown
    if (list.phase === 'needs-you') {
      header = (
        <Box flexDirection="row">
          <Text bold inverse color="warning">
            {' Needs you '}
          </Text>
          <Text wrap="truncate-end"> {fit(list.needsYouReason ?? REASON.reply, Math.max(0, headerWidth - 12)).trimEnd()}</Text>
        </Box>
      )
    } else if (list.phase === 'stuck') {
      header = (
        <Text color="warning" wrap="truncate-end">
          {fit(`⚠ Stuck: ${list.stuckReason ?? 'something went wrong'}`, headerWidth).trimEnd()}
        </Text>
      )
    } else if (list.phase === 'stopped') {
      header = <Text wrap="truncate-end">{fit(`■ Stopped · ${list.title} · you pressed Esc`, headerWidth).trimEnd()}</Text>
    } else if (list.phase === 'done') {
      header = (
        <Text color="success" wrap="truncate-end">
          {fit(`✓ All done · ${list.title} · took ${elapsed}`, headerWidth).trimEnd()}
        </Text>
      )
    } else {
      header = (
        <Text bold wrap="truncate-end">
          {fit(`${list.title} · ${elapsed}`, headerWidth).trimEnd()}
        </Text>
      )
    }

    const headerRow = (
      <Box flexDirection="row" justifyContent="space-between">
        {header}
        {button}
      </Box>
    )
    if (list.phase === 'done' && list.isCollapsed) return headerRow

    // icon(1) + space + name + space + meter(10) + space + label(7)
    // As wide as the longest step name, so the meter sits right after the names,
    // and never wider than the band has room for.
    const longest = Math.max(4, ...list.tasks.map(t => t.name.length))
    const nameWidth = Math.max(4, Math.min(longest, columns - (2 + 1 + METER + 1 + LABEL_WIDTH)))
    let upcomingSeen = 0
    const rows = list.tasks.map(task => {
      if (task.status === 'done') {
        return (
          <Box flexDirection="row">
            <Text color="success">✓ </Text>
            <Text dimColor>{fit(task.name, nameWidth)} </Text>
            <Text color="success">{'█'.repeat(METER)}</Text>
            <Text dimColor> Done</Text>
          </Box>
        )
      }
      if (task.status === 'active') {
        const paused = list.phase === 'needs-you'
        let meter: string
        let tag: string
        if (task.hasReported) {
          const filled = Math.round(task.percent / 10)
          meter = '█'.repeat(filled) + '░'.repeat(METER - filled)
          tag = `${task.percent}%`
        } else {
          const at = tick % METER
          meter = Array.from({ length: METER }, (_, i) => ((i - at + METER) % METER < 3 ? '▓' : '░')).join('')
          tag = 'Working'
        }
        return (
          <Box flexDirection="row">
            <Text color="claude">{paused ? '‖ ' : '▶ '}</Text>
            <Text bold>{fit(task.name, nameWidth)} </Text>
            <Text color="claude">{meter}</Text>
            <Text> {tag}</Text>
          </Box>
        )
      }
      upcomingSeen += 1
      return (
        <Box flexDirection="row">
          <Text dimColor>○ </Text>
          <Text dimColor>{fit(task.name, nameWidth)} </Text>
          <Text dimColor>{'░'.repeat(METER)}</Text>
          <Text dimColor> {upcomingSeen === 1 ? 'Next' : 'Up next'}</Text>
        </Box>
      )
    })

    return (
      <Box flexDirection="column">
        {headerRow}
        {rows}
      </Box>
    )
  }
}
