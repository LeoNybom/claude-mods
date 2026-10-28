import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren, RenderInput } from 'claude-code'

type Engine = EngineInterface
type Site = RenderInput<'AbovePrompt' | 'PromptHint'>

const STORE_KEY = 'enabled'
const LIMITS_KEY = 'lastLimits'
const EFFORT_KEY = 'lastEffort'
const METER = 10
const TERMINAL_TOOLS = '◆ Tools ▲'
const DESKTOP_TOOLS = 'Tools ⌃'
/** The desktop meter: 32 px wide, about four cells of the app's text. */
const METER_PX = 32
const METER_CELLS = 4
/** How many of the app's average characters fit in one cell of `bodyColumns`. */
const DESKTOP_CELL_RATIO = 1.2
const LEVEL_HEX = { success: '#3fb950', warning: '#d29922', error: '#f85149' } as const
const TRACK_HEX = 'rgba(128,128,128,0.35)'
const DIVIDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="14" viewBox="0 0 1 14"><rect width="1" height="14" fill="rgba(128,128,128,0.45)"/></svg>'

/** A slim rounded bar: the used share in its level color over a faint track. */
export function meterSvg(percent: number): string {
  const p = Math.max(0, Math.min(100, percent))
  const used = p === 0 ? 0 : Math.max(6, Math.round((p / 100) * METER_PX))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${METER_PX}" height="6" viewBox="0 0 ${METER_PX} 6">` +
    `<rect width="${METER_PX}" height="6" rx="3" fill="${TRACK_HEX}"/>` +
    (used > 0 ? `<rect width="${used}" height="6" rx="3" fill="${LEVEL_HEX[levelColor(p)]}"/>` : '') +
    '</svg>'
  )
}

const enabledAtom = atom({ plugin: 'infobar', key: 'enabled' } as const, true)
const modelAtom = atom({ plugin: 'infobar', key: 'liveModel' } as const, null)
const effortAtom = atom({ plugin: 'infobar', key: 'liveEffort' } as const, null)
const tickAtom = atom({ plugin: 'infobar', key: 'tick' } as const, 0)

const MODELS = [
  { alias: 'haiku', label: 'Haiku 5.5' },
  { alias: 'sonnet', label: 'Sonnet 5.5' },
  { alias: 'opus', label: 'Opus 5.5' },
  { alias: 'fable', label: 'Fable 5.1' },
] as const

/** "claude-opus-5-5" → "Opus 5.5"; anything unknown is shown as given. */
export function modelLabel(id: string): string {
  const found = MODELS.find(m => id.toLowerCase().includes(m.alias))
  return found ? found.label : id
}

/** Theme colors for the desktop app: green under 60%, yellow under 85%, red from there. */
export function levelColor(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 85) return 'error'
  if (percent >= 60) return 'warning'
  return 'success'
}

/** The same levels as terminal color names, so they come from the terminal's own theme. */
export function ansiLevel(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 85) return 'red'
  if (percent >= 60) return 'yellow'
  return 'green'
}

/** A 10-cell meter: ▰ for used, ▱ for free. */
export function meter(percent: number): string {
  const filled = Math.max(0, Math.min(METER, Math.round(percent / 10)))
  return '▰'.repeat(filled) + '▱'.repeat(METER - filled)
}

/** One part of the bar: how wide it is, how important it is, and what it draws. */
type Part = { width: number; priority: number; node: RenderChildren }

/** Keeps the most important parts that fit, in their original order. */
export function fitParts<T extends { width: number; priority: number }>(parts: T[], room: number, gap = 2): T[] {
  const kept = [...parts]
  const total = () => kept.reduce((sum, p) => sum + p.width, 0) + Math.max(0, kept.length - 1) * gap
  while (kept.length > 0 && total() > room) {
    let worst = 0
    kept.forEach((p, i) => {
      if (p.priority > kept[worst]!.priority) worst = i
    })
    kept.splice(worst, 1)
  }
  return kept
}

// Module variables reset on a reload; what is drawn lives in $.state.
let ticker: { cancel: () => void } | undefined
let hasToolbox = false
let savedLimits: SavedLimit[] = []
let savedEffort: string | null = null

async function setEnabled($: Engine, value: boolean): Promise<void> {
  await update($, enabledAtom, () => value)
  await $.store.set(STORE_KEY, value)
  $.ui.toast(value ? 'Infobar is on.' : 'Infobar is off.')
}

async function toggle($: Engine): Promise<void> {
  await setEnabled($, !(await read($, enabledAtom)))
}

function startTicker($: Engine): void {
  if (ticker !== undefined) return
  ticker = $.clock.every(1000, () => {
    void update($, tickAtom, n => (n ?? 0) + 1)
  })
}

async function stopTicker($: Engine): Promise<void> {
  ticker?.cancel()
  ticker = undefined
  await update($, tickAtom, n => (n ?? 0) + 1)
}

async function checkToolbox($: Engine): Promise<boolean> {
  if (!hasToolbox) hasToolbox = (await $.command.list()).some(c => c.name === 'toolbox')
  return hasToolbox
}

/** Everything the bar shows, read once per drawing. */
type Info = {
  model: string
  effort: string | null
  ctx: number
  limits: { name: string; percent: number }[]
  agents: number
  showTools: boolean
}

/** A usage window as saved between sessions. */
type SavedLimit = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The 5h and 7d windows to show. A window whose reset time has passed shows 0%,
 * since a saved reading from before the reset no longer holds.
 */
export function limitsFrom(raw: SavedLimit[], now: number): Info['limits'] {
  return raw
    .map(limit => {
      const reset = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)
      return {
        name: limit.kind === 'five_hour' ? '5h' : limit.kind === 'seven_day' ? '7d' : '',
        percent: !Number.isNaN(reset) && reset <= now ? 0 : Math.round(limit.percentUsed),
      }
    })
    .filter(limit => limit.name !== '')
}

function isSavedLimits(value: unknown): value is SavedLimit[] {
  return (
    Array.isArray(value) &&
    value.every(
      v =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as SavedLimit).kind === 'string' &&
        typeof (v as SavedLimit).percentUsed === 'number',
    )
  )
}

/**
 * Effort and the 5h/7d windows arrive only with the first reply of a session.
 * Until then the bar shows the last ones seen, kept in $.store; no request is made for them.
 */
async function loadSaved($: Engine): Promise<void> {
  const limits = await $.store.get(LIMITS_KEY)
  savedLimits = isSavedLimits(limits) ? limits : []
  const effort = await $.store.get(EFFORT_KEY)
  savedEffort = typeof effort === 'string' ? effort : null
}

async function saveLimits($: Engine, limits: SavedLimit[]): Promise<void> {
  const plain = limits.map(l => (l.resetsAt === undefined ? { kind: l.kind, percentUsed: l.percentUsed } : { kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  if (JSON.stringify(plain) === JSON.stringify(savedLimits)) return
  savedLimits = plain
  await $.store.set(LIMITS_KEY, plain)
}

async function saveEffort($: Engine, effort: string): Promise<void> {
  if (effort === savedEffort) return
  savedEffort = effort
  await $.store.set(EFFORT_KEY, effort)
}

async function collect($: Engine): Promise<Info> {
  await read($, tickAtom)
  const usage = await $.session.usage()
  const model = (await read($, modelAtom)) ?? (await $.session.model())
  if (usage.rateLimits.length > 0) await saveLimits($, usage.rateLimits)
  const live = usage.rateLimits.length > 0 ? usage.rateLimits : savedLimits
  return {
    model: modelLabel(model),
    effort: (await read($, effortAtom)) ?? savedEffort,
    ctx: Math.round(usage.context.percent ?? 0),
    limits: limitsFrom(live, Date.now()),
    agents: (await $.agent.list()).filter(a => a.status === 'running' || a.status === 'pending').length,
    showTools: await checkToolbox($),
  }
}

function agentWord(n: number): string {
  return `${n} ${n === 1 ? 'agent' : 'agents'}`
}

/** Width of "5h 12%  7d 54%", plus any meters drawn beside each. */
function limitsWidth(limits: Info['limits'], gap: number, meterWidth = 0): number {
  return (
    limits.reduce((sum, l) => sum + l.name.length + 1 + meterWidth + `${l.percent}%`.length, 0) +
    Math.max(0, limits.length - 1) * gap
  )
}

/** The terminal: glyph meters in the terminal's own theme colors, spread over the whole line. */
async function drawTerminal($: Engine, e: Site, columns: number, isWorking: boolean): Promise<RenderChildren> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const info = await collect($)
  const parts: Part[] = []

  parts.push({
    priority: 1,
    width: 2 + info.model.length,
    node: (
      <Text bold color="blue">
        ◆ {info.model}
      </Text>
    ),
  })
  if (info.effort !== null) {
    parts.push({
      priority: 4,
      width: 7 + info.effort.length,
      node: (
        <Text>
          <Text dimColor>effort </Text>
          <Text color="cyan">{info.effort}</Text>
        </Text>
      ),
    })
  }
  parts.push({
    priority: 3,
    width: 4 + METER + 1 + `${info.ctx}%`.length,
    node: (
      <Text>
        <Text dimColor>ctx </Text>
        <Text color={ansiLevel(info.ctx)}>{meter(info.ctx)}</Text>
        <Text color={ansiLevel(info.ctx)}> {info.ctx}%</Text>
      </Text>
    ),
  })
  if (info.limits.length > 0) {
    parts.push({
      priority: 2,
      width: limitsWidth(info.limits, 2),
      node: (
        <Text>
          {info.limits.map((l, i) => (
            <Text>
              <Text dimColor>
                {i > 0 ? '  ' : ''}
                {l.name}{' '}
              </Text>
              <Text color={ansiLevel(l.percent)}>{l.percent}%</Text>
            </Text>
          ))}
        </Text>
      ),
    })
  }
  const agentText = `◇ ${agentWord(info.agents)}`
  parts.push({ priority: 5, width: agentText.length, node: <Text dimColor>{agentText}</Text> })

  // The desktop app has its own stop button, so the hint is for the terminal only.
  const prefix = isWorking ? 'esc to interrupt · ' : ''
  const room = columns - 2 - prefix.length - (info.showTools ? TERMINAL_TOOLS.length + 5 : 0)
  const kept = fitParts(parts, room, 2)

  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
      {prefix !== '' ? <Text dimColor>{prefix}</Text> : null}
      {kept.map(part => (
        <Box flexShrink={0} marginRight={2}>
          {part.node}
        </Box>
      ))}
      {info.showTools ? (
        <Box marginLeft={3} flexShrink={0}>
          <Button key="open-tools" plain onPress={() => undefined}>
            <Text color="magenta">{TERMINAL_TOOLS}</Text>
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}

/** The desktop app: every part in one shared rounded frame, with hairline dividers between them. */
async function drawDesktop($: Engine, e: Site, columns: number): Promise<RenderChildren> {
  const { Box, Text, Button, Svg } = $.ui.resolve(e as RenderInput<'AbovePrompt'> & { surface: 'desktop' })
  const info = await collect($)
  const parts: Part[] = []

  // A meter is a small picture, so it cannot read the app's theme: these colors read well on light and dark.
  const meterBar = (percent: number) => (
    <Svg source={meterSvg(percent)} alt={`${percent}% used`} width={METER_PX} height={6} />
  )
  const divider = () => <Svg source={DIVIDER_SVG} alt="divider" width={1} height={14} />

  parts.push({
    priority: 1,
    width: 2 + info.model.length,
    node: (
      <Text weight="medium">
        <Text color="suggestion">✦ </Text>
        {info.model}
      </Text>
    ),
  })
  if (info.effort !== null) {
    parts.push({
      priority: 4,
      width: 7 + info.effort.length,
      node: (
        <Text>
          <Text dimColor>effort </Text>
          <Text>{info.effort}</Text>
        </Text>
      ),
    })
  }
  const usage = [{ name: 'ctx', percent: info.ctx }, ...info.limits]
  parts.push({
    priority: 2,
    width: usage.reduce((sum, u) => sum + u.name.length + 1 + METER_CELLS + 1 + `${u.percent}%`.length, 0) + (usage.length - 1) * 2,
    node: (
      <Box flexDirection="row" alignItems="center" gap={2}>
        {usage.map(u => (
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Text dimColor>{u.name}</Text>
            {meterBar(u.percent)}
            <Text>{u.percent}%</Text>
          </Box>
        ))}
      </Box>
    ),
  })
  parts.push({
    priority: 5,
    width: 2 + agentWord(info.agents).length,
    node: (
      <Text>
        <Text color={info.agents > 0 ? 'success' : 'subtle'}>● </Text>
        <Text>{agentWord(info.agents)}</Text>
      </Text>
    ),
  })

  // The app's font is narrower than a terminal cell, so a cell count overstates the width.
  const room = Math.round(columns * DESKTOP_CELL_RATIO) - 4 - (info.showTools ? DESKTOP_TOOLS.length + 4 : 0)
  const kept = fitParts(parts, room, 3)

  const row: RenderChildren[] = []
  kept.forEach((part, i) => {
    if (i > 0) row.push(divider())
    row.push(
      <Box flexShrink={0} paddingX={1}>
        {part.node}
      </Box>,
    )
  })
  // Tools sits outside the part that may shrink, so it always shows; the parts give way first.
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      width="100%"
      borderStyle="round"
      borderColor="subtle"
      paddingX={1}
    >
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" flexGrow={1} flexShrink={1} overflow="hidden">
        {row}
      </Box>
      {info.showTools ? (
        <Box flexDirection="row" alignItems="center" flexShrink={0} marginLeft={2}>
          {divider()}
          <Box marginLeft={2} paddingX={1}>
            <Button key="open-tools" label={DESKTOP_TOOLS} plain onPress={() => undefined} />
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}


export function registerInfobar(on: On): void {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'infobar',
      description: 'Turn the Infobar on or off (no argument flips it)',
      argumentHint: 'on|off',
    })
    // Always written, so the Tools box knows the Infobar is installed.
    const saved = await $.store.get(STORE_KEY)
    await update($, enabledAtom, () => (typeof saved === 'boolean' ? saved : true))
    await loadSaved($)
    return next(e)
  })

  on('command.run', { command: 'infobar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const value = arg === 'on' ? true : arg === 'off' ? false : !(await read($, enabledAtom))
    await setEnabled($, value)
    return {}
  })

  // Its row in the Tools box.
  on('ui.press', { plugin: 'toolbox', element: 'mod:infobar' }, async ($, e, next) => {
    await toggle($)
    return next(e)
  })

  // --- What the session is really using ---
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const model = e.model
      const effort = typeof e.effort === 'string' ? e.effort : null
      await update($, modelAtom, () => model)
      if (effort !== null) {
        await update($, effortAtom, () => effort)
        await saveEffort($, effort)
      }
    }
    return yield* next(e)
  })

  on('config.set', { key: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await update($, modelAtom, () => null)
    return result
  })

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await update($, modelAtom, () => null)
    return result
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()
    if (level !== '') {
      await update($, effortAtom, () => level)
      await saveEffort($, level)
    }
    return result
  })

  // --- Redraw every second while Claude works, and after each turn ---
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) startTicker($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await stopTicker($)
    return result
  })

  // --- In the terminal: the line under the prompt ---
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, enabledAtom))) return next(e)
    return (await drawTerminal($, e, e.viewport?.columns ?? 100, e.props.isWorking)) as never
  })

  // --- In the desktop app: a framed row at the bottom of the band right above the prompt ---
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.surface === 'terminal' || e.props.hasSurvey || !(await read($, enabledAtom))) return rest
    const { Box } = $.ui.resolve(e)
    const bar = await drawDesktop($, e, e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {rest ?? null}
        {bar}
      </Box>
    )
  })
}
