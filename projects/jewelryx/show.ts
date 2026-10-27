#!/usr/bin/env node
// show.ts — wf show [<b2b|admin> <path> [as <buyer|seller|admin>] [mobile]]
// Prepares the T2 walk's scenario (reset, setup, readback) and opens no window: the proof is a screenshot.
// No args: the `open:` line of the agreement's T2 walk. #114 moved that walk from the old
// `## T2 walk` PLAN.md section into the agreement (`process/AGREEMENT-TEMPLATE.md`: a `- **T2 walk.**`
// bullet under `## Agreed`). Plain and bold labels are equivalent; B/C agreements declare a walk
// or an explicit no-walk reason before T1. Without an open line, show needs its arguments.
// The login and the page are the project's verification skill (round.ts VERIFY_SKILL): its CLI
// holds how JewelryX logs in, which this file used to repeat in a spec of its own.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { opensWindows } from '../../src/worktrees/editor.ts';
import { ensureServers } from '../../src/worktrees/serve.ts';
import { readState, roundOf, toplevelOf } from '../../src/round/state.ts';
import { agreementPath, agreementT2WalkLines, consequential, t2WalkRecipeGap, walkLines } from '../../src/round/agreement.ts';
import { parseOpen, walkCommand, walkRecipeGap } from './walk.ts';
import { VERIFY_SKILL } from './round.ts';

// Pure: Git Bash rewrites an argument that starts with / into a Windows path under its own install
// before node sees it (`wf show admin /products` arrived as `C:/Program Files/Git/products`). It
// names that install in EXEPATH (`<root>\bin`), so the rewrite is undone exactly; the same rule as
// control-jewelryx's unMsys.
export function unMsys(arg: string, env: NodeJS.ProcessEnv): string {
	if (!env.MSYSTEM || !env.EXEPATH || !/^[A-Za-z]:[\\/]/.test(arg)) return arg;
	const root = `${dirname(env.EXEPATH.replace(/\\/g, '/'))}/`;
	const a = arg.replace(/\\/g, '/');
	return a.toLowerCase().startsWith(root.toLowerCase()) ? `/${a.slice(root.length)}` : arg;
}

// Keep show callers on the same open-target parser as pre-approval validation.
export { parseOpen } from './walk.ts';

/** Pure: the `open:` line of the explicit plain or bold T2 walk bullet, or null. Read its indented
 * continuations, never another bullet's facts. The bullet lives in Agreed for B/C or TICKET.md
 * for A; the retired PLAN.md `## T2 walk` heading has no reader (#114). */
export function openLineOf(text: string | null): string | null {
	return walkLines(text, /open:/i)[0] ?? null;
}

/** Pure: the explicit `none — <why>` of the T2 walk bullet, or null. A class A round's is in
 * TICKET.md; #139 (JX-1068) read one whose missing walk fell through to the generic fallback. */
export function noneLineOf(text: string | null): string | null {
	for (const line of agreementT2WalkLines(text)) {
		const m = /^none\s*(?:—|[-:])\s*(\S.*)$/i.exec(line.trim());
		if (m) return `none — ${m[1]}`;
	}
	return null;
}

// Pure: the `setup:` lines of the agreement's T2 walk, in order. Each is one of the two recipes
// walk.ts admits (`api …` or `script […]`), which `walkCommand` runs.
export function setupLinesOf(text: string | null): string[] {
	return walkLines(text, /setup:/i);
}

export async function runShow(argv: string[]): Promise<void> {
	const toplevel = toplevelOf();
	let line: string | null = argv.map((a) => unMsys(a, process.env)).join(' ').trim();
	let setups: string[] = [];
	let ready: string[] = [];
	let resets: string[] = [];
	if (!line) {
		const state = readState(toplevel);
		const { folder } = roundOf(state, toplevel);
		const agreement = folder && agreementPath(toplevel, state?.class ?? null, folder);
		const text = agreement && existsSync(agreement) ? readFileSync(agreement, 'utf8') : null;
		// Validate all declared targets and recipes before even the no-walk early return.
		const gap = agreementT2WalkLines(text).length ? t2WalkRecipeGap(text) : null;
		if (gap) {
			console.error(`wf show: ${gap}. Fix it in the agreement's T2 walk bullet, then wf show again.`);
			process.exit(gap.includes('`open:`') ? 2 : 1);
		}
		line = text && openLineOf(text);
		ready = walkLines(text, /ready:/i);
		resets = walkLines(text, /reset:/i);
		setups = setupLinesOf(text);
		if (!line) {
			// A round with nothing visible says `none — <why>`; print its own reason, never the fallback.
			const none = text ? noneLineOf(text) : null;
			if (none) {
				console.log(`wf show: ${none}`);
				return;
			}
			const walkFile = consequential(state?.class ?? null) ? 'AGREEMENT.md' : 'TICKET.md';
			console.error(`wf show: no \`open:\` line in ${walkFile}'s T2 walk bullet — record this round's target and setup there, or none — <why no walk is needed>`);
			process.exit(2);
		}
	}
	const open = parseOpen(line);
	if (!open) {
		console.error(`wf show: cannot read "${line}" — want: <b2b|admin> <path> [as buyer|seller|admin] [mobile]`);
		process.exit(2);
	}
	// #139: a recipe token cannot prove that live data survived reset. Check before and after
	// preparation, using the same project-owned readback/reset that assessment can run. The handoff
	// runs this same check (step.ts), so a malformed line is refused there, not here at T2 (JX-436).
	const gap = walkRecipeGap({ ready, reset: resets, setup: setups });
	if (gap) {
		console.error(`wf show: ${gap}. Fix it in the agreement's T2 walk bullet, then wf show again.`);
		process.exit(1);
	}
	// API setup/readback needs the stack. wf show opens no window; the proof is a screenshot.
	if (opensWindows() && (ready.length || resets.length || setups.length)) {
		if (!existsSync(join(toplevel, VERIFY_SKILL))) {
			console.error(`wf show: this worktree has no ${VERIFY_SKILL} — its base predates the verification skill`);
			process.exit(1);
		}
		// wf step/next release an idle stack, so by T2 nothing may be listening: start it first, as brief does.
		try { console.error(await ensureServers(toplevel, { wait: true })); } catch (e) { console.error((e as Error).message); process.exit(1); }
	}
	const execute = (cmd: string) => {
		const command = walkCommand(cmd);
		if (!command) return null;
		return spawnSync(command.executable, command.args, { cwd: toplevel, encoding: 'utf8', timeout: 120_000 });
	};
	const scenarioReady = () => {
		let present = true;
		for (const cmd of ready) {
			const result = execute(cmd);
			if (result?.status === 0) continue;
			if (result?.status === 1) { present = false; continue; }
			console.error(`wf show: scenario readback could not run: ${result?.error?.message ?? result?.stderr ?? cmd}; no reset attempted`);
			process.exit(1);
		}
		return present;
	};
	if (!ready.length || !scenarioReady()) {
		for (const cmd of [...resets, ...setups]) {
			const result = execute(cmd);
			if (!result || result.status !== 0) {
				console.error(`wf show: setup "${cmd}" failed: ${result?.error?.message ?? `${result?.stdout ?? ''}${result?.stderr ?? ''}`.trim().slice(0, 600)}\nFix it in the agreement's T2 walk bullet, then wf show again.`);
				process.exit(1);
			}
			console.log(`setup: ${cmd} → ${/HTTP \d+/.exec(result.stdout)?.[0] ?? 'ok'}`);
		}
		if (ready.length && !scenarioReady()) {
			console.error('wf show: scenario readback failed after setup; repair the admitted ready/reset/setup recipe before T2.');
			process.exit(1);
		}
	}
	// No browser window opens (2026-10): the person judges screenshots and the PR, not a live app.
	console.log(`wf show: scenario ready for ${open.app} ${open.path} as ${open.as}; no window opened. Capture the proof as a screenshot under proof/.`);
}

if (process.argv[1]?.endsWith('show.ts')) await runShow(process.argv.slice(2));
