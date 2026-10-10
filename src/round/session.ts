#!/usr/bin/env node
// session.ts — the harness session a round is running in, kept as a reference in the round's state.
// wf owns no session system or agent loop (DIRECTION, composition): it records the ids the harnesses
// already put in the environment, so another session (or a person) can resume the work without
// reconstructing it by hand. PI injects PI_SESSION_ID / PI_SESSION_FILE into every tool's env
// (pi-coding-agent docs/environment-variables.md); Claude Code sets CLAUDE_CODE_SESSION_ID in the
// Bash subprocess env and hands its hooks a session_id / transcript_path pair. A harness wf cannot
// see records nothing, and a missing reference is reported as missing, never fabricated (#114).
import { readState, WF_STATE_VERSION, writeState } from './state.ts';
import type { State } from './state.ts';

// A harness session, as a reference: which harness, its id, the transcript it owns (when the harness
// names one), and the round step it was recorded at. No transcript content is copied.
export type SessionRef = { harness: string; id: string; transcript: string | null; step: string | null; at: string };

// Pure: the harness session the current environment names, or null. PI first: a pi session that also
// carries a Claude variable (a nested harness) is a pi session. The transcript is whatever the
// harness names in the env; Claude's transcript_path arrives on a hook, not in the Bash env.
export function harnessSession(env: Record<string, string | undefined> = process.env): { harness: string; id: string; transcript: string | null } | null {
	const pi = env.PI_SESSION_ID?.trim();
	if (pi) return { harness: 'pi', id: pi, transcript: env.PI_SESSION_FILE?.trim() || null };
	const claude = env.CLAUDE_CODE_SESSION_ID?.trim();
	if (claude) return { harness: 'claude', id: claude, transcript: null };
	return null;
}

// Pure: the session a Claude Code hook input carries. `session_id` is what the hook contract hands
// every hook (claude/hooks.json → wf handoff); `transcript_path` is the session's own log. An env id
// is the fallback for a hook fired without the field.
export function hookSession(input: { session_id?: string; transcript_path?: string }, env: Record<string, string | undefined> = process.env): { harness: string; id: string; transcript: string | null } | null {
	const id = input.session_id?.trim() || env.CLAUDE_CODE_SESSION_ID?.trim();
	if (!id) return null;
	return { harness: 'claude', id, transcript: input.transcript_path?.trim() || null };
}

// Pure: whether recording `ref` at `step` would change the round's reference. A brief re-run in the
// same session is not a new fact, so it does not rewrite state.json on every phase read.
export function sessionChanged(state: State, ref: { harness: string; id: string } | null, step: string | null): boolean {
	if (!ref) return false;
	const held = state.session;
	return !held || held.harness !== ref.harness || held.id !== ref.id || held.step !== (step ?? null);
}

// Pure: `state` with the reference recorded at `step`. A nested collection is not involved: one
// session, the latest.
export function withSession(state: State, ref: { harness: string; id: string; transcript: string | null }, step: string | null, now = new Date().toISOString()): State {
	return { ...state, session: { ...ref, step: step ?? null, at: now } };
}

// Record the environment's harness session into the round's state when it is new. Best-effort by
// design: a phase read or a hook must not fail because state could not be written, and a round from
// another runtime is left alone (it may not hold the field). `wf status` reads the reference back.
export function recordSession(toplevel: string, ref: { harness: string; id: string; transcript: string | null } | null, step: string | null): void {
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
