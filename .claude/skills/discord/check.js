#!/usr/bin/env node
// Checks whether a mod has a published update that has not been announced on Discord yet.
//
//   node check.js <mod>                 -> JSON report (reads origin/main on GitHub)
//   node check.js <mod> --mark <ver>    -> records <ver> as announced
//
// "Published" means the version in <mod>/.claude-plugin/plugin.json on origin/main,
// since that is what `claude plugin update` installs.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STATE = path.join(__dirname, "announced.json");
const NAMES = {
  toolbox: "Tools",
  infobar: "Infobar",
  "prompt-upgrade": "Prompt Upgrade",
  thinkbar: "Thinkbar",
};

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const cmp = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

const readState = () => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; }
};

const out = (obj) => { process.stdout.write(JSON.stringify(obj, null, 2) + "\n"); };

const [mod, flag, markVer] = process.argv.slice(2);
if (!mod) { out({ error: "Usage: node check.js <mod> [--mark <version>]", mods: Object.keys(NAMES) }); process.exit(1); }

if (flag === "--mark") {
  const state = readState();
  state[mod] = markVer;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  out({ marked: mod, version: markVer });
  process.exit(0);
}

try { git("fetch", "--quiet", "origin", "main"); }
catch (e) { out({ error: "Could not fetch from GitHub: " + String(e.stderr || e.message).trim() }); process.exit(1); }

let published;
try {
  published = JSON.parse(git("show", `origin/main:${mod}/.claude-plugin/plugin.json`)).version;
} catch {
  const mods = git("ls-tree", "-d", "--name-only", "origin/main").split("\n")
    .filter((d) => { try { git("cat-file", "-e", `origin/main:${d}/.claude-plugin/plugin.json`); return true; } catch { return false; } });
  out({ error: `No mod called "${mod}" on GitHub.`, mods });
  process.exit(1);
}

const announced = readState()[mod] || null;
const hasUpdate = !announced || cmp(published, announced) > 0;

// Changelog sections for this mod, newest first.
const changelog = git("show", "origin/main:CHANGELOG.md");
const lines = changelog.split(/\r?\n/);
const sections = {};
let inMod = false, ver = null;
for (const line of lines) {
  const h2 = line.match(/^## (\S+)/);
  if (h2) { inMod = h2[1] === mod; ver = null; continue; }
  if (!inMod) continue;
  const h3 = line.match(/^### (\d+\.\d+\.\d+)/);
  if (h3) { ver = h3[1]; sections[ver] = []; continue; }
  if (ver && line.trim()) sections[ver].push(line);
}

// Versions to cover: everything after the announced one, or only the newest if nothing was announced yet.
const newVersions = [];
if (hasUpdate) {
  const all = new Set(Object.keys(sections).concat(published));
  for (const v of [...all].sort(cmp).reverse()) {
    if (cmp(v, published) > 0) continue;
    if (announced ? cmp(v, announced) <= 0 : v !== published) continue;
    newVersions.push({ version: v, changelog: sections[v] ? sections[v].join("\n") : null });
  }
}

// Commit messages touching the mod since the announced version, as a fallback for missing changelog lines.
let commits = [];
if (hasUpdate) {
  // Announced: start after the newest commit that touched the announced version.
  // Not announced: start just before the commit that introduced the published version.
  let since = null;
  try {
    const hits = git("log", "origin/main", "--format=%H", "-S", `"version": "${announced || published}"`,
      "--", `${mod}/.claude-plugin/plugin.json`).split("\n").filter(Boolean);
    if (hits.length) since = announced ? hits[0] : `${hits[hits.length - 1]}~1`;
  } catch {}
  const range = since ? `${since}..origin/main` : "origin/main";
  const args = ["log", range, "--no-merges", "--format=%s%n%b%x1e"];
  if (!since) args.push("-n", "10");
  args.push("--", `${mod}/`);
  commits = git(...args).split("\x1e").map((s) => s.trim()).filter(Boolean)
    .map((s) => s.split("\n").filter((l) => !/^Co-Authored-By:/i.test(l)).join("\n").trim());
}

out({ mod, name: NAMES[mod] || mod, published, announced, hasUpdate, newVersions, commits });
