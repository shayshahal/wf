#!/usr/bin/env node
// selfcheck.ts — node selfcheck.ts: every *.selfcheck.ts in wf and its projects, and tsc over all of
// wf, in parallel. One line on green; on red the failing files' output, exit 1. The pre-push hook
// runs it (.githooks/pre-push): a push to main is live on the next wf command, with no CI in between
// (AGENTS.md). Run from the editing clone: review.selfcheck.ts needs a git checkout, and tsc needs
// `npm ci` (wf runs on Node alone; typescript and @types/node are only for this check).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

type Result = { file: string; code: number | null; out: string };

const root = dirname(fileURLToPath(import.meta.url));
const inDir = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.selfcheck.ts')).map((f) => join(dir, f));
const projectsIn = (dir: string) => readdirSync(join(dir, 'projects')).flatMap((p) => inDir(join(dir, 'projects', p)));
// The kit (root, projects/) and Shay's env (env/, env/projects/).
const files = [...inDir(root), ...projectsIn(root), ...inDir(join(root, 'env')), ...projectsIn(join(root, 'env'))];

const run = (label: string, args: string[]) => new Promise<Result>((resolve) => {
	const child = spawn(process.execPath, args, { cwd: root });
	let out = '';
	child.stdout.on('data', (d) => { out += d; });
	child.stderr.on('data', (d) => { out += d; });
	child.on('close', (code) => resolve({ file: label, code, out }));
});

// Node strips the types without reading them, so a wrong one only shows here.
const TSC = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const typecheck = existsSync(TSC)
	? run('tsc', [TSC, '-p', root])
	: Promise.resolve({ file: 'tsc', code: 1, out: 'no node_modules/typescript: run `npm ci` in this clone' });

const t0 = Date.now();
const results = await Promise.all([...files.map((f) => run(relative(root, f).replace(/\\/g, '/'), [f])), typecheck]);
const red = results.filter((r) => r.code !== 0);
for (const r of red) console.error(`\n── FAIL ${r.file}\n${r.out.split('\n').filter((l) => !l.startsWith('  ok ')).join('\n').trimEnd()}`);
console.log(`${red.length ? `${red.length} of ${results.length} selfchecks red` : `${results.length} selfchecks green`} (tsc included) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(red.length ? 1 : 0);
