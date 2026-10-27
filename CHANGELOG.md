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

### 0.2.0
- Opens as a framed box right above the prompt instead of a side pane.
- The chosen model and effort are highlighted.
- Solid lines around the MODS section, and room between the on/off buttons.
- Adds a row for Prompt Upgrade.
- `/toolbox` no longer writes a line in the chat.

### 0.1.0
- First version: switch model and effort, turn mods on and off, quick actions.

## infobar

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
