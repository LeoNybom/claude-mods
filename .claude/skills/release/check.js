#!/usr/bin/env node
// Lists which mods have changes that are not on GitHub yet, and whether they still need a new version, for /release.
// It only reads (git fetch updates origin/main, nothing else); it writes no file.
//
//   node .claude/skills/release/check.js          -> every mod
//   node .claude/skills/release/check.js <mod>    -> one mod
//
// A "mod" is a top-level folder with .claude-plugin/plugin.json. "Pending" = files under the mod that
// differ from origin/main (committed but not pushed, uncommitted, or untracked). Several changes before
// one push share one bump, so a mod needs a bump only when it has pending changes and its version is
// still the published one.

const { execFileSync } = require("child_process");
const { existsSync, readFileSync, readdirSync } = require("fs");

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd(); // keep leading spaces: status lines start with one
const lines = (s) => (s ? s.split("\n").filter(Boolean) : []);
const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");

let root;
try {
  root = git("rev-parse", "--show-toplevel");
} catch {
  out({ error: "Not inside a git repository." });
  process.exit(1);
}
process.chdir(root);

const mods = readdirSync(".", { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && existsSync(`${d.name}/.claude-plugin/plugin.json`))
  .map((d) => d.name)
  .sort();

const [only] = process.argv.slice(2);
if (only && !mods.includes(only)) {
  out({ error: `No mod called "${only}".`, mods });
  process.exit(1);
}

let marketplace = [];
try {
  marketplace = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8")).plugins.map((p) => p.name);
} catch {
  // no marketplace file: every mod counts as new
}
const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";

/** Version headings (### x.y.z) under "## <mod>" in CHANGELOG.md, newest first. */
function changelogVersions(mod) {
  const found = [];
  let inMod = false;
  for (const line of changelog.split(/\r?\n/)) {
    const h2 = line.match(/^## (\S+)/);
    if (h2) { inMod = h2[1] === mod; continue; }
    const h3 = inMod && line.match(/^### (\d+\.\d+\.\d+)/);
    if (h3) found.push(h3[1]);
  }
  return found;
}

let fetched = true;
try { git("fetch", "--quiet", "origin", "main"); } catch { fetched = false; }
let unpushed = null;
try { unpushed = Number(git("rev-list", "--count", "origin/main..HEAD")); } catch { /* no origin/main */ }

const report = [];
for (const mod of only ? [only] : mods) {
  const file = `${mod}/.claude-plugin/plugin.json`;
  let version = null;
  try { version = JSON.parse(readFileSync(file, "utf8")).version; } catch { /* broken plugin.json */ }
  let published = null;
  try { published = JSON.parse(git("show", `origin/main:${file}`)).version; } catch { /* not on GitHub yet */ }
  const vsGithub = published === null ? lines(git("ls-files", "--", mod)) : lines(git("diff", "--name-only", "origin/main", "--", mod));
  const uncommitted = lines(git("status", "--porcelain", "--untracked-files=all", "--", mod)).map((l) => l.slice(3));
  const changed = [...new Set([...vsGithub, ...uncommitted])].filter((f) => f !== file);
  const versions = changelogVersions(mod);
  report.push({
    mod,
    version,
    published,
    changed,
    needsBump: changed.length > 0 && published !== null && version === published,
    onlyTests: changed.length > 0 && changed.every((f) => f.startsWith(`${mod}/tests/`)),
    uncommitted,
    inMarketplace: marketplace.includes(mod),
    changelogHasVersion: version !== null && versions.includes(version),
  });
}

// Changes outside the mods (CLAUDE.md, README, …): shown so they are never committed by accident.
const outside = lines(git("status", "--porcelain"))
  .map((l) => l.slice(3))
  .filter((f) => !mods.some((m) => f === m || f.startsWith(`${m}/`)));

out({ fetched, unpushed, mods: report, outside });
