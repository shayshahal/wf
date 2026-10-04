#!/usr/bin/env node
// selfcheck.ts — node src/selfcheck.ts: every *.selfcheck.ts in wf and its projects, tsc over all of
// wf, and eslint (lint-kit's error-handling set, eslint.config.js), in parallel. One line on green; on red the failing files' output, exit 1. The pre-push hook
// runs it (.githooks/pre-push): a push to main is live on the next wf command, with no CI in between
// (AGENTS.md). Run from the editing clone: review.selfcheck.ts needs a git checkout, and tsc needs
// `npm ci` (wf runs on Node alone; its dev dependencies are only for this check).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { WF_ROOT } from './paths.ts';

type Result = { file: string; code: number | null; out: string };

const root = WF_ROOT;
const under = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? under(join(dir, e.name)) : e.name.endsWith('.selfcheck.ts') ? [join(dir, e.name)] : []);
// The kit (src/, projects/) and Shay's env (env/).
const files = ['src', 'projects', 'env'].flatMap((d) => under(join(root, d)));

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
// lint-kit's error-handling set (eslint.config.js): a catch that drops the error says why, or is fixed.
const ESLINT = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const lint = existsSync(ESLINT)
	? run('eslint', ['--disable-warning=ExperimentalWarning', ESLINT, root])
	: Promise.resolve({ file: 'eslint', code: 1, out: 'no node_modules/eslint: run `npm ci` in this clone' });

const t0 = Date.now();
const results = await Promise.all([...files.map((f) => run(relative(root, f).replace(/\\/g, '/'), [f])), typecheck, lint]);
const red = results.filter((r) => r.code !== 0);
for (const r of red) console.error(`\n── FAIL ${r.file}\n${r.out.split('\n').filter((l) => !l.startsWith('  ok ')).join('\n').trimEnd()}`);
console.log(`${red.length ? `${red.length} of ${results.length} selfchecks red` : `${results.length} selfchecks green`} (tsc and eslint included) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(red.length ? 1 : 0);
