#!/usr/bin/env node
// show.mjs — wf show [<b2b|admin> <path> [as <buyer|seller|admin>] [mobile]]
// Opens a browser window on this worktree's stack, already logged in as a seed user and
// already on the page, and leaves it to Shay (T2: see the fix before reading the diff).
// No args: the `open:` line under PLAN.md `## T2 walk`. Returns at once; the window stays
// until Shay closes it.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugForBranch } from '../../worktree.mjs';
import { readState, roundOf, toplevelOf } from '../../state.mjs';
import { logins, stackNames } from './index.mjs';

// Pure: `b2b /catalog as buyer mobile` → { app, path, as, mobile }, or null.
export function parseOpen(line) {
	const m = /^(b2b|admin)\s+(\/\S*)(?:\s+as\s+(buyer|seller|admin))?(\s+mobile)?\s*$/.exec((line ?? '').trim());
	if (!m) return null;
	return { app: m[1], path: m[2], as: m[3] ?? (m[1] === 'admin' ? 'admin' : 'buyer'), mobile: Boolean(m[4]) };
}

// Pure: the `open:` line under `## T2 walk`, or null.
export function openLineOf(planText) {
	const walk = /^## T2 walk[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec((planText ?? '').replace(/\r\n/g, '\n'));
	const m = walk && /^open:[ \t]*`?([^`\n]+?)`?[ \t]*$/m.exec(walk[1]);
	return m ? m[1] : null;
}

export function runShow(argv) {
	const toplevel = toplevelOf();
	let line = argv.join(' ').trim();
	if (!line) {
		const { folder } = roundOf(readState(toplevel), toplevel);
		const plan = folder && join(toplevel, folder, 'PLAN.md');
		line = plan && existsSync(plan) ? openLineOf(readFileSync(plan, 'utf8')) : null;
		if (!line) {
			console.error('wf show: no `open:` line under PLAN.md ## T2 walk — pass it: wf show b2b /catalog as buyer mobile');
			process.exit(2);
		}
	}
	const open = parseOpen(line);
	if (!open) {
		console.error(`wf show: cannot read "${line}" — want: <b2b|admin> </path> [as buyer|seller|admin] [mobile]`);
		process.exit(2);
	}
	const branch = execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
	const names = stackNames(slugForBranch(branch));
	const host = (app) => names[app];
	// The spec imports the worktree's own verification/ login helpers, so it runs from inside it.
	const dir = join(toplevel, '.wf', 'show');
	mkdirSync(dir, { recursive: true });
	const src = join(dirname(fileURLToPath(import.meta.url)), 'show');
	for (const f of ['show.spec.ts', 'pw.config.ts']) copyFileSync(join(src, f), join(dir, f));
	const [email, password] = logins[open.as];
	const log = openSync(join(dir, 'show.log'), 'w');
	// node on the CLI directly, not `pnpm exec`: on Windows pnpm needs shell: true, and a detached
	// child under a shell writes nothing to the log (measured: 0 bytes detached+shell, 16 detached
	// alone). A failed login then left an empty show.log and a dead window (fix/role-assign-dialog T2).
	const cli = join(toplevel, 'verification', 'node_modules', '@playwright', 'test', 'cli.js');
	const child = spawn(process.execPath, [cli, 'test', '-c', '../.wf/show/pw.config.ts'], {
		cwd: join(toplevel, 'verification'),
		detached: true,
		stdio: ['ignore', log, log],
		env: {
			...process.env,
			// pw.config.ts sits in .wf/show/, outside verification/: its `@playwright/test` import resolves
			// only when the worktree root happens to hoist it (the tools checkout does not: MODULE_NOT_FOUND).
			NODE_PATH: join(toplevel, 'verification', 'node_modules'),
			SHOW_APP: open.app,
			SHOW_PATH: open.path,
			SHOW_MOBILE: open.mobile ? '1' : '',
			SHOW_AS: open.as,
			B2B_URL: host('b2b'),
			ADMIN_URL: host('admin'),
			API_URL: `${host('api')}/api/v1`,
			...(open.app === 'admin' ? { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } : { B2B_OWNER_EMAIL: email, B2B_OWNER_PASSWORD: password }),
			AUTH_DIR: join(dir, '.auth'),
		},
	});
	child.unref();
	console.log(`wf show: opening ${host(open.app)}/${open.app}${open.path} as ${email}${open.mobile ? ' (phone, 390px)' : ''} — the window stays until you close it (log: .wf/show/show.log)`);
}

if (process.argv[1]?.endsWith('show.mjs')) runShow(process.argv.slice(2));
