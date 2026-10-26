#!/usr/bin/env node
// brief.ts — wf brief <agree | build | assess>
// What a phase runs first: `wf next` prints one `work <phase>:` packet, "run `wf brief <phase>` and do
// exactly what it prints", so the brief is wf's own text, never a summary or a shell expression, and
// the session already open may run it just as a fresh agent may be handed the same line. The old
// per-phase handoff token (a `<!-- brief: … -->` line recording which brief a
// file answered) is gone (#112): a phase is identified by the round's step, and a build ends by
// running `wf step assess`, not by matching a commit subject or a row number.
import { existsSync, readFileSync } from 'node:fs';
import { nextAction, snapshotOf } from './next.ts';
import { composePrompt } from './prompt.ts';
import { harnessSession, recordSession } from './session.ts';
import { agreementFile, consequential } from './agreement.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { recoverProjections } from './ask.ts';
import { readState, toplevelOf } from './state.ts';
import { correctionStateSha } from './corrections.ts';
import { PHASES, USAGE } from './prompt.ts';
import { wfEntryCommand } from '../paths.ts';
import { seams } from '../seams.ts';

// The phases that drive the app in a browser: their brief starts the stack and waits for it. The
// build chooses its own checks; the assessment may look at the app itself.
export const USES_STACK = new Set(['assess']);

/** End a phase brief with its next action; phase templates own the work and report requirements. */
export function handoffText(phase: string, folder: string | null, klass: string | null, assessmentFile = 'ASSESSMENT.md'): string {
	if (phase === 'build') return `\n## Handoff\n\nAfter recording a correction's disposition, run \`wf next\`: unchanged approved delivery may resume without another vote. Otherwise, when the agreement's behavior is implemented and you have run the checks that matter for this change, commit, then run \`wf step assess\`. For an unresolved blocker, follow the questions procedure above rather than retrying blindly.\n`;
	if (phase === 'assess') return `\n## Handoff\n\nAfter writing \`${folder}/${assessmentFile}\` as specified above, run \`wf next\`.\n`;
	return `\n## Handoff\n\nWrite \`${folder}/${agreementFile(klass as 'A' | 'B' | 'C')}\` (class ${klass}: ${consequential(klass as 'A' | 'B' | 'C') ? 'the agreement with `## Observed`, `## Agreed` and `## Verification`' : 'the ticket with `## Intent` (the requester\'s words, verbatim and attributed), plus `## Repro` for a check round'}); then \`wf next\`.\n`;
}

// Pure: null when `wf next` is working exactly this brief, else why not. A brief read out of turn
// would run a phase the round is not at; only the current `work <phase>:` packet is accepted, and the
// old `dispatch <phase> (model: …)` line is refused so a stale instruction cannot start a phase.
export function briefGap(argv: string[], say: string): string | null {
	const label = argv.join(' ');
	const lines = say.split('\n');
	if (lines.some((l) => l.startsWith(`work ${label}:`))) return null;
	if (lines.some((l) => l.startsWith(`dispatch ${label}:`) || l.startsWith(`dispatch ${label} (model: `))) return `wf next no longer dispatches a phase to a fixed agent — it is working \`${label}\`; run \`wf next\` and act on the \`work ${label}:\` packet it prints`;
	return `wf next is not working \`${label}\` (it says: ${lines[0]}). To read a phase's prompt, \`wf prompt ${label}\``;
}

export async function runBrief(argv: string[], { stack = ensureServers }: { stack?: typeof ensureServers } = {}): Promise<void> {
	const phase = argv[0];
	// A bare `wf brief` used to reach the stale-packet guard and report "wf next is not working ``"
	// about a phase nobody asked for; the usage is the honest answer (2026-10-19).
	if (!PHASES.includes(phase)) {
		console.error(`wf brief: usage: <${USAGE}>`);
		process.exitCode = 2;
		return;
	}
	let composed: ReturnType<typeof composePrompt>;
	let blockedAnswer = '';
	let workReason = '';
	let expectedCorrections = '';
	try {
		const toplevel = toplevelOf();
		recoverProjections(toplevel);
		const snapshot = snapshotOf(toplevel);
		expectedCorrections = correctionStateSha({ corrections: snapshot.corrections });
		const action = nextAction(snapshot, 'brief').say;
		const gap = briefGap(argv, action);
		if (phase === 'build') workReason = `
## Build reason

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
	// A known context may be linked for inspection; task records, not a harness session or hook,
	// carry the resume contract. Missing context identity is deliberately harmless.
	recordSession(toplevel, harnessSession(), readState(toplevel)?.step ?? phase);
	// The stack comes first. A stack that will not start does not stop the brief: the build can start
	// without it, and `wf check` starts its own.
	if (USES_STACK.has(phase)) {
		try { console.error(await stack(toplevel, { wait: true })); } catch (e) { /* the brief still goes out */ console.error((e as Error).message); }
	}
	if (correctionStateSha(readState(toplevel)) !== expectedCorrections) {
		console.error('wf brief: corrections changed while preparing the brief; run wf next again to receive the current instruction');
		process.exitCode = 2;
		return;
	}
	const handoff = handoffText(phase, folder, readState(toplevel)?.class ?? state?.class ?? null, composed.assessmentFile)
		.replace(/`wf /g, `\`${wfEntryCommand(seams.entry, { cwd: toplevel })} `);
	process.stdout.write(`${composed.text.trimEnd()}\n${workReason}${blockedAnswer}${handoff}`);
}

if (process.argv[1]?.endsWith('brief.ts')) await runBrief(process.argv.slice(2));
