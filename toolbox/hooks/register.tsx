import type { Register } from 'claude-code'

import { registerToolbox } from './toolbox'

export const register: Register = on => {
  registerToolbox(on)
}
