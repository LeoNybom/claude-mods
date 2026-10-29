import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren, RenderInput } from 'claude-code'

type Engine = EngineInterface
type Site = RenderInput<'AbovePrompt' | 'PromptHint'>

const STORE_KEY = 'enabled'
const LIMITS_KEY = 'lastLimits'
const EFFORT_KEY = 'lastEffort'
const METER = 10
const TERMINAL_TOOLS = '◆ Tools ▲'
const DESKTOP_TOOLS = 'Tools'
/** The desktop meter: 32 px wide, about four cells of the app's text. */
const METER_PX = 32
const METER_CELLS = 4
/** How many of the app's average characters fit in one cell of `bodyColumns`. */
const DESKTOP_CELL_RATIO = 1.2
const LEVEL_HEX = { success: '#3fb950', warning: '#d29922', error: '#f85149' } as const
const TRACK_HEX = 'rgba(128,128,128,0.35)'
/**
 * No frame: the band's own background is the bar. The band adds 10 px above and below,
 * the row is 20 px, and BAR_PAD_Y adds 2 px on each side: 44 px, as tall as the empty prompt box.
 */
const BAR_PAD_Y = 0.2
/** Dividers run the whole height of the row. */
const DIVIDER_PX = 20
const DIVIDER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${DIVIDER_PX}" viewBox="0 0 1 ${DIVIDER_PX}" preserveAspectRatio="none">` +
  `<rect width="1" height="${DIVIDER_PX}" fill="rgba(128,128,128,0.45)"/></svg>`
/** A thin upward chevron, drawn as text so it sits inside the Tools button. */
const DESKTOP_CHEVRON = '∧'
/** A git branch mark: two dots joined by a line. */
const BRANCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="rgba(150,150,150,1)" stroke-width="1.2" stroke-linecap="round"><circle cx="3" cy="2.5" r="1.5"/><circle cx="3" cy="9.5" r="1.5"/><circle cx="9" cy="4" r="1.5"/><path d="M3 4v4M9 5.5c0 2-6 1-6 2.5"/></svg>'

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
  git: GitInfo
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
    git,
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

// --- Git: the branch and whether everything is committed and pushed ---

/** The branch, and whether all is committed and pushed; null outside a git repository. */
export type GitInfo = { branch: string; upToDate: boolean } | null

/**
 * Reads `git status --porcelain=v1 -b`. Up to date means no changes, an upstream,
 * and no commits ahead of it: committed and pushed.
 */
export function parseGitStatus(out: string): GitInfo {
  const lines = out.split('\n').filter(l => l.trim() !== '')
  const head = lines[0]
  if (head === undefined || !head.startsWith('## ')) return null
  const text = head.slice(3)
  let branch: string
  let hasUpstream = false
  if (text.startsWith('No commits yet on ')) branch = text.slice('No commits yet on '.length).trim()
  else if (text.startsWith('HEAD (no branch)')) branch = 'HEAD'
  else {
    const name = text.split(' [')[0]!
    const dots = name.indexOf('...')
    hasUpstream = dots >= 0
    branch = dots >= 0 ? name.slice(0, dots) : name.trim()
  }
  const isAhead = /\[[^\]]*ahead \d+/.test(text)
  return { branch, upToDate: lines.length === 1 && hasUpstream && !isAhead }
}

const GIT_EVERY_MS = 10_000
let git: GitInfo = null
let gitTimer: { cancel: () => void } | undefined
let gitBusy = false

/** Runs git on this machine only (no request to Claude), and redraws when the answer changed. */
async function refreshGit($: Engine): Promise<void> {
  if (gitBusy) return
  gitBusy = true
  try {
    const result = await $.process.run(['git', 'status', '--porcelain=v1', '-b'], { timeoutMs: 5000 })
    const next = result.exitCode === 0 ? parseGitStatus(result.stdout) : null
    if (JSON.stringify(next) !== JSON.stringify(git)) {
      git = next
      await update($, tickAtom, n => (n ?? 0) + 1)
    }
  } catch {
    // No git on this machine, or it did not answer: the part stays hidden.
  } finally {
    gitBusy = false
  }
}

function startGitWatch($: Engine): void {
  void refreshGit($)
  if (gitTimer === undefined) gitTimer = $.clock.every(GIT_EVERY_MS, () => void refreshGit($))
}

// --- Drawing ---

/** Width of the git part at its smallest: icon, a few letters, the dot. */
const GIT_MIN_WIDTH = 8

/** The terminal: model and effort anchored left, git in the gap, usage, agents and Tools anchored right. */
async function drawTerminal($: Engine, e: Site, columns: number, isWorking: boolean): Promise<RenderChildren> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const info = await collect($)

  const left: Part[] = []
  const right: Part[] = []
  left.push({
    priority: 1,
    width: 2 + info.model.length,
    node: (
      <Text bold color="blue">
        ◆ {info.model}
      </Text>
    ),
  })
  if (info.effort !== null) {
    left.push({
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
  right.push({
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
    right.push({
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
  right.push({ priority: 5, width: agentText.length, node: <Text dimColor>{agentText}</Text> })

  const gitPart: Part | null =
    info.git === null
      ? null
      : {
          priority: 6,
          width: GIT_MIN_WIDTH,
          node: (
            <Text wrap="truncate-end">
              <Text dimColor>⎇ </Text>
              <Text>{info.git.branch} </Text>
              <Text color={info.git.upToDate ? 'green' : 'yellow'}>●</Text>
            </Text>
          ),
        }

  // The desktop app has its own stop button, so the hint is for the terminal only.
  const prefix = isWorking ? 'esc to interrupt · ' : ''
  const room = columns - 2 - prefix.length - (info.showTools ? TERMINAL_TOOLS.length + 3 : 0)
  const all = [...left, ...(gitPart ? [gitPart] : []), ...right]
  const kept = new Set(fitParts(all, room, 2))

  return (
    <Box flexDirection="row" alignItems="center" width="100%">
      {prefix !== '' ? <Text dimColor>{prefix}</Text> : null}
      {left
        .filter(p => kept.has(p))
        .map(part => (
          <Box flexShrink={0} marginRight={2}>
            {part.node}
          </Box>
        ))}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginRight={2}>
        {gitPart !== null && kept.has(gitPart) ? gitPart.node : null}
      </Box>
      {right
        .filter(p => kept.has(p))
        .map(part => (
          <Box flexShrink={0} marginLeft={2}>
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

/** The desktop app: git from the left edge to the first right part; usage, agents and Tools anchored right. */
async function drawDesktop($: Engine, e: Site, columns: number): Promise<RenderChildren> {
  const { Box, Text, Button, Svg } = $.ui.resolve(e as RenderInput<'AbovePrompt'> & { surface: 'desktop' })
  const info = await collect($)

  // Pictures cannot read the app's theme: these colors read well on light and dark.
  const meterBar = (percent: number) => (
    <Svg source={meterSvg(percent)} alt={`${percent}% used`} width={METER_PX} height={6} />
  )
  const divider = () => <Svg source={DIVIDER_SVG} alt="divider" width={1} height={DIVIDER_PX} />

  const right: Part[] = []
  const usage = [{ name: 'ctx', percent: info.ctx }, ...info.limits]
  right.push({
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
  right.push({
    priority: 5,
    width: 2 + agentWord(info.agents).length,
    node: (
      <Text>
        <Text color={info.agents > 0 ? 'success' : 'subtle'}>● </Text>
        <Text>{agentWord(info.agents)}</Text>
      </Text>
    ),
  })

  const gitPart: Part | null =
    info.git === null
      ? null
      : {
          priority: 6,
          width: GIT_MIN_WIDTH,
          node: (
            <Box flexDirection="row" alignItems="center" gap={1} overflow="hidden">
              <Svg source={BRANCH_SVG} alt="branch" width={12} height={12} />
              <Text wrap="truncate-end">{info.git.branch}</Text>
              <Text color={info.git.upToDate ? 'success' : 'warning'}>●</Text>
            </Box>
          ),
        }

  // The app's font is narrower than a terminal cell, so a cell count overstates the width.
  const room = Math.round(columns * DESKTOP_CELL_RATIO) - 4 - (info.showTools ? DESKTOP_TOOLS.length + 6 : 0)
  const kept = new Set(fitParts([...(gitPart ? [gitPart] : []), ...right], room, 3))
  const shownRight = right.filter(p => kept.has(p))

  const row: RenderChildren[] = []
  row.push(
    <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingX={1}>
      {gitPart !== null && kept.has(gitPart) ? gitPart.node : null}
    </Box>,
  )
  shownRight.forEach(part => {
    row.push(divider())
    row.push(
      <Box flexShrink={0} paddingX={1}>
        {part.node}
      </Box>,
    )
  })
  if (info.showTools) {
    row.push(divider())
    row.push(
      // One Button holds the label and the chevron, so a click anywhere on the part opens Tools.
      // A Button may hold only text, so the chevron is a thin glyph here, not a picture.
      <Box flexShrink={0} paddingX={1}>
        <Button key="open-tools" plain onPress={() => undefined}>
          <Text>{DESKTOP_TOOLS} </Text>
          <Text dimColor>{DESKTOP_CHEVRON}</Text>
        </Button>
      </Box>,
    )
  }

  return (
    <Box flexDirection="row" alignItems="center" width="100%" paddingX={1} paddingY={BAR_PAD_Y}>
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
    await loadSaved($)
    startGitWatch($)
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
    if (e.agentId === undefined) {
      await refreshGit($)
      await stopTicker($)
    }
    return result
  })

  // --- In the terminal: the line under the prompt ---
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, enabledAtom))) return next(e)
    // A row another mod draws here (such as Clean Info Agents' progress bar) stays, right above the bar.
    // Claude Code's own hint ({ type: 'engine' }) is the one the bar replaces.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const above = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const bar = await drawTerminal($, e, e.viewport?.columns ?? 100, e.props.isWorking)
    if (above === null) return bar as never
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {above as RenderChildren}
        {bar}
      </Box>
    ) as never
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
