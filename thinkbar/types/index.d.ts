/** What Claude is doing right now, from the last thing it did. */
export type Phase = 'thinking' | 'reading' | 'editing' | 'running' | 'delegating' | 'writing' | 'done' | 'stopped'

/** One prompt's progress, from its start to its answer. */
export type Run = {
  turnId: string
  phase: Phase
  /** Model requests and tool calls so far. */
  steps: number
  /** From Claude's own task list, when it keeps one; 0 when it doesn't. */
  total: number
  done: number
  /** Where the bar was when the task list came; its steps share the rest evenly. */
  listBase?: number
  /** 0 to 1, never moves back during a run. */
  ratio: number
  isFinished: boolean
}

declare module 'claude-code' {
  interface PluginState {
    thinkbar: {
      /** Whether the bar shows. Saved with $.store. */
      enabled: boolean
      run: Run | null
    }
  }
}
