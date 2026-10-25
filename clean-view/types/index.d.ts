/** Where a step stands. */
export type CleanViewTaskStatus = 'done' | 'active' | 'upcoming'

/** One row of the checklist. */
export type CleanViewTask = {
  id: string
  name: string
  status: CleanViewTaskStatus
  /** 0 to 100. */
  percent: number
  /** True once Claude has reported a percent for this step. */
  hasReported: boolean
}

/** What the job as a whole is doing. */
export type CleanViewPhase =
  | 'idle'
  | 'working'
  | 'needs-you'
  | 'stuck'
  | 'stopped'
  | 'done'

/** The checklist shown above the prompt. */
export type CleanViewChecklist = {
  /** Counts up with each new job, so late answers for old jobs are ignored. */
  jobId: number
  title: string
  phase: CleanViewPhase
  tasks: CleanViewTask[]
  /** True once Claude has laid out a real plan (plan_steps or a to-do list). */
  isPlanned: boolean
  needsYouReason: string | null
  stuckReason: string | null
  startedAt: number | null
  finishedAt: number | null
  isCollapsed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'clean-view': {
      cleanViewEnabled: boolean
      checklist: CleanViewChecklist
      tick: number
    }
  }
}
