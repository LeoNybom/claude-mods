/**
 * The Tools box above the prompt. A mod gets a row in it once it writes its
 * on/off value (Clean View: `cleanViewEnabled`, Infobar: `enabled`), and it
 * answers the press on its row (`{ plugin: 'toolbox', element: 'mod:<plugin>' }`).
 */
export type ToolboxEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    toolbox: {
      /** The effort last chosen or seen; null while unknown. */
      effort: ToolboxEffort | null
      /** Bumped to redraw the box after the model changes. */
      revision: number
      /** Whether the box is open. */
      isOpen: boolean
      /** The first list row showing under the popup's header. */
      offset: number
    }
  }
}
