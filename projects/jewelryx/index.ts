// projects/jewelryx/index.ts — everything wf knows about JewelryX. The rest of wf imports this file
// only, through ../../src/project.ts; the other files in this folder are its implementation.
// A second project gets a folder like this one. What the two then share is the interface; until
// then this file's exports are simply what JewelryX needed (Shay, 2026-09-24).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { checkTasks, oracleEdits, parseStackEnv, oracleCaseGap, PRODUCT_BRANCH, seedActorsEnv, realPkgFor } from './checks.ts';
import type { CheckTask } from '../../src/gates/check.ts';
import { unpairedProofImages } from '../../src/gates/review-format.ts';
import { dropDatabase, dropStrandedTestDatabases, worktreeDatabase } from './db.ts';
import { seams } from '../../src/seams.ts';
import type { Command, RemovalStep } from '../../src/seams.ts';
import type { State } from '../../src/round/state.ts';
import { listWorktrees, mainCheckout, basePortForBranch } from '../../src/worktrees/worktree.ts';
import { homedir } from 'node:os';
import { delimiter } from 'node:path';
import { closeBrowsers, installShim, linkVerifySkill, unlinkCompetingSkills, verifyStackEnv, writeReproConfig } from './round.ts';
import type { VerificationProfile, VerificationRequirements } from './readiness.ts';
export { parseVerificationProfile, probeVerificationEndpoint, verificationEndpoints, waitForVerificationReady } from './readiness.ts';
export { trackerCompletionGap } from './post-completion.ts';
export { isTicketless, trackerIdsGap } from './tracker-id.ts';
export { releaseBaseCheck } from './release-base.ts';
// The T2 walk's recipe grammar: `wf show` runs it, and the build/assess handoff refuses a line early (JX-436).
export { walkRecipeGap, walkGap } from './walk.ts';
export type { VerificationProfile, VerificationRequirements } from './readiness.ts';

/** Existing app checks retain shared authentication admission unless the project declares narrower needs. */
export const defaultVerificationRequirements: VerificationRequirements = { kind: 'stack', profile: 'shared-auth', temporary: false };

// This folder's name: skills, agents and prompts reach its notes as {{project}} (ROUND.md, prompts/<phase>.md).
export const name: string = 'jewelryx';
export const repo: string = 'github.com/Raynw-MediaTech/jeweleryx';
// Rounds branch off origin/dev, and their PRs target dev.
export const baseBranch: string = 'dev';
// Round work besides dev: a ticket id in these branches' subjects is earlier work on it (wf new --id).
export const roundBranches: string[] = ['fix/*', 'feat/*'];
// Release branches rounds are also built on (a ticket labelled v1.1); wf new looks for earlier work on them too.
export const releaseBranches: string[] = ['v[0-9]*'];
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
// Printed by `wf new`: the logins, and where the fixture ids are. The ids themselves stay in the
// project's docs/agents/seed.md (AGENTS.md: wf keeps no copy of a project's facts): the copy printed
// here said SG-0001..0005 · ORD-0001..0009 while the seed held SG-0006 · ORD-0006 (2026-10-26 audit).
export const seedLines: string[] = [
	`Seed logins: ${Object.values(logins).map(([u, p]) => `${u} / ${p}`).join(' · ')}`,
	'Fixtures:    fixed ids (orders, scrap gold, listings, auction, products): docs/agents/seed.md',
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

/** The direct endpoints owned by a server profile; a narrow release must not require unrelated apps to stop. */
export function serverDirectUrls(port: Port, profile?: VerificationProfile): string[] {
	const urls = directUrls(port);
	return profile === 'api' ? [urls.api] : Object.values(urls);
}

// A stack's addresses for a person: the machine's names for it when it has them (portless on
// Shay's), else the direct ones. B2B first: wf status probes the first app, which answers on P.
export function stackUrls({ slug, port }: Stack): Origins {
	return machine().names?.(slug) ?? directUrls(port);
}

// What JewelryX needs from the machine it runs on (seams.project). Shay's: env/projects/jewelryx.
//   secretsFrom(worktree)         the folder holding the files .worktreeinclude names
//   database.url({ slug, port })  the MongoDB URL the worktree's backend uses
//   database.up({ worktree, slug, port }) start it (awaited before the seed)
//   database.seedUrl({ slug, port }) where the seeder writes, when not database.url
//   database.teardown({ slug, worktree }) the steps that remove it, run while the worktree exists
//   names(slug)                   the browser origins { b2b, admin, api }, when the machine names them
//   servers(slug)                 { origins, wrap } for the dev servers (dev.ts), when not direct
//   teardown({ slug, worktree })  steps after the database's
export type Machine = {
	secretsFrom: (worktree: string) => string;
	database: {
		url: (o: { slug: string; port?: Port }) => string;
		up: (o: { worktree: string } & Stack) => Promise<void>;
		seedUrl?: (o: Stack) => string;
		teardown: (o: { slug: string; worktree: string }) => RemovalStep[];
	};
	/** Prepare shared infrastructure outside the owned server tree. */
	prepareServe?: () => void;
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
		// MONGO_URL set, or unset with something answering on 27017: that MongoDB is the person's, only
		// checked (a natively installed MongoDB answers here the same as the repo's container: native on
		// Shay's PC since 2026-10-08). Unset and nothing answers: the repo's own is brought up
		// (docker-compose.yml's `mongodb`, profile local-db, container jewelryx-mongodb), under the
		// project name a clone folder named jeweleryx gives it, so a person's `docker compose up` and
		// wf's are one container and one volume. Shay, 2026-10-04: "make wf bring it up"; before, a
		// stopped one stopped `wf new` with "start one".
		async up({ worktree, slug, port }) {
			const url = KIT.database.url({ slug, port });
			if (process.env.MONGO_URL || (await answers(url))) return mongoAnswers(url);
			const r = spawnSync('docker', ['compose', '-p', 'jeweleryx', '--profile', 'local-db', 'up', '-d', '--wait', 'mongodb'], { cwd: worktree, stdio: 'inherit', windowsHide: true });
			if (r.status !== 0) throw new Error(`no MongoDB answers at ${url}, and the repo's (docker compose --profile local-db up -d mongodb) did not start: exit ${r.status ?? r.error?.message}. Start one, or set MONGO_URL to yours`);
			return mongoAnswers(url);
		},
		// Then whatever test databases killed pytest runs left, any worktree's (db.ts): a reap is the
		// one moment wf already cleans the MongoDB, and nothing else ever drops them.
		teardown: ({ slug, worktree }) => [
			{ label: 'drop database', run: () => dropDatabase({ worktree, database: worktreeDatabase(slug), mongoUrl: KIT.database.url({ slug }) }) },
			{ label: 'drop stranded test databases', run: () => dropStrandedTestDatabases({ worktree, mongoUrl: KIT.database.url({ slug }) }) },
		],
	},
	teardown: () => [],
};

// Whether the MongoDB at `url` takes a connection within 3 s.
function answers(url: string) {
	const { hostname, port } = new URL(url);
	return new Promise<boolean>((resolve) => {
		const sock = createConnection({ host: hostname, port: Number(port) || 27017, timeout: 3000 });
		const no = () => { sock.destroy(); resolve(false); };
		sock.once('connect', () => { sock.end(); resolve(true); }).once('error', no).once('timeout', no);
	});
}
// Resolves when it answers; else throws saying what to do, before the seeder's own 30 s
// server-selection timeout.
async function mongoAnswers(url: string) {
	if (!(await answers(url))) throw new Error(`no MongoDB answers at ${url}: start one, or set MONGO_URL to yours`);
}
function machine(): Machine {
	return { ...KIT, ...(seams.project as Partial<Machine>) };
}

// Why this machine cannot supply a new round's secrets from `cwd`'s repository, or null.
// `wf new` asks before it creates anything: on 2026-10-25 the bare kit entry ran in a repository with
// no main checkout, and setup's env step was the last of six steps to fail — after the worktree, the
// database and two pnpm builds. Setup names a round's secrets only once a worktree exists (its env
// step); this asks the same machine the same question with the folder wf was started in.
export function secretsGap(cwd: string): string | null {
	let from: string;
	try { from = machine().secretsFrom(cwd); }
	catch (error) { return error instanceof Error ? error.message : String(error); }
	// A folder that is not there is not a source either (the kit's throw covers only the bare layout;
	// a machine's own secretsFrom names its folder without looking).
	return existsSync(from) ? null : `the secrets folder ${from} does not exist: machine().secretsFrom names the folder a round copies its .env files from`;
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
		// The bare `control-jewelryx` (round.ts SHIM_SH): in a folder of the person's own that is already on PATH.
		const norm = (p: string) => p.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
		const onPath = (process.env.PATH ?? '').split(delimiter).map(norm);
		const dir = installShim([join(homedir(), 'bin'), join(homedir(), '.local', 'bin')].filter((d) => onPath.includes(norm(d))));
		if (!dir) console.warn('wf: no ~/bin or ~/.local/bin on PATH, so `control-jewelryx` is not a bare command; run it as node docs/agents/verify-jewelryx/control-jewelryx.mjs');
	},
	// #185 (JX-1427): ignored paraglide/.svelte-kit output must exist before a fresh check.
	node: 'pnpm install --frozen-lockfile && pnpm build:types && pnpm build:data && pnpm build:filters && pnpm --filter jewelryx-admin-dashboard check:prep && pnpm --filter jewelryx-frontend check:prep',
	verify: 'pnpm --dir verification install --ignore-workspace',
	tools: 'node scripts/link-tools.mjs',
	async db({ worktree, slug, port }: { worktree: string } & Stack) {
		const { seedDatabase } = await import('./db.ts');
		const { database } = machine();
		// cwd: the kit runs this step from `wf new`, not from inside the worktree as wt does. --quiet:
		// there the output is the agent's, and a fresh sync listed ~60 packages into it (2026-09-27).
		sh('uv sync --quiet --dev --directory packages/backend', worktree);
		await database.up({ worktree, slug, port });
		seedDatabase({ worktree, database: worktreeDatabase(slug), mongoUrl: seedUrl({ slug, port }) });
	},
};

/** Prepare shared infrastructure before acquiring a worktree's server process tree. */
export function prepareServe(): void { machine().prepareServe?.(); }

// The stack: the three dev servers, until they die (`wf serve`, when a phase needs them).
export async function serve({ worktree, slug, port, profile }: { worktree: string; profile?: VerificationProfile } & Stack): Promise<void> {
	const { runDev } = await import('./dev.ts');
	const servers = machine().servers?.(slug);
	return runDev({ worktree, basePort: port, origins: servers?.origins, wrap: servers?.wrap, profile });
}

// What removing a worktree leaves behind, in order: the database's steps, then the machine's own.
// Each step tolerates "already gone". `worktree` is there only when the steps run before the folder
// goes (the kit's removal plan); Shay's run after it (wt's post-remove hook).
export function teardown({ slug, worktree }: { slug: string; worktree: string }): RemovalStep[] {
	const m = machine();
	// Browsers first: they hold the folder itself, so a database drop that needs the worktree still
	// runs while nothing is parked in it.
	return [...closeBrowsers(worktree), ...m.database.teardown({ slug, worktree }), ...m.teardown({ slug, worktree })];
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

// The agreement's verification cases against the project's rules: null, or why they cannot pass.
// `branch` is the round's; the rows are verification cases, never planned commits.
export function agreementCaseGap({ branch, rows }: { branch: string | null; rows: { n: number; message: string; files: string[] }[] }): string | null {
	return oracleCaseGap({ branch, rows });
}

// The oracle files the worktree differs from the base in (checks.ts, the oracle guard): committed, staged,
// unstaged and untracked, where the guard itself reads only commits. Empty off a fix/ or feat/ branch.
// The base as the guard reads it: origin/<base> when there is one, else the local branch.
function oracleTouched(toplevel: string, roundBase?: string): string[] {
	const git = (args: string[]) => spawnSync('git', ['-C', toplevel, ...args], { encoding: 'utf8', windowsHide: true });
	const branchResult = git(['branch', '--show-current']);
	if (branchResult.status !== 0) throw new Error('protected files: cannot read the current branch');
	const branch = branchResult.stdout.trim();
	if (!PRODUCT_BRANCH.test(branch)) return [];
	const base = roundBase ?? (git(['rev-parse', '--verify', '--quiet', `origin/${baseBranch}`]).status === 0 ? `origin/${baseBranch}` : baseBranch);
	const resolved = git(['merge-base', base, 'HEAD']);
	const mergeBase = resolved.stdout.trim();
	if (resolved.status !== 0 || !mergeBase) throw new Error('protected files: cannot resolve the project base');
	const lines = (r: { status: number | null; stdout: string; stderr: string }) => {
		if (r.status !== 0) throw new Error(`protected files: git could not read the diff: ${r.stderr.trim()}`);
		return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
	};
	const paths = ['--', 'verification/', 'JewelryX-Tools/'];
	return oracleEdits([...new Set([...lines(git(['diff', '--name-only', mergeBase, ...paths])), ...lines(git(['diff', '--name-only', '--cached', mergeBase, ...paths])), ...lines(git(['ls-files', '--others', '--exclude-standard', ...paths]))])]).sort();
}

// The env a verification or repro run gets: the round's seed actors (the project's support helpers
// read these, and they are the identities the repro config logs in) plus .verify-stack.env's URLs.
// A project verification tool can pass it to its runner, so a repro that imports
// verification/tests/support reads the round's own users, not the helpers' by-hand defaults
// (verification-owner@), which the round database does not have (BJEW-617, 2026-10-06).
export function verificationStackEnv(toplevel: string): Record<string, string> {
	const stackFile = join(toplevel, '.verify-stack.env');
	return { ...seedActorsEnv(logins), ...(existsSync(stackFile) ? parseStackEnv(readFileSync(stackFile, 'utf8')) : {}) };
}

// The runner environment drops session bookkeeping, not project flags or OS/tool configuration.
export const harnessEnvKeys: string[] = ['PWD', 'OLDPWD', '_', 'SHLVL', 'CLAUDECODE', 'TERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION', 'SESSIONNAME'];
export const harnessEnvPrefixes: string[] = ['PI_', 'WT_'];
export function runnerEnv(ambient: NodeJS.ProcessEnv): Record<string, string> {
	const kept: [string, string][] = [];
	for (const [key, value] of Object.entries(ambient)) {
		if (value === undefined) continue;
		if (harnessEnvKeys.includes(key) || harnessEnvPrefixes.some((prefix) => key.startsWith(prefix))) continue;
		kept.push([key, value]);
	}
	return Object.fromEntries(kept);
}

// The keys verificationStackEnv (and the worktree's own `.env`) own: the round's seed actors, the
// stack's own URLs and log path, and the database/resource identifiers. For an isolated baseline run
// these point at the LIVE round; the baseline branch's own values must replace them, and a key with no
// baseline value (STACK_LOG, MONGO_URL from the host) is dropped rather than leaking the live
// URL/database (the scratch's own `.env` then supplies its identifiers).
export const stackEnvOwnedKeys = (): string[] => [...Object.keys(seedActorsEnv(logins)), 'B2B_URL', 'ADMIN_URL', 'API_URL', 'STACK_LOG', 'MONGO_URL', 'MONGO_URI', 'DATABASE_URL', 'DATABASE_NAME', 'REDIS_URL'];

// The stack env a task gets in an isolated baseline worktree for `branch`: the seed actors and the
// baseline stack's own URLs, computed from the branch (ports are pure functions of it). Core can bind
// it to a proof before the worktree exists, and the run then uses exactly these values -- never the
// live round's ports or database. `setup`'s env step writes the same URLs into the scratch's
// `.verify-stack.env`.
export function baselineStackEnv(branch: string): Record<string, string> {
	const direct = directUrls(basePortForBranch(branch));
	return { ...seedActorsEnv(logins), B2B_URL: direct.b2b, ADMIN_URL: direct.admin, API_URL: direct.api };
}

/**
 * The environment for an optional isolated baseline experiment. It starts from the
 * curated runner env, drops the base's owned live resource keys, keeps the task's own non-resource
 * overrides, and adds the baseline branch's own stack env. Nothing from a live port/database survives.
 */
export function baselineRunnerEnv({ ambient, taskEnv, branch }: { ambient: NodeJS.ProcessEnv; taskEnv?: Record<string, string>; branch: string }): Record<string, string> {
	const owned = new Set(stackEnvOwnedKeys());
	const base = Object.fromEntries(Object.entries(runnerEnv(ambient)).filter(([key]) => !owned.has(key)));
	const preserved = Object.fromEntries(Object.entries(taskEnv ?? {}).filter(([key]) => !owned.has(key)));
	return { ...base, ...preserved, ...baselineStackEnv(branch) };
}

/** Optional affected checks; command selection does not certify agreement cases. */
export function checks({ toplevel, changed }: { toplevel: string; changed: string[] }): CheckTask[] {
	return checkTasks({ changed, pkgFor: realPkgFor(toplevel), pushHook: existsSync(join(toplevel, 'lefthook.yml')), onDisk: (f) => existsSync(join(toplevel, f)) });
}

/** Protected oracle edits are refused independently of commands or case tables. */
// `roundBase` is the round's own base ref (a release-branch round: origin/v1.1); default is the project base.
export function protectedFilesGap(toplevel: string, roundBase?: string): string | null {
	try {
		const touched = oracleTouched(toplevel, roundBase);
		return touched.length ? `protected oracle files differ from the base: ${touched.join(', ')}; coverage belongs on a verification branch` : null;
	} catch (error) {
		return `protected files: could not inspect the project diff: ${error instanceof Error ? error.message : String(error)}`;
	}
}

// ── proof naming ─────────────────────────────────────────────────────────────

// JX-1068 (2026-10-13, #138): timestamp-named captures needed hand renames at posting.
/** Refuse root proof images posting/T2 cannot show; this project's naming uses core's pairing rule. */
export function proofNamingGap(names: string[]): string | null {
	const unpaired = unpairedProofImages(names);
	return unpaired.length
		? `proof/${unpaired.join(', proof/')} is not named before-<label>.png or after-<label>.png, so wf post cannot attach it and T2's before/after page shows nothing of it; rename it (after-<label>.png, and before-<label>.png when there is a baseline) before the handoff`
		: null;
}

// ── delivery ─────────────────────────────────────────────────────────────────

// The note wf deliver leaves in the round folder, one section per ticket id (a round on sub-tasks has
// one per sub-task); the round skill fills and posts each (wf never calls Jira). Only the scaffold:
// the words are for Einat, in plain Hebrew with no file, code name or line number
// (docs/agents/jira.md), and PLAN.md's Cause and Approach are written for the code. TJEW-670
// (2026-09-28): the note carried PLAN.md's Cause, file:line and all, as one note for four subitems.
export function trackerNote({ ids, url }: { ids: string[]; url: string }): { file: string; text: string } {
	const section = (id: string) => [`## ${id}`, 'השינוי מוכן ב-PR וממתין למיזוג.', 'מה היה: <what the reporter saw, from TICKET.md ## Intent>', 'מה שונה: <what she sees now>', 'לבדיקה: <where to look, step by step>', 'pictures: <the proof/ files that show the reporter the delivered screen, e.g. after-1.png after-2.png, or none; wf post attaches only these>', `PR: ${url}`].join('\n');
	const head = '<!-- One comment per ## section, posted on that issue. Fill the <...> lines in plain Hebrew for the reporter: no file path, code name or line number (docs/agents/jira.md, Comments on an issue). The ## line is not posted, nor the pictures: line: wf post attaches and shows exactly the proof/ files it names, nothing else. -->';
	return { file: 'JIRA.md', text: `${[head, ...ids.map(section)].join('\n\n')}\n` };
}

// The branch a round's PR is opened against and looked up on: the round's own base ref (`wf new --base
// origin/v1.1` for a ticket labelled v1.1) without its `origin/`, else the project base. deliver asked
// the project base for every round, so a v1.1 round's PR was opened against dev and the reconciliation
// of an already-open v1.1 PR (`gh pr list --base dev`) could never find it.
export function prBaseOf(roundBase: string | null | undefined): string {
	return roundBase ? roundBase.replace(/^origin\//, '') : baseBranch;
}

// The subject of wf deliver's round-folder commit. JewelryX's commit-msg hook (ticket-id) wants a
// ticketed branch's subject to start with its ticket, `JX-1081: <what>`; `docs(fix/JX-1534-…)` was
// refused, so deliver died after T2 and the round folder had to be committed by hand (JX-1534,
// 2026-10-26). A round with no ticket (chore/*) keeps `docs(<id>)`.
export function roundFolderSubject({ id, ids }: { id: string; ids?: string[] }): string {
	const ticket = ids?.find((one) => /^JX-\d+$/.test(one)) ?? id.match(/JX-\d+/)?.[0];
	return `${ticket ? `${ticket}:` : `docs(${id}):`} round folder: ticket, agreement, assessment, repro`;
}

/** Why the round's tickets no longer say what the round read (an edited description or title, a comment added or edited since the round began), or null. Throws when it cannot look. wf review asks it at T2's opening; wf post asks it again before posting (post.ts). */
export async function ticketChanges(state: State | null): Promise<string | null> {
	const { ticketRefusal } = await import('./post.ts');
	return ticketRefusal(state, state?.ids ?? (state?.id ? [state.id] : []), 'run wf review again');
}

// ── JewelryX's own wf commands ───────────────────────────────────────────────

export const commands: Record<string, Command> = {
	seed: async (argv) => (await import('./seed.ts')).runSeed(argv),
	show: async (argv) => (await import('./show.ts')).runShow(argv),
	post: async (argv) => (await import('./post.ts')).runPost(argv),
};
