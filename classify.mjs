// wf classify: any B file => class B. Class C is never set by paths;
// only the orchestrator sets C (product-undecided).
// Base: --base, else .wf/state.json.base (set by wf new), else origin/dev — a bare
// `wf classify` on a round cut from tools/wf-runtime used to diff against origin/dev
// and report the runtime's own commits as the round's (BJEW-585 pilot note 1).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const persistedBase = () => {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    return JSON.parse(readFileSync(join(top, ".wf", "state.json"), "utf8")).base ?? null;
  } catch { return null; }
};
const hasOriginDev = spawnSync("git", ["rev-parse", "--verify", "-q", "origin/dev"]).status === 0;
const base = bi === -1 ? (persistedBase() ?? (hasOriginDev ? "origin/dev" : "dev")) : (args[bi + 1] ?? "dev");
const asJson = args.includes("--json");
const names = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
// The wf-class pathspec lives in the tools checkout's .gitattributes; a round cut from dev has none,
// so check-attr there read every path as A (fix/role-assign-dialog, 2026-09-23: a B endpoint read A).
// core.attributesFile ranks below the tree's own .gitattributes, so dev's lines win once they land.
const toolsAttributes = fileURLToPath(new URL("./classes.gitattributes", import.meta.url)).replace(/\\/g, "/");
const attrRun = names.length ? spawnSync("git", ["-c", `core.attributesFile=${toolsAttributes}`, "check-attr", "--stdin", "wf-class"], { input: names.join("\n"), encoding: "utf8" }) : null;
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
