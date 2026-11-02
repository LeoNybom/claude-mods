import type { Register } from 'claude-code'

import { registerThinkbar } from './thinkbar'

export const register: Register = on => {
  registerThinkbar(on)
}
