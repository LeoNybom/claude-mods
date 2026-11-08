# Changelog

Each mod has its own version, in its `.claude-plugin/plugin.json`. To get the newest versions:

```
claude plugin marketplace update leonybom-mods
claude plugin update <mod>@leonybom-mods
```

## toolbox

### 0.8.0
- Adds a row for ADHD under MODS.

### 0.6.0
- Desktop app: MODS and QUICK each get an equal half, with the line between them always in the middle.
- Desktop app: when a section no longer fits on one row it breaks into columns that fill every row (three columns of two rows for six mods, never two and one), else one column. The line between the sections grows with the rows.
- Desktop app: a thin line under the open menu, inset with its content and in the dividers' color, set where the closed bar's top edge is.
- Desktop app: a mod's description shows on hover; the empty ring is exactly as large as the green dot.
- Desktop app: a band row another mod keys `top:…` (Thinkbar's bar) stays above the open menu, however deep the mods beneath wrap it.
- Desktop app: MODS and its own ∨ Tools button line up with the Infobar's ∨ Tools and Thinkbar's dot.

### 0.5.0
- The MODS row for Clean Info Agents is now a row for Thinkbar.

### 0.4.0
- No frame and no orange: the box sits on the band's own background.
- Mods: the name is the switch (no On/Off buttons), with a green dot while on and an empty ring of the same size while off; rest the pointer on a mod to see what it does. Clearer descriptions.
- Desktop app: everything on one row above the Infobar, with a line between MODS and QUICK; on a narrow window each takes its own row, its title first. No model and effort (the app shows them), no header and no ✕.
- Desktop app: with the Infobar off, Tools draws its own ∧ Tools button (∨ while open), so turning the Infobar off never locks you out.
- Terminal: the list scrolls under its header when the room above the prompt is short, with ▲ and ▼ and a scrollbar.

### 0.3.1
- The Clean View row is gone, since Clean View is no longer part of this marketplace.

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

### 0.5.1
- Desktop app: the ∨ of ∨ Tools is centered on the M of the Tools box's MODS, and on Thinkbar's dot.

### 0.5.0
- Desktop app: a new order. Tools sits at the left edge, right under the box it opens, with its chevron first (∧ Tools). The git branch comes next and takes the free room, then the agents, and the usage bars last at the right.
- Desktop app: the chevron points down (∨ Tools) while the Tools box is open.

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

## thinkbar

### 0.3.0
- Between events the bar creeps on by itself, slower the closer it gets, and never past the next task-list step.
- Without a task list the bar stays under a third until the answer (it waited under 90%), and reading, editing or running no longer jumps it to 60%. A task list that comes later shares the rest of the bar evenly from where the bar is, with a jump at each step.
- The bar says Writing while Claude writes its answer, and Thinking while it thinks.
- While Claude writes, the text streamed moves the bar too, up to 95% on the last step or without a task list, so a long answer no longer sits near the start and then jumps to 100%.

### 0.2.0
- Desktop app: the bar stays above the Tools box when it is open (its row is keyed `top:thinkbar`), with a thin line under it like the one under the Tools box.
- Desktop app: the row is centered; its dot sits centered on the M of MODS and its star over the Infobar's last %, where the lines end.
- Desktop app: the progress bar has the same room after the label as before the percent.

### 0.1.0
- First version: a purple progress bar above the prompt and the other mods, from the moment a prompt is sent until the answer. It shows what Claude is doing, follows Claude's task list when there is one, and turns green at the answer. Replaces the progress bar of Clean Info Agents, without the crabs.
- An on/off row in the Tools box.

## adhd

### 0.1.0
- First version: the i-have-adhd rules by Ayoub Ghriss (ayghri/i-have-adhd, MIT), turned on and off from its row in the Tools box. Off by default.

## clean-info-agents (removed)

Removed from the marketplace. Its progress bar lives on as Thinkbar.

### 0.2.0
- `/cia <task>` starts savvy-flow, a short name for `/clean-info-agents:savvy-flow`.
- Desktop app: the progress bar spans the full width like the Infobar, with `×N` and ✕ at the right edge, and the crab is no longer cut off.

### 0.1.0
- First version, based on savvy-flow and savvy-progress from [claude-kit](https://github.com/JohnnyVizz/claude-kit) (MIT): `/savvy-flow` and its five tiered agents, a progress bar and an agents panel (`/agents-info`).
- Terminal: the bar and the panel use the terminal theme's own colors, and with the Infobar on the bar sits right above it, under the prompt.
- An on/off row in the Tools box, and `/agents-info on` or `off`.
- Recognises the agents with their plugin name in front (`clean-info-agents:savvy-careful`).
