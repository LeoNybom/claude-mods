---
name: discord
description: Writes a Swedish Discord announcement for the newest version on GitHub of a mod in this marketplace, shown in the chat only. Use when the user types /discord <mod> (toolbox, infobar, prompt-upgrade, thinkbar, adhd).
argument-hint: <mod>
allowed-tools: Bash(node .claude/skills/discord/check.js:*), Read
---

# /discord <mod>

Mod: `$ARGUMENTS`

Reply with the announcement in the chat and nothing else. Never write it, or anything else, to any file, anywhere, and add no lines before or after it.

## 1. Read the newest version

Run from the repository root (it only reads):

```
node .claude/skills/discord/check.js $ARGUMENTS
```

It fetches `origin/main` from GitHub and prints JSON:

- `published`: the version on GitHub (what `claude plugin update` installs)
- `newVersions`: the published version, with its `CHANGELOG.md` lines (`changelog` is null when the changelog has no entry for it)
- `commits`: commit messages for the mod in that version

Then:

- **No mod given, or `error` in the output:** say what went wrong in one line, in Swedish, and list the mods (`mods`) if given. Stop.
- **Otherwise:** go on to step 2.

## 2. Write the message

Write it in Swedish, from `newVersions` (all of them, merged into one list). Where `changelog` is null, use `commits` instead, and skip commits that only touch other things than the mod (tests, other mods, merges). If something is unclear, read the mod's files on disk to understand what the change does for the user. Never invent features.

Follow this template exactly. It is the format the owner liked:

```
## <emoji> <name> <published> är ute!

<One or two short sentences: what the update is about, in plain words.>

**Nytt i den här versionen**
<emoji> **<Short title>:** <What changed, for the user. One or two sentences. `code` for things shown on screen.>
  <Optional indented sub-lines with details, two spaces in front.>
<emoji> **<Short title>:** ...

⚡ **<Optional: one reassuring line, e.g. that it costs no tokens, if it is true for this change.>**

**Så uppdaterar du**
Har du redan <name> installerad? Kör de här kommandona i en terminal:

**1. Hämta senaste nytt från marketplacen**
`claude plugin marketplace update leonybom-mods`

**2. Uppdatera <name>**
`claude plugin update <mod>@leonybom-mods`

**3. Starta om Claude Code**
Stäng terminalen eller desktop-appen och öppna den igen.

Frågor eller något som ser konstigt ut? Skriv här i kanalen! 🙌
```

Rules:

- Heading emoji per mod: Tools 🧰, Infobar 📊, Prompt Upgrade ✍️, Thinkbar 💜, ADHD 🧠.
- One fitting emoji in front of each bullet, different ones per bullet.
- Group by feature, not by version. Say "Terminalen" and "Desktop-appen" when a change only affects one of them.
- Write for users, not developers: what they see and can do, not how it is built. No pixel values or internal names unless they show on screen.
- 3–6 bullets. Merge small fixes into one bullet like "🛠️ **Småfixar:** ...".
- Leave out the ⚡ line when there is nothing true and useful to say.
- Keep it under 2000 characters (Discord's limit).

Your whole reply is the message inside one ```markdown code block, so it is easy to copy. Nothing else.
