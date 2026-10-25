import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

type Engine = EngineInterface

const STORE_KEY = 'enabled'
const METER = 10
const SEPARATOR = ' │ '

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

/** Green under 60%, yellow under 85%, red from there. */
export function levelColor(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 85) return 'error'
  if (percent >= 60) return 'warning'
  return 'success'
}

/** A 10-cell meter: ▰ for used, ▱ for free. */
export function meter(percent: number): string {
  const filled = Math.max(0, Math.min(METER, Math.round(percent / 10)))
  return '▰'.repeat(filled) + '▱'.repeat(METER - filled)
}

/** One part of the bar: how wide it is, how important it is, and what it draws. */
type Part = { width: number; priority: number; node: unknown }

/** Keeps the most important parts that fit, in their original order. */
export function fitParts<T extends { width: number; priority: number }>(parts: T[], room: number): T[] {
  const kept = [...parts]
  const total = () => kept.reduce((sum, p) => sum + p.width, 0) + Math.max(0, kept.length - 1) * SEPARATOR.length
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

/** Draws the bar for a site `columns` cells wide. */
async function drawBar(
  $: Engine,
  e: RenderInput<'AbovePrompt' | 'PromptHint'>,
  columns: number,
  isWorking: boolean,
): Promise<unknown> {
  const { Box, Text, Button } = $.ui.resolve(e)
  await read($, tickAtom)

  const usage = await $.session.usage()
  const model = (await read($, modelAtom)) ?? (await $.session.model())
  const effort = await read($, effortAtom)
  const agents = (await $.agent.list()).filter(a => a.status === 'running' || a.status === 'pending').length
  const showTools = await checkToolbox($)

  const parts: Part[] = []
  const plan = usage.rateLimits.length > 0 ? 'Subscription' : 'API'
  parts.push({ priority: 5, width: 2 + plan.length, node: <Text color="success">◆ {plan}</Text> })

  const modelText = modelLabel(model)
  parts.push({
    priority: 1,
    width: 2 + modelText.length,
    node: (
      <Text bold color="suggestion">
        ◆ {modelText}
      </Text>
    ),
  })

  if (effort !== null) {
    parts.push({
      priority: 3,
      width: 7 + effort.length,
      node: (
        <Text>
          <Text dimColor>effort </Text>
          <Text color="claude">{effort}</Text>
        </Text>
      ),
    })
  }

  const ctx = Math.round(usage.context.percent ?? 0)
  parts.push({
    priority: 2,
    width: 4 + METER + 1 + `${ctx}%`.length,
    node: (
      <Text>
        <Text dimColor>ctx </Text>
        <Text color={levelColor(ctx)}>{meter(ctx)}</Text>
        <Text color={levelColor(ctx)}> {ctx}%</Text>
      </Text>
    ),
  })

  const limits = usage.rateLimits
    .map(limit => ({
      name: limit.kind === 'five_hour' ? '5h' : limit.kind === 'seven_day' ? '7d' : '',
      percent: Math.round(limit.percentUsed),
    }))
    .filter(limit => limit.name !== '')
  if (limits.length > 0) {
    parts.push({
      priority: 4,
      width: limits.reduce((sum, l) => sum + l.name.length + 1 + `${l.percent}%`.length, 0) + (limits.length - 1) * 3,
      node: (
        <Text>
          {limits.map((l, i) => (
            <Text>
              <Text dimColor>
                {i > 0 ? ' · ' : ''}
                {l.name}{' '}
              </Text>
              <Text color={levelColor(l.percent)}>{l.percent}%</Text>
            </Text>
          ))}
        </Text>
      ),
    })
  }

  const agentText = `◇ ${agents} ${agents === 1 ? 'agent' : 'agents'}`
  parts.push({ priority: 6, width: agentText.length, node: <Text dimColor>{agentText}</Text> })

  const prefix = isWorking ? 'esc to interrupt · ' : ''
  const toolsLabel = '◆ Tools ▲'
  const room = columns - 2 - prefix.length - (showTools ? toolsLabel.length + 4 : 0)
  const kept = fitParts(parts, room)

  const left: unknown[] = []
  if (prefix !== '') left.push(<Text dimColor>{prefix}</Text>)
  kept.forEach((part, i) => {
    if (i > 0) left.push(<Text dimColor>{SEPARATOR}</Text>)
    left.push(part.node)
  })

  return (
    <Box flexDirection="row" justifyContent="space-between" alignItems="center" width="100%">
      <Box flexDirection="row" flexShrink={1} overflow="hidden">
        {left}
      </Box>
      {showTools ? (
        <Box marginLeft={3} flexShrink={0}>
          <Button key="open-tools" label={toolsLabel} plain onPress={() => undefined} />
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
    return (await drawBar($, e, e.viewport?.columns ?? 100, e.props.isWorking)) as never
  })

  // --- In the desktop app: the last line of the band right above the prompt ---
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.surface === 'terminal' || e.props.hasSurvey || !(await read($, enabledAtom))) return rest
    const { Box } = $.ui.resolve(e)
    const bar = await drawBar($, e, e.props.bodyColumns, e.props.isWorking)
    return (
      <Box flexDirection="column">
        {rest ?? null}
        {bar}
      </Box>
    )
  })
}
