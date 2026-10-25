#!/usr/bin/env node
// Optional project-affected checks. Agents choose other verification through their harness;
// this convenience records execution, not completion of agreement cases or proof of intent.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checks, protectedFilesGap, runnerEnv } from '../project.ts';
import type { VerificationRequirements } from '../project.ts';
import { readState, resolveRoundBase, roundOf, toplevelOf } from '../round/state.ts';
import { acquireVerificationServers } from '../worktrees/serve.ts';
import type { VerificationServers } from '../worktrees/serve.ts';
import { worktreeContentSha } from './content-identity.ts';
import { dirtyFiles } from '../dirty-files.ts';
import { checkOutputTail, checkRunLine } from './checks-log.ts';
import type { CheckRun, RedCause } from './checks-log.ts';
import { runCheckProcess } from './check-process.ts';

/** A project-owned affected check, or a concrete reason it cannot run. */
export type CheckTask =
	| { label: string; cmd: string; args: string[]; cwd: string; env?: Record<string, string>; stack?: boolean; requirements?: VerificationRequirements; missing?: never }
	| { label: string; missing: string; cmd?: never; args?: never; cwd?: never; env?: never; stack?: never; requirements?: never };

// Everything the round has moved: committed on the branch since `base` (when given), plus unstaged,
// staged and untracked, repo-relative. A committed-only product change must be seen too — a build that
// commits before `wf check`, a repair cycle or a resumed round runs on a clean tree (#109).
export function changedFiles(toplevel: string, base?: string | null) {
	const git = (args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean);
	return [...new Set([...(base ? git(['diff', '--name-only', `${base}...HEAD`]) : []), ...dirtyFiles(toplevel)])].sort();
}

// The round's own paperwork is never fenced: the implementer writes BLOCKED.md and
// `wf prompt` rewrites state while the commit is open. SPEC, SPEC-REVIEW and REVIEW are in the round
// folder too (until 2026-09-23 they sat at the worktree root, and TJEW-700's class B commits were
// fenced on them there).
export const isRoundPaperwork = (file: string, folder: string | null) => file.startsWith('.wf/') || (folder && file.startsWith(folder.replace(/\\/g, '/').replace(/\/?$/, '/')));

/** Manual verification text is displayed to the reviewer, never executed. */
export function manualCheck(cell: string | null | undefined): string | null {
	const m = /^\s*manual:[ \t]*(.+?)\s*$/i.exec(cell ?? '');
	return m && m[1] ? m[1] : null;
}

/** Unreadable or changed measured bytes cannot supply a green result. */
export type IdentityGap = 'unavailable' | 'changed' | null;
export function identityGap(start: string | undefined, end: string | undefined): IdentityGap {
	if (start === undefined || end === undefined) return 'unavailable';
	return start === end ? null : 'changed';
}

/** Quote project-built argv for Windows command shims; native platforms retain argv. */
export const shellArgv = (args: string[], platform: NodeJS.Platform = process.platform): string[] =>
	platform === 'win32' ? args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`) : args;

/** Refuse cmd environment expansion rather than silently running different project-built argv. */
export const shellArgUnsafe = (arg: string, platform: NodeJS.Platform = process.platform): boolean =>
	platform === 'win32' && /%[^%]+%/.test(arg);

/** Captured runner output may exceed Node's default buffer. */
export const RUN_MAX_BUFFER = 64 * 1024 * 1024;

const contentOf = (toplevel: string, folder: string | null): string | undefined => {
	try { return worktreeContentSha(toplevel, folder, null, 'row'); }
	catch { return undefined; /* git cannot name the measured tree; fail closed below */ }
};

/** Run the project's affected checks optionally; no agreement row or baseline policy is executed. */
export async function runCheck(argv: string[] = []): Promise<void> {
	if (argv.length) { console.error('wf check: affected checks take no arguments; run other project commands through your harness'); process.exitCode = 1; return; }
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { folder } = roundOf(state, toplevel);
	const start = contentOf(toplevel, folder);
	const ran: CheckRun[] = [];
	const logRun = (result: string, cause?: RedCause) => {
		mkdirSync(join(toplevel, '.wf'), { recursive: true });
		appendFileSync(join(toplevel, '.wf', 'checks.log'), `${checkRunLine({ ts: new Date().toISOString(), row: null, rowCheck: null, tasks: ran, result, cause, content: contentOf(toplevel, folder) })}\n`);
	};
	const refuse = (missing: string) => {
		console.error(`COULD NOT RUN: ${missing}`);
		ran.push({ label: 'check', exit: null, missing });
		logRun('red', 'environment');
		process.exitCode = 1;
	};
	const { ref, base } = resolveRoundBase(toplevel, state);
	if (!base) { refuse(`the round's base \`${ref}\` does not resolve`); return; }
	const protectedGap = protectedFilesGap(toplevel);
	if (protectedGap) { refuse(protectedGap); return; }
	const tasks = checks({ toplevel, changed: changedFiles(toplevel, base) });
	if (!tasks.length) { console.log('wf check: no affected project checks; no measurement recorded'); return; }
	for (const task of tasks) {
		if (task.missing !== undefined) { refuse(task.missing); return; }
		const unsafe = task.args.find((arg) => shellArgUnsafe(arg));
		if (unsafe !== undefined) { refuse(`Windows command shim would expand \`${unsafe}\`; run a literal-safe project command instead`); return; }
		let lease: VerificationServers = { kind: 'acquired', release: async () => null };
		if (task.stack || task.requirements) {
			lease = await acquireVerificationServers(toplevel, { ...runnerEnv(process.env), ...task.env }, task.requirements);
			if (lease.kind === 'refused') { refuse(lease.why); return; }
		}
		let cleanup: string | null = null;
		const started = Date.now();
		let run;
		try {
			run = await runCheckProcess(task.cmd, shellArgv(task.args), { worktree: toplevel, cwd: join(toplevel, task.cwd), env: { ...runnerEnv(process.env), ...task.env }, shell: process.platform === 'win32', maxBuffer: RUN_MAX_BUFFER, signal: lease.signal });
		} finally { cleanup = await lease.release(); }
		const output = `${run.stdout}${run.stderr}`;
		const interrupted = cleanup || lease.signal?.aborted;
		ran.push({ label: task.label, exit: interrupted ? null : run.status, output: checkOutputTail(output), durationMs: Date.now() - started, ...(cleanup ? { missing: cleanup } : {}) });
		if (interrupted || run.status !== 0) {
			console.error(`FAILED: ${task.label}
${checkOutputTail(output)}${cleanup ? `
${cleanup}` : ''}`);
			logRun('red', interrupted || run.status === null ? 'environment' : 'code');
			process.exitCode = 1;
			return;
		}
	}
	const gap = identityGap(start, contentOf(toplevel, folder));
	if (gap) {
		console.error(`wf check: measured tree ${gap === 'changed' ? 'changed during execution' : 'could not be read'}; no green recorded`);
		logRun(gap);
		process.exitCode = 1;
		return;
	}
	logRun('green');
}

if (process.argv[1] && basename(process.argv[1]) === 'check.ts') await runCheck(process.argv.slice(2));
