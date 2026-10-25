import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

import type { ToolboxEffort } from '../types'

type Engine = EngineInterface

const PANE = 'toolbox'
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

const QUICK = [
  { command: 'compact', icon: '✦', label: 'Shrink this chat (/compact)' },
  { command: 'clear', icon: '◇', label: 'Start a new chat (/clear)' },
] as const

const effortAtom = atom({ plugin: 'toolbox', key: 'effort' } as const, null)
const revisionAtom = atom({ plugin: 'toolbox', key: 'revision' } as const, 0)

/** "claude-opus-5-5" → "Opus 5.5"; anything unknown is shown as given. */
export function modelLabel(id: string): string {
  const found = MODELS.find(m => id.toLowerCase().includes(m.alias))
  return found ? found.label : id
}

function isEffort(value: unknown): value is ToolboxEffort {
  return EFFORTS.some(e => e.level === value)
}

/** "MODS" → "M O D S". */
function spaced(text: string): string {
  return text.split('').join(' ')
}

async function isOpen($: Engine): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function openToolbox($: Engine): Promise<void> {
  await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })
}

async function toggleToolbox($: Engine): Promise<void> {
  if (await isOpen($)) await $.ui.close({ id: PANE })
  else await openToolbox($)
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

async function runQuick($: Engine, command: string): Promise<void> {
  await $.command.run({ command })
}

export function registerToolbox(on: On): void {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'toolbox', description: 'Open or close the Tools panel' })
    return next(e)
  })

  on('command.run', { command: 'toolbox' }, async $ => {
    await toggleToolbox($)
    return { text: 'Tools panel toggled.' }
  })

  // The Infobar's "◆ Tools ▲" button opens and closes the panel.
  on('ui.press', { plugin: 'infobar', element: 'open-tools' }, async ($, e, next) => {
    await toggleToolbox($)
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns)
    await read($, revisionAtom)
    const modelId = await $.session.model()
    const effort = await read($, effortAtom)
    const effortLabel = EFFORTS.find(x => x.level === effort)?.label

    // Rows other mods add beneath (they draw next(e) first, then their own row).
    const below = await next(e)

    const divider = (name: string) => {
      const head = `── ${spaced(name)} `
      return <Text dimColor>{head + '─'.repeat(Math.max(0, width - head.length))}</Text>
    }

    const status = effortLabel ? `${modelLabel(modelId)} · ${effortLabel}` : modelLabel(modelId)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="claude">
            ◆ {' '}
            {spaced(TITLE.toUpperCase())}
          </Text>
          <Text dimColor>{status}</Text>
        </Box>
        <Text> </Text>
        <Box flexDirection="row" flexWrap="wrap">
          <Text dimColor>{'MODEL'.padEnd(9)}</Text>
          {MODELS.map(m =>
            modelId.toLowerCase().includes(m.alias) ? (
              <Button key={`model:${m.alias}`} plain onPress={() => setModel($, m.alias, m.label)}>
                <Text inverse color="claude">{` ${m.label} `}</Text>
              </Button>
            ) : (
              <Button key={`model:${m.alias}`} plain onPress={() => setModel($, m.alias, m.label)}>
                {` ${m.label} `}
              </Button>
            ),
          )}
        </Box>
        <Box flexDirection="row" flexWrap="wrap">
          <Text dimColor>{'EFFORT'.padEnd(9)}</Text>
          {EFFORTS.map(x =>
            x.level === effort ? (
              <Button key={`effort:${x.level}`} plain onPress={() => setEffort($, x.level, x.label)}>
                <Text inverse color="suggestion">{` ${x.label} `}</Text>
              </Button>
            ) : (
              <Button key={`effort:${x.level}`} plain onPress={() => setEffort($, x.level, x.label)}>
                {` ${x.label} `}
              </Button>
            ),
          )}
        </Box>
        {divider('QUICK')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={4}>
          {QUICK.map(q => (
            <Button key={`quick:${q.command}`} plain onPress={() => runQuick($, q.command)}>
              <Text color="claude">{q.icon}</Text>
              {` ${q.label}`}
            </Button>
          ))}
        </Box>
        {divider('MODS')}
        {below ?? <Text dimColor>No mods yet</Text>}
      </Box>
    )
  })
}
