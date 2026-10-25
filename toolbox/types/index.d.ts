/**
 * The Tools panel. Other mods add their own row to it: they hook
 * `ui.render` on `{ component: 'Pane', requestId: 'toolbox' }`, draw
 * `await next(e)` first and their row under it, and answer their own
 * Button's press. The MODS section is always last, so rows land there.
 */
export type ToolboxEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    toolbox: {
      /** The effort last chosen or seen; null while unknown. */
      effort: ToolboxEffort | null
      /** Bumped to redraw the panel after the model changes. */
      revision: number
    }
  }
}
