// env/projects/jewelryx/index.ts — JewelryX on Shay's machine: what the kit's project folder reads
// from the machine (`machine()` in projects/jewelryx/index.ts lists it), and his own commands.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dropDatabase, worktreeDatabase } from '../../../projects/jewelryx/db.ts';
import { basePortForBranch } from '../../../src/worktrees/worktree.ts';
import { containerOf, mongoPortForBase, mongoTeardown, mongoUp } from './mongo.ts';
import type { Machine, Origins, Wrap } from '../../../projects/jewelryx/index.ts';
import type { Command, RemovalStep } from '../../../src/seams.ts';

// The machine's copy of the files the project's .worktreeinclude names, at the same paths. Until
// 2026-09-24 new worktrees copied them from the dev worktree (`wt step copy-ignored --from dev`),
// which made dev the secrets store as well as the dev stack's folder, so nobody dared pull it.
export const SECRETS: string = join(homedir(), '.config', 'wf', 'jewelryx');

// A stack's names behind portless, http://<slug>.<app>.jewelryx.localhost, for a browser. <slug> is
// passed in full: portless's own worktree prefix is the branch's last segment only (measured
// 2026-09-22: branch tools/workflow-v2 gave workflow-v2, not tools-workflow-v2). B2B first: wf status
// probes the first app, which answers on P.
export function stackNames(slug: string): Origins {
	const name = (app: string) => `http://${slug}.${app}.jewelryx.localhost`;
	return { b2b: name('b2b'), admin: name('admin'), api: name('api') };
}

// `portless --name <app> --app-port <port> -- <cmd>`: the exact dotted name, so no worktree prefix
// is added (portless's own prefix is the branch's last segment, not our slug). PORTLESS_HTTPS=0 pins
// an auto-started proxy to plain HTTP (--no-tls); a no-op when the service proxy is already up.
// PORTLESS=0 serves the ports directly with no route: the fallback when the proxy is down.
const portlessAppFor = (origin: string) => origin.replace(/^https?:\/\//, '').replace(/\.localhost\/?$/, '');
export function portlessServers(slug: string): { origins: Origins; wrap: Wrap } | null {
	if (process.env.PORTLESS === '0') return null;
	const origins = stackNames(slug);
	return {
		origins,
		wrap: ({ role, port, command }) => ({ command: `portless --name ${portlessAppFor(origins[role])} --app-port ${port} -- ${command}`, env: { PORTLESS_HTTPS: '0' } }),
	};
}

// Every worktree's database, jewelryx_<slug>, in the dev stack's mongo (jewelryx-mongo-dev, stacks.ts),
// as the kit does with one MongoDB. Until 2026-10-04 each worktree had a container, a volume and a
// network of its own; Shay: "too much".
const DEV_BASE = basePortForBranch('dev');
export const sharedMongoUrl = (): string => `mongodb://127.0.0.1:${mongoPortForBase(DEV_BASE)}`;

// Pure: what removes a worktree's own container, when it has one. Worktrees made before 2026-10-04
// do; once `docker ps -a --filter name=jewelryx-mongo-` shows only the stacks', this and mongoTeardown
// go. The dev worktree's container is the shared one, never removed.
export const oldContainerSteps = (slug: string, exists: boolean): RemovalStep[] => (exists && slug !== 'dev' ? mongoTeardown(slug) : []);

// Pure: reap's database steps. The container is looked for when reap runs, not when the plan is made,
// so the plan (and its selfchecks) runs no docker.
export function databaseTeardown({ slug, worktree }: { slug: string; worktree: string }): RemovalStep[] {
	return [
		{ label: 'drop database', run: () => dropDatabase({ worktree, database: worktreeDatabase(slug), mongoUrl: sharedMongoUrl() }) },
		{
			label: 'its own mongo container, if any',
			run: () => {
				const exists = spawnSync('docker', ['inspect', containerOf(slug)], { stdio: 'ignore' }).status === 0;
				for (const s of oldContainerSteps(slug, exists)) spawnSync(s.cmd!, s.args!, { stdio: 'inherit' });
			},
		},
	];
}

export const pieces = {
	secretsFrom: () => SECRETS,
	database: {
		url: sharedMongoUrl,
		// compose up --wait on the running container changes nothing: the stacks supervisor runs it on every start.
		up: () => mongoUp({ slug: 'dev', base: DEV_BASE }),
		teardown: databaseTeardown,
	},
	names: stackNames,
	servers: portlessServers,
	// portless prune drops the routes whose server died with the worktree; CI=1 keeps it from prompting.
	teardown: () => [{ label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } }],
} satisfies Partial<Machine>;

export const commands: Record<string, Command> = {
	stacks: async (argv) => (await import('./stacks.ts')).runStacks(argv),
};
