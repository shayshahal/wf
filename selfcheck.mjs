#!/usr/bin/env node
// selfcheck.mjs — node selfcheck.mjs: every *.selfcheck.mjs in wf and its projects, in parallel.
// One line on green; on red the failing files' output, exit 1. The pre-push hook runs it
// (.githooks/pre-push): a push to main is live on the next wf command, with no CI in between
// (AGENTS.md). Run from the editing clone: review.selfcheck.mjs needs a git checkout.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const inDir = (dir) => readdirSync(dir).filter((f) => f.endsWith('.selfcheck.mjs')).map((f) => join(dir, f));
const files = [...inDir(root), ...readdirSync(join(root, 'projects')).flatMap((p) => inDir(join(root, 'projects', p)))];

const run = (file) => new Promise((resolve) => {
	const child = spawn(process.execPath, [file], { cwd: root });
	let out = '';
	child.stdout.on('data', (d) => { out += d; });
	child.stderr.on('data', (d) => { out += d; });
	child.on('close', (code) => resolve({ file: relative(root, file).replace(/\\/g, '/'), code, out }));
});

const t0 = Date.now();
const results = await Promise.all(files.map(run));
const red = results.filter((r) => r.code !== 0);
for (const r of red) console.error(`\n── FAIL ${r.file}\n${r.out.split('\n').filter((l) => !l.startsWith('  ok ')).join('\n').trimEnd()}`);
console.log(`${red.length ? `${red.length} of ${results.length} selfchecks red` : `${results.length} selfchecks green`} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(red.length ? 1 : 0);
