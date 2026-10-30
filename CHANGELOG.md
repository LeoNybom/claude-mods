# Changelog

Each mod has its own version, in its `.claude-plugin/plugin.json`. To get the newest versions:

```
claude plugin marketplace update leonybom-mods
claude plugin update <mod>@leonybom-mods
```

## clean-view

### 0.2.0
- Adds an on/off row to the Tools box, and hides its own button when Tools is installed.
- Shares the band above the prompt with Tools and the Infobar.
- The progress meter sits right after the step names instead of at the far right.

### 0.1.0
- First version: hides tool rows and shows one simple checklist above the prompt.

## toolbox

### 0.4.0
- No frame and no orange: the box sits on the band's own background.
- Mods: the name is the switch (no On/Off buttons), with a green dot while on and an empty ring of the same size while off; rest the pointer on a mod to see what it does. Clearer descriptions.
- Desktop app: everything on one row above the Infobar, with a line between MODS and QUICK; on a narrow window each takes its own row, its title first. No model and effort (the app shows them), no header and no ✕.
- Desktop app: with the Infobar off, Tools draws its own ∧ Tools button (∨ while open), so turning the Infobar off never locks you out.
- Terminal: the list scrolls under its header when the room above the prompt is short, with ▲ and ▼ and a scrollbar.

### 0.3.0
- Adds a row for Clean Info Agents, with a wider name column so its name fits.

### 0.2.0
- Opens as a framed box right above the prompt instead of a side pane.
- The chosen model and effort are highlighted.
- Solid lines around the MODS section, and room between the on/off buttons.
- Adds a row for Prompt Upgrade.
- `/toolbox` no longer writes a line in the chat.

### 0.1.0
- First version: switch model and effort, turn mods on and off, quick actions.

## infobar

### 0.4.4
- Desktop app: no frame around the bar. The band's own background is the bar, as wide and as tall as the empty prompt box (44 px), and the dividers run the height of the row.

### 0.4.3
- Terminal: a row another mod draws under the prompt (such as the Clean Info Agents progress bar) stays, right above the Infobar.

### 0.4.2
- Desktop app: the chevron on Tools shows again.

### 0.4.1
- Desktop app: the whole Tools part opens Tools, chevron included.

### 0.4.0
- New git part: `⎇ <branch>` with a yellow dot for uncommitted or unpushed changes and a green one when all is committed and pushed. Hidden outside a git repository; git runs on your machine only, no tokens.
- ctx/5h/7d, agents and Tools are anchored to the right; the git part gets the free room on the left.
- Terminal: model and effort stay on the far left, followed by the git part.
- Desktop app: model and effort are gone (the app already shows them), dividers run the full height and Tools gets a thin chevron.

### 0.3.4
- Effort, 5h and 7d show from the moment a chat opens: until the first reply, the bar shows the last values it saw (a window whose reset time has passed shows 0%).

### 0.3.3
- The Subscription/API part is gone, so the rest has room in both the terminal and the desktop app.

### 0.3.2
- Desktop app: the Tools button always shows, and the dividers are visible again.

### 0.3.1
- Desktop app: slim colored bars and hairline dividers, and plan and agents no longer drop out at normal widths.

### 0.3.0
- Its own look in each place: the terminal keeps the ▰▱ meters, colored by your terminal's own theme, and the desktop app gets one rounded frame with thin dividers and slim meters that follow the app's light and dark mode.
- Parts are spread over the whole width instead of packed together on the left.
- More room before the Tools button.

### 0.2.0
- Shows in the desktop app, right above the prompt.
- Session (5h) and weekly (7d) usage stay visible on narrower screens.
- Space before the Tools button.

### 0.1.0
- First version: plan, model, effort, context, usage limits and agents under the prompt.

## prompt-upgrade

### 0.1.0
- First version: `/better` turns a rough prompt into a great one, with questions, a rewrite and a side-by-side review.

## clean-info-agents

### 0.2.0
- `/cia <task>` starts savvy-flow, a short name for `/clean-info-agents:savvy-flow`.
- Desktop app: the progress bar spans the full width like the Infobar, with `×N` and ✕ at the right edge, and the crab is no longer cut off.

### 0.1.0
- First version, based on savvy-flow and savvy-progress from [claude-kit](https://github.com/JohnnyVizz/claude-kit) (MIT): `/savvy-flow` and its five tiered agents, a progress bar and an agents panel (`/agents-info`).
- Terminal: the bar and the panel use the terminal theme's own colors, and with the Infobar on the bar sits right above it, under the prompt.
- An on/off row in the Tools box, and `/agents-info on` or `off`.
- Recognises the agents with their plugin name in front (`clean-info-agents:savvy-careful`).
