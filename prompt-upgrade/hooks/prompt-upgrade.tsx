import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { PromptUpgradeAnswer, PromptUpgradeEntry, PromptUpgradeSession } from '../types'
import {
  QUESTIONS_SYSTEM,
  REWRITE_SYSTEM,
  bigNumber,
  parseQuestions,
  parseRewrite,
  questionsPrompt,
  rewritePrompt,
  routeSubmission,
  wordCount,
} from './logic'

type Engine = EngineInterface

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANE = 'prompt-upgrade'
const TITLE = 'PROMPT UPGRADE'
const QUESTIONS_MODEL = 'haiku'
const REWRITE_MODEL = 'sonnet'
const HISTORY_SIZE = 20

const GOLD = '#F2C46D'
const HAIRLINE = '#262B33'
const MUTED = '#7D8590'
const TEXT = '#E6EDF3'
const GREEN = '#3DD68C'
const AMBER = '#E3B341'
const DARK = '#0D1117'

const SAFE_ERROR = 'Your prompt is safe.'

const IDLE: PromptUpgradeSession = {
  id: 0,
  phase: 'idle',
  original: '',
  questions: [],
  answers: [],
  otherOpen: null,
  upgraded: '',
  added: [],
  error: null,
  retry: null,
  isCopied: false,
}

const sessionAtom = atom({ plugin: 'prompt-upgrade', key: 'session' } as const, IDLE)
const autoAtom = atom({ plugin: 'prompt-upgrade', key: 'auto' } as const, false)
const historyAtom = atom({ plugin: 'prompt-upgrade', key: 'history' } as const, [])

// ---------------------------------------------------------------------------
// Session changes (never from a draw)
// ---------------------------------------------------------------------------

async function change($: Engine, fn: (s: PromptUpgradeSession) => PromptUpgradeSession): Promise<void> {
  await update($, sessionAtom, s => fn(s ?? IDLE))
}

async function current($: Engine): Promise<PromptUpgradeSession> {
  return (await read($, sessionAtom)) ?? IDLE
}

async function setAuto($: Engine, value: boolean): Promise<void> {
  await update($, autoAtom, () => value)
  await $.store.set('auto', value)
}

/** Opens the pane. When the window has no room, the words go back to the prompt box. */
async function openPane($: Engine): Promise<boolean> {
  const placed = await $.ui.open({ id: PANE, title: 'Prompt Upgrade', focus: true })
  if (placed.isPlaced) return true
  const s = await current($)
  await change($, () => ({ ...IDLE, id: s.id }))
  if (s.original !== '') await $.prompt.fill({ text: s.original, mode: 'replace' })
  $.ui.toast('The window is too narrow for Prompt Upgrade, so your words are back in the prompt box.')
  return false
}

async function closePane($: Engine): Promise<void> {
  if ((await $.ui.panes()).some(p => p.id === PANE)) await $.ui.close({ id: PANE })
}

/** Starts an upgrade of `original`: Reading, then Questions. */
async function start($: Engine, original: string): Promise<void> {
  const s = await current($)
  const id = s.id + 1
  await change($, () => ({ ...IDLE, id, phase: 'reading', original }))
  if (await openPane($)) await askQuestions($, id)
}

async function openInput($: Engine): Promise<void> {
  const s = await current($)
  await change($, () => ({ ...IDLE, id: s.id + 1, phase: 'input' }))
  await openPane($)
}

async function openHistory($: Engine): Promise<void> {
  const s = await current($)
  await change($, () => ({ ...IDLE, id: s.id + 1, phase: 'history' }))
  await openPane($)
}

async function failed($: Engine, id: number, retry: 'questions' | 'rewrite', why: string): Promise<void> {
  await change($, s =>
    s.id === id ? { ...s, phase: 'error', retry, error: `${why} ${SAFE_ERROR}` } : s,
  )
}

async function askQuestions($: Engine, id: number): Promise<void> {
  const s = await current($)
  if (s.id !== id) return
  const reply = await $.model.complete({
    model: QUESTIONS_MODEL,
    effort: 'low',
    maxTokens: 800,
    timeoutMs: 45000,
    system: QUESTIONS_SYSTEM,
    prompt: questionsPrompt(s.original),
  })
  if (!reply.isAnswered) {
    await failed($, id, 'questions', "The questions couldn't be fetched.")
    return
  }
  const questions = parseQuestions(reply.text)
  if (questions === undefined) {
    await failed($, id, 'questions', "The questions came back in a form I couldn't read.")
    return
  }
  if (questions.length === 0) {
    await change($, x => (x.id === id ? { ...x, phase: 'rewriting', questions: [], answers: [] } : x))
    await rewrite($, id)
    return
  }
  await change($, x =>
    x.id === id ? { ...x, phase: 'questions', questions, answers: questions.map(() => null) } : x,
  )
}

async function answer($: Engine, index: number, value: PromptUpgradeAnswer): Promise<void> {
  const s = await current($)
  if (s.phase !== 'questions') return
  const answers = s.answers.map((a, i) => (i === index ? value : a))
  const isDone = answers.every(a => a !== null)
  await change($, x => ({ ...x, answers, otherOpen: null, phase: isDone ? 'rewriting' : 'questions' }))
  if (isDone) await rewrite($, s.id)
}

async function skipRest($: Engine): Promise<void> {
  const s = await current($)
  if (s.phase !== 'questions') return
  const answers = s.answers.map(a => a ?? { kind: 'skip' as const })
  await change($, x => ({ ...x, answers, otherOpen: null, phase: 'rewriting' }))
  await rewrite($, s.id)
}

async function rewrite($: Engine, id: number): Promise<void> {
  const s = await current($)
  if (s.id !== id) return
  const reply = await $.model.complete({
    model: REWRITE_MODEL,
    effort: 'medium',
    maxTokens: 3000,
    timeoutMs: 90000,
    system: REWRITE_SYSTEM,
    prompt: rewritePrompt(s.original, s.questions, s.answers),
  })
  if (!reply.isAnswered) {
    await failed($, id, 'rewrite', "The rewrite couldn't be fetched.")
    return
  }
  const result = parseRewrite(reply.text)
  if (result === undefined) {
    await failed($, id, 'rewrite', "The rewrite came back in a form I couldn't read.")
    return
  }
  const now = await $.clock.now()
  await change($, x => (x.id === id ? { ...x, phase: 'review', upgraded: result.upgraded, added: result.added } : x))
  const entry: PromptUpgradeEntry = { at: now, original: s.original, upgraded: result.upgraded, added: result.added }
  await update($, historyAtom, list => [entry, ...(list ?? [])].slice(0, HISTORY_SIZE))
  await $.store.set('history', await read($, historyAtom))
}

async function retry($: Engine): Promise<void> {
  const s = await current($)
  if (s.phase !== 'error' || s.retry === null) return
  const id = s.id
  if (s.retry === 'questions') {
    await change($, x => ({ ...x, phase: 'reading', error: null, retry: null }))
    await askQuestions($, id)
  } else {
    await change($, x => ({ ...x, phase: 'rewriting', error: null, retry: null }))
    await rewrite($, id)
  }
}

/** Sends a prompt as yours. A plugin's own prompt never comes back to the pane. */
async function send($: Engine, text: string): Promise<void> {
  const s = await current($)
  await change($, () => ({ ...IDLE, id: s.id }))
  await closePane($)
  await $.prompt.submit({ text, asUser: true })
}

async function cancel($: Engine): Promise<void> {
  const s = await current($)
  await change($, () => ({ ...IDLE, id: s.id }))
  await closePane($)
  if (s.original !== '') await $.prompt.fill({ text: s.original, mode: 'replace' })
}

async function copy($: Engine, surface: RenderInput['surface']): Promise<void> {
  const s = await current($)
  const copied = await $.ui.copy({ text: s.upgraded, surface })
  await change($, x => ({ ...x, isCopied: copied.isCopied }))
}

async function openEntry($: Engine, index: number): Promise<void> {
  const list = (await read($, historyAtom)) ?? []
  const entry = list[index]
  if (entry === undefined) return
  await change($, x => ({
    ...IDLE,
    id: x.id + 1,
    phase: 'review',
    original: entry.original,
    upgraded: entry.upgraded,
    added: entry.added,
  }))
}

/** After a reload mid-step, picks the step back up. */
async function resume($: Engine): Promise<void> {
  const s = await current($)
  if (s.phase === 'idle') return
  const placed = await openPane($)
  if (!placed) return
  if (s.phase === 'reading') await askQuestions($, s.id)
  if (s.phase === 'rewriting') await rewrite($, s.id)
}

/** Runs work outside the hook that asked for it, so a command answers at once. */
function later($: Engine, work: () => Promise<void>): void {
  $.clock.after(0, () => {
    void work().catch(() => {
      void change($, s => ({
        ...s,
        phase: 'error',
        retry: s.phase === 'rewriting' ? 'rewrite' : s.phase === 'reading' ? 'questions' : null,
        error: `Something went wrong. ${SAFE_ERROR}`,
      }))
    })
  })
}

// ---------------------------------------------------------------------------
// The mod
// ---------------------------------------------------------------------------

export function registerPromptUpgrade(on: On): void {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'better',
      description: 'Upgrade a rough prompt before it is sent (on, off, history)',
      argumentHint: '<prompt> | on | off | history',
    })
    // Always written, so the Tools box knows Prompt Upgrade is installed.
    const auto = await $.store.get('auto')
    await update($, autoAtom, () => auto === true)
    const history = await $.store.get('history')
    if (Array.isArray(history)) await update($, historyAtom, () => history as PromptUpgradeEntry[])
    later($, () => resume($))
    return next(e)
  })

  on('command.run', { command: 'better' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'on' || word === 'off') {
      await setAuto($, word === 'on')
      return {
        text:
          word === 'on'
            ? 'Prompt Upgrade is on: prompts you type open in the pane first. Start one with > to send it as it is.'
            : 'Prompt Upgrade is off: prompts are sent as you type them.',
      }
    }
    if (word === 'history') {
      later($, () => openHistory($))
      return { text: 'Opening your last upgrades.' }
    }
    if (arg === '') {
      later($, () => openInput($))
      return { text: 'Type your prompt in the Prompt Upgrade pane.' }
    }
    later($, () => start($, arg))
    return { text: 'Upgrading your prompt in the Prompt Upgrade pane.' }
  }).catch(() => ({ text: 'Prompt Upgrade could not start. Your prompt is safe; try /better again.' }))

  // Its row in the Tools box flips automatic mode.
  on('ui.press', { plugin: 'toolbox', element: 'mod:prompt-upgrade' }, async ($, e, next) => {
    await setAuto($, !(await read($, autoAtom)))
    return next(e)
  })

  // Automatic mode: a prompt typed in the prompt box goes to the pane first.
  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, autoAtom))) return next(e)
    const route = routeSubmission({
      text: e.text,
      hasCommand: e.command !== undefined,
      isMeta: e.isMeta === true,
      hasAttachments: (e.attachments?.length ?? 0) > 0,
      isDuringTurn: e.turnId !== undefined,
      originKind: e.origin.kind,
    })
    if (route.kind === 'pass') return next(e)
    if (route.kind === 'strip') return next({ ...e, text: route.text })
    const original = e.text.trim()
    later($, () => start($, original))
    return { drop: 'Opened in Prompt Upgrade.' }
  }).catch(($, e, next) => next(e))

  // Closing the pane by hand is a Cancel: your words go back in the prompt box.
  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE && e.origin.kind === 'person') {
      const s = await current($)
      await change($, () => ({ ...IDLE, id: s.id }))
      if (s.original !== '' && s.phase !== 'history') await $.prompt.fill({ text: s.original, mode: 'replace' })
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawPane($, e))
}

// ---------------------------------------------------------------------------
// Drawing (reads only)
// ---------------------------------------------------------------------------

const STEPS = ['Your prompt', 'Questions', 'Rewrite', 'Review'] as const

function stepOf(s: PromptUpgradeSession): number {
  if (s.phase === 'questions') return 1
  if (s.phase === 'rewriting') return 2
  if (s.phase === 'review' || s.phase === 'edit') return 3
  if (s.phase === 'error') return s.retry === 'rewrite' ? 2 : 1
  return 0
}

async function drawPane($: Engine, e: RenderInput<'Pane'>): Promise<unknown> {
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const width = Math.max(30, e.props.bodyColumns)
  const isWide = width >= 80
  const isDesktop = e.surface !== 'terminal'
  const s = await current($)

  // --- small building blocks ---
  const hairline = (color: string) => (
    <Box flexGrow={1} height={1} overflow="hidden">
      <Text color={color}>{'─'.repeat(400)}</Text>
    </Box>
  )

  const heading = (name: string) => (
    <Box flexDirection="row" marginTop={1}>
      <Text color={MUTED}>{name.toUpperCase()} </Text>
      {hairline(HAIRLINE)}
    </Box>
  )

  /** A chip: gold for the main action, slate for the others, plain muted text for quiet ones. */
  const chip = (key: string, label: string, kind: 'main' | 'slate' | 'quiet' | 'picked', onPress: () => unknown) => {
    if (kind === 'quiet') {
      return (
        <Button key={key} plain onPress={onPress}>
          <Text color={MUTED}>{label}</Text>
        </Button>
      )
    }
    if (isDesktop) {
      return <Button key={key} label={label} variant={kind === 'main' || kind === 'picked' ? 'primary' : 'secondary'} onPress={onPress} />
    }
    const bg = kind === 'main' ? GOLD : kind === 'picked' ? GREEN : HAIRLINE
    const fg = kind === 'slate' ? TEXT : DARK
    return (
      <Button key={key} plain onPress={onPress}>
        <Text backgroundColor={bg} color={fg} bold={kind !== 'slate'}>
          {` ${label} `}
        </Text>
      </Button>
    )
  }

  const card = (title: string, body: string, border: string) => (
    <Box flexDirection="column" borderStyle="round" borderColor={border} paddingX={1} flexGrow={1}>
      <Text color={MUTED}>{title.toUpperCase()}</Text>
      <Text color={TEXT}>{body}</Text>
    </Box>
  )

  const header = (
    <Box flexDirection="column">
      <Text bold color={TEXT}>
        {TITLE}
      </Text>
      <Box flexDirection="row">
        <Text color={GOLD}>{'━'.repeat(TITLE.length)}</Text>
        {hairline(HAIRLINE)}
      </Box>
    </Box>
  )

  const step = stepOf(s)
  const tracker = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
      {STEPS.map((name, i) => {
        const isDone = i < step || (s.phase === 'review' && i === 3)
        const isNow = i === step && !isDone
        const mark = isDone ? '✓' : String(i + 1)
        const color = isDone ? GREEN : isNow ? GOLD : MUTED
        return (
          <Text color={color} bold={isNow}>
            {mark} {name}
          </Text>
        )
      })}
    </Box>
  )

  const view: unknown[] = []

  if (s.phase === 'idle') {
    view.push(<Text color={MUTED}>Nothing to upgrade. Type /better and a prompt to start.</Text>)
  }

  if (s.phase === 'input') {
    view.push(heading('Your prompt'))
    view.push(
      <t.Input
        key="new-prompt"
        placeholder="Type the prompt you want to upgrade, then press Enter"
        rows={3}
        autoFocus
        onSubmit={(value: string) => {
          if (value.trim() !== '') void start($, value.trim())
        }}
      />,
    )
    view.push(
      <Box flexDirection="row" marginTop={1}>
        {chip('cancel', 'Cancel', 'quiet', () => cancel($))}
      </Box>,
    )
  }

  if (s.phase === 'reading') {
    view.push(tracker)
    view.push(heading('Your prompt'))
    view.push(card('Your prompt', s.original, HAIRLINE))
    view.push(<Text color={MUTED}>Reading your prompt and picking the questions that would help most.</Text>)
    view.push(<Box marginTop={1}>{chip('cancel', 'Cancel', 'quiet', () => cancel($))}</Box>)
  }

  if (s.phase === 'questions') {
    const answered = s.answers.filter(a => a !== null).length
    view.push(tracker)
    view.push(heading('Questions'))
    view.push(
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} alignItems="center">
        <Text color={MUTED}>
          {answered} of {s.questions.length} answered
        </Text>
        {chip('skip-rest', 'Skip the rest, upgrade now', 'slate', () => skipRest($))}
      </Box>,
    )
    s.questions.forEach((q, i) => {
      const a = s.answers[i] ?? null
      const badge =
        a === null ? (
          <Text backgroundColor={GOLD} color={DARK} bold>
            {` ${i + 1} `}
          </Text>
        ) : (
          <Text backgroundColor={GREEN} color={DARK} bold>
            {' ✓ '}
          </Text>
        )
      view.push(
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row" columnGap={1}>
            {badge}
            <Text color={TEXT} bold>
              {q.question}
            </Text>
          </Box>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="sm" marginTop={isDesktop ? 1 : 0}>
            {q.options.map((option, j) =>
              chip(`q${i}:o${j}`, option, a !== null && a.kind === 'option' && a.text === option ? 'picked' : 'slate', () =>
                answer($, i, { kind: 'option', text: option }),
              ),
            )}
            {chip(`q${i}:other`, 'Other (type it)', a !== null && a.kind === 'other' ? 'picked' : 'slate', () =>
              change($, x => ({ ...x, otherOpen: i })),
            )}
            {chip(`q${i}:skip`, 'Skip', 'quiet', () => answer($, i, { kind: 'skip' }))}
          </Box>
          {s.otherOpen === i ? (
            <t.Input
              key={`q${i}:other-text`}
              placeholder="Type your answer, then press Enter"
              autoFocus
              onSubmit={(value: string) => {
                if (value.trim() !== '') void answer($, i, { kind: 'other', text: value.trim() })
              }}
            />
          ) : null}
        </Box>,
      )
    })
    view.push(<Box marginTop={1}>{chip('cancel', 'Cancel', 'quiet', () => cancel($))}</Box>)
  }

  if (s.phase === 'rewriting') {
    view.push(tracker)
    view.push(heading('Rewrite'))
    view.push(card('Your prompt', s.original, HAIRLINE))
    view.push(<Text color={MUTED}>Writing the upgrade from your prompt and your answers.</Text>)
    view.push(<Box marginTop={1}>{chip('cancel', 'Cancel', 'quiet', () => cancel($))}</Box>)
  }

  if (s.phase === 'error') {
    view.push(tracker)
    view.push(
      <Box flexDirection="column" borderStyle="round" borderColor={AMBER} paddingX={1} marginTop={1}>
        <Text color={AMBER} bold>
          Something didn't work
        </Text>
        <Text color={TEXT}>{s.error ?? SAFE_ERROR}</Text>
      </Box>,
    )
    view.push(
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="sm" marginTop={1} alignItems="center">
        {chip('retry', 'Try again', 'main', () => retry($))}
        {chip('send-original', 'Send my original', 'slate', () => send($, s.original))}
        {chip('cancel', 'Cancel', 'quiet', () => cancel($))}
      </Box>,
    )
  }

  if (s.phase === 'review' || s.phase === 'edit') {
    const before = wordCount(s.original)
    const after = wordCount(s.upgraded)
    const tile = (n: number, label: string, color: string) => {
      const rows = bigNumber(n)
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={HAIRLINE} paddingX={1} alignItems="center">
          {rows.map(row => (
            <Text color={color} mono>
              {row}
            </Text>
          ))}
          <Text color={MUTED}>{label}</Text>
        </Box>
      )
    }
    view.push(tracker)
    view.push(
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
        {tile(before, 'words before', TEXT)}
        {tile(after, 'words after', GOLD)}
        {tile(s.added.length, 'details added', GREEN)}
      </Box>,
    )
    if (s.phase === 'edit') {
      view.push(heading('Edit the upgrade'))
      view.push(
        <t.Input
          key="edit"
          value={s.upgraded}
          rows={Math.min(12, Math.max(3, Math.ceil(s.upgraded.length / Math.max(20, width - 4))))}
          autoFocus
          submitLabel="Run it"
          onSubmit={(value: string) => {
            if (value.trim() !== '') void send($, value.trim())
          }}
        />,
      )
      view.push(
        <Box flexDirection="row" columnGap={1} marginTop={1}>
          {chip('stop-edit', 'Back', 'slate', () => change($, x => ({ ...x, phase: 'review' })))}
          {chip('cancel', 'Cancel', 'quiet', () => cancel($))}
        </Box>,
      )
    } else {
      view.push(
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap="sm" marginTop={1} alignItems="center">
          {chip('run', 'Run it', 'main', () => send($, s.upgraded))}
          {chip('edit', 'Edit', 'slate', () => change($, x => ({ ...x, phase: 'edit', isCopied: false })))}
          {chip('copy', s.isCopied ? 'Copied' : 'Copy', 'slate', () => copy($, e.surface))}
          {chip('cancel', 'Cancel', 'quiet', () => cancel($))}
        </Box>,
      )
    }
    if (s.added.length > 0) {
      view.push(heading('What I added'))
      for (const item of s.added) {
        view.push(
          <Box flexDirection="row">
            <Text color={GREEN}>+ </Text>
            <Text color={TEXT}>{item}</Text>
          </Box>,
        )
      }
    }
    view.push(heading('Side by side'))
    view.push(
      <Box flexDirection={isWide ? 'row' : 'column'} columnGap={1}>
        <Box width={isWide ? '50%' : '100%'} flexDirection="column">
          {card('Your prompt', s.original, HAIRLINE)}
        </Box>
        <Box width={isWide ? '50%' : '100%'} flexDirection="column">
          {card('The upgrade', s.upgraded, GOLD)}
        </Box>
      </Box>,
    )
  }

  if (s.phase === 'history') {
    const list = (await read($, historyAtom)) ?? []
    view.push(heading('Your last upgrades'))
    if (list.length === 0) view.push(<Text color={MUTED}>No upgrades yet. Try /better and a prompt.</Text>)
    list.forEach((entry, i) => {
      const first = entry.original.replace(/\s+/g, ' ')
      const room = Math.max(10, width - 6)
      const label = first.length > room ? first.slice(0, room - 1) + '…' : first
      view.push(
        <Button key={`history:${i}`} plain onPress={() => openEntry($, i)}>
          <Text color={GOLD}>{String(i + 1).padStart(2)} </Text>
          <Text color={TEXT}>{label}</Text>
        </Button>,
      )
    })
    view.push(<Box marginTop={1}>{chip('cancel', 'Close', 'quiet', () => cancel($))}</Box>)
  }

  return (
    <Box flexDirection="column">
      {header}
      {view}
    </Box>
  )
}
