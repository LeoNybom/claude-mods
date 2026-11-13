# Tests for /release

Run in a throwaway copy of the repository whose `origin` is a local bare clone, so nothing reaches GitHub.

| # | Setup | Run | Expected |
|---|---|---|---|
| 1 | Clean copy, everything pushed | `/release` | "Inget att släppa – allt är redan på GitHub." No file changed. |
| 2 | Unknown mod | `/release nope` | One line about the error and the list of mods. No file changed. |
| 3 | A small fix in `thinkbar/hooks/thinkbar.tsx`, not committed | `/release thinkbar` | Proposes Thinkbar 0.3.0 → 0.3.1 (patch), a CHANGELOG line, the commit message and the files. Ends with "Kör jag?". `git status` shows only the fix: no file changed before the yes. |
| 4 | As 3, answer "ja" | (same session) | `plugin.json` 0.3.1, a new `### 0.3.1` first under `## thinkbar`, `claude plugin test thinkbar` passes, one commit "Thinkbar 0.3.1: …" with the fix, `plugin.json` and `CHANGELOG.md`. Asks "Pusha till GitHub nu?" and does not push. |
| 5 | A new row or setting in a mod | `/release <mod>` | Proposes minor (x.y.0 → x.(y+1).0). |
| 6 | Version already raised and committed, not pushed, plus one more fix | `/release <mod>` | Does not raise again; checks that the CHANGELOG entry covers both changes. |
| 7 | `CLAUDE.md` and `thumbnail/` changed outside the mods, as in 3 | `/release thinkbar` | Shows "Rör inte: …"; after the yes the commit holds neither. |
| 8 | A test made to fail | `/release <mod>`, "ja" | Shows the failing test, commits nothing. |
| 9 | Only a file under `<mod>/tests/` changed | `/release <mod>` | Says users get nothing new and asks whether to raise patch or commit without a new version. |
| 10 | After 4, answer "ja" to the push | (same session) | `git push origin main` to the bare clone; the last line points to `/discord thinkbar`. |
