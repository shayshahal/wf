#!/usr/bin/env node
// session.ts — optional harness session references, never workflow authority or required resume context.
// The environment must name the actual context; otherwise record nothing rather than guess a parent.
import { readState, WF_STATE_VERSION, writeState } from './state.ts';
import type { State } from './state.ts';

// A harness session, as a reference: which harness, its id, the transcript it owns (when the harness
// names one), and the round step it was recorded at. No transcript content is copied.
export type SessionRef = { harness: string; id: string; transcript: string | null; step: string | null; at: string };
// What a recorder found: a SessionRef before the step and time recordSession stamps on it.
export type SessionRefInput = { harness: string; id: string; transcript: string | null };

// PI's environment identifies its actual context. Claude Code's shared environment id does not
// distinguish a delegated worker, so it is deliberately not recorded as that worker's identity.
export function harnessSession(env: Record<string, string | undefined> = process.env): SessionRefInput | null {
	const pi = env.PI_SESSION_ID?.trim();
	if (pi) return { harness: 'pi', id: pi, transcript: env.PI_SESSION_FILE?.trim() || null };
	return null;
}

// Pure: whether recording `ref` at `step` would change the round's reference. A brief re-run in the
// same session is not a new fact, so it does not rewrite state.json on every phase read.
export function sessionChanged(state: State, ref: SessionRefInput | null, step: string | null): boolean {
	if (!ref) return false;
	const held = state.session;
	if (!held || held.harness !== ref.harness || held.id !== ref.id || held.step !== (step ?? null)) return true;
	// A null transcript is not a new fact: an env or brief re-read that names no transcript must not
	// erase the one already recorded for this session. A richer transcript is a new fact.
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

// Record a known context reference when new. Best-effort: a phase read must not fail because its
// optional session reference could not be written, and a round from another
// runtime is left alone (it may not hold the field). `wf status` reads the reference back.
export function recordSession(toplevel: string, ref: SessionRefInput | null, step: string | null): void {
	if (!ref) return;
	try {
		const state = readState(toplevel);
		if (!state || state.wf_version !== WF_STATE_VERSION || !sessionChanged(state, ref, step)) return;
		writeState(toplevel, (current) => (sessionChanged(current, ref, step) ? withSession(current, ref, step) : current));
	} catch {
		// A session reference is visibility, not the round: a lock held by another writer or a
		// corrupt state must not turn `wf brief` into a failure.
	}
}
