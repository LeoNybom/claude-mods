/** One multiple-choice question the fast model asked. */
export type PromptUpgradeQuestion = { question: string; options: string[] }

/** How a question was answered; null while it is open. */
export type PromptUpgradeAnswer = { kind: 'option' | 'other'; text: string } | { kind: 'skip' } | null

/** Where the pane is. */
export type PromptUpgradePhase =
  | 'idle'
  | 'input'
  | 'reading'
  | 'questions'
  | 'rewriting'
  | 'review'
  | 'edit'
  | 'error'
  | 'history'

/** The upgrade in progress. */
export type PromptUpgradeSession = {
  /** Counts up with each upgrade, so a late model answer for an old one is ignored. */
  id: number
  phase: PromptUpgradePhase
  original: string
  questions: PromptUpgradeQuestion[]
  answers: PromptUpgradeAnswer[]
  /** The question whose "Other" box is open, or null. */
  otherOpen: number | null
  upgraded: string
  added: string[]
  /** The calm message on the error card. */
  error: string | null
  /** Which model call "Try again" repeats. */
  retry: 'questions' | 'rewrite' | null
  /** True right after Copy, until the next change. */
  isCopied: boolean
}

/** One finished upgrade, kept in the history. */
export type PromptUpgradeEntry = { at: number; original: string; upgraded: string; added: string[] }

declare module 'claude-code' {
  interface PluginState {
    'prompt-upgrade': {
      session: PromptUpgradeSession
      /** Automatic mode: typed prompts go to the pane first. Saved with $.store. */
      auto: boolean
      /** The last 20 upgrades, newest first. Saved with $.store. */
      history: PromptUpgradeEntry[]
    }
  }
}
