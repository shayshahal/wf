// merged-base.ts — after deliver confirms a merge, the project's full check of the base it landed on.
// 2026-11-02, JewelryX: #662 merged at 10:38 onto a dev that had #657 and dev's svelte-check went red.
// Nobody saw it until the next push: nothing checks the merge result (branch protection is paywalled,
// PR CI on demand). Detection only — the merge has happened and the round stays delivered — so a red
// merged base is printed loudly and recorded for `wf next` to tell the user. A check that could not run
// (fetch, install, timeout) is "not checked", never green.
// This module is the result and its words; merged-base-check.ts runs the check.

/** One command of the project's merged-base check, run in `cwd` under the base's checkout. */
export type MergedBaseCommand = { label: string; cmd: string; args: string[]; cwd: string };
/** `prepare` failing means the base was not checked; a `checks` command failing means it is red. */
export type MergedBaseCheck = { prepare: MergedBaseCommand[]; checks: MergedBaseCommand[]; timeoutMs: number };
/** What `wf next` reports; `delivered` is the merged head the check belongs to, so a retry runs it once. */
export type MergedBaseResult = { base: string; sha: string; delivered: string; at: string } & (
	| { result: 'green' }
	| { result: 'red'; command: string; tail: string }
	| { result: 'not-checked'; why: string }
);

const sha40 = /^[a-f0-9]{40}$/;
/** Why a persisted `merged_base_check` is malformed, or null. */
export function mergedBaseResultGap(v: unknown): string | null {
	if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'invalid merged_base_check';
	if (!('base' in v) || typeof v.base !== 'string' || !('sha' in v) || typeof v.sha !== 'string' || !('delivered' in v) || typeof v.delivered !== 'string' || !sha40.test(v.delivered) || !('at' in v) || typeof v.at !== 'string') return 'invalid merged_base_check';
	if (!('result' in v)) return 'invalid merged_base_check result';
	if (v.result === 'green') return null;
	if (v.result === 'red') return 'command' in v && typeof v.command === 'string' && 'tail' in v && typeof v.tail === 'string' ? null : 'invalid merged_base_check red';
	if (v.result === 'not-checked') return 'why' in v && typeof v.why === 'string' ? null : 'invalid merged_base_check not-checked';
	return 'invalid merged_base_check result';
}

// Pure: the last lines of a command's output that are not blank — what a person needs to start on it.
export const lastLines = (output: string, n = 20): string => output.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).slice(-n).join('\n');

// Pure: what deliver prints. Red is a banner on stderr: the merge happened, and someone must fix the base.
export function mergedBaseLines(r: MergedBaseResult): { out: string[]; err: string[] } {
	const at = `${r.base} ${r.sha.slice(0, 12) || '(unknown)'}`;
	if (r.result === 'green') return { out: [`wf deliver: the merged base ${at} is green`], err: [] };
	if (r.result === 'not-checked') return { out: [], err: [`wf deliver: the merged base ${at} was NOT CHECKED: ${r.why} — it is not known to be green`] };
	const bar = `wf deliver: ${'='.repeat(60)}`;
	return { out: [], err: [bar, `wf deliver: the merged base ${at} is RED: ${r.command} failed`, ...r.tail.split('\n').map((l) => `    ${l}`), `wf deliver: the merge already happened and this round is delivered; tell the user ${r.base} is red now`, bar] };
}

// Pure: what `wf next` says about it beside `done`, or null when it was green or never recorded.
export function mergedBaseNextNote(r: MergedBaseResult | undefined | null): string | null {
	if (!r || r.result === 'green') return null;
	const at = `${r.base} ${r.sha.slice(0, 12) || '(unknown)'}`;
	return r.result === 'red'
		? `tell the user first: the merged base ${at} is RED (${r.command} failed) — the merge already happened; this round does not fix it`
		: `tell the user first: the merged base ${at} was NOT CHECKED (${r.why}) — it is not known to be green`;
}
