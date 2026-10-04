// projects/jewelryx/index.ts — everything wf knows about JewelryX. The rest of wf imports this file
// only, through ../../src/project.ts; the other files in this folder are its implementation.
// A second project gets a folder like this one. What the two then share is the interface; until
// then this file's exports are simply what JewelryX needed (Shay, 2026-09-24).
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { checkTasks, realPkgFor } from './checks.ts';
import type { CheckTask } from '../../src/gates/check.ts';
import { dropDatabase, worktreeDatabase } from './db.ts';
import { seams } from '../../src/seams.ts';
import type { Command, RemovalStep } from '../../src/seams.ts';
import { listWorktrees, mainCheckout } from '../../src/worktrees/worktree.ts';
import { linkVerifySkill, unlinkCompetingSkills, verifyStackEnv, writeReproConfig } from './round.ts';

// This folder's name: skills, agents and prompts reach its notes as {{project}} (ROUND.md, prompts/<phase>.md).
export const name: string = 'jewelryx';
export const repo: string = 'github.com/Raynw-MediaTech/jeweleryx';
// Rounds branch off origin/dev, and their PRs target dev.
export const baseBranch: string = 'dev';
// Round work besides dev: a ticket id in these branches' subjects is earlier work on it (wf new --id).
export const roundBranches: string[] = ['fix/*', 'feat/*'];
// Each round's folder is <roundsDir>/<slug> (the project's bug-reports/README.md).
export const roundsDir: string = 'bug-reports';
// The project's contract paths (wf classify: a change under one is class B), in the round's worktree.
export const contractPaths: string = 'docs/agents/contract-paths.txt';
// The project's notes for agents, in the round's worktree: one with `globs:` reaches the brief of a
// commit whose files it matches (guidance.ts).
export const guidance: string = 'docs/agents';
// Who a round waits on or asks, besides Shay: product (Einat) and QA (Saar).
export const people: string[] = ['einat', 'saar'];
// The seeded users (`wf seed` restores them); docs/agents/seed.md in the project is the source.
export type SeedRole = 'buyer' | 'seller' | 'admin';
export const logins: Record<SeedRole, [user: string, password: string]> = {
	buyer: ['buyer@seed.jewelryx', 'seed1234'],
	seller: ['seller@seed.jewelryx', 'seed1234'],
	admin: ['admin@jewelryx.com', 'admin123'],
};
// Printed by `wf new`: the logins, and the fixtures a round needs on line one.
export const seedLines: string[] = [
	`Seed logins: ${Object.values(logins).map(([u, p]) => `${u} / ${p}`).join(' · ')}`,
	'Fixtures:    SG-0001..SG-0005 · ORD-0001..ORD-0009 · MKT-0001 · AUC-0001 · SEED-RNG-001 … (docs/agents/seed.md)',
];

// ── ports and names ──────────────────────────────────────────────────────────
// P = wt's hash_port(branch), 10000-19999 (ports.ts): B2B on P, API P+10000, admin P+20000.
// A number from the branch, or the string a hook's argv carries.
export type Port = number | string;
export type Stack = { slug: string; port: Port };
export type Origins = { b2b: string; admin: string; api: string };
// How the machine serves one dev server (dev.ts): its command and the env it adds.
export type Wrap = (o: { role: keyof Origins; port: number; command: string }) => { command: string; env: Record<string, string> };

// A stack's direct addresses, for Node: Node on Windows cannot resolve *.localhost, and the API is
// 127.0.0.1 because Node tries ::1 first for localhost (docs/agents/testing.md). They are also the
// {{b2b}} {{admin}} {{api}} of every prompt.
export function directUrls(port: Port): Origins {
	const p = Number(port);
	return { b2b: `http://localhost:${p}`, admin: `http://localhost:${p + 20_000}`, api: `http://127.0.0.1:${p + 10_000}/api/v1` };
}

// A stack's addresses for a person: the machine's names for it when it has them (portless on
// Shay's), else the direct ones. B2B first: wf status probes the first app, which answers on P.
export function stackUrls({ slug, port }: Stack): Origins {
	return machine().names?.(slug) ?? directUrls(port);
}

// What JewelryX needs from the machine it runs on (seams.project). Shay's: env/projects/jewelryx.
//   secretsFrom(worktree)         the folder holding the files .worktreeinclude names
//   database.url({ slug, port })  the MongoDB URL the worktree's backend uses
//   database.up({ slug, port })   start it (awaited before the seed)
//   database.seedUrl({ slug, port }) where the seeder writes, when not database.url
//   database.teardown({ slug, worktree }) the steps that remove it, run while the worktree exists
//   names(slug)                   the browser origins { b2b, admin, api }, when the machine names them
//   servers(slug)                 { origins, wrap } for the dev servers (dev.ts), when not direct
//   teardown({ slug, worktree })  steps after the database's
export type Machine = {
	secretsFrom: (worktree: string) => string;
	database: {
		url: (o: { slug: string; port?: Port }) => string;
		up: (o: Stack) => Promise<void>;
		seedUrl?: (o: Stack) => string;
		teardown: (o: { slug: string; worktree: string }) => RemovalStep[];
	};
	names?: (slug: string) => Origins;
	servers?: (slug: string) => { origins: Origins; wrap: Wrap } | null;
	teardown: (o: { slug: string; worktree: string }) => RemovalStep[];
};
// The kit's own (KIT): a person's machine with one MongoDB and their clone of JewelryX (kit and env
// plan, step 3).
const KIT: Machine = {
	// The files .worktreeinclude names, from the person's clone, where they keep them to run the app.
	secretsFrom(worktree) {
		const main = mainCheckout(listWorktrees(worktree));
		if (!main) throw new Error('the secrets: this repository has no main checkout to copy the .env files from (it is bare)');
		return main;
	},
	// Every worktree's database, jewelryx_<slug>, in the one MongoDB at MONGO_URL.
	database: {
		url: () => process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017',
		up: ({ slug, port }) => mongoAnswers(KIT.database.url({ slug, port })),
		teardown: ({ slug, worktree }) => [{ label: 'drop database', run: () => dropDatabase({ worktree, database: worktreeDatabase(slug), mongoUrl: KIT.database.url({ slug }) }) }],
	},
	teardown: () => [],
};

// Resolves when the MongoDB at `url` takes a connection; else throws saying what to do, before the
// seeder's own 30 s server-selection timeout.
function mongoAnswers(url: string) {
	const { hostname, port } = new URL(url);
	return new Promise<void>((resolve, reject) => {
		const sock = createConnection({ host: hostname, port: Number(port) || 27017, timeout: 3000 });
		const fail = () => { sock.destroy(); reject(new Error(`no MongoDB answers at ${url}: start one, or set MONGO_URL to yours`)); };
		sock.once('connect', () => { sock.end(); resolve(); }).once('error', fail).once('timeout', fail);
	});
}
function machine(): Machine {
	return { ...KIT, ...(seams.project as Partial<Machine>) };
}

// Where the seeder writes for this worktree (`wf seed`, and setup's db step).
export function seedUrl({ slug, port }: Stack): string {
	const { database } = machine();
	return (database.seedUrl ?? database.url)({ slug, port });
}

// A changed file → the page a reviewer should open, { app, path } (the route with groups like
// `(store)` dropped, params left as `[id]`), or null. The URL is <stackUrls[app]>/<app>/<path>.
export function pageOf(file: string): { app: 'b2b' | 'admin'; path: string } | null {
	const m = /^packages\/frontend\/(b2b|admin)\/src\/routes\/(.*?)\/?\+(?:page|layout)(?:\.server)?\.(?:svelte|ts)$/.exec(file);
	return m ? { app: m[1] as 'b2b' | 'admin', path: [m[1], ...m[2].split('/').filter((seg) => seg && !/^\(.*\)$/.test(seg))].join('/') } : null;
}

// ── a worktree's stack ───────────────────────────────────────────────────────

function sh(command: string, cwd: string) {
	const r = spawnSync(command, { stdio: 'inherit', shell: true, cwd });
	if (r.status !== 0) throw new Error(`${command} failed (exit ${r.status})`);
}

// The pre-start steps, run by wt in parallel: a command, or a function of { worktree, slug, port }.
// `node` stays one chain: as a sibling step `pnpm build:types` started a second `pnpm install` over
// the same node_modules/.pnpm and killed the first with EPERM (measured 2026-09-20, three runs).
// `tools` is the project's own linker. The python environment is synced inside `db`, because the
// seeder runs in it.
export type SetupStep = string | ((o: { worktree: string } & Stack) => Promise<void>);
export const setup: Record<string, SetupStep> = {
	async env({ worktree, slug, port }: { worktree: string } & Stack) {
		const { copySecrets, sanitizeWorktreeEnv } = await import('./env.ts');
		const m = machine();
		copySecrets(worktree, m.secretsFrom(worktree));
		sanitizeWorktreeEnv(worktree, { url: m.database.url({ slug, port }), name: worktreeDatabase(slug) });
		// The verification skill's CLI finds this checkout's stack here (round.ts VERIFY_SKILL).
		writeFileSync(join(worktree, '.verify-stack.env'), verifyStackEnv(directUrls(port), join(worktree, '.wf', 'logs', 'dev.log') /* dev.ts writes it */.replace(/\\/g, '/')));
	},
	node: 'pnpm install --frozen-lockfile && pnpm build:types && pnpm build:data && pnpm build:filters',
	verify: 'pnpm --dir verification install --ignore-workspace',
	tools: 'node scripts/link-tools.mjs',
	async db({ worktree, slug, port }: { worktree: string } & Stack) {
		const { seedDatabase } = await import('./db.ts');
		const { database } = machine();
		// cwd: the kit runs this step from `wf new`, not from inside the worktree as wt does. --quiet:
		// there the output is the agent's, and a fresh sync listed ~60 packages into it (2026-09-27).
		sh('uv sync --quiet --dev --directory packages/backend', worktree);
		await database.up({ slug, port });
		seedDatabase({ worktree, database: worktreeDatabase(slug), mongoUrl: seedUrl({ slug, port }) });
	},
};

// The post-start step: the three dev servers, until they die (wt tethers it on Shay's).
export async function serve({ worktree, slug, port }: { worktree: string } & Stack): Promise<void> {
	const { runDev } = await import('./dev.ts');
	const servers = machine().servers?.(slug);
	return runDev({ worktree, basePort: port, origins: servers?.origins, wrap: servers?.wrap });
}

// What removing a worktree leaves behind, in order: the database's steps, then the machine's own.
// Each step tolerates "already gone". `worktree` is there only when the steps run before the folder
// goes (the kit's removal plan); Shay's run after it (wt's post-remove hook).
export function teardown({ slug, worktree }: { slug: string; worktree: string }): RemovalStep[] {
	const m = machine();
	return [...m.database.teardown({ slug, worktree }), ...m.teardown({ slug, worktree })];
}

// After `wf new` made the worktree and its round folder: the repro scaffold, and the lines to print.
export function newRound({ worktree, folder, port }: { worktree: string; folder: string; port: Port }): string[] {
	writeReproConfig({ worktree, folder, direct: directUrls(port) });
	const unlinked = unlinkCompetingSkills(worktree);
	const linked = linkVerifySkill(worktree);
	return [
		...(unlinked.length ? [`unlinked ${unlinked.join(', ')}: the round skill is this worktree's one flow`] : []),
		...(linked.length ? [`linked ${linked.join(', ')}: the app is driven through it`] : []),
		...seedLines,
	];
}

// ── checks ───────────────────────────────────────────────────────────────────

// wf check's commands for the changed files, plus `test` (the plan row's test path, or null). Each is
// { label, cmd, args, cwd } (cwd repo-relative), or { label, missing } when `test` is not runnable.
export function checks({ toplevel, changed, test }: { toplevel: string; changed: string[]; test: string | null }): CheckTask[] {
	return checkTasks({ changed, test, pkgFor: realPkgFor(toplevel), pushHook: existsSync(join(toplevel, 'lefthook.yml')) });
}

// ── delivery ─────────────────────────────────────────────────────────────────

// The note wf deliver leaves in the round folder, one section per ticket id (a round on subitems has
// one per subitem); the round skill fills and posts each (wf never calls Monday). Only the scaffold:
// the words are for Einat, in plain Hebrew with no file, code name or line number
// (docs/agents/monday.md), and PLAN.md's Cause and Approach are written for the code. TJEW-670
// (2026-09-28): the note carried PLAN.md's Cause, file:line and all, as one note for four subitems.
export function trackerNote({ ids, url }: { ids: string[]; url: string }): { file: string; text: string } {
	const section = (id: string) => [`## ${id}`, 'תוקן ✅', 'מה היה: <what the reporter saw, from TICKET.md ## Intent>', 'מה שונה: <what she sees now>', 'לבדיקה: <where to look, step by step>', `PR: ${url}`].join('\n');
	const head = '<!-- One comment per ## section, posted on that item. Fill the <...> lines in plain Hebrew for the reporter: no file path, code name or line number (docs/agents/monday.md, Comments on an item). The ## line is not posted. -->';
	return { file: 'MONDAY.md', text: `${[head, ...ids.map(section)].join('\n\n')}\n` };
}

// ── JewelryX's own wf commands ───────────────────────────────────────────────

export const commands: Record<string, Command> = {
	seed: async (argv) => (await import('./seed.ts')).runSeed(argv),
	show: async (argv) => (await import('./show.ts')).runShow(argv),
};
