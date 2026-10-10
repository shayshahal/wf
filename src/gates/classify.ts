// wf classify: any B file => class B. Class C is never set by paths;
// only the orchestrator sets C (product-undecided).
// classFromFiles is also what `wf next` measures a plan's own files with, before any commit exists
// for git to run on: the gitattributes measurement at `wf new` sees an empty diff.
// Base: --base, else .wf/state.json.base (set by wf new), else origin/<the project's base branch> — a bare
// `wf classify` on a round cut from tools/wf-runtime used to diff against origin/dev
// and report the runtime's own commits as the round's (BJEW-585 pilot note 1).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseBranch, contractPaths as contractPathsFile } from "../project.ts";
import { CorruptStateError, readState, resolveRoundBase } from "../round/state.ts";

// Pure: the project's contract paths (one pathspec glob per line, # comments) as a gitattributes
// file. Last match wins, so the default A comes first.
export function classAttributes(contractPaths: string) {
  const globs = contractPaths.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return ["** wf-class=A", ...globs.map((g) => `${g} wf-class=B`)].join("\n") + "\n";
}

// Pure: one contract-path glob against one repo-relative path, as the generated gitattributes file
// decides it — `** A` first, then the globs, so only a B glob can match. The rules are .gitignore's:
// a pattern with no slash matches at any level, `*` does not cross `/`, `**` does. This is what
// `wf next` measures a plan's own files with, before any commit exists to run git on.
export function contractGlob(pattern: string, path: string): boolean {
  const glob = pattern.trim();
  if (!glob) return false;
  return new RegExp(globSource(glob)).test(path.replace(/\\/g, "/"));
}

function globSource(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") { out += "(?:.*/)?"; i += 2; }
        else { out += ".*"; i += 1; }
      } else out += "[^/]*";
    } else if (c === "?") out += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) out += `\\${c}`;
    else out += c;
  }
  return pattern.includes("/") ? `^${out}$` : `(?:^|/)${out}$`;
}

// Pure: the class a set of repo-relative paths measures — B when any contract-path glob matches one,
// A otherwise. C is never set by paths; only the orchestrator sets it (process/CLASSES.md).
export function classFromFiles(files: string[], contractPaths: string): "A" | "B" {
  const globs = contractPaths.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return files.some((f) => globs.some((g) => contractGlob(g, f))) ? "B" : "A";
}

// The dispatcher (run.ts) calls runClassify with the command's own arguments; running this file
// directly (what `wf step classify` and T2 spawn) still works through the guard. process.argv[1]
// tells them apart: it ends in classify.ts only for a direct run (2026-10-09: the route only
// imported this module, the guard never fired, and `wf classify` printed nothing and exited 0).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/classify.ts")) runClassify(process.argv.slice(2));

export function runClassify(args: string[]) {
const bi = args.indexOf("--base");
const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const persistedBase = () => {
  try {
    return readState(top)?.base ?? null;
  } catch (e) {
    // A state file that is not the round's is reported, not read as "no base here": falling back to
    // the project's base branch would classify against the wrong base (issue #107).
    if (e instanceof CorruptStateError) throw e;
    /* an unreadable state file: the project's base branch decides */
    return null;
  }
};
const hasOriginBase = spawnSync("git", ["rev-parse", "--verify", "-q", `origin/${baseBranch}`]).status === 0;
const base = bi === -1 ? (persistedBase() ?? (hasOriginBase ? `origin/${baseBranch}` : baseBranch)) : (args[bi + 1] ?? baseBranch);
const asJson = args.includes("--json");
// 2026-10-10: next/check diagnosed an unknown base, but classify still leaked git's fatal + stack.
// Keep its existing base-selection rules; require the selected ref to resolve before measuring it.
if (!resolveRoundBase(top, { base }).base) {
  console.error(`wf classify: the base \`${base}\` does not resolve — fetch it, or pass \`wf classify --base <ref>\``);
  process.exit(2);
}
const names = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
// Class B is the project's own list of contract paths, read from the round's worktree, so it moves
// with the code it describes. It must exist: without it every path read as A, and a B endpoint
// went through as A (fix/role-assign-dialog, 2026-09-23).
const listFile = join(top, contractPathsFile);
let contractPaths: string;
try { contractPaths = readFileSync(listFile, "utf8"); } catch {
  // One actionable line, not an uncaught stack (R-9). Never a silent default to class A: a missing
  // list is a missing fact, and reading every path as A let a B endpoint through (2026-09-23).
  console.error(`wf classify: ${listFile} is missing — the project names its contract paths there (a missing list is not class A)`);
  process.exit(2);
}
const attributesFile = join(tmpdir(), `wf-class-${process.pid}.gitattributes`);
writeFileSync(attributesFile, classAttributes(contractPaths));
const attrRun = names.length ? spawnSync("git", ["-c", `core.attributesFile=${attributesFile.replace(/\\/g, "/")}`, "check-attr", "--stdin", "wf-class"], { input: names.join("\n"), encoding: "utf8" }) : null;
rmSync(attributesFile, { force: true });
if (attrRun?.status) throw new Error(`git check-attr failed: ${attrRun.stderr}`);
const attr = attrRun?.stdout ?? "";
const files = attr.split("\n").filter(Boolean).map((line) => {
  const m = line.match(/^(.*): wf-class: (\S+)$/);
  if (!m) throw new Error(`unexpected check-attr line: ${line}`);
  return { path: m[1], class: m[2] === "unspecified" ? "A" : m[2] };
});
const klass = files.some((f) => f.class === "B") ? "B" : "A";
if (asJson) console.log(JSON.stringify({ class: klass, files }));
else {
  for (const f of files) console.log(`${f.class}\t${f.path}`);
  console.log(`class: ${klass}`);
}
}
