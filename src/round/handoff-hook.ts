// handoff-hook.ts — wf handoff <check | no-fork>: the Claude Code plugin's hooks (claude/hooks.json),
// fed the hook's JSON on stdin.
//   check    a wf:round-worker handing back (PreToolUse on SubagentHandback) or stopping
//            (SubagentStop): sends it back, once per step, while the phase its round is at still owes
//            its handoff. The old per-brief token is gone (#112): the round's step is the phase, and
//            the handoff is the agreement file (agree), `wf step assess` (build) or ASSESSMENT.md
//            (assess). pi has no such hook; wf next catches it there one step later.
//   no-fork  PreToolUse on Agent: in a round, a fork is refused.
// Outside a round both allow everything.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agreementGap, agreementPath, ASSESSMENT_FILE, assessmentGap, consequential, section } from './agreement.ts';
import { CorruptStateError, legacyStateGap, readState, writeState } from './state.ts';
import { hookSession, recordSession } from './session.ts';
import type { State } from './state.ts';

// Everything the hook contract hands us that wf reads. `session_id`/`transcript_path` are the session's
// own reference (Claude Code 2.1.132): recorded so a round can be resumed in the session that ran it,
// and dropped for nothing else — the metadata travels with the hook, wf keeps only the reference.
type HookInput = { cwd?: string; session_id?: string; transcript_path?: string; stop_hook_active?: boolean; agent_type?: string; hook_event_name?: string; tool_input?: { subagent_type?: string } };

// Pure: null when the round-worker may end, else what its phase still owes. Keyed on the round's step,
// which is the phase it is at; the sent-back marker holds it to one hand-back per *visit* to the step
// (`step@since`), so a build that returns after a repair is sent back again (#112).
export function stopGap(state: State | null, files: { agreement: string | null; assessment: string | null; blocked: boolean; commits: boolean }): string | null {
	if (!state || state.handoff_sent_back === `${state.step ?? ''}@${state.since ?? ''}`) return null;
	const klass = state.class ?? null;
	if (state.step === 'agree') {
		if (!files.agreement) return `write ${consequential(klass) ? 'AGREEMENT.md' : 'TICKET.md'} (its sections) before you end`;
		if (consequential(klass)) return agreementGap(files.agreement, klass, null);
		if (!section(files.agreement, 'Intent')) return 'TICKET.md has no `## Intent` — the requester\'s words, verbatim';
		return null;
	}
	if (state.step === 'build') {
		if (files.blocked || files.commits) return null;
		return 'the build has no commit yet: when the agreement\'s verification cases pass, commit and run `wf step assess`, or write BLOCKED.md';
	}
	if (state.step === 'assess') {
		if (!files.assessment) return `write ${ASSESSMENT_FILE} (with its Verdict: and head: lines) before you end`;
		return assessmentGap(files.assessment);
	}
	return null;
}

// Pure: why an Agent call is refused, or null.
export function forkGap(input: HookInput | null | undefined): string | null {
	return input?.tool_input?.subagent_type === 'fork' ? 'no forks in a round: a fork carries this whole conversation. Dispatch a fresh wf:round-worker with the line `wf next` printed (round skill, Dispatch in this harness).' : null;
}

async function stdinJson(): Promise<HookInput> {
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	try { return JSON.parse(text) as HookInput; } catch { /* no JSON from the harness: judged by the working directory alone */ return {}; }
}

function roundAt(cwd: string): string | null {
	try {
		const toplevel = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return existsSync(join(toplevel, '.wf', 'state.json')) && readState(toplevel)?.folder ? toplevel : null;
	} catch (e) {
		// A state file that is not the round's is the round's, not "no round here": rethrow so the hook
		// can block instead of letting a worker end or fork past its gate (issue #107).
		if (e instanceof CorruptStateError) throw e;
		return null;
	}
}

export async function runHandoff(argv: string[]): Promise<void> {
	const input = await stdinJson();
	let toplevel: string | null;
	try {
		toplevel = roundAt(input.cwd ?? process.cwd());
	} catch (e) {
		if (!(e instanceof CorruptStateError)) throw e;
		const reason = `wf handoff: ${e.message}`;
		process.stdout.write(JSON.stringify(input.hook_event_name === 'PreToolUse'
			? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
			: { decision: 'block', reason }));
		return;
	}
	if (!toplevel) return;
	// The Claude session that is running this round, as a fact beside the step: a resumed session (or
	// the person) can find it again. A host without `session_id` records nothing, never a guess.
	recordSession(toplevel, hookSession(input), readState(toplevel)?.step ?? null);
	if (argv[0] === 'check') {
		// Once per step: a second hand-back or stop goes through, and wf next redispatches (a hook loop
		// would burn the agent).
		if (input.stop_hook_active || !/round-worker/.test(input.agent_type ?? '')) return;
		const state = readState(toplevel);
		if (!state) return;
		// A state from the old runtime is refused before the hook writes anything (finish-before-release,
		// #110): the handoff hook is the one producer that runs outside the dispatcher's guard.
		const legacy = legacyStateGap(state);
		if (legacy) {
			const reason = `wf handoff: ${legacy}`;
			process.stdout.write(JSON.stringify(input.hook_event_name === 'PreToolUse'
				? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
				: { decision: 'block', reason }));
			return;
		}
		const folder = state.folder ?? null;
		const agreementFile = agreementPath(toplevel, state.class ?? null, folder);
		const read = (name: string) => (folder && existsSync(join(toplevel, folder, name)) ? readFileSync(join(toplevel, folder, name), 'utf8') : null);
		const commits = (() => { try { return execFileSync('git', ['-C', toplevel, 'log', '--format=%H', `${state.base ?? 'HEAD~1'}..HEAD`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0; } catch { return false; } })();
		const gap = stopGap(state, {
			agreement: existsSync(agreementFile) ? readFileSync(agreementFile, 'utf8') : null,
			assessment: read(ASSESSMENT_FILE),
			blocked: existsSync(join(toplevel, folder ?? '', 'BLOCKED.md')),
			commits,
		});
		if (!gap) return;
		writeState(toplevel, (current) => ({ handoff_sent_back: `${current.step ?? ''}@${current.since ?? ''}` }));
		const out = input.hook_event_name === 'PreToolUse'
			? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `not yet: ${gap}` } }
			: { decision: 'block', reason: gap };
		process.stdout.write(JSON.stringify(out));
	} else if (argv[0] === 'no-fork') {
		const gap = forkGap(input);
		if (gap) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: gap } }));
	}
}
