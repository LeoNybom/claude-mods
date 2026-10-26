import type { PromptUpgradeAnswer, PromptUpgradeQuestion } from '../types'

// ---------------------------------------------------------------------------
// Which typed prompts go to the pane
// ---------------------------------------------------------------------------

/** What a submitted prompt looks like to the interceptor. */
export type Submission = {
  text: string
  hasCommand: boolean
  isMeta: boolean
  hasAttachments: boolean
  /** True when Claude was working as it was sent. */
  isDuringTurn: boolean
  /** Who sent it: only the person's own Enter in the prompt box is caught. */
  originKind: string
}

export type Route = { kind: 'pass' } | { kind: 'strip'; text: string } | { kind: 'upgrade' }

const SHORT_REPLY =
  /^(y|n|yes|no|yep|nope|ok|okay|sure|thanks|thank you|go|go on|go ahead|continue|keep going|do it|sounds good|looks good|lgtm|perfect|great|stop|ja|nej|okej|kör|fortsätt|tack)[.!]*$/i

/** Decides what happens to a prompt typed while automatic mode is on. */
export function routeSubmission(s: Submission): Route {
  if (s.originKind !== 'composer') return { kind: 'pass' }
  if (s.hasCommand || s.isMeta || s.hasAttachments || s.isDuringTurn) return { kind: 'pass' }
  const text = s.text.trim()
  if (text.startsWith('>')) return { kind: 'strip', text: text.slice(1).trimStart() }
  if (text === '' || text.startsWith('/')) return { kind: 'pass' }
  if (SHORT_REPLY.test(text) || wordCount(text) <= 2) return { kind: 'pass' }
  return { kind: 'upgrade' }
}

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

// ---------------------------------------------------------------------------
// Talking to the model
// ---------------------------------------------------------------------------

export const QUESTIONS_SYSTEM = [
  'You help a person improve a prompt they are about to send to an AI assistant.',
  'Ask at most three multiple-choice questions whose answers would most improve the result.',
  'Each question is short and plain, with two to four short options (a few words each).',
  'Ask nothing the prompt already answers. If no question would really help, ask none.',
  'Reply with JSON only, no other text: {"questions":[{"question":"...","options":["...","..."]}]}',
].join('\n')

export const REWRITE_SYSTEM = [
  'You rewrite a rough prompt into a great one that the person could have typed themselves.',
  'Rules:',
  '- Keep exactly what they meant. Add a clear goal, who it is for, the format, and what "done" looks like.',
  '- Use their answers. Leave out anything they skipped.',
  '- Never invent facts, names, numbers or prices. Where something is unknown, leave a [placeholder] in square brackets.',
  '- Write it as one request in plain language, in the same language as their prompt. No headings about yourself.',
  'Reply with JSON only, no other text: {"prompt":"the upgraded prompt","added":["short note of one thing you added", "..."]}',
].join('\n')

export function questionsPrompt(original: string): string {
  return `The prompt:\n"""\n${original}\n"""`
}

export function rewritePrompt(
  original: string,
  questions: readonly PromptUpgradeQuestion[],
  answers: readonly PromptUpgradeAnswer[],
): string {
  const lines = questions.map((q, i) => {
    const a = answers[i]
    if (a === null || a === undefined || a.kind === 'skip') return `- ${q.question}: (skipped, leave it out)`
    return `- ${q.question}: ${a.text}`
  })
  const answered = lines.length > 0 ? `\n\nTheir answers:\n${lines.join('\n')}` : ''
  return `The rough prompt:\n"""\n${original}\n"""${answered}`
}

/** The first {...} block of a reply, parsed, or undefined. */
function firstJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/** Reads the questions from the model's reply; undefined when it cannot be read. */
export function parseQuestions(text: string): PromptUpgradeQuestion[] | undefined {
  const data = firstJson(text) as { questions?: unknown } | undefined
  if (data === undefined || !Array.isArray(data.questions)) return undefined
  const out: PromptUpgradeQuestion[] = []
  for (const item of data.questions as { question?: unknown; options?: unknown }[]) {
    if (typeof item?.question !== 'string' || !Array.isArray(item.options)) continue
    const options = item.options.filter((o): o is string => typeof o === 'string' && o.trim() !== '').map(o => o.trim())
    if (options.length < 2) continue
    out.push({ question: item.question.trim(), options: options.slice(0, 4) })
    if (out.length === 3) break
  }
  return out
}

/** Reads the upgraded prompt from the model's reply; undefined when it cannot be read. */
export function parseRewrite(text: string): { upgraded: string; added: string[] } | undefined {
  const data = firstJson(text) as { prompt?: unknown; added?: unknown } | undefined
  if (data === undefined || typeof data.prompt !== 'string' || data.prompt.trim() === '') return undefined
  const added = Array.isArray(data.added)
    ? data.added.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map(a => a.trim())
    : []
  return { upgraded: data.prompt.trim(), added: added.slice(0, 8) }
}

// ---------------------------------------------------------------------------
// Big numbers: three rows tall, heavy box-drawing characters
// ---------------------------------------------------------------------------

const DIGITS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['╺━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

/** A number as three rows of heavy box-drawing characters. */
export function bigNumber(n: number): [string, string, string] {
  const digits = String(Math.max(0, Math.round(n))).split('')
  const rows: [string, string, string] = ['', '', '']
  for (const d of digits) {
    const glyph = DIGITS[d] ?? DIGITS['0']!
    for (let r = 0; r < 3; r++) rows[r] += (rows[r] === '' ? '' : ' ') + glyph[r]
  }
  return rows
}
