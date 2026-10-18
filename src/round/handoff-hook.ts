// handoff-hook.ts — wf handoff <record | check>: the Claude Code plugin's hooks (claude/hooks.json),
// fed the hook's JSON on stdin. `record` (SubagentStop) records the worker's session reference;
// `check` is kept for an older install. wf no longer judges a handoff: the agent owns its sessions and
// when a phase ends (approved agent-owned harness/session management). What remains is the session
// recorder and the mechanical state guard — a corrupt or old-runtime state blocks rather than being
// written past. The no-fork policy is gone (the parent updates the hook install docs).
// Outside a round both allow everything.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CorruptStateError, legacyStateGap, readState } from './state.ts';
import { hookSession, recordSession } from './session.ts';

// Everything the hook contract hands us that wf reads. When the hook fires inside a subagent the event
// carries `agent_id`/`agent_type`, and SubagentStop adds `agent_transcript_path` (Claude Code 2.1.280,
// read 2026-10-10): that pair is the worker's reference. `session_id`/`transcript_path` are the MAIN
// session's on such a hook (the binary's base hook input, `Ul`), so session.ts reads the agent pair for
// the worker and never the main pair. The metadata travels with the hook, wf keeps only the reference.
type HookInput = { cwd?: string; session_id?: string; transcript_path?: string; stop_hook_active?: boolean; agent_id?: string; agent_type?: string; agent_transcript_path?: string; hook_event_name?: string; tool_input?: { subagent_type?: string } };

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
		// can block instead of letting a worker end past a state it cannot read (issue #107).
		if (e instanceof CorruptStateError) throw e;
		return null;
	}
}

function deny(input: HookInput, reason: string): void {
	process.stdout.write(JSON.stringify(input.hook_event_name === 'PreToolUse'
		? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
		: { decision: 'block', reason }));
}

export async function runHandoff(argv: string[]): Promise<void> {
	const input = await stdinJson();
	let toplevel: string | null;
	try {
		toplevel = roundAt(input.cwd ?? process.cwd());
	} catch (e) {
		if (!(e instanceof CorruptStateError)) throw e;
		deny(input, `wf handoff: ${e.message}`);
		return;
	}
	if (!toplevel) return;
	// The Claude phase worker, as a fact beside the step: a resumed session (or the person) can find it
	// again. Only the round-worker's own hook names the worker (session.ts, hookSession); the
	// orchestrator's Agent PreToolUse and another subagent's handback carry no worker id, and recording
	// them overwrote the worker's own reference (#114). A host without the fields records nothing,
	// never a guess.
	recordSession(toplevel, hookSession(input), readState(toplevel)?.step ?? null);
	if (argv[0] === 'check' || argv[0] === 'record') {
		const state = readState(toplevel);
		if (!state) return;
		// A state from the old runtime — or carrying executable-unit progress — is refused before the
		// hook lets the worker end (finish-before-release, #110).
		const legacy = legacyStateGap(state);
		if (legacy) deny(input, `wf handoff: ${legacy}`);
	}
	// `record` (and any other command) allows: the semantic handoff judge and the no-fork policy are gone.
}
