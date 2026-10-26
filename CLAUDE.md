# Rules for this repository

This repository is a marketplace of Claude Code mods (`clean-view`, `toolbox`, `infobar`, `prompt-upgrade`). Other people install them with `claude plugin install <mod>@leonybom-mods` and update with `claude plugin update`.

## Every change to a mod gets a new version

Whenever a mod's files change, raise the `version` in that mod's `.claude-plugin/plugin.json` in the same commit, so `claude plugin update` picks it up:

- **Patch** (0.2.0 → 0.2.1): a fix or a small visual tweak.
- **Minor** (0.2.1 → 0.3.0): a new feature, setting, command or row.
- **Major** (0.x → 1.0.0): only when the owner asks for it.

Raise only the mods that changed, once per release (several changes before one push share one bump). Add a line for it under the mod's heading in `CHANGELOG.md`, newest first. A new mod starts at 0.1.0 and gets its own heading in `CHANGELOG.md`, an entry in `.claude-plugin/marketplace.json` and install/update lines in `README.md`.
