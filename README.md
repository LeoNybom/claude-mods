# Claude mods

Mods for Claude Code.

## Clean View

Makes Claude Code calm and friendly for people who aren't technical. While Claude works, tool calls, file diffs and command output are hidden, and one simple checklist sits above the prompt: the plan, what's happening now and how far along it is.

- Turn it on or off with the **Clean View** button above the prompt, or type `/simple on`, `/simple off` or just `/simple`.
- The choice is remembered on each computer.
- Press ctrl+o to see every hidden row at any time.

## Tools (toolbox)

One panel for everything: switch the model and effort with one click, turn each mod on or off, and run quick actions (`/compact`, `/clear`).

- Open or close it by clicking **◆ Tools ▲** at the right of the Infobar, or type `/toolbox`. Esc closes it too.
- Every mod adds its own on/off row under MODS by itself.

## Infobar

One line under the prompt: your plan, model, effort, how full the chat is (green, then yellow at 60%, red at 85%), your 5-hour and 7-day usage, and running agents. On a narrow screen the least important parts are left out first.

- Turn it on or off from the Tools panel, or type `/infobar on`, `/infobar off` or just `/infobar`.

## Install

At the prompt of a Claude Code terminal session, one line per mod:

```
/plugin install clean-view --marketplace LeoNybom/claude-mods
/plugin install toolbox --marketplace LeoNybom/claude-mods
/plugin install infobar --marketplace LeoNybom/claude-mods
```

Answer `y` to add the marketplace the first time, then press Enter to choose the user scope (all projects).

From a shell:

```
claude plugin install clean-view --marketplace LeoNybom/claude-mods
claude plugin install toolbox --marketplace LeoNybom/claude-mods
claude plugin install infobar --marketplace LeoNybom/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `LeoNybom/claude-mods`, then Add plugin.

This repository is private: the computer must be able to read it on GitHub (for example `gh auth login` and then `gh auth setup-git`, or an SSH key).

## Update

```
claude plugin marketplace update leonybom-mods
claude plugin update clean-view@leonybom-mods
claude plugin update toolbox@leonybom-mods
claude plugin update infobar@leonybom-mods
```

Then type `/reload-plugins` in a running session, or start a new one.
