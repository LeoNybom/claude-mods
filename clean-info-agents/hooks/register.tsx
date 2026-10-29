import type { Register } from 'claude-code'

import { registerAgents } from './agents'

export const register: Register = (on, options) => {
  registerAgents(on, options)
}
