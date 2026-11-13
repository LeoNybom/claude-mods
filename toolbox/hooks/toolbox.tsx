import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderChildren, RenderInput } from 'claude-code'

import type { ToolboxEffort } from '../types'

type Engine = EngineInterface

const TITLE = 'Tools'

export const MODELS = [
  { alias: 'haiku', label: 'Haiku 5.5' },
  { alias: 'sonnet', label: 'Sonnet 5.5' },
  { alias: 'opus', label: 'Opus 5.5' },
  { alias: 'fable', label: 'Fable 5.1' },
] as const

export const EFFORTS: readonly { level: ToolboxEffort; label: string }[] = [
  { level: 'low', label: 'Low' },
  { level: 'medium', label: 'Medium' },
  { level: 'high', label: 'High' },
  { level: 'xhigh', label: 'XHigh' },
  { level: 'max', label: 'Max' },
]

/** A quick action runs a slash command, or sends Claude a prompt in the Tools mod's name. */
type Quick = { key: string; icon: string; label: string } & ({ command: string } | { prompt: string })

const SUMMARY_PROMPT =
  'Summarize briefly what this chat is about: its topic, what has been done and where it stands now. ' +
  'Two to four sentences, in the language the person writes in. Run no tools and change nothing.'

const QUICK: readonly Quick[] = [
  { key: 'compact', command: 'compact', icon: '✦', label: 'Shrink this chat' },
  { key: 'clear', command: 'clear', icon: '◇', label: 'Start a new chat' },
  { key: 'summary', prompt: SUMMARY_PROMPT, icon: '≡', label: 'Summary' },
]

const effortAtom = atom({ plugin: 'toolbox', key: 'effort' } as const, null)
const revisionAtom = atom({ plugin: 'toolbox', key: 'revision' } as const, 0)
const openAtom = atom({ plugin: 'toolbox', key: 'isOpen' } as const, false)
const offsetAtom = atom({ plugin: 'toolbox', key: 'offset' } as const, 0)

/** Rows the terminal's header takes: its title and the line under it. */
const TERMINAL_HEADER_ROWS = 2
/** Rows left for what the band shows under the list, the room above QUICK and the room under the list. */
const KEPT_ROWS = 4
/** In the terminal, the cells a Button adds around its label: `[ ` and ` ]`. */
const BUTTON_CHROME = 4
/** In the terminal, the cells the box adds around its rows: the frame and one cell of room each side. */
const BOX_CHROME = 4
/** In the terminal, the cells the scrollbar takes at the right while the list scrolls. */
const SCROLLBAR_COLUMNS = 3
/** In the terminal, the width of the MODEL and EFFORT labels, and the gap after them. */
const LABEL_COLUMNS = 7

/**
 * In the terminal, how wide the box is: half the prompt's width, never narrower than the
 * MODEL row with every model on it, never wider than the band.
 */
export function terminalBoxWidth(bodyColumns: number, scrolls: boolean): number {
  const buttons = MODELS.reduce((sum, m) => sum + m.label.length + BUTTON_CHROME, 0)
  const modelRow = LABEL_COLUMNS + 1 + buttons + MODELS.length - 1
  const least = modelRow + BOX_CHROME + (scrolls ? SCROLLBAR_COLUMNS : 0)
  return Math.min(bodyColumns, Math.max(least, Math.floor(bodyColumns / 2)))
}

/** The fewest list rows the terminal shows, however short the band is. */
const MIN_LIST_ROWS = 3
/** In the terminal, where a mod's description shows while the pointer rests on its row: cells from the row's left edge. */
const DESCRIPTION_COLUMN = 20
/** In the app, cells between the two sections on one row, and the title column when they stack. */
const SECTION_GAP = 3
const TITLE_COLUMNS = 10
/** How many of the app's average characters fit in one cell of `bodyColumns`, as the Infobar counts. */
const DESKTOP_CELL_RATIO = 1.2
/** In the app, the most items on one row: three mods, two quick actions. More go on rows above. */
const MOD_COLUMNS = 3
const QUICK_COLUMNS = 2
/** In the app, cells between two columns of items. */
const COLUMN_GAP = 2
/** In the app, one row's height, which the line between the sections grows by. */
const ROW_PX = 20
/** In the app, the lines' color: the Infobar's dividers'. Both lines are pictures, so they match. */
const LINE_COLOR = 'rgba(128,128,128,0.45)'
/** In the app, the line under the menu: wider than any band, cut to the menu's width. */
const UNDERLINE_PX = 4000
const UNDERLINE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${UNDERLINE_PX}" height="1" viewBox="0 0 ${UNDERLINE_PX} 1" preserveAspectRatio="none">` +
  `<rect width="${UNDERLINE_PX}" height="1" fill="${LINE_COLOR}"/></svg>`
/** In the app, the line between the mods and QUICK, as tall as the rows it stands beside. */
function dividerSvg(rows: number): string {
  const px = rows * ROW_PX
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="${px}" viewBox="0 0 1 ${px}" preserveAspectRatio="none">` +
    `<rect width="1" height="${px}" fill="${LINE_COLOR}"/></svg>`
  )
}
/** In the app, a mod's dot: filled green while on, an empty gray ring of the same size while off. */
const DOT_ON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#3fb950"/></svg>'
const DOT_OFF_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="rgba(150,150,150,1)" stroke-width="1"/></svg>'

// The mods the panel knows. A mod shows up once it has written its on/off value;
// it answers the press on its own row (`mod:<plugin>`) itself.
const infobarRef = { plugin: 'infobar', key: 'enabled' } as const
const promptUpgradeRef = { plugin: 'prompt-upgrade', key: 'auto' } as const
const thinkbarRef = { plugin: 'thinkbar', key: 'enabled' } as const
const adhdRef = { plugin: 'adhd', key: 'enabled' } as const

type ModName = 'infobar' | 'prompt-upgrade' | 'thinkbar' | 'adhd'

/** Each mod with what it does, shown while the pointer rests on it. */
const MODS: readonly { plugin: ModName; name: string; about: string }[] = [
  { plugin: 'infobar', name: 'Infobar', about: 'Context, usage limits, agents and git branch at a glance' },
  { plugin: 'prompt-upgrade', name: 'Prompt Upgrade', about: "Turns a rough prompt into a clear one before it's sent" },
  { plugin: 'thinkbar', name: 'Thinkbar', about: 'A progress bar above the prompt while Claude works' },
  { plugin: 'adhd', name: 'ADHD', about: 'Answers shaped for ADHD: next action first, numbered steps, no tangents' },
]

// What the terminal's last drawing showed, so a scroll knows how far the list may move.
let shownListRows = 0
let shownWindowRows = 0

/** "claude-opus-5-5" → "Opus 5.5"; anything unknown is shown as given. */
export function modelLabel(id: string): string {
  const found = MODELS.find(m => id.toLowerCase().includes(m.alias))
  return found ? found.label : id
}

/**
 * Which rows of the list show under the header, and where the scrollbar's thumb sits on a
 * track of `track` rows (the window's rows when left out).
 */
export function scrollWindow(listRows: number, room: number, offset: number, track?: number) {
  const windowRows = Math.max(0, Math.min(listRows, room))
  const last = Math.max(0, listRows - windowRows)
  const at = Math.max(0, Math.min(last, Math.round(offset)))
  const trackRows = track ?? windowRows
  const thumbRows = last === 0 ? trackRows : Math.max(1, Math.round((trackRows * windowRows) / listRows))
  const thumbAt = last === 0 ? 0 : Math.round((at / last) * (trackRows - thumbRows))
  return { windowRows, offset: at, scrolls: last > 0, thumbAt, thumbRows }
}

/**
 * The column counts a section of `count` items may take, widest first: `most` or fewer, down to
 * one. The last row may be short (four mods in three columns: three and one).
 */
export function columnChoices(count: number, most: number): number[] {
  const choices: number[] = []
  for (let c = Math.max(1, Math.min(most, count)); c >= 1; c -= 1) choices.push(c)
  return choices
}

/**
 * The rows a section shows, top first: the first `columns` items on the bottom row, the next ones
 * on the row above, and so on. Each row lists its items by column, null where a short row has none.
 */
export function rowsBottomUp<T>(items: readonly T[], columns: number): (T | null)[][] {
  const height = Math.ceil(items.length / columns)
  const rows: (T | null)[][] = []
  for (let r = height - 1; r >= 0; r -= 1) {
    rows.push(Array.from({ length: columns }, (_, c) => items[r * columns + c] ?? null))
  }
  return rows
}

/**
 * How the app lays out MODS and QUICK, given each item's width in characters. Side by side, each
 * section in its own half of `room` so the line between them stays in the middle, in the most
 * columns that fit its half; else stacked, each in the most columns that fit `room`.
 */
export function gridLayout(modWidths: readonly number[], quickWidths: readonly number[], room: number) {
  const half = Math.floor((room - 1 - SECTION_GAP * 2) / 2)
  const sectionWidth = (title: string, widths: readonly number[], columns: number) => {
    let sum = spaced(title).length + 2
    for (let c = 0; c < columns; c += 1) {
      sum += Math.max(...widths.filter((_, i) => i % columns === c)) + (c > 0 ? COLUMN_GAP : 0)
    }
    return sum
  }
  const most = (title: string, widths: readonly number[], max: number, space: number) =>
    columnChoices(widths.length, max).find(columns => sectionWidth(title, widths, columns) <= space)
  const modColumns = most('MODS', modWidths, MOD_COLUMNS, half)
  const quickColumns = most('QUICK', quickWidths, QUICK_COLUMNS, half)
  if (modColumns !== undefined && quickColumns !== undefined) return { isStacked: false, modColumns, quickColumns }
  return {
    isStacked: true,
    modColumns: most('MODS', modWidths, MOD_COLUMNS, room) ?? 1,
    quickColumns: most('QUICK', quickWidths, QUICK_COLUMNS, room) ?? 1,
  }
}

type BandNode = { type?: unknown; props?: { key?: unknown }; children?: unknown[] }

/**
 * Splits off the top row of what the band draws beneath the box when another mod keys it `top:…`
 * (Thinkbar's progress bar): that row stays on top, the rest goes under the box. Each mod beneath
 * wraps what lies under it in its own column (the Infobar wraps Thinkbar's), so the row is looked
 * for down the first child of each column.
 */
export function splitTop(rest: unknown): { top: RenderChildren; below: RenderChildren } {
  const none = { top: null, below: (rest ?? null) as RenderChildren }
  const node = rest as BandNode | null | undefined
  const key = node?.props?.key
  if (typeof key === 'string' && key.startsWith('top:')) return { top: rest as RenderChildren, below: null }
  const children = node?.type === 'Box' && Array.isArray(node.children) ? node.children : []
  if (children.length === 0) return none
  const inner = splitTop(children[0])
  if (inner.top === null) return none
  const rows = inner.below === null ? children.slice(1) : [inner.below, ...children.slice(1)]
  return { top: inner.top, below: { ...node, children: rows } as RenderChildren }
}

/** Moves the list by `by` rows, inside its ends. */
async function scrollBy($: Engine, by: number): Promise<void> {
  const last = Math.max(0, shownListRows - shownWindowRows)
  await update($, offsetAtom, n => Math.max(0, Math.min(last, (n ?? 0) + by)))
}

function isEffort(value: unknown): value is ToolboxEffort {
  return EFFORTS.some(e => e.level === value)
}

/** "MODS" → "M O D S". */
function spaced(text: string): string {
  return text.split('').join(' ')
}

async function toggleOpen($: Engine): Promise<void> {
  // Each opening starts at the top of the list.
  await update($, offsetAtom, () => 0)
  await update($, openAtom, open => !open)
}

async function close($: Engine): Promise<void> {
  await update($, openAtom, () => false)
}

async function setModel($: Engine, alias: string, label: string): Promise<void> {
  const answer = await $.config.set({ key: 'model', value: alias })
  if (answer.deny !== undefined) {
    $.ui.toast(`Couldn't switch to ${label}: ${answer.deny}`)
    return
  }
  await update($, revisionAtom, n => (n ?? 0) + 1)
  $.ui.toast(`Model: ${label}`)
}

async function setEffort($: Engine, level: ToolboxEffort, label: string): Promise<void> {
  await $.command.run({ command: 'effort', args: level })
  await update($, effortAtom, () => level)
  $.ui.toast(`Effort: ${label}`)
}

async function runQuick($: Engine, q: Quick): Promise<void> {
  await close($)
  if ('command' in q) await $.command.run({ command: q.command })
  else await $.prompt.submit({ text: q.prompt })
}

async function readFlag($: Engine, which: ModName): Promise<boolean | undefined> {
  const held =
    which === 'infobar'
      ? await $.state.get(infobarRef)
      : which === 'prompt-upgrade'
        ? await $.state.get(promptUpgradeRef)
        : which === 'thinkbar'
          ? await $.state.get(thinkbarRef)
          : await $.state.get(adhdRef)
  return typeof held.value === 'boolean' ? held.value : undefined
}

export function registerToolbox(on: On): void {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'toolbox', description: 'Open or close the Tools box' })
    return next(e)
  })

  // Answers quietly: the box opening is the answer.
  on('command.run', { command: 'toolbox' }, async $ => {
    await toggleOpen($)
    return {}
  })

  // The Infobar's "◆ Tools ▲" button opens and closes the box.
  on('ui.press', { plugin: 'infobar', element: 'open-tools' }, async ($, e, next) => {
    await toggleOpen($)
    return next(e)
  })

  // Keep the effort shown in step with what is really sent.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && isEffort(e.effort)) {
      const level = e.effort
      await update($, effortAtom, () => level)
    }
    return yield* next(e)
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()
    if (isEffort(level)) await update($, effortAtom, () => level)
    return result
  })

  on('command.run', { command: 'model' }, async ($, e, next) => {
    const result = await next(e)
    await update($, revisionAtom, n => (n ?? 0) + 1)
    return result
  })

  // The terminal's list under the header scrolls by itself, so the header stays where it is.
  on('ui.scroll', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, openAtom)) || shownListRows <= shownWindowRows) return next(e)
    await scrollBy($, e.by)
    return {}
  }).catch(($, e, next) => (next.called ? {} : next(e)))

  // In the app one row above the Infobar; in the terminal a list above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey) return rest

    const { Box, Text, Button } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'

    // In the app the Infobar's Tools button opens the box. While the Infobar is off there is no
    // such button, so the box draws its own in its place: turning the Infobar off from here
    // never locks you out.
    // Its arrow points down while the box is open, as the Infobar's does.
    const isOpen = await read($, openAtom)
    const ownButton =
      isTerminal || (await readFlag($, 'infobar')) === true ? null : (
        // Less room at its left than the box: with the button's own padding, the chevron is centered
        // on the M of MODS, as the Infobar's is.
        <Box flexDirection="row" paddingLeft={1.25} paddingRight={2}>
          <Button key="open-tools" plain onPress={() => toggleOpen($)}>
            <Text dimColor>{isOpen ? '∨' : '∧'}</Text> Tools
          </Button>
        </Box>
      )
    // A row another mod keys `top:…` (Thinkbar's progress bar) stays at the top of the band, so the
    // box opens under it, between it and the Infobar.
    const { top, below } = splitTop(rest)
    const withRest = (box: RenderChildren) => (
      <Box flexDirection="column">
        {top}
        {box}
        {below}
        {ownButton}
      </Box>
    )
    if (!isOpen) return ownButton === null ? rest : withRest(null)

    const shown: { plugin: ModName; name: string; about: string; isOn: boolean }[] = []
    for (const mod of MODS) {
      const isOn = await readFlag($, mod.plugin)
      if (isOn !== undefined) shown.push({ ...mod, isOn })
    }

    // Green and filled while on, an empty gray ring while off. In the app both are pictures of one
    // size (● and ○ come from different fonts there); the terminal draws the glyphs. The dot stays
    // outside the button, where the app keeps its color.
    const dot = (isOn: boolean) => {
      if (isTerminal) return <Text color={isOn ? 'success' : 'inactive'}>{isOn ? '●' : '○'}</Text>
      const { Svg } = $.ui.resolve(e as RenderInput<'AbovePrompt'> & { surface: 'desktop' })
      return <Svg source={isOn ? DOT_ON_SVG : DOT_OFF_SVG} alt={isOn ? 'on' : 'off'} width={10} height={10} />
    }
    // The name is the switch, lit under the pointer like the quick actions.
    const nameButton = (mod: (typeof shown)[number]) => (
      <Button key={`mod:${mod.plugin}`} plain dimColor={!mod.isOn} onPress={() => undefined}>
        <Text bold>{mod.name}</Text>
      </Button>
    )
    const quickButton = (q: Quick) => (
      <Button key={`quick:${q.key}`} plain onPress={() => runQuick($, q)}>
        <Text color="claude">{q.icon}</Text> {q.label}
      </Button>
    )

    if (!isTerminal) {
      shownListRows = 0
      shownWindowRows = 0
      const { Svg } = $.ui.resolve(e as RenderInput<'AbovePrompt'> & { surface: 'desktop' })
      const modWidths = shown.length > 0 ? shown.map(mod => 4 + mod.name.length) : [22]
      const quickWidths = QUICK.map(q => 4 + q.label.length)
      const layout = gridLayout(modWidths, quickWidths, Math.round(e.props.bodyColumns * DESKTOP_CELL_RATIO) - 4)
      // Rows each section takes: its items fill full rows of its columns.
      const modHeight = Math.ceil(modWidths.length / layout.modColumns)
      const quickHeight = Math.ceil(quickWidths.length / layout.quickColumns)
      const tallest = Math.max(modHeight, quickHeight)

      // Rows under a mod before the line under the menu. The first mods sit on the bottom row and
      // later ones on rows above, so a mod has as many rows under it as rows come before its own;
      // the sections stand on one bottom line, and when stacked QUICK's rows are under the mods.
      const rowsBelow = (i: number) => {
        const row = Math.floor(i / layout.modColumns)
        return row + (layout.isStacked ? quickHeight : 0)
      }

      // Each mod is a hover scope holding its description, hidden until the pointer rests on the
      // mod and then drawn just under the line under the menu, as a small label over the Infobar.
      const modItems =
        shown.length > 0
          ? shown.map((mod, i) => (
              <Box key={`mod-row:${mod.plugin}`} flexDirection="row" alignItems="center" gap={1}>
                {dot(mod.isOn)}
                {nameButton(mod)}
                <Box
                  position="absolute"
                  left={0}
                  top={rowsBelow(i) + 1}
                  display="none"
                  hover={{ display: 'flex' }}
                  backgroundColor="promptBorder"
                  paddingX={1}
                >
                  <Text dimColor>{mod.about}</Text>
                </Box>
              </Box>
            ))
          : [<Text dimColor>No mods installed yet</Text>]

      // The first items fill the bottom row, left to right; later ones go on rows above it, in
      // aligned columns, with an empty row's height where a short row has no item. The title
      // stands on the bottom row. Side by side each section takes an equal half (width 0, grown),
      // so the line between them stays in the middle: the mods fill the left half, QUICK the right.
      const section = (title: string, items: RenderChildren[], columns: number) => {
        const rows = rowsBottomUp(items, columns)
        return (
          <Box
            flexDirection="row"
            alignItems="flex-end"
            gap={2}
            flexGrow={layout.isStacked ? 0 : 1}
            flexShrink={1}
            width={layout.isStacked ? undefined : 0}
            overflow="hidden"
          >
            <Box flexShrink={0} width={layout.isStacked ? TITLE_COLUMNS : undefined}>
              <Text dimColor>{spaced(title)}</Text>
            </Box>
            <Box flexDirection="row" alignItems="flex-end" columnGap={COLUMN_GAP}>
              {Array.from({ length: columns }, (_, c) => (
                <Box flexDirection="column">
                  {rows.map((row, r) => row[c] ?? <Box key={`empty:${title}:${r}:${c}`} height={1} />)}
                </Box>
              ))}
            </Box>
          </Box>
        )
      }

      // paddingLeft 2.25 (18 px) puts MODS straight above the Infobar's ∨ Tools.
      return withRest(
        <Box flexDirection="column" paddingLeft={2.25} paddingRight={2}>
          {/* paddingBottom puts the line as far under the menu's text as the Infobar's text is under it. */}
          <Box flexDirection="column" paddingBottom={1}>
            {layout.isStacked ? (
              <Box flexDirection="column">
                {section('MODS', modItems, layout.modColumns)}
                {section('QUICK', QUICK.map(quickButton), layout.quickColumns)}
              </Box>
            ) : (
              <Box flexDirection="row" alignItems="flex-end" columnGap={SECTION_GAP}>
                {section('MODS', modItems, layout.modColumns)}
                {/* A thin line between the mods and QUICK, as tall as the rows beside it. */}
                <Svg source={dividerSvg(tallest)} alt="divider" width={1} height={tallest * ROW_PX} />
                {section('QUICK', QUICK.map(quickButton), layout.quickColumns)}
              </Box>
            )}
            {/* A thin line under the menu, inset with its content, in the dividers' color, on the
                bottom edge of the room under the last row. */}
            <Box position="absolute" left={0} right={0} bottom={0} overflow="hidden">
              <Svg source={UNDERLINE_SVG} alt="underline" width={UNDERLINE_PX} height={1} />
            </Box>
          </Box>
          {/* Room under the line as deep as the band's own above the closed Infobar (half a row),
              so the line sits where the closed bar's top edge is. */}
          <Box height={0.5} />
        </Box>,
      )
    }

    // The terminal: a framed box with a list under a header and a Close button, scrolled by
    // itself when the band is short.
    await read($, revisionAtom)
    const modelId = await $.session.model()
    const effort = await read($, effortAtom)

    // A solid line across the list: one row tall, the overflow cut off, so it fills the
    // width without wrapping or an ellipsis.
    const line = (key: string) => (
      <Box key={key} height={1} overflow="hidden">
        <Text dimColor>{'─'.repeat(400)}</Text>
      </Box>
    )

    const label = (text: string) => (
      <Box width={LABEL_COLUMNS}>
        <Text dimColor>{text}</Text>
      </Box>
    )

    const modRows = shown.map(mod => (
      // The whole row is a hover scope: resting the pointer on it shows what the mod does.
      <Box key={`mod-row:${mod.plugin}`} flexDirection="row" flexGrow={1} gap={1} alignItems="center">
        {dot(mod.isOn)}
        {nameButton(mod)}
        <Box position="absolute" left={DESCRIPTION_COLUMN} top={0} display="none" hover={{ display: 'flex' }}>
          <Text dimColor>{mod.about}</Text>
        </Box>
      </Box>
    ))

    // Every entry is one row, so the window moves a row at a time.
    const list: RenderChildren[] = [
      <Box flexDirection="row" gap={1} alignItems="center">
        {label('MODEL')}
        {MODELS.map(m => (
          <Button
            key={`model:${m.alias}`}
            label={m.label}
            variant={modelId.toLowerCase().includes(m.alias) ? 'primary' : 'secondary'}
            onPress={() => setModel($, m.alias, m.label)}
          />
        ))}
      </Box>,
      <Box flexDirection="row" gap={1} alignItems="center">
        {label('EFFORT')}
        {EFFORTS.map(x => (
          <Button
            key={`effort:${x.level}`}
            label={x.label}
            variant={x.level === effort ? 'primary' : 'secondary'}
            onPress={() => setEffort($, x.level, x.label)}
          />
        ))}
      </Box>,
      line('line-above-mods'),
      <Text dimColor>{spaced('MODS')}</Text>,
      ...(modRows.length > 0 ? modRows : [<Text dimColor>No mods installed yet</Text>]),
      // No line between the sections, just a little room above QUICK.
      <Box marginTop={1}>
        <Text dimColor>{spaced('QUICK')}</Text>
      </Box>,
      ...QUICK.map(quickButton),
    ]

    const room = Math.max(MIN_LIST_ROWS, e.props.maxRows - TERMINAL_HEADER_ROWS - KEPT_ROWS)
    // The track runs between the ▲ at the top and the ▼ at the bottom.
    const track = Math.max(1, Math.min(list.length, room) - 2)
    const win = scrollWindow(list.length, room, await read($, offsetAtom), track)
    shownListRows = list.length
    shownWindowRows = win.windowRows

    // The scrollbar, only while the list is longer than the window: ▲ and ▼ move it a row,
    // and between them a bar with its thumb where the window is.
    const scrollbar = (i: number) => {
      if (!win.scrolls) return null
      let part: RenderChildren
      if (i === 0) {
        part = <Button key="scroll-up" label="▲" plain onPress={() => scrollBy($, -1)} />
      } else if (i === win.windowRows - 1) {
        part = <Button key="scroll-down" label="▼" plain onPress={() => scrollBy($, 1)} />
      } else {
        const isThumb = i - 1 >= win.thumbAt && i - 1 < win.thumbAt + win.thumbRows
        part = <Box width={1} backgroundColor={isThumb ? 'inactive' : 'promptBorder'} />
      }
      return (
        <Box width={2} marginLeft={1} flexDirection="row" justifyContent="center">
          {part}
        </Box>
      )
    }

    const rows = list.slice(win.offset, win.offset + win.windowRows).map((row, i) => (
      <Box flexDirection="row">
        <Box flexDirection="row" flexGrow={1} flexShrink={1} alignItems="center" overflow="hidden">
          {row}
        </Box>
        {scrollbar(i)}
      </Box>
    ))

    return withRest(
      <Box
        flexDirection="column"
        width={terminalBoxWidth(e.props.bodyColumns, win.scrolls)}
        // At the right edge, straight above the Infobar's ◆ Tools ▲ that opens it.
        alignSelf="flex-end"
        borderStyle="round"
        borderColor="claude"
        paddingX={1}
        marginBottom={1}
      >
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold color="claude">
            ◆ {spaced(TITLE.toUpperCase())}
          </Text>
          <Button key="close" label="✕ Close" variant="primary" role="dismiss" onPress={() => close($)} />
        </Box>
        {line('line-under-header')}
        {rows}
      </Box>,
    )
  })
}
