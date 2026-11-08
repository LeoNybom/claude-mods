import type { Register } from 'claude-code'

import { registerAdhd } from './adhd'

export const register: Register = on => {
  registerAdhd(on)
}
