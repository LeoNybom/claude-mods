# Claude mods

Mods for Claude Code.

## Clean View

Makes Claude Code calm and friendly for people who aren't technical. While Claude works, tool calls, file diffs and command output are hidden, and one simple checklist sits above the prompt: the plan, what's happening now and how far along it is.

- Turn it on or off from the Tools box (or, without Tools, the **Clean View** button above the prompt), or type `/simple on`, `/simple off` or just `/simple`.
- The choice is remembered on each computer.
- Press ctrl+o to see every hidden row at any time.

## Tools (toolbox)

One panel for everything: switch the model and effort with one click, turn each mod on or off, and run quick actions (`/compact`, `/clear`).

- It opens as a framed box right above the prompt. Open or close it by clicking **◆ Tools ▲** at the right of the Infobar, or type `/toolbox`; ✕ closes it too.
- Clean View, Infobar and Prompt Upgrade each get an on/off row under MODS once they are installed.

## Infobar

One line under the prompt (in the desktop app: right above it): your plan, model, effort, how full the chat is (green, then yellow at 60%, red at 85%), your 5-hour and 7-day usage, and running agents. On a narrow screen the least important parts are left out first.

- Turn it on or off from the Tools panel, or type `/infobar on`, `/infobar off` or just `/infobar`.

## Prompt Upgrade

Turns a rough prompt into a great one before it is sent. A pane asks up to three quick multiple-choice questions, rewrites the prompt, and shows your prompt and the upgrade side by side. Nothing is sent until you press **Run it**.

- `/better <your prompt>` upgrades that prompt. `/better` alone opens a box to type one.
- `/better on` and `/better off` (or its row in the Tools box) flip automatic mode: prompts you type open in the pane first. Start a prompt with `>` to send it as it is.
- `/better history` shows your last 20 upgrades; click one to open its review again.
- Cancel puts your original prompt back in the prompt box.

## Install

At the prompt of a Claude Code terminal session, one line per mod:

```
/plugin install clean-view --marketplace LeoNybom/claude-mods
/plugin install toolbox --marketplace LeoNybom/claude-mods
/plugin install infobar --marketplace LeoNybom/claude-mods
/plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
```

Answer `y` to add the marketplace the first time, then press Enter to choose the user scope (all projects).

From a shell:

```
claude plugin install clean-view --marketplace LeoNybom/claude-mods
claude plugin install toolbox --marketplace LeoNybom/claude-mods
claude plugin install infobar --marketplace LeoNybom/claude-mods
claude plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `LeoNybom/claude-mods`, then Add plugin.

## Update

```
claude plugin marketplace update leonybom-mods
claude plugin update clean-view@leonybom-mods
claude plugin update toolbox@leonybom-mods
claude plugin update infobar@leonybom-mods
claude plugin update prompt-upgrade@leonybom-mods
```

Then type `/reload-plugins` in a running session, or start a new one.

## License

MIT, see [LICENSE](LICENSE).
