import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

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

const QUICK = [
  { command: 'compact', icon: '✦', label: 'Shrink this chat' },
  { command: 'clear', icon: '◇', label: 'Start a new chat' },
] as const

const effortAtom = atom({ plugin: 'toolbox', key: 'effort' } as const, null)
const revisionAtom = atom({ plugin: 'toolbox', key: 'revision' } as const, 0)
const openAtom = atom({ plugin: 'toolbox', key: 'isOpen' } as const, false)

// The mods the panel knows. A mod shows up once it has written its on/off value;
// it answers the press on its own row (`mod:<plugin>`) itself.
const cleanViewRef = { plugin: 'clean-view', key: 'cleanViewEnabled' } as const
const infobarRef = { plugin: 'infobar', key: 'enabled' } as const
const promptUpgradeRef = { plugin: 'prompt-upgrade', key: 'auto' } as const

type ModName = 'clean-view' | 'infobar' | 'prompt-upgrade'

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

async function toggleOpen($: Engine): Promise<void> {
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

async function runQuick($: Engine, command: string): Promise<void> {
  await close($)
  await $.command.run({ command })
}

async function readFlag($: Engine, which: ModName): Promise<boolean | undefined> {
  const held =
    which === 'clean-view'
      ? await $.state.get(cleanViewRef)
      : which === 'infobar'
        ? await $.state.get(infobarRef)
        : await $.state.get(promptUpgradeRef)
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

  // The box sits above the prompt, above the other mods' rows there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    if (e.props.hasSurvey || !(await read($, openAtom))) return rest

    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, revisionAtom)
    const modelId = await $.session.model()
    const effort = await read($, effortAtom)
    const effortLabel = EFFORTS.find(x => x.level === effort)?.label
    const status = effortLabel ? `${modelLabel(modelId)} · ${effortLabel}` : modelLabel(modelId)

    const section = (name: string) => (
      <Text dimColor wrap="truncate-end">
        {spaced(name)}
      </Text>
    )

    // A solid line across the box: one row tall, the overflow cut off, so it
    // fills the width on every surface without wrapping or an ellipsis.
    const line = (key: string) => (
      <Box key={key} height={1} overflow="hidden" marginY={1}>
        <Text dimColor>{'─'.repeat(400)}</Text>
      </Box>
    )

    const label = (text: string) => (
      <Box width={9}>
        <Text dimColor>{text}</Text>
      </Box>
    )

    const mods: { plugin: ModName; name: string; about: string }[] = [
      { plugin: 'clean-view', name: 'Clean View', about: 'simple checklist' },
      { plugin: 'infobar', name: 'Infobar', about: 'info bar under the prompt' },
      { plugin: 'prompt-upgrade', name: 'Prompt Upgrade', about: 'better prompts' },
    ]
    const modRows: unknown[] = []
    for (const mod of mods) {
      const isOn = await readFlag($, mod.plugin)
      if (isOn === undefined) continue
      modRows.push(
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexDirection="row">
            <Text color={isOn ? 'success' : 'inactive'}>{isOn ? '● ' : '○ '}</Text>
            <Box width={17}>
              <Text bold>{mod.name}</Text>
            </Box>
            <Text dimColor>{mod.about}</Text>
          </Box>
          <Button
            key={`mod:${mod.plugin}`}
            label={isOn ? '● On' : '○ Off'}
            variant={isOn ? 'primary' : 'secondary'}
            onPress={() => undefined}
          />
        </Box>,
      )
    }

    const box = (
      <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color="claude">
            ◆ {spaced(TITLE.toUpperCase())}
          </Text>
          <Box flexDirection="row" gap={2}>
            <Text dimColor>{status}</Text>
            <Button key="close" label="✕" plain role="dismiss" onPress={() => close($)} />
          </Box>
        </Box>
        <Box flexDirection="column" marginTop={1} rowGap="sm">
        <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          {label('MODEL')}
          {MODELS.map(m => (
            <Button
              key={`model:${m.alias}`}
              label={m.label}
              variant={modelId.toLowerCase().includes(m.alias) ? 'primary' : 'secondary'}
              onPress={() => setModel($, m.alias, m.label)}
            />
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1} alignItems="center">
          {label('EFFORT')}
          {EFFORTS.map(x => (
            <Button
              key={`effort:${x.level}`}
              label={x.label}
              variant={x.level === effort ? 'primary' : 'secondary'}
              onPress={() => setEffort($, x.level, x.label)}
            />
          ))}
        </Box>
        </Box>
        {line('line-above-mods')}
        <Box flexDirection="column" rowGap="sm">
          {section('MODS')}
          {modRows.length > 0 ? modRows : <Text dimColor>No mods installed yet</Text>}
        </Box>
        {line('line-below-mods')}
        {section('QUICK')}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {QUICK.map(q => (
            <Button key={`quick:${q.command}`} plain onPress={() => runQuick($, q.command)}>
              <Text color="claude">{q.icon}</Text> {q.label}
            </Button>
          ))}
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        {box}
        {rest ?? null}
      </Box>
    )
  })
}
