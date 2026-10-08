#!/usr/bin/env node
// state.ts — <git-toplevel>/.wf/state.json, the one file a round's commands share.
// step.ts owns round/class/base/step/waiting_on/since; `wf new --id` adds id + folder;
// `wf prompt implement N` adds commit (the row `wf check` fences against).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { roundsDir } from '../project.ts';
import { traceStateWrite } from './state-trace.ts';

export type RoundClass = 'A' | 'B' | 'C';
// A question `wf ask` opened; `wf decide` moves it to `answered` with its answer (ask.ts).
export type Question = { n: number; to: string; text: string; default?: string; source?: string; asked: string; answer?: string | null; answered?: string };
// What `wf brief` recorded for a phase (handoff.ts): the token its handoff file must end with.
// of: the validation token a critique judged; exchange: which critique of that validation's chain it is;
// answers: the exchange a `validate --answer` answered (gates/critique.ts).
export type Brief = { token: string; at: string; count: number; head?: string; sent_back?: boolean; of?: string | null; exchange?: number; answers?: number;
// plan only: SPEC.md's sha when the brief went out, null when there was none yet (a plan written before the design session).
spec?: string | null };
// .wf/state.json. Every field is optional: each command writes only its own (writeState merges),
// and a hand-cut worktree has only what `wf step` wrote.
export type State = {
	round?: string;
	class?: RoundClass | null;
	base?: string | null;
	step?: string;
	waiting_on?: string | null;
	since?: string;
	history?: { step: string; at: string }[];
	id?: string;
	ids?: string[];
	folder?: string;
	made_by?: string;
	// Who opened the worktree (seams.opener, at `wf new`), so a tool beside wf can show which agent it belongs to.
	opened_by?: Record<string, string>;
	entry?: string;
	check?: boolean;
	commit?: number;
	questions?: Question[];
	answered?: Question[];
	// Answers that say the plan must change (`wf decide --revise`, ask.ts): `wf next` sends the round
	// to `plan --revise` until a plan brief is newer than the answer.
	revisions?: { text: string; at: string }[];
	// What research must now measure (`wf decide --research`, ask.ts): `wf next` dispatches a fresh
	// research until a research brief is newer than the request, and its prompt carries them all.
	researchRequests?: { text: string; at: string }[];
	last_question?: number;
	briefs?: Record<string, Brief>;
	// How many agents each phase has had, over the whole round: every brief it sent, in a field nothing
	// voids (`briefs` loses every `implement *` key on a plan --revise, on purpose). This is what `wf
	// reap`'s line reports as `agents:`; a round from before the field falls back to the surviving briefs.
	briefCounts?: Record<string, number>;
	// The validation token whose T2 setup `wf show` already ran (projects/jewelryx/show.ts).
	t2_setup?: string;
	// The tracker note `wf deliver` wrote, from the worktree's top: `wf next` reads which of its
	// sections are posted (src/round/next.ts, unpostedSections).
	note?: string;
};

export function toplevelOf(cwd = process.cwd()): string {
	return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd }).trim();
}

export function stateFile(toplevel: string) {
	return join(toplevel, '.wf', 'state.json');
}

export function readState(toplevel: string): State | null {
	try {
		return JSON.parse(readFileSync(stateFile(toplevel), 'utf8'));
	} catch {
		return null; // no round here yet, or a half-written file
	}
}

// Every file a person reads (SPEC, SPEC-REVIEW, REVIEW, BLOCKED…) lives in the round folder and is
// committed with the fix. Until 2026-09-23 SPEC, SPEC-REVIEW and REVIEW sat at the worktree root,
// where they were rarely committed and reap lost them.
export function roundFile(toplevel: string, name: string) {
	return join(toplevel, readState(toplevel)?.folder ?? '', name);
}

// Merge: every writer keeps the fields it does not own.
export function writeState(toplevel: string, patch: State): State {
	// What is on disk now, kept: state-trace.ts compares it against what this write leaves behind,
	// since `briefs` is the one field a patch replaces whole.
	const before = readState(toplevel);
	const state: State = { ...(before ?? {}), ...patch };
	mkdirSync(join(toplevel, '.wf'), { recursive: true });
	writeFileSync(stateFile(toplevel), JSON.stringify(state, null, 2) + '\n');
	traceStateWrite(toplevel, { before, after: state, patch: Object.keys(patch) });
	return state;
}

// The round id and folder a prompt substitutes. Falls back to the branch when
// `wf new --id` did not run (a hand-cut worktree).
export function roundOf(state: State | null, toplevel: string) {
	const id = state?.id ?? state?.round ?? null;
	return { id, folder: state?.folder ?? (id ? `${roundsDir}/${id}` : null), toplevel };
}

// Pure: why `entry` may not run in this round, or null. A round records which wf made it (`wf new`:
// made_by, entry), and the other refuses: on Shay's machine ~/bin/wf (his env) is on the PATH of a
// Desktop session too, and a bare `wf` there would carry a team round into his env's URLs and
// review UI (kit and env plan, step 6). Rounds from before the field run anywhere.
export function entryGap(state: State | null, madeBy: string) {
	if (!state?.made_by || state.made_by === madeBy) return null;
	return `this round was made by the ${state.made_by}'s wf, and this is the ${madeBy}'s: run it as node "${state.entry}"${state.made_by === 'kit' ? ' (in the Claude Code plugin: node "${CLAUDE_PLUGIN_ROOT}/wf.mjs")' : ''}`;
}
