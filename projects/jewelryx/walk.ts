// walk.ts — the grammar of a T2 walk recipe: the two forms `wf show` runs, and the one place that
// says whether a `ready:`/`reset:`/`setup:` line is one of them. `walkRecipeGap` is used by `wf show`
// itself and, through project.ts, by the build/assess handoff (`wf step assess`, `wf next`): JX-436
// (2026-10-25) reached T2 with `setup: cd packages/backend && uv run python …`, which build and
// assessment accepted because nothing before T2 read the line, and only `wf show` refused it.
// The project owns the command syntax; the agreement owns where the lines are written.
import { VERIFY_SKILL } from './round.ts';
import type { SeedRole } from './index.ts';

// Pure: `b2b /catalog as buyer mobile` → { app, path, as, mobile }, or null. The path may drop its
// slash (`wf show admin products`); a Windows path is refused rather than opened.
/** The project's screenshot target, with a default seed role already resolved. */
export type Open = { app: 'b2b' | 'admin'; path: string; as: SeedRole; mobile: boolean };
/** Parse the open target shared by wf show and pre-approval walk validation. */
export function parseOpen(line: string | null | undefined): Open | null {
	const m = /^(b2b|admin)\s+(\S+)(?:\s+as\s+(buyer|seller|admin))?(\s+mobile)?\s*$/.exec((line ?? '').trim());
	if (!m || /^[A-Za-z]:[\\/]/.test(m[2])) return null;
	// SAFETY: the regex admits only the app and seed-role literals; RegExp captures remain strings in TypeScript.
	return { app: m[1] as Open['app'], path: m[2].startsWith('/') ? m[2] : `/${m[2]}`, as: (m[3] as SeedRole | undefined) ?? (m[1] === 'admin' ? 'admin' : 'buyer'), mobile: Boolean(m[4]) };
}

// The forms an agent is told to write, with their accepted placeholder shapes.
const FORMS = '`api <fn> <json> as <buyer|seller|admin>` or `script ["executable","arg",...]`';

// Pure: `api createVariant {"path":…} as seller` → the CLI's arguments, or null. One call of the
// verification CLI's `api`, its JSON passed as one argument: no shell, whose quoting differs by OS.
export function setupArgs(line: string): string[] | null {
	const m = /^api\s+(\w+)\s+(\{.*\})\s+as\s+(buyer|seller|admin)$/.exec(line.trim());
	return m ? [`${VERIFY_SKILL}/control-jewelryx.mjs`, 'api', m[1], m[2], '--as', m[3]] : null;
}

// Script recipes carry argv, never shell text; admission belongs to the round's walk.
export function walkCommand(line: string): { executable: string; args: string[] } | null {
	if (line.startsWith('script ')) {
		let value: unknown;
		try { value = JSON.parse(line.slice(7)); } catch { return null; /* Report malformed recipes before execution. */ }
		if (!Array.isArray(value) || !value.length || !value.every((arg): arg is string => typeof arg === 'string' && arg.length > 0)) return null;
		return { executable: value[0] === 'node' ? process.execPath : value[0], args: value.slice(1) };
	}
	const args = setupArgs(line);
	return args ? { executable: process.execPath, args } : null;
}

export type WalkRecipes = { ready: string[]; reset: string[]; setup: string[] };

/** Pure: why `wf show` cannot run this walk's recipes, or null. A `setup:` or `reset:` cannot prove
 * that live data survived reset, so it needs a `ready:` readback (#139). */
export function walkRecipeGap({ ready, reset, setup }: WalkRecipes): string | null {
	const recipes: [string, string][] = [...ready.map((line): [string, string] => ['ready', line]), ...reset.map((line): [string, string] => ['reset', line]), ...setup.map((line): [string, string] => ['setup', line])];
	const bad = recipes.find(([, line]) => !walkCommand(line));
	if (bad) return `the T2 walk \`${bad[0]}:\` line "${bad[1]}" must be ${FORMS}`;
	if ((reset.length || setup.length) && !ready.length) return 'the T2 walk has a `setup:` or `reset:` line but no `ready:` readback of the scenario — setup/reset requires ready readback';
	return null;
}

/** Pure: validate the whole T2 walk before approval or handoff; never execute its commands. */
export function walkGap(walk: WalkRecipes & { open: string[]; none: boolean }): string | null {
	const recipes = walkRecipeGap(walk);
	if (recipes) return recipes;
	if (!walk.open.length && !walk.none) return 'the T2 walk needs open: <the review target>, or none - <why no walk is needed>';
	if (walk.open.some((line) => !parseOpen(line))) return 'the T2 walk `open:` target must be <b2b|admin> <path> [as buyer|seller|admin] [mobile]';
	return null;
}
