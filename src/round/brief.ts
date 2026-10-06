#!/usr/bin/env node
// brief.ts — wf brief <research | plan [--revise] | implement N | as-built | validate [--answer] | critique | standards <check> | fix-review>
// What a phase agent runs first: the orchestrator dispatches one line, "run `wf brief <phase>` and do
// exactly what it prints" (wf next prints it), so the agent's brief is wf's own text, never a summary
// or a shell expression (kit and env plan, step 4). The prompt is `wf prompt`'s, plus a handoff with
// a token recorded in .wf/state.json `briefs` (handoff.ts). It refuses while the handoff it
// starts from is missing or stale: RESEARCH.md for plan, PLAN.md's rows for implement.
// Implement and fix-review hand off a commit, so their brief carries no token line.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { briefsAfter, handoffFile, handoffGap, HANDOFF_FILES, newToken, tokenLine, tokenOf } from './handoff.ts';
import { nextAction, snapshotOf } from './next.ts';
import { composePrompt } from './prompt.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { readState, toplevelOf, writeState } from './state.ts';
import type { State } from './state.ts';

// Pure: the handoff a phase's brief ends with.
export function handoffText({ phase, folder, token, file = HANDOFF_FILES[phase] }: { phase: string; folder: string | null; token: string; file?: string }): string {
	const line = `\`${tokenLine(token)}\``;
	if (phase === 'implement') return `\n## Handoff\n\nYour handoff is the commit: the row's message exactly, made after \`wf check\` is green; or \`${folder}/BLOCKED.md\`.\n`;
	if (phase === 'fix-review') return '\n## Handoff\n\nYour handoff is the one `fix(review):` commit, made after `wf check` is green.\n';
	return `\n## Handoff\n\nEnd \`${folder}/${file}\` with this line, exactly: ${line}\nWithout it the file is not taken as this brief's answer, and the round does not move on.\n`;
}

const readIf = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

// The phase whose handoff a brief starts from.
const STARTS_FROM: Record<string, string> = { plan: 'research', implement: 'plan', critique: 'validate' };

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
	if (say.split('\n').some((l) => l.startsWith(`dispatch ${label}:`) || l.startsWith(`dispatch ${label} (model: `))) return null;
	return `wf next is not dispatching \`${label}\` (it says: ${say.split('\n')[0]}). A brief records a new token and voids the last one's handoff; to read a phase's prompt, \`wf prompt ${label}\``;
}

// The chain a critique and an answering validation are part of (gates/critique.ts): a critique records
// the validation it judges and which exchange it is, `validate --answer` the exchange it answers. A
// validation not briefed as an answer (the first, or one after a fix) starts a new chain.
function critiqueFields(phase: string, argv: string[], state: State | null, toplevel: string, folder: string | null) {
	if (phase === 'critique') {
		return { of: tokenOf(readIf(join(toplevel, folder ?? '', HANDOFF_FILES.validate))), exchange: (state?.briefs?.validate?.answers ?? 0) + 1 };
	}
	if (phase === 'validate' && argv.includes('--answer')) return { answers: state?.briefs?.critique?.exchange ?? 1 };
	return {};
}

// The phases that drive the app in a browser: their brief starts the stack and waits for it, since
// nothing serves a worktree from its creation (2026-10-04, serve.ts).
export const USES_STACK = new Set(['research', 'validate']);

// `stack` is ensureServers; the self-check plugs in a stack that never answers.
export async function runBrief(argv: string[], { stack = ensureServers }: { stack?: typeof ensureServers } = {}): Promise<void> {
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
	const { toplevel, folder, key } = composed;
	// The stack comes first, and the brief is recorded only once it is about to go out. The wait runs up
	// to 3 minutes, and a stack that does not answer holds the brief back for all of it: BJEW-461
	// (2026-10-06), the validate agent's piped `wf brief validate` hung on a dev server busy with a
	// backlog of reloads, its caller gave up and ran it again, and the record, written before the wait,
	// counted two agents for one; `wf next` then refused to dispatch validate. A brief that never got
	// out is not an agent. On stderr, so the brief on stdout stays the prompt alone. A stack that will
	// not start does not stop the brief: a backend-only round's research still has work to do without it.
	if (USES_STACK.has(phase)) {
		try { console.error(await stack(toplevel, { wait: true })); } catch (e) { /* the brief still goes out: research can start without the app */ console.error((e as Error).message); }
	}
	const token = newToken();
	const state = readState(toplevel);
	// count: how many agents this phase has had; wf next stops at two without a handoff.
	// A critique of a new validation is that validation's first, not the round's next.
	const fresh = phase === 'critique' && state?.briefs?.critique?.of !== tokenOf(readIf(join(toplevel, folder ?? '', HANDOFF_FILES.validate)));
	const count = fresh ? 1 : (state?.briefs?.[key]?.count ?? 0) + 1;
	// head: the commit a phase was briefed on. wf next re-runs validate once a fix(review) commit lands
	// after it (TJEW-670: the PR shipped a validation of the tree before its review fix).
	const head = execFileSync('git', ['-C', toplevel, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	writeState(toplevel, { briefs: { ...briefsAfter(phase, argv, state?.briefs), [key]: { token, at: new Date().toISOString(), count, head, ...critiqueFields(phase, argv, state, toplevel, folder) } } });
	process.stdout.write(`${composed.text.trimEnd()}\n${handoffText({ phase, folder, token, file: handoffFile(phase, argv[1]) })}`);
}

if (process.argv[1]?.endsWith('brief.ts')) await runBrief(process.argv.slice(2));
