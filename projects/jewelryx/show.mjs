#!/usr/bin/env node
// show.mjs — wf show [<b2b|admin> <path> [as <buyer|seller|admin>] [mobile]]
// Opens a browser window on this worktree's stack, already logged in as a seed user and
// already on the page, and leaves it to Shay (T2: see the fix before reading the diff).
// No args: the `open:` line under PLAN.md `## T2 walk`. Returns once the page is open; the
// window stays until Shay closes it.
// The login and the page are the project's verification skill (round.mjs VERIFY_SKILL): its CLI
// holds how JewelryX logs in, which this file used to repeat in a spec of its own.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readState, roundOf, toplevelOf } from '../../state.mjs';
import { VERIFY_SKILL } from './round.mjs';

// Pure: Git Bash rewrites an argument that starts with / into a Windows path under its own install
// before node sees it (`wf show admin /products` arrived as `C:/Program Files/Git/products`). It
// names that install in EXEPATH (`<root>\bin`), so the rewrite is undone exactly; the same rule as
// control-jewelryx's unMsys.
export function unMsys(arg, env) {
	if (!env.MSYSTEM || !env.EXEPATH || !/^[A-Za-z]:[\\/]/.test(arg)) return arg;
	const root = `${dirname(env.EXEPATH.replace(/\\/g, '/'))}/`;
	const a = arg.replace(/\\/g, '/');
	return a.toLowerCase().startsWith(root.toLowerCase()) ? `/${a.slice(root.length)}` : arg;
}

// Pure: `b2b /catalog as buyer mobile` → { app, path, as, mobile }, or null. The path may drop its
// slash (`wf show admin products`); a Windows path is refused rather than opened.
export function parseOpen(line) {
	const m = /^(b2b|admin)\s+(\S+)(?:\s+as\s+(buyer|seller|admin))?(\s+mobile)?\s*$/.exec((line ?? '').trim());
	if (!m || /^[A-Za-z]:[\\/]/.test(m[2])) return null;
	return { app: m[1], path: m[2].startsWith('/') ? m[2] : `/${m[2]}`, as: m[3] ?? (m[1] === 'admin' ? 'admin' : 'buyer'), mobile: Boolean(m[4]) };
}

// Pure: the `open:` line under `## T2 walk`, or null.
export function openLineOf(planText) {
	const walk = /^## T2 walk[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec((planText ?? '').replace(/\r\n/g, '\n'));
	const m = walk && /^open:[ \t]*`?([^`\n]+?)`?[ \t]*$/m.exec(walk[1]);
	return m ? m[1] : null;
}

// Pure: the CLI's arguments for a parsed `open:` line, in its own headed window ("show" session),
// apart from the browser the round's agents drive.
export function showArgs(open) {
	return [`${VERIFY_SKILL}/control-jewelryx.mjs`, 'open', open.app, open.path, 'as', open.as, ...(open.mobile ? ['mobile'] : []), '--headed'];
}

export function runShow(argv) {
	const toplevel = toplevelOf();
	let line = argv.map((a) => unMsys(a, process.env)).join(' ').trim();
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
		console.error(`wf show: cannot read "${line}" — want: <b2b|admin> <path> [as buyer|seller|admin] [mobile]`);
		process.exit(2);
	}
	if (!existsSync(join(toplevel, VERIFY_SKILL))) {
		console.error(`wf show: this worktree has no ${VERIFY_SKILL} — its base predates the verification skill`);
		process.exit(1);
	}
	const r = spawnSync(process.execPath, showArgs(open), { cwd: toplevel, stdio: 'inherit' });
	process.exit(r.status ?? 1);
}

if (process.argv[1]?.endsWith('show.mjs')) runShow(process.argv.slice(2));
