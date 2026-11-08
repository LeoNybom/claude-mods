/** What the model has been told in this chat: nothing yet, the rules, or that ADHD mode is off. */
export type Told = 'nothing' | 'rules' | 'off'

declare module 'claude-code' {
  interface PluginState {
    adhd: {
      /** Whether ADHD mode is on. Saved with $.store. */
      enabled: boolean
    }
  }
}
