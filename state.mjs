#!/usr/bin/env node
// state.mjs — <git-toplevel>/.wf/state.json, the one file a round's commands share.
// step.mjs owns round/class/base/step/waiting_on/since; `wf new --id` adds id + folder;
// `wf prompt implement N` adds commit (the row `wf check` fences against).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function toplevelOf(cwd = process.cwd()) {
	return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd }).trim();
}

export function stateFile(toplevel) {
	return join(toplevel, '.wf', 'state.json');
}

export function readState(toplevel) {
	try {
		return JSON.parse(readFileSync(stateFile(toplevel), 'utf8'));
	} catch {
		return null; // no round here yet, or a half-written file
	}
}

// Every file a person reads (SPEC, SPEC-REVIEW, REVIEW, BLOCKED…) lives in the round folder and is
// committed with the fix. Until 2026-09-23 SPEC, SPEC-REVIEW and REVIEW sat at the worktree root,
// where they were rarely committed and reap lost them.
export function roundFile(toplevel, name) {
	return join(toplevel, readState(toplevel)?.folder ?? '', name);
}

// Merge: every writer keeps the fields it does not own.
export function writeState(toplevel, patch) {
	const state = { ...(readState(toplevel) ?? {}), ...patch };
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	writeFileSync(stateFile(toplevel), JSON.stringify(state, null, 2) + '\n');
	return state;
}

// The round id and folder a prompt substitutes. Falls back to the branch when
// `wf new --id` did not run (a hand-cut worktree).
export function roundOf(state, toplevel) {
	const id = state?.id ?? state?.round ?? null;
	return { id, folder: state?.folder ?? (id ? `bug-reports/${id}` : null), toplevel };
}
