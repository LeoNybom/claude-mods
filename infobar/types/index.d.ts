/** How full something is, 0 to 100. */
export type InfobarPercent = number

declare module 'claude-code' {
  interface PluginState {
    infobar: {
      /** Whether the Infobar is shown. Saved with $.store. */
      enabled: boolean
      /** The model the last main request was sent with; null until one is sent. */
      liveModel: string | null
      /** The effort the last main request was sent with, or the last one chosen. */
      liveEffort: string | null
      /** Bumped to redraw: every second while Claude works, and after each turn. */
      tick: number
    }
  }
}
