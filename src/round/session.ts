#!/usr/bin/env node
// session.ts — the phase worker's harness session, kept as a reference in the round's state.
// wf owns no session system or agent loop (DIRECTION, composition): it records the ids the harnesses
// already put in the environment, so another session (or a person) can resume the work without
// reconstructing it by hand. PI injects PI_SESSION_ID / PI_SESSION_FILE into the worker's tools
// (pi-coding-agent docs/environment-variables.md); Claude Code hands a hook fired inside the worker
// its own `agent_id` / `agent_transcript_path` (code.claude.com/docs/en/hooks; the installed 2.1.280
// binary, read 2026-10-10). A harness wf cannot see records nothing, and a missing reference is
// reported as missing, never fabricated (#114).
import { readState, WF_STATE_VERSION, writeState } from './state.ts';
import type { State } from './state.ts';

// A harness session, as a reference: which harness, its id, the transcript it owns (when the harness
// names one), and the round step it was recorded at. No transcript content is copied.
export type SessionRef = { harness: string; id: string; transcript: string | null; step: string | null; at: string };
// What a recorder found: a SessionRef before the step and time recordSession stamps on it.
export type SessionRefInput = { harness: string; id: string; transcript: string | null };

// Pure: the phase worker's session the current environment names, or null. PI first: PI_SESSION_ID /
// PI_SESSION_FILE are injected into the worker's own tools, so a pi session is the worker's. Claude
// Code's CLAUDE_CODE_SESSION_ID is the round's shared session — the orchestrator and every subagent
// run in it (the installed binary's shell env sets it from the session id, 2.1.280, 2026-10-10) — so
// it never names the worker; Claude's reference comes from the hook's agent_id (hookSession)
// instead. Recording the shared id here would name the parent as the worker.
export function harnessSession(env: Record<string, string | undefined> = process.env): SessionRefInput | null {
	const pi = env.PI_SESSION_ID?.trim();
	if (pi) return { harness: 'pi', id: pi, transcript: env.PI_SESSION_FILE?.trim() || null };
	return null;
}

// Pure: whether a Claude Code hook fired inside the round-worker. The worker's event carries its own
// `agent_id` and `agent_type` (common hook input, 2.1.280); a main-thread event (Agent PreToolUse,
// Stop) has no agent_id, and another subagent's handback carries its own type, not the worker's.
export function isRoundWorker(input: { agent_type?: string }): boolean {
	return /round-worker/.test(input.agent_type ?? '');
}

// Pure: the phase worker session a Claude Code hook input names, or null. A hook fired inside a
// subagent carries `agent_id` and `agent_type`; SubagentStop also carries `agent_transcript_path`,
// the subagent's own log (code.claude.com/docs/en/hooks, 2.1.280). On such a hook `session_id` /
// `transcript_path` are the MAIN session's — reading them as the worker named the parent (#114) — so
// they are typed here only because the payload carries them, and never read. A hook that is not the
// round-worker's names no worker: nothing is recorded.
export function hookSession(input: { session_id?: string; transcript_path?: string; agent_id?: string; agent_type?: string; agent_transcript_path?: string }): SessionRefInput | null {
	if (!isRoundWorker(input)) return null;
	const id = input.agent_id?.trim();
	if (!id) return null;
	return { harness: 'claude', id, transcript: input.agent_transcript_path?.trim() || null };
}

// Pure: whether recording `ref` at `step` would change the round's reference. A brief re-run in the
// same session is not a new fact, so it does not rewrite state.json on every phase read.
export function sessionChanged(state: State, ref: SessionRefInput | null, step: string | null): boolean {
	if (!ref) return false;
	const held = state.session;
	if (!held || held.harness !== ref.harness || held.id !== ref.id || held.step !== (step ?? null)) return true;
	// A null transcript is not a new fact: an env or brief re-read that names no transcript must not
	// erase the one a hook already recorded for this session. A richer transcript is a new fact.
	if (!ref.transcript) return false;
	return held.transcript !== ref.transcript;
}

// Pure: `state` with the reference recorded at `step`. One session, the latest. A null transcript
// never erases a held transcript for the same session (sessionChanged already refuses that write;
// this keeps the invariant true for a direct caller too).
export function withSession(state: State, ref: SessionRefInput, step: string | null, now = new Date().toISOString()): State {
	const held = state.session;
	const transcript = ref.transcript ?? (held && held.harness === ref.harness && held.id === ref.id ? held.transcript : null);
	return { ...state, session: { ...ref, transcript, step: step ?? null, at: now } };
}

// Record the worker's harness session into the round's state when it is new. Best-effort by design: a
// phase read or a hook must not fail because state could not be written, and a round from another
// runtime is left alone (it may not hold the field). `wf status` reads the reference back.
export function recordSession(toplevel: string, ref: SessionRefInput | null, step: string | null): void {
	if (!ref) return;
	try {
		const state = readState(toplevel);
		if (!state || state.wf_version !== WF_STATE_VERSION || !sessionChanged(state, ref, step)) return;
		writeState(toplevel, (current) => (sessionChanged(current, ref, step) ? withSession(current, ref, step) : current));
	} catch {
		// A session reference is visibility, not the round: a lock held by another writer or a
		// corrupt state must not turn `wf brief` or a harness hook into a failure.
	}
}
