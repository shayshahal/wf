#!/usr/bin/env node
// brief.mts — wf brief <research | plan [--revise] | implement N | as-built | validate | fix-review>
// What a phase agent runs first: the orchestrator dispatches one line, "run `wf brief <phase>` and do
// exactly what it prints" (wf next prints it), so the agent's brief is wf's own text, never a summary
// or a shell expression (kit and env plan, step 4). The prompt is `wf prompt`'s, plus a handoff with
// a token recorded in .wf/state.json `briefs` (handoff.mts). It refuses while the handoff it
// starts from is missing or stale: RESEARCH.md for plan, PLAN.md's rows for implement.
// Implement and fix-review hand off a commit, so their brief carries no token line.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { briefKey, handoffGap, HANDOFF_FILES, newToken, tokenLine } from './handoff.mts';
import { nextAction, snapshotOf } from './next.mts';
import { composePrompt } from './prompt.mts';
import { readState, toplevelOf, writeState } from './state.mts';
import type { State } from './state.mts';

// Pure: the handoff a phase's brief ends with.
export function handoffText({ phase, folder, token }: { phase: string; folder: string | null; token: string }): string {
	const line = `\`${tokenLine(token)}\``;
	if (phase === 'implement') return `\n## Handoff\n\nYour handoff is the commit: the row's message exactly, made after \`wf check\` is green; or \`${folder}/BLOCKED.md\`.\n`;
	if (phase === 'fix-review') return '\n## Handoff\n\nYour handoff is the one `fix(review):` commit, made after `wf check` is green.\n';
	return `\n## Handoff\n\nEnd \`${folder}/${HANDOFF_FILES[phase]}\` with this line, exactly: ${line}\nWithout it the file is not taken as this brief's answer, and the round does not move on.\n`;
}

// The phase whose handoff a brief starts from.
const STARTS_FROM: Record<string, string> = { plan: 'research', implement: 'plan' };

// Null, or why the phase before `phase` has not handed off (the files as they are now).
export function startGap(phase: string, toplevel: string, state: State | null): string | null {
	const from = STARTS_FROM[phase];
	if (!from) return null;
	const file = join(toplevel, state?.folder ?? '', HANDOFF_FILES[from]);
	return handoffGap(from, existsSync(file) ? readFileSync(file, 'utf8') : null, state?.briefs?.[from]);
}

// Pure: null when `wf next` (its printed `say`) dispatches exactly this brief, else why not. A
// brief records a new token, and the last brief's handoff stops counting: BJEW-562 (2026-09-27),
// the orchestrator ran `wf brief plan --revise` to preview it, and the build it then dispatched
// refused, the plan no longer handed off.
export function briefGap(argv: string[], say: string): string | null {
	const label = argv.join(' ');
	if (say.split('\n').some((l) => l.startsWith(`dispatch ${label}:`))) return null;
	return `wf next is not dispatching \`${label}\` (it says: ${say.split('\n')[0]}). A brief records a new token and voids the last one's handoff; to read a phase's prompt, \`wf prompt ${label}\``;
}

export function runBrief(argv: string[]): void {
	const phase = argv[0];
	let composed: ReturnType<typeof composePrompt>;
	try {
		const toplevel = toplevelOf();
		const gap = startGap(phase, toplevel, readState(toplevel)) ?? briefGap(argv, nextAction(snapshotOf(toplevel)).say);
		if (gap) throw new Error(`${phase}: ${gap}`);
		composed = composePrompt(argv);
	} catch (e) {
		console.error(`wf brief ${(e as Error).message}`);
		process.exit(2);
	}
	const token = newToken();
	const { toplevel, folder, n } = composed;
	const state = readState(toplevel);
	const key = briefKey(phase, n);
	// count: how many agents this phase has had; wf next stops at two without a handoff.
	const count = (state?.briefs?.[key]?.count ?? 0) + 1;
	// head: the commit a phase was briefed on. wf next re-runs validate once a fix(review) commit lands
	// after it (TJEW-670: the PR shipped a validation of the tree before its review fix).
	const head = execFileSync('git', ['-C', toplevel, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	writeState(toplevel, { briefs: { ...(state?.briefs ?? {}), [key]: { token, at: new Date().toISOString(), count, head } } });
	process.stdout.write(`${composed.text.trimEnd()}\n${handoffText({ phase, folder, token })}`);
}

if (process.argv[1]?.endsWith('brief.mts')) runBrief(process.argv.slice(2));
