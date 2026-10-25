import type { Register } from 'claude-code'

import { registerCleanView } from './clean-view'

// Each mod adds itself here. More mods can sit next to Clean View later.
export const register: Register = on => {
  registerCleanView(on)
}
