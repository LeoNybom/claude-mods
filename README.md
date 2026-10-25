# Claude mods

Mods for Claude Code.

## Clean View

Makes Claude Code calm and friendly for people who aren't technical. While Claude works, tool calls, file diffs and command output are hidden, and one simple checklist sits above the prompt: the plan, what's happening now and how far along it is.

- Turn it on or off with the **Clean View** button above the prompt, or type `/simple on`, `/simple off` or just `/simple`.
- The choice is remembered on each computer.
- Press ctrl+o to see every hidden row at any time.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install clean-view --marketplace LeoNybom/claude-mods
```

Answer `y` to add the marketplace, then press Enter to choose the user scope (all projects).

From a shell:

```
claude plugin install clean-view --marketplace LeoNybom/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `LeoNybom/claude-mods`, then Add plugin.

This repository is private: the computer must be able to read it on GitHub (for example `gh auth login` and then `gh auth setup-git`, or an SSH key).

## Update

```
claude plugin marketplace update leonybom-mods
claude plugin update clean-view@leonybom-mods
```

Then type `/reload-plugins` in a running session, or start a new one.
