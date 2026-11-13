---
name: release
description: Gets one or more mods in this marketplace ready to push - finds what has changed since GitHub, proposes patch or minor and a CHANGELOG line, and after the owner's yes raises the version, runs the mod's tests and commits only the mod's files. Pushes only after a second yes. Use when the user types /release [mod] or wants to release a mod (toolbox, infobar, prompt-upgrade, thinkbar, adhd).
argument-hint: [mod]
allowed-tools: Bash(node .claude/skills/release/check.js:*), Bash(git diff:*), Bash(git log:*), Bash(claude plugin test:*), Bash(git add:*), Bash(git commit:*), Read, Edit(**/.claude-plugin/plugin.json), Edit(.claude-plugin/marketplace.json), Edit(CHANGELOG.md), Edit(README.md)
---

# /release [mod]

Mod: `$ARGUMENTS` (empty = every mod)

Talk to the owner in Swedish. Code, commit messages and CHANGELOG lines stay in English, like the rest of the repository.

Run every command below with the Bash tool, one command per call, exactly as written: no `cd`, no `;` or `&&`. Then each one runs without a permission question.

## 1. See what has changed

Run it exactly like this, with no `cd` in front (the session already starts in the repository root; it only reads):

```
node .claude/skills/release/check.js $ARGUMENTS
```

It fetches `origin/main` and prints JSON. Per mod in `mods`:

- `version`: the version on disk; `published`: the version on GitHub (null = the mod is not on GitHub yet)
- `changed`: files under the mod that differ from GitHub (committed but not pushed, or uncommitted), except `plugin.json`
- `needsBump`: true when there are changes and the version is still the published one
- `onlyTests`: every change is under `<mod>/tests/`
- `uncommitted`: the mod's files that are not committed yet
- `inMarketplace`, `changelogHasVersion`: whether `marketplace.json` and `CHANGELOG.md` already know the mod and its version

And for the whole repository: `fetched` (false = GitHub could not be reached, so say the comparison may be old), `unpushed` (commits not on GitHub yet) and `outside` (changed files outside the mods).

Then:

- **`error` in the output:** say what went wrong in one line and list `mods` if given. Stop.
- **No mod has `changed`:** reply with only "Inget att släppa – allt är redan på GitHub." Stop.
- **Otherwise:** go on with the mods that have `changed`. Ignore the rest.

## 2. Understand the changes

For each such mod, read what changed:

```
git diff origin/main -- <mod>
```

`git diff` shows committed and uncommitted changes to tracked files. Files in `changed` that are new (not tracked yet) do not show there: read them with Read. For a mod with `published` null, read its files instead. `git log origin/main..HEAD --oneline -- <mod>` shows the commit messages, if any.

## 3. Propose

Pick the new version per mod, using the rules in `CLAUDE.md`:

- **Patch** (0.2.0 → 0.2.1): only fixes or small visual tweaks.
- **Minor** (0.2.1 → 0.3.0): anything with a new feature, setting, command or row. A minor resets the patch number.
- **Major:** never propose it. Only when the owner asks.
- **`needsBump` false and `published` not null:** the version is already raised for this release (several changes before one push share one bump). Keep it. Only check that the CHANGELOG entry for `version` covers every change, and propose the missing lines.
- **`published` null (new mod):** 0.1.0, a new `## <mod>` heading in `CHANGELOG.md`, an entry in `.claude-plugin/marketplace.json` (copy the shape of the others) and install/update lines in `README.md` (copy the shape of the others).
- **`onlyTests`:** users get nothing new. Say so, and ask if the owner still wants a patch, or a commit without a new version.

Write CHANGELOG lines like the ones already there: one line per change, for the user, starting with a verb ("Adds …", "Fixes …"), "Desktop app:" or "Terminal:" in front when only one of them is affected.

Never change the mod's own code. If you notice something in it (a stale comment, a likely bug), mention it in one line under the proposal and leave it to the owner.

Show the proposal like this, and then stop and wait for the owner's answer. Change no file before the answer.

```
**<Name>** <published> → <new> (<patch/minor>)
Ändringar: <one short line in Swedish per change>
CHANGELOG:
- <English line>
Commit: <Name> <new>: <short English summary>
Filer i committen: <list>
```

Add, when it is true:

- "Rör inte: <outside>" when `outside` is not empty. Those files are never part of the release.
- "Ej committade ändringar följer med i release-committen: <uncommitted>", because a change and its version go in the same commit.

Names: toolbox = Tools, infobar = Infobar, prompt-upgrade = Prompt Upgrade, thinkbar = Thinkbar, adhd = ADHD. A new mod: its folder name with a capital first letter, unless the owner says another name.

End with "Kör jag?" The owner may answer yes, change the version, change a line, or say no. A no ends the skill without changes.

## 4. Do it (only after a yes)

1. Raise `version` in `<mod>/.claude-plugin/plugin.json` (skip when it was already raised).
2. Add the lines to `CHANGELOG.md` under `## <mod>`, as a new `### <version>` heading above the newest one (or under the existing heading for the version, if it is already there).
3. For a new mod: `marketplace.json` and `README.md` as proposed. If `README.md` is in `outside` before you touch it, the owner has their own changes there: stop and ask first.
4. Run the mod's tests, if it has a `tests/` folder (from the root, no `cd`):
   ```
   claude plugin test <mod>
   ```
   If a test fails: show which one and what it said, leave the edits in place, commit nothing and stop.
5. Commit only the release's own files: the mod's files from `changed`, `<mod>/.claude-plugin/plugin.json`, `CHANGELOG.md`, and for a new mod `marketplace.json` and `README.md`. Never a file from `outside`, never another mod, never `git add -A` or `git add .`.
   ```
   git add -- <files>
   git commit -m "<Name> <version>: <summary>" -m "<one to three lines on what changed and why>" -m "<the Co-Authored-By line this session uses for commits>" -- <files>
   ```
   Several mods in one release: one commit, "<Name> <version> and <Name> <version>: <summary>".
   When the changes were already committed and only `plugin.json` and `CHANGELOG.md` are new, the commit holds just those two.

## 5. Push (only after a second yes)

Show the commit (hash and message) and ask: "Pusha till GitHub nu?" Only on a clear yes:

```
git push origin main
```

If it is rejected because GitHub has new commits, say so and stop. Never pull, rebase or force-push on your own.

After a push, end with one line: "Klart. Vill du ha ett Discord-inlägg? Kör `/discord <mod>`."
Without a push, end with: "Committat, inte pushat. Kör `git push origin main` när du vill släppa."
