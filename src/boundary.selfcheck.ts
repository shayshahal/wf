// boundary.selfcheck.ts — node boundary.selfcheck.ts → exit 0 when green.
// The kit (everything outside env/) never imports the env and never names Shay's machine: the team
// runs the kit alone, and a kit that reached into env/ or ~/.herdr would break on their machines
// without a word (kit and env plan, step 2). The env imports the kit, never the other way round.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WF_ROOT } from './paths.ts';

const root = WF_ROOT;
const SKIP = new Set(['env', 'docs', 'node_modules', '.git']);
// `base` is the walk's root, so the selfcheck can walk a tree it builds. A directory holding its own
// `.git` is another checkout, not this kit: untracked scratch (.delta/worktrees/<id>/wf) held full
// copies of this repo, the walk read their env/ as the kit's, and the check went red on a clean tree
// (2026-10-08).
const walk = (dir: string, base: string, isFile: (name: string) => boolean): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
	if (e.isDirectory()) return (SKIP.has(e.name) && dir === base) || existsSync(join(dir, e.name, '.git')) ? [] : walk(join(dir, e.name), base, isFile);
	return isFile(e.name) ? [join(dir, e.name)] : [];
});
const kitFiles = (dir: string, base = root) => walk(dir, base, (n) => /\.(ts|mjs)$/.test(n));

// Pure: the env imports in a file's text (static and dynamic).
export function envImports(text: string) {
	return [...text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]*\benv\/[^'"]*)['"]/g)].map((m) => m[1]);
}
// Pure: Shay's machine paths in a file's code (comment lines are not code).
const MACHINE = [/\.herdr\b/, /['"/]\.bare\b/, /LOCALAPPDATA/, /['"]\.config['"],\s*['"]wf['"]/, /~\/\.config\/wf/, /['"]work['"],\s*['"]wf['"]/, /~\/work\/wf/];
export function machinePaths(text: string) {
	return text.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).flatMap((l) => MACHINE.filter((re) => re.test(l)).map(() => l.trim()));
}
// Pure: the machine paths and env-only tools in text a round's agent reads. Prose has no comment
// lines — every line counts, and a `*` bullet is not one. worktrunk, portless and `~/.pi` are Shay's;
// the kit's worktree seam is `git worktree` (src/seams.ts). Plannotator and herdr are named seams in
// the kit itself, so prose may describe them as optional.
const ENV_ONLY = [/\bwt\b/, /\bworktrunk\b/i, /\bportless\b/, /~\/\.pi\b/];
export function machineText(text: string) {
	return text.split('\n').flatMap((l) => [...MACHINE, ...ENV_ONLY].filter((re) => re.test(l)).map(() => l.trim()));
}

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('envImports sees static and dynamic imports of env/', envImports("import { x } from './env/a.ts';\nawait import('../../env/b.ts');\nimport { y } from './env.ts';").join() === './env/a.ts,../../env/b.ts');
check('machinePaths skips comments and sees code', machinePaths("// ~/.herdr\nconst a = join(homedir(), '.config', 'wf');").length === 1);
check('machineText reads prose, bullets included, and sees an env-only tool', machineText('* `wt switch --create`\nA `wt` hook failing\nsee ~/.pi for it\nplain line').length === 3 && machineText('plannotator is optional').length === 0);

// A nested checkout beside the kit is skipped: untracked scratch under .delta/worktrees held copies of
// this repo, and the walk read their env/ and their machine paths as the kit's (2026-10-08).
const tree = mkdtempSync(join(tmpdir(), 'wf-kitfiles-'));
mkdirSync(join(tree, 'src'), { recursive: true });
mkdirSync(join(tree, 'env'), { recursive: true });
mkdirSync(join(tree, 'scratch', 'wf', 'env'), { recursive: true });
writeFileSync(join(tree, 'src', 'a.ts'), 'export const a = 1;\n');
writeFileSync(join(tree, 'env', 'b.ts'), "join(homedir(), '.config', 'wf');\n");
writeFileSync(join(tree, 'scratch', 'wf', '.git'), 'gitdir: /elsewhere/wf/.git/worktrees/wf\n');
writeFileSync(join(tree, 'scratch', 'wf', 'env', 'c.ts'), 'const p = process.env.LOCALAPPDATA;\n');
const walked = kitFiles(tree, tree).map((f) => relative(tree, f).replace(/\\/g, '/'));
check('the walk skips a nested checkout, and the env/ beside it', walked.join() === 'src/a.ts', walked.join());
rmSync(tree, { recursive: true, force: true });

// This file's own test strings name env/ on purpose.
const files = kitFiles(root).filter((f) => f !== fileURLToPath(import.meta.url));
const imports = files.flatMap((f) => envImports(readFileSync(f, 'utf8')).map((i) => `${relative(root, f)}: ${i}`));
check(`no kit file imports env/ (${files.length} files)`, imports.length === 0, imports.join('; '));
const paths = files.filter((f) => !f.endsWith('.selfcheck.ts')).flatMap((f) => machinePaths(readFileSync(f, 'utf8')).map((l) => `${relative(root, f)}: ${l}`));
check('no kit file names Shay\'s machine (~/.herdr, .bare, LOCALAPPDATA, ~/.config/wf, ~/work/wf)', paths.length === 0, paths.join('; '));

// The text a round's agent reads: the prompts, the process docs, the skills and the agents (the
// generated claude/ copies included). The README, AGENTS.md and docs/ are for people changing wf,
// and docs/ is history, so they may name the env. Before this, only code was walked, and
// process/LIFECYCLE.md told the team to run `wt switch` on machines without worktrunk (2026-10-08).
const AGENT_TEXT = ['prompts', 'process', 'skills', 'agents', 'claude'];
const text = AGENT_TEXT.flatMap((d) => walk(join(root, d), join(root, d), (n) => n.endsWith('.md')));
const prose = text.flatMap((f) => machineText(readFileSync(f, 'utf8')).map((l) => `${relative(root, f)}: ${l}`));
check(`no text a round's agent reads names Shay's machine or an env-only tool (${text.length} files)`, prose.length === 0, prose.join('; '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
