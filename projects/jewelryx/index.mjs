// projects/jewelryx/index.mjs — everything wf knows about JewelryX. The rest of wf imports this file
// only, through ../../project.mjs; the other files in this folder are its implementation.
// A second project gets a folder like this one. What the two then share is the interface; until
// then this file's exports are simply what JewelryX needed (Shay, 2026-09-24).
import { spawnSync } from 'node:child_process';
import { checkTasks, realPkgFor } from './checks.mjs';
import { composeProjectOf, containerOf, volumeOf } from './db.mjs';
import { unlinkCompetingSkills, writeReproConfig } from './round.mjs';

// This folder's name: skills, agents and prompts reach its notes as {{project}} (ROUND.md, prompts/<phase>.md).
export const name = 'jewelryx';
export const repo = 'github.com/Raynw-MediaTech/jeweleryx';
// Rounds branch off origin/dev, and their PRs target dev.
export const baseBranch = 'dev';
// Round work besides dev: a ticket id in these branches' subjects is earlier work on it (wf new --id).
export const roundBranches = ['fix/*', 'feat/*'];
// Each round's folder is <roundsDir>/<slug> (the project's bug-reports/README.md).
export const roundsDir = 'bug-reports';
// The project's contract paths (wf classify: a change under one is class B), in the round's worktree.
export const contractPaths = 'docs/agents/contract-paths.txt';
// Who a round waits on or asks, besides Shay: product (Einat) and QA (Saar).
export const people = ['einat', 'saar'];
// The seeded users (`wf seed` restores them); docs/agents/seed.md in the project is the source.
export const logins = {
	buyer: ['buyer@seed.jewelryx', 'seed1234'],
	seller: ['seller@seed.jewelryx', 'seed1234'],
	admin: ['admin@jewelryx.com', 'admin123'],
};
// Printed by `wf new`: the logins, and the fixtures a round needs on line one.
export const seedLines = [
	`Seed logins: ${Object.values(logins).map(([u, p]) => `${u} / ${p}`).join(' · ')}`,
	'Fixtures:    SG-0001..SG-0005 · ORD-0001..ORD-0009 · MKT-0001 · AUC-0001 · SEED-RNG-001 … (docs/agents/seed.md)',
];

// ── ports and names ──────────────────────────────────────────────────────────
// P = wt's hash_port(branch), 10000-19999: B2B on P, API P+10000, admin P+20000, mongo 40000+(P-10000) (db.mjs).

// A stack's names behind portless, http://<slug>.<app>.jewelryx.localhost, for a browser. <slug> is
// passed in full: portless's own worktree prefix is the branch's last segment only (measured
// 2026-09-22: branch tools/workflow-v2 gave workflow-v2, not tools-workflow-v2). B2B first: wf status
// probes the first app, which answers on P.
export function stackNames(slug) {
	const name = (app) => `http://${slug}.${app}.jewelryx.localhost`;
	return { b2b: name('b2b'), admin: name('admin'), api: name('api') };
}

// A stack's direct addresses, for Node: Node on Windows cannot resolve *.localhost, and the API is
// 127.0.0.1 because Node tries ::1 first for localhost (docs/agents/testing.md). They are also the
// {{b2b}} {{admin}} {{api}} of every prompt.
export function directUrls(port) {
	const p = Number(port);
	return { b2b: `http://localhost:${p}`, admin: `http://localhost:${p + 20_000}`, api: `http://127.0.0.1:${p + 10_000}/api/v1` };
}

// A changed file → the page a reviewer should open, { app, path } (the route with groups like
// `(store)` dropped, params left as `[id]`), or null. The URL is <stackNames[app]>/<app>/<path>.
export function pageOf(file) {
	const m = /^packages\/frontend\/(b2b|admin)\/src\/routes\/(.*?)\/?\+(?:page|layout)(?:\.server)?\.(?:svelte|ts)$/.exec(file);
	return m ? { app: m[1], path: [m[1], ...m[2].split('/').filter((seg) => seg && !/^\(.*\)$/.test(seg))].join('/') } : null;
}

// ── a worktree's stack ───────────────────────────────────────────────────────

function sh(command) {
	const r = spawnSync(command, { stdio: 'inherit', shell: true });
	if (r.status !== 0) throw new Error(`${command} failed (exit ${r.status})`);
}

// The pre-start steps, run by wt in parallel: a command, or a function of { worktree, slug, port }.
// `node` stays one chain: as a sibling step `pnpm build:types` started a second `pnpm install` over
// the same node_modules/.pnpm and killed the first with EPERM (measured 2026-09-20, three runs).
// `tools` is the project's own linker. The python environment is synced inside `db`, because the
// seeder runs in it.
export const setup = {
	async env({ worktree, slug, port }) {
		sh('wt step copy-ignored --from dev --require-include');
		const { sanitizeWorktreeEnv } = await import('./env.mjs');
		const { worktreeDatabase, worktreeMongoUrl } = await import('./db.mjs');
		sanitizeWorktreeEnv(worktree, { url: worktreeMongoUrl(port), name: worktreeDatabase(slug) });
	},
	node: 'pnpm install --frozen-lockfile && pnpm build:types && pnpm build:data && pnpm build:filters',
	verify: 'pnpm --dir verification install --ignore-workspace',
	tools: 'node scripts/link-tools.mjs',
	async db({ worktree, slug, port }) {
		const { mongoUp, seedDatabase, worktreeDatabase } = await import('./db.mjs');
		sh('uv sync --dev --directory packages/backend');
		await mongoUp({ slug, base: port });
		seedDatabase({ worktree, slug, database: worktreeDatabase(slug) });
	},
};

// The post-start step: the three dev servers, until they die (wt tethers it).
export async function serve({ worktree, slug, port }) {
	const { runDev } = await import('./dev.mjs');
	return runDev({ worktree, basePort: port, slug });
}

// What removing a worktree leaves behind, in order. Each step tolerates "already gone". The compose
// network outlives its container; 23 of them exhausted docker's address pools and the next `wf new`
// failed: "all predefined address pools have been fully subnetted" (3187601171). portless prune drops
// the routes whose server died with the worktree; CI=1 keeps it from prompting.
export function teardown(slug) {
	return [
		{ label: 'docker rm mongo', cmd: 'docker', args: ['rm', '-f', containerOf(slug)] },
		{ label: 'docker volume rm', cmd: 'docker', args: ['volume', 'rm', volumeOf(slug)] },
		{ label: 'docker network rm', cmd: 'docker', args: ['network', 'rm', `${composeProjectOf(slug)}_default`] },
		{ label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } },
	];
}

// After `wf new` made the worktree and its round folder: the repro scaffold, and the lines to print.
export function newRound({ worktree, folder, port }) {
	writeReproConfig({ worktree, folder, direct: directUrls(port) });
	const unlinked = unlinkCompetingSkills(worktree);
	return [
		...(unlinked.length ? [`unlinked ${unlinked.join(', ')}: the round skill is this worktree's one flow`] : []),
		...seedLines,
	];
}

// ── checks ───────────────────────────────────────────────────────────────────

// wf check's commands for the changed files, plus `test` (the plan row's test path, or null). Each is
// { label, cmd, args, cwd } (cwd repo-relative), or { label, missing } when `test` is not runnable.
export function checks({ toplevel, changed, test }) {
	return checkTasks({ changed, test, pkgFor: realPkgFor(toplevel) });
}

// ── delivery ─────────────────────────────────────────────────────────────────

// The note wf deliver leaves in the round folder for the ticket; the round skill posts it (wf never
// calls Monday). Hebrew scaffolding; Cause/Approach come across verbatim from PLAN.md (wf has no
// translator: a plan written in English arrives in English, marked for the poster).
export function trackerNote({ planText, url }) {
	const body = planText.replace(/\r\n/g, '\n');
	const field = (name) => new RegExp(`^${name}:[ \\t]*(.+)$`, 'm').exec(body)?.[1]?.trim() ?? '';
	const text = ['<!-- translate: the two quoted lines are PLAN.md verbatim -->', 'תוקן ✅', `סיבה: ${field('Cause')}`, `מה שונה: ${field('Approach')}`, `PR: ${url}`].join('\n') + '\n';
	return { file: 'MONDAY.md', text };
}

// ── JewelryX's own wf commands ───────────────────────────────────────────────

export const commands = {
	seed: async (argv) => (await import('./seed.mjs')).runSeed(argv),
	show: async (argv) => (await import('./show.mjs')).runShow(argv),
	stacks: async (argv) => (await import('./stacks.mjs')).runStacks(argv),
};
