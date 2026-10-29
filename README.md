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
- Clean View, Infobar, Prompt Upgrade and Clean Info Agents each get an on/off row under MODS once they are installed.

## Infobar

One line under the prompt (in the desktop app: right above it): your model and effort (terminal only), your git branch with a yellow or green dot, how full the chat is (green, then yellow at 60%, red at 85%), your 5-hour and 7-day usage, and running agents. On a narrow screen the least important parts are left out first.

- Turn it on or off from the Tools panel, or type `/infobar on`, `/infobar off` or just `/infobar`.

## Prompt Upgrade

Turns a rough prompt into a great one before it is sent. A pane asks up to three quick multiple-choice questions, rewrites the prompt, and shows your prompt and the upgrade side by side. Nothing is sent until you press **Run it**.

- `/better <your prompt>` upgrades that prompt. `/better` alone opens a box to type one.
- `/better on` and `/better off` (or its row in the Tools box) flip automatic mode: prompts you type open in the pane first. Start a prompt with `>` to send it as it is.
- `/better history` shows your last 20 upgrades; click one to open its review again.
- Cancel puts your original prompt back in the prompt box.

## Clean Info Agents

Lets Claude plan a bigger task and hand the work to helper agents, while you watch it happen. Based on savvy-flow and savvy-progress from [claude-kit](https://github.com/JohnnyVizz/claude-kit) by johnnyvizz (MIT, see [LICENSE-claude-kit](clean-info-agents/LICENSE-claude-kit)).

- `/savvy-flow <task>` (`/clean-info-agents:savvy-flow` when installed as a plugin): Claude plans, decides the design, hands each task to the cheapest agent that gets it right, and checks what comes back.
- Five agents, each a plain file in `clean-info-agents/agents/` that you can change (model, effort, rules):

  | Agent | Model / effort | For |
  | --- | --- | --- |
  | `savvy-fable` | Fable / high | the hardest logic and bugs |
  | `savvy-heavy` | Opus / xhigh | unfamiliar code, unclear cause |
  | `savvy-careful` | Opus / high | delicate but clear changes |
  | `savvy-medium` | Opus / medium | standard feature work |
  | `savvy-light` | Opus / low | mechanical edits, builds, tests |

- A progress bar shows the plan, the phase and how many tasks are done. In the desktop app it sits right above the Infobar; in the terminal it sits under the prompt right above the Infobar (above the prompt when the Infobar is off), in your terminal theme's colors.
- An agents panel shows every agent: running, finished and planned, with model, effort, context, cost and time. Click `×N` on the bar or type `/agents-info` to show or hide it; `/agents-info open` opens it.
- Turn it on or off from the Tools box, or type `/agents-info on` or `/agents-info off`. Off, the bar is hidden and the panel no longer opens by itself.
- Panel language (`auto`, `en`, `ru`, `he`) and when the panel opens by itself (`savvy` or `any`) are set in `/config`.

## Install

At the prompt of a Claude Code terminal session, one line per mod:

```
/plugin install clean-view --marketplace LeoNybom/claude-mods
/plugin install toolbox --marketplace LeoNybom/claude-mods
/plugin install infobar --marketplace LeoNybom/claude-mods
/plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
/plugin install clean-info-agents --marketplace LeoNybom/claude-mods
```

Answer `y` to add the marketplace the first time, then press Enter to choose the user scope (all projects).

From a shell:

```
claude plugin install clean-view --marketplace LeoNybom/claude-mods
claude plugin install toolbox --marketplace LeoNybom/claude-mods
claude plugin install infobar --marketplace LeoNybom/claude-mods
claude plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
claude plugin install clean-info-agents --marketplace LeoNybom/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `LeoNybom/claude-mods`, then Add plugin.

## Update

```
claude plugin marketplace update leonybom-mods
claude plugin update clean-view@leonybom-mods
claude plugin update toolbox@leonybom-mods
claude plugin update infobar@leonybom-mods
claude plugin update prompt-upgrade@leonybom-mods
claude plugin update clean-info-agents@leonybom-mods
```

Then type `/reload-plugins` in a running session, or start a new one.

Every change to a mod raises its version number, so these commands always find the newest one. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
