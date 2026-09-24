// wf classify: any B file => class B. Class C is never set by paths;
// only the orchestrator sets C (product-undecided).
// Base: --base, else .wf/state.json.base (set by wf new), else origin/<the project's base branch> — a bare
// `wf classify` on a round cut from tools/wf-runtime used to diff against origin/dev
// and report the runtime's own commits as the round's (BJEW-585 pilot note 1).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseBranch, contractPaths as contractPathsFile } from "./project.mjs";

// Pure: the project's contract paths (one pathspec glob per line, # comments) as a gitattributes
// file. Last match wins, so the default A comes first.
export function classAttributes(contractPaths) {
  const globs = contractPaths.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  return ["** wf-class=A", ...globs.map((g) => `${g} wf-class=B`)].join("\n") + "\n";
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/classify.mjs")) classify();

function classify() {
const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const persistedBase = () => {
  try {
    return JSON.parse(readFileSync(join(top, ".wf", "state.json"), "utf8")).base ?? null;
  } catch { return null; }
};
const hasOriginBase = spawnSync("git", ["rev-parse", "--verify", "-q", `origin/${baseBranch}`]).status === 0;
const base = bi === -1 ? (persistedBase() ?? (hasOriginBase ? `origin/${baseBranch}` : baseBranch)) : (args[bi + 1] ?? baseBranch);
const asJson = args.includes("--json");
const names = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
// Class B is the project's own list of contract paths, read from the round's worktree, so it moves
// with the code it describes. It must exist: without it every path read as A, and a B endpoint
// went through as A (fix/role-assign-dialog, 2026-09-23).
const listFile = join(top, contractPathsFile);
let contractPaths;
try { contractPaths = readFileSync(listFile, "utf8"); } catch { throw new Error(`classify: ${listFile} is missing; the project names its contract paths there`); }
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
