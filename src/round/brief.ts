#!/usr/bin/env node
// brief.ts — wf brief <agree | build | assess>
// What a phase agent runs first: the orchestrator dispatches one line, "run `wf brief <phase>` and do
// exactly what it prints", so the agent's brief is wf's own text, never a summary or a shell
// expression. The old per-phase handoff token (a `<!-- brief: … -->` line recording which brief a
// file answered) is gone (#112): a phase is identified by the round's step, and a build ends by
// running `wf step assess`, not by matching a commit subject or a row number.
import { existsSync, readFileSync } from 'node:fs';
import { nextAction, snapshotOf } from './next.ts';
import { composePrompt } from './prompt.ts';
import { harnessSession, recordSession } from './session.ts';
import { agreementFile, consequential } from './agreement.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { readState, toplevelOf } from './state.ts';

// The phases that drive the app in a browser: their brief starts the stack and waits for it. The
// build chooses its own checks; the assessment may look at the app itself.
export const USES_STACK = new Set(['assess']);

// Pure: the handoff a phase's brief ends with. No token is minted: the build's handoff is the step
// transition `wf step assess`, the assessment's the ASSESSMENT.md it writes.
export function handoffText(phase: string, folder: string | null, klass: string | null, assessmentFile = 'ASSESSMENT.md'): string {
	if (phase === 'build') return `\n## Handoff\n\nWhen the agreement's behavior is implemented and you have run the checks that matter for this change, commit, then run \`wf step assess\`. If a check cannot run (stack, git, a missing runner), do not retry blind: write \`${folder}/BLOCKED.md\` with a \`Question:\` naming what could not run. Write it too if you cannot proceed.\n`;
	if (phase === 'assess') return `\n## Handoff\n\nWrite \`${folder}/${assessmentFile}\` whole, with its \`Verdict:\` line and \`head:\` line; then \`wf next\`.\n`;
	return `\n## Handoff\n\nWrite \`${folder}/${agreementFile(klass as 'A' | 'B' | 'C')}\` (class ${klass}: ${consequential(klass as 'A' | 'B' | 'C') ? 'the agreement with `## Observed`, `## Agreed` and `## Verification`' : 'the ticket, with `## Repro` for a check round'}); then \`wf next\`.\n`;
}

// Pure: null when `wf next` dispatches exactly this brief, else why not. A brief read out of turn
// would run a phase the round is not at (the old token was what made a stale file not count).
export function briefGap(argv: string[], say: string): string | null {
	const label = argv.join(' ');
	if (say.split('\n').some((l) => l.startsWith(`dispatch ${label}:`) || l.startsWith(`dispatch ${label} (model: `))) return null;
	return `wf next is not dispatching \`${label}\` (it says: ${say.split('\n')[0]}). To read a phase's prompt, \`wf prompt ${label}\``;
}

export async function runBrief(argv: string[], { stack = ensureServers }: { stack?: typeof ensureServers } = {}): Promise<void> {
	const phase = argv[0];
	let composed: ReturnType<typeof composePrompt>;
	let blockedAnswer = '';
	let dispatchReason = '';
	try {
		const toplevel = toplevelOf();
		const snapshot = snapshotOf(toplevel);
		const action = nextAction(snapshot, 'brief').say;
		const gap = briefGap(argv, action);
		if (phase === 'build') dispatchReason = `
## Build dispatch reason

${action}
`;
		if (gap) throw new Error(`${phase}: ${gap}`);
		if (phase === 'build' && snapshot.files.blocked) blockedAnswer = `\n## Answered build block\n\n${snapshot.files.blocked.trim()}\n`;
		composed = composePrompt(argv);
	} catch (e) {
		console.error(`wf brief ${(e as Error).message}`);
		process.exit(2);
	}
	const { toplevel, folder, state } = composed;
	// The phase worker's own harness session is the one to resume: record it as a round fact (pi's
	// PI_SESSION_ID / PI_SESSION_FILE). Claude Code's shared session id is not the worker's, so in
	// Claude the worker is recorded from its own hook (session.ts). Best-effort.
	recordSession(toplevel, harnessSession(), readState(toplevel)?.step ?? phase);
	// The stack comes first. A stack that will not start does not stop the brief: the build can start
	// without it, and `wf check` starts its own.
	if (USES_STACK.has(phase)) {
		try { console.error(await stack(toplevel, { wait: true })); } catch (e) { /* the brief still goes out */ console.error((e as Error).message); }
	}
	process.stdout.write(`${composed.text.trimEnd()}\n${dispatchReason}${blockedAnswer}${handoffText(phase, folder, readState(toplevel)?.class ?? state?.class ?? null, composed.assessmentFile)}`);
}

if (process.argv[1]?.endsWith('brief.ts')) await runBrief(process.argv.slice(2));
