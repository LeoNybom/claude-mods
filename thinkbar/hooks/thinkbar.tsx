import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren, RenderInput } from 'claude-code'

import type { Phase, Run } from '../types'

// On/off, saved with $.store. Always written at start, so the Tools box knows
// the mod is installed and gives it a row.
const enabledAtom = atom({ plugin: 'thinkbar', key: 'enabled' } as const, true)
const runAtom = atom({ plugin: 'thinkbar', key: 'run' } as const, null)
const STORE_KEY = 'enabled'

const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'
const STOPPED = '#9a9a96'
// The terminal takes color names, so they follow the terminal's own theme.
const ANSI_ACCENT = 'magenta'
const ANSI_DONE = 'green'

// How long a finished bar stays before it leaves.
const LINGER_MS = 6000

const PHASE_WORD: Record<Phase, string> = {
  thinking: 'Thinking',
  reading: 'Reading',
  editing: 'Editing',
  running: 'Running',
  delegating: 'Delegating',
  done: 'Done',
  stopped: 'Stopped',
}

// Where each phase puts the bar at the least, when Claude keeps no task list.
const FLOOR: Record<Phase, number> = {
  thinking: 0.04,
  reading: 0.2,
  delegating: 0.3,
  editing: 0.45,
  running: 0.6,
  done: 1,
  stopped: 0,
}

// Claude can't know how long it will take, so without a task list the bar is an
// estimate: each step moves it on a little less, and it waits under 90% for the end.
const CAP = 0.9

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'LS', 'NotebookRead'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const RUN_TOOLS = new Set(['Bash', 'PowerShell', 'BashOutput'])
const AGENT_TOOLS = new Set(['Agent', 'Task'])

/** The phase a tool call puts Claude in, or undefined when it says nothing new. */
export function phaseOf(tool: string): Phase | undefined {
  if (READ_TOOLS.has(tool)) return 'reading'
  if (EDIT_TOOLS.has(tool)) return 'editing'
  if (RUN_TOOLS.has(tool)) return 'running'
  if (AGENT_TOOLS.has(tool)) return 'delegating'
  if (/^mcp__.*(browser|navigate|read_page|get_page_text|find)/i.test(tool)) return 'reading'
  return undefined
}

type Item = { status?: unknown }
const isDone = (i: Item): boolean => i.status === 'completed'

/** A task list Claude keeps (TodoWrite, the app's plan, Tasks): its size and how much is done. */
export function listOf(tool: string, input: Record<string, unknown>, prev: { total: number; done: number }): { total: number; done: number } | undefined {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const items = input.todos as Item[]
    return { total: items.length, done: items.filter(isDone).length }
  }
  if (/update_plan$/.test(tool)) {
    if (Array.isArray(input.items)) {
      const items = input.items as Item[]
      return { total: items.length, done: items.filter(isDone).length }
    }
    if (prev.total === 0) return undefined
    if (input.advance === true) return { total: prev.total, done: Math.min(prev.total, prev.done + 1) }
    if (Array.isArray(input.done)) return { total: prev.total, done: Math.min(prev.total, prev.done + input.done.length) }
    return undefined
  }
  if (tool === 'TaskCreate') return { total: prev.total + 1, done: prev.done }
  if (tool === 'TaskUpdate' && input.status === 'completed') return { total: prev.total, done: Math.min(prev.total, prev.done + 1) }
  return undefined
}

/** Where the bar should be now: never back, and under the cap until the answer. */
export function estimate(r: Run): number {
  if (r.isFinished) return 1
  const byList = r.total > 0 ? (r.done / r.total) * 0.95 : 0
  const bySteps = CAP * (1 - Math.pow(0.88, r.steps))
  const guess = Math.max(FLOOR[r.phase], r.total > 0 ? byList : bySteps)
  return Math.max(r.ratio, Math.min(r.total > 0 ? 0.95 : CAP, guess))
}

const fresh = (turnId: string): Run => ({ turnId, phase: 'thinking', steps: 0, total: 0, done: 0, ratio: FLOOR.thinking, isFinished: false })

const advance = (r: Run, change: Partial<Run>): Run => {
  const next = { ...r, ...change }
  return { ...next, ratio: estimate(next) }
}

/** The word in the pill: the step when there is a task list, else what Claude is doing. */
export function pillOf(r: Run): string {
  if (r.isFinished) return PHASE_WORD[r.phase]
  if (r.total > 0) return `step ${Math.min(r.total, r.done + 1)} of ${r.total}`
  return PHASE_WORD[r.phase]
}

// ---------------------------------------------------------------------------
// Desktop: the whole row is one SVG, since the app wraps sibling elements.

const H = 22
const BAR_H = 16
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

// Fixed noise so the dither stays put between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

const colorOf = (r: Run): string => (r.phase === 'stopped' ? STOPPED : r.isFinished ? DONE : ACCENT)

export function rowSvg(r: Run, W: number): string {
  const LABEL_W = 92
  const BAR_X = 16 + LABEL_W
  const BAR_W = Math.max(60, W - BAR_X - 64)
  const color = colorOf(r)
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * r.ratio)

  // Dithered fill: sparse at the start, dense toward the head.
  const dots: string[] = []
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let y = 0; y < rows; y++) {
      if (noise(c, y) < density) dots.push(`<rect class="t${Math.floor(noise(y, c) * 4)}" x="${c * CELL + 1}" y="${y * CELL + 1}" width="2" height="2"/>`)
    }
  }

  // Ticks between task-list steps, ahead of the fill.
  const ticks: string[] = []
  for (let i = 1; i < r.total; i++) {
    const x = Math.round((BAR_W * i) / r.total)
    if (x > fillW + 4) ticks.push(`<rect x="${x}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const pill = pillOf(r)
  const pillW = Math.round(18 + pill.length * 6.6)
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))
  const percent = `${Math.round(r.ratio * 100)}%`
  const markX = W - 10
  // A four-point star that turns while Claude works; a check once it's done.
  const mark = r.isFinished
    ? `<path d="M${markX - 5} ${H / 2} l3.5 3.5 l6.5 -7" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<g transform="translate(${markX},${H / 2})"><path class="spin" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" fill="${color}"/></g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
.t0,.t1,.t2,.t3{animation:tw ${r.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${r.isFinished ? 0.8 : 0.3}}}
.spin{transform-origin:0 0;animation:sp 2.4s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3,.spin{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="5" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" x="16" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${PHASE_WORD[r.phase]}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${pill}</text>
</g>
<text class="m" x="${W - 24}" y="${H / 2 + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${mark}
</svg>`
}

// ---------------------------------------------------------------------------
// Terminal: block characters that thin out toward the start, like the dither.

const RAMP = ['░', '▒', '▓', '█']

export function barText(r: Run, width: number): { filled: string; rest: string } {
  const f = r.ratio * width
  const whole = Math.floor(f)
  let filled = ''
  for (let i = 0; i < whole; i++) {
    const d = i / Math.max(1, whole)
    filled += RAMP[Math.min(3, Math.floor(d * 3 + 1))]
  }
  if (!r.isFinished && whole < width) filled += '▌'
  return { filled, rest: '·'.repeat(Math.max(0, width - [...filled].length)) }
}

async function drawRow($: EngineInterface, e: RenderInput<'AbovePrompt'>, r: Run, below: RenderChildren | null): Promise<RenderChildren> {
  const ui = $.ui.resolve(e)
  const { Box, Text } = ui
  const cols = e.props.bodyColumns || 100
  const percent = `${Math.round(r.ratio * 100)}%`

  // The terminal's element table has an `Svg` that draws nothing: test the surface too.
  if (e.surface !== 'terminal' && 'Svg' in ui) {
    const { Svg } = ui
    // Columns are about 7.8 CSS px in the app; a row wider than its slot wraps, so keep some slack.
    const width = Math.max(200, Math.min(1600, Math.round(cols * 7.6) - 40))
    return (
      <Box flexDirection="column" width="100%">
        <Box flexDirection="row" alignItems="center" width="100%">
          <Svg source={rowSvg(r, width)} alt={`${PHASE_WORD[r.phase]}: ${pillOf(r)}, ${percent}`} width={width} height={H} />
        </Box>
        {below}
      </Box>
    )
  }

  const color = r.phase === 'stopped' ? undefined : r.isFinished ? ANSI_DONE : ANSI_ACCENT
  const icon = r.isFinished ? (r.phase === 'stopped' ? '■' : '✓') : '✻'
  const width = Math.max(8, Math.min(40, cols - 36))
  const { filled, rest } = barText(r, width)
  const step = r.total > 0 && !r.isFinished ? `${Math.min(r.total, r.done + 1)}/${r.total}` : ''
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Box width={13} flexShrink={0}>
          <Text color={color} dimColor={color === undefined}>
            {icon} {PHASE_WORD[r.phase]}
          </Text>
        </Box>
        <Text>
          <Text color={color} dimColor={color === undefined}>
            {filled}
          </Text>
          <Text dimColor>{rest}</Text>
        </Text>
        {step ? <Text dimColor>{step}</Text> : null}
        <Text dimColor>{percent.padStart(4)}</Text>
      </Box>
      {below}
    </Box>
  )
}

async function setEnabled($: EngineInterface, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_KEY, value)
  $.ui.toast(value ? 'Thinkbar is on.' : 'Thinkbar is off.')
}

export function registerThinkbar(on: On): void {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const saved = await $.store.get(STORE_KEY)
    await update($, enabledAtom, () => (typeof saved === 'boolean' ? saved : true))
    return started
  })

  // Its row in the Tools box.
  on('ui.press', { plugin: 'toolbox', element: 'mod:thinkbar' }, async ($, e, next) => {
    await setEnabled($, !(await read($, enabledAtom)))
    return next(e)
  })

  // A new prompt on the main loop starts a new bar.
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await update($, runAtom, prev => (prev && !prev.isFinished ? prev : fresh(e.turnId)))
    return result
  })

  // Each model request of the main loop is a step.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) await update($, runAtom, r => (r && !r.isFinished ? advance(r, { steps: r.steps + 1 }) : r))
    return result
  })

  // What Claude does tells where it is: reading, editing, running, a task list.
  on('tool.call', async ($, e, next) => {
    const call = e as unknown as { tool: string; agentId?: string } & Record<string, unknown>
    if (call.agentId === undefined) {
      await update($, runAtom, r => {
        if (!r || r.isFinished) return r
        const phase = phaseOf(call.tool)
        const list = listOf(call.tool, call, r)
        return advance(r, { steps: r.steps + 1, ...(phase ? { phase } : {}), ...(list ?? {}) })
      })
    }
    return next(e)
  })

  // The answer fills the bar; it leaves a few seconds later, unless a new prompt took its place.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const stopped = e.reason !== 'answer'
    const finished = await update($, runAtom, r =>
      r ? { ...r, isFinished: true, phase: stopped ? 'stopped' : 'done', ratio: stopped ? r.ratio : 1 } : r,
    )
    const turnId = finished?.turnId
    $.clock.after(LINGER_MS, () => {
      void update($, runAtom, r => (r && r.isFinished && r.turnId === turnId ? null : r))
    })
    return result
  })

  // Above the prompt, with every other mod's row beneath it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, runAtom)
    if (r === null || e.props.hasSurvey || !(await read($, enabledAtom))) return next(e)
    // Claude Code's own placeholder ({ type: 'engine' }) is never nested: the app drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    return drawRow($, e, r, below as RenderChildren | null)
  })
}
