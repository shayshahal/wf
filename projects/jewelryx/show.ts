#!/usr/bin/env node
// show.ts — wf show [<b2b|admin> <path> [as <buyer|seller|admin>] [mobile]]
// Opens a browser window on this worktree's stack, already logged in as a seed user and
// already on the page, and leaves it to Shay (T2: see the fix before reading the diff).
// No args: the `open:` line of the agreement's T2 walk. #114 moved that walk from the old
// `## T2 walk` PLAN.md section into the agreement (`process/AGREEMENT-TEMPLATE.md`: a `- **T2 walk.**`
// bullet under `## Agreed`). Plain and bold labels are equivalent; B/C agreements declare a walk
// or an explicit no-walk reason before T1. Without an open line, show needs its arguments.
// The login and the page are the project's verification skill (round.ts VERIFY_SKILL): its CLI
// holds how JewelryX logs in, which this file used to repeat in a spec of its own.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { opensWindows } from '../../src/worktrees/editor.ts';
import { ensureServers } from '../../src/worktrees/serve.ts';
import { writeCloneLaunch } from '../../src/worktrees/new.ts';
import { readState, roundOf, toplevelOf, writeState } from '../../src/round/state.ts';
import { browserPidFromOutput, recordShowBrowser } from '../../src/worktrees/show-browser.ts';
import { agreementPath, agreementSha, agreementT2WalkLines, consequential } from '../../src/round/agreement.ts';
import { basePortForBranch, slugForBranch } from '../../src/worktrees/worktree.ts';
import { logins, stackUrls } from './index.ts';
import type { Origins, SeedRole } from './index.ts';
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

// Pure: `b2b /catalog as buyer mobile` → { app, path, as, mobile }, or null. The path may drop its
// slash (`wf show admin products`); a Windows path is refused rather than opened.
export type Open = { app: 'b2b' | 'admin'; path: string; as: SeedRole; mobile: boolean };
export function parseOpen(line: string | null | undefined): Open | null {
	const m = /^(b2b|admin)\s+(\S+)(?:\s+as\s+(buyer|seller|admin))?(\s+mobile)?\s*$/.exec((line ?? '').trim());
	if (!m || /^[A-Za-z]:[\\/]/.test(m[2])) return null;
	return { app: m[1] as Open['app'], path: m[2].startsWith('/') ? m[2] : `/${m[2]}`, as: (m[3] as SeedRole | undefined) ?? (m[1] === 'admin' ? 'admin' : 'buyer'), mobile: Boolean(m[4]) };
}

/** Pure: the `open:` line of the explicit plain or bold T2 walk bullet, or null. Read its indented
 * continuations, never another bullet's facts. The bullet lives in Agreed for B/C or TICKET.md
 * for A; the retired PLAN.md `## T2 walk` heading has no reader (#114). */
export function openLineOf(text: string | null): string | null {
	return matchWalkLines(text, /open:/i)[0] ?? null;
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

// Pure: the `setup:` lines of the agreement's T2 walk, in order. Each follows the one grammar
// `setup: api <sdk function> <its JSON options, one line> as <role>` (`setupArgs` runs them).
export function setupLinesOf(text: string | null): string[] {
	return matchWalkLines(text, /setup:/i);
}

// The agreement owns the walk boundary (2026-10-10 F1: sibling facts must not execute) and labels;
// the project owns command syntax. Plain labels failed on two delivered rounds, 2026-10-13.
function matchWalkLines(text: string | null, key: RegExp): string[] {

	const command = new RegExp(`^${key.source}[ \\t]*\`?([^\`\n]+?)\`?[ \\t]*$`, 'i');
	return agreementT2WalkLines(text).flatMap((line) => {
		const match = command.exec(line);
		return match ? [match[1]] : [];
	});
}

// Pure: what Claude Code's Browser pane opens for a parsed `open:` line, where wf opens no window
// (editor.ts opensWindows): the login page, the seed user, then the page. Apps are served under
// their own base path, as control-jewelryx's appUrl has it.
export function paneText(open: Open, urls: Origins, slug: string, users: Record<SeedRole, [user: string, password: string]> = logins): string {
	const page = (path: string) => `${urls[open.app]}/${open.app}${path}`;
	const [user, password] = users[open.as];
	return [
		`T2 in the Browser pane (wf opens no window under Claude Code): mcp__Claude_Browser__preview_start with name "${slug} ${open.app}" (wf new wrote it into the clone's .claude/launch.json, where Desktop reads it; by name the pane can persist its login), then navigate:`,
		`  the page: ${page(open.path)}${open.mobile ? ' (mobile: resize the pane to 390x844)' : ''}`,
		`  if it asks for a login: ${page('/login')} as ${user} / ${password} (a one-time code follows: it is on the page's DEV banner), then the page again`,
	].join('\n');
}

// Pure: `api createVariant {"path":…} as seller` → the CLI's arguments, or null. One call of the
// verification CLI's `api`, its JSON passed as one argument: no shell, whose quoting differs by OS.
export function setupArgs(line: string): string[] | null {
	const m = /^api\s+(\w+)\s+(\{.*\})\s+as\s+(buyer|seller|admin)$/.exec(line.trim());
	return m ? [`${VERIFY_SKILL}/control-jewelryx.mjs`, 'api', m[1], m[2], '--as', m[3]] : null;
}

// Pure: the CLI's arguments for a parsed `open:` line, in its own headed window ("show" session),
// apart from the browser the round's agents drive.
export function showArgs(open: Open): string[] {
	return [`${VERIFY_SKILL}/control-jewelryx.mjs`, 'open', open.app, open.path, 'as', open.as, ...(open.mobile ? ['mobile'] : []), '--headed'];
}

export async function runShow(argv: string[]): Promise<void> {
	const toplevel = toplevelOf();
	let line: string | null = argv.map((a) => unMsys(a, process.env)).join(' ').trim();
	let setups: { cmd: string; token: string }[] = [];
	if (!line) {
		const state = readState(toplevel);
		const { folder } = roundOf(state, toplevel);
		const agreement = folder && agreementPath(toplevel, state?.class ?? null, folder);
		const text = agreement && existsSync(agreement) ? readFileSync(agreement, 'utf8') : null;
		line = text && openLineOf(text);
		// Once per recipe: a second show must not create the data twice. Class A's walk sits outside
		// Intent (its agreement sha), so correcting its setup must invalidate the replay token (#139).
		const token = consequential(state?.class ?? null)
			? agreementSha(toplevel, state?.class ?? null, folder) ?? 'agreement'
			: createHash('sha256').update(agreementT2WalkLines(text).join('\n')).digest('hex');
		if (state?.t2_setup !== token) setups = setupLinesOf(text).map((cmd) => ({ cmd, token }));
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
	for (const { cmd } of setups) {
		const args = setupArgs(cmd);
		const r = args && spawnSync(process.execPath, args, { cwd: toplevel, encoding: 'utf8' });
		if (!r || r.status !== 0) {
			console.error(`wf show: setup "${cmd}" ${r ? `failed:\n${`${r.stdout}${r.stderr}`.trim().slice(0, 600)}` : 'is not `api <fn> <json> as <buyer|seller|admin>`'}\nFix it in the agreement's T2 walk bullet, then wf show again.`);
			process.exit(1);
		}
		console.log(`setup: ${cmd} → ${/HTTP \d+/.exec(r.stdout)?.[0] ?? 'ok'}`);
	}
	if (setups.length) writeState(toplevel, () => ({ t2_setup: setups[0].token }));
	if (!opensWindows()) {
		const branch = spawnSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
		const slug = slugForBranch(branch);
		const urls = stackUrls({ slug, port: basePortForBranch(branch) });
		// Again here: a round wf new made before the clone had its entries gets them now.
		writeCloneLaunch(slug, urls);
		console.log(paneText(open, urls, slug));
		return;
	}
	if (!existsSync(join(toplevel, VERIFY_SKILL))) {
		console.error(`wf show: this worktree has no ${VERIFY_SKILL} — its base predates the verification skill`);
		process.exit(1);
	}
	// wf step/next release an idle stack, so by T2 nothing may be listening: start it first, as brief does.
	try { console.error(await ensureServers(toplevel, { wait: true })); } catch (e) { console.error((e as Error).message); process.exit(1); }
	// Capture rather than inherit: the browser pid is in this CLI's first output line, and the window
	// it leaves behind keeps the worktree on Windows until reap releases it (#180).
	const r = spawnSync(process.execPath, showArgs(open), { cwd: toplevel, encoding: 'utf8' });
	const printed = `${r.stdout ?? ''}${r.stderr ?? ''}`;
	if (printed) process.stdout.write(printed.endsWith('\n') ? printed : `${printed}\n`);
	if (r.status === 0) {
		const pid = browserPidFromOutput(printed);
		if (pid === null) console.error('wf show: the CLI printed no `opened with pid` line, so this window is not recorded as the round\'s and `wf reap` may fail to delete the worktree while it is open. Report it; the project\'s teardown still closes this checkout\'s browsers');
		else recordShowBrowser(toplevel, [pid]);
	}
	process.exit(r.status ?? 1);
}

if (process.argv[1]?.endsWith('show.ts')) await runShow(process.argv.slice(2));
