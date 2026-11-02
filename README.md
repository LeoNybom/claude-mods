# Claude mods

Mods for Claude Code.

## Tools (toolbox)

One panel for everything: turn each mod on or off, run quick actions (`/compact`, `/clear`), and in the terminal switch the model and effort with one click.

- It opens right above the prompt. Open or close it by clicking **◆ Tools ▲** at the right of the Infobar (in the desktop app **∧ Tools** at its left, pointing down while open), or type `/toolbox`; in the terminal ✕ closes it too.
- Infobar, Prompt Upgrade and Thinkbar each get a row under MODS once they are installed: a green dot while on, an empty ring while off. Click the name to turn it on or off; rest the pointer on it to see what it does.
- Desktop app: everything sits on one row above the Infobar (MODS and QUICK each on their own row when the window is narrow). The app shows the model and effort itself, so they are left out. With the Infobar off, Tools draws its own **∧ Tools** button, so it is never out of reach.
- Terminal: a list with the model and effort at the top; when it is taller than the room above the prompt it scrolls under its header, with ▲ and ▼.

## Infobar

One line under the prompt (in the desktop app: right above it): your model and effort (terminal only), your git branch with a yellow or green dot, how full the chat is (green, then yellow at 60%, red at 85%), your 5-hour and 7-day usage, and running agents. On a narrow screen the least important parts are left out first.

- Turn it on or off from the Tools panel, or type `/infobar on`, `/infobar off` or just `/infobar`.

## Prompt Upgrade

Turns a rough prompt into a great one before it is sent. A pane asks up to three quick multiple-choice questions, rewrites the prompt, and shows your prompt and the upgrade side by side. Nothing is sent until you press **Run it**.

- `/better <your prompt>` upgrades that prompt. `/better` alone opens a box to type one.
- `/better on` and `/better off` (or its row in the Tools box) flip automatic mode: prompts you type open in the pane first. Start a prompt with `>` to send it as it is.
- `/better history` shows your last 20 upgrades; click one to open its review again.
- Cancel puts your original prompt back in the prompt box.

## Thinkbar

A purple progress bar right above the prompt, above the Infobar and the other mods, that shows how far Claude has come on each prompt.

- It appears when you send a prompt and fills in as Claude works. The word at its left says what Claude is doing: Thinking, Reading, Editing, Running or Delegating.
- When Claude keeps a task list, the bar follows it (`step 2 of 4`, with a tick per step). Otherwise it is an estimate: Claude can't know in advance how long it will take, so each step moves the bar on a little less, and it waits under 90% until the answer.
- At the answer the bar turns green and says Done, then leaves after a few seconds. An interrupted prompt turns gray and says Stopped.
- Desktop app: a dotted pixel fill, a small turning star while Claude works and a check when it's done. Terminal: block characters in your terminal theme's colors.
- Turn it on or off from its row in the Tools box.

## Install

At the prompt of a Claude Code terminal session, one line per mod:

```
/plugin install toolbox --marketplace LeoNybom/claude-mods
/plugin install infobar --marketplace LeoNybom/claude-mods
/plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
/plugin install thinkbar --marketplace LeoNybom/claude-mods
```

Answer `y` to add the marketplace the first time, then press Enter to choose the user scope (all projects).

From a shell:

```
claude plugin install toolbox --marketplace LeoNybom/claude-mods
claude plugin install infobar --marketplace LeoNybom/claude-mods
claude plugin install prompt-upgrade --marketplace LeoNybom/claude-mods
claude plugin install thinkbar --marketplace LeoNybom/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `LeoNybom/claude-mods`, then Add plugin.

## Update

```
claude plugin marketplace update leonybom-mods
claude plugin update toolbox@leonybom-mods
claude plugin update infobar@leonybom-mods
claude plugin update prompt-upgrade@leonybom-mods
claude plugin update thinkbar@leonybom-mods
```

Then type `/reload-plugins` in a running session, or start a new one.

Every change to a mod raises its version number, so these commands always find the newest one. What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## License

MIT, see [LICENSE](LICENSE).
