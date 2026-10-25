import type { Register } from 'claude-code'

import { registerInfobar } from './infobar'

export const register: Register = on => {
  registerInfobar(on)
}
