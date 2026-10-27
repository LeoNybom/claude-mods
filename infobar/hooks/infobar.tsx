import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren, RenderInput } from 'claude-code'

type Engine = EngineInterface
type Site = RenderInput<'AbovePrompt' | 'PromptHint'>

const STORE_KEY = 'enabled'
const METER = 10
const DESKTOP_METER = 6
const TERMINAL_TOOLS = '◆ Tools ▲'
const DESKTOP_TOOLS = 'Tools ▴'

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
  plan: string
  model: string
  effort: string | null
  ctx: number
  limits: { name: string; percent: number }[]
  agents: number
  showTools: boolean
}

async function collect($: Engine): Promise<Info> {
  await read($, tickAtom)
  const usage = await $.session.usage()
  const model = (await read($, modelAtom)) ?? (await $.session.model())
  const limits = usage.rateLimits
    .map(limit => ({
      name: limit.kind === 'five_hour' ? '5h' : limit.kind === 'seven_day' ? '7d' : '',
      percent: Math.round(limit.percentUsed),
    }))
    .filter(limit => limit.name !== '')
  return {
    plan: usage.rateLimits.length > 0 ? 'Subscription' : 'API',
    model: modelLabel(model),
    effort: await read($, effortAtom),
    ctx: Math.round(usage.context.percent ?? 0),
    limits,
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

  parts.push({ priority: 6, width: 2 + info.plan.length, node: <Text color="green">◆ {info.plan}</Text> })
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

/** The desktop app: every part in one shared rounded frame, with thin dividers between them. */
async function drawDesktop($: Engine, e: Site, columns: number): Promise<RenderChildren> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const info = await collect($)
  const parts: Part[] = []

  /** A slim line meter: ━ in the level color for used, faint for free. */
  const slim = (percent: number) => {
    const filled = Math.max(0, Math.min(DESKTOP_METER, Math.round((percent / 100) * DESKTOP_METER)))
    return (
      <Text>
        <Text color={levelColor(percent)}>{'━'.repeat(filled)}</Text>
        <Text color="subtle">{'━'.repeat(DESKTOP_METER - filled)}</Text>
      </Text>
    )
  }

  parts.push({ priority: 6, width: 2 + info.plan.length, node: <Text color="success">● {info.plan}</Text> })
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
  parts.push({
    priority: 3,
    width: 4 + DESKTOP_METER + 1 + `${info.ctx}%`.length,
    node: (
      <Text>
        <Text dimColor>ctx </Text>
        {slim(info.ctx)}
        <Text> {info.ctx}%</Text>
      </Text>
    ),
  })
  if (info.limits.length > 0) {
    parts.push({
      priority: 2,
      width: limitsWidth(info.limits, 3, DESKTOP_METER + 1),
      node: (
        <Text>
          {info.limits.map((l, i) => (
            <Text>
              <Text dimColor>
                {i > 0 ? '   ' : ''}
                {l.name}{' '}
              </Text>
              {slim(l.percent)}
              <Text> {l.percent}%</Text>
            </Text>
          ))}
        </Text>
      ),
    })
  }
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

  const room = columns - 4 - (info.showTools ? DESKTOP_TOOLS.length + 7 : 0)
  const kept = fitParts(parts, room, 3)

  const row: RenderChildren[] = []
  kept.forEach((part, i) => {
    if (i > 0) row.push(<Text color="subtle">│</Text>)
    row.push(
      <Box flexShrink={0} paddingX={1}>
        {part.node}
      </Box>,
    )
  })
  if (info.showTools) {
    row.push(<Text color="subtle">│</Text>)
    row.push(
      <Box flexShrink={0} marginLeft={2} paddingX={1}>
        <Button key="open-tools" label={DESKTOP_TOOLS} plain onPress={() => undefined} />
      </Box>,
    )
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      width="100%"
      borderStyle="round"
      borderColor="subtle"
      paddingX={1}
    >
      {row}
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
      if (effort !== null) await update($, effortAtom, () => effort)
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
    if (level !== '') await update($, effortAtom, () => level)
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
