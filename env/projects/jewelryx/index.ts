// env/projects/jewelryx/index.ts — JewelryX on Shay's machine: what the kit's project folder reads
// from the machine (`machine()` in projects/jewelryx/index.ts lists it).
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { containerOf, mongoTeardown } from './mongo.ts';
import type { Machine, Origins, Wrap } from '../../../projects/jewelryx/index.ts';
import type { RemovalStep } from '../../../src/seams.ts';

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

// The worktrees' databases are the kit's (projects/jewelryx/index.ts): jewelryx_<slug> in the repo's own
// MongoDB on 27017, which wf brings up when it is down. Shay's machine had its own until 2026-10-04: a
// container per worktree (Shay: "too much"), then one shared jewelryx-mongo-dev beside the repo's.

// Pure: what removes a worktree's own container, when it has one. Worktrees made before 2026-10-04
// do; once `docker ps -a --filter name=jewelryx-mongo-` shows none, this, the reap step below and
// mongo.ts go.
export const oldContainerSteps = (slug: string, exists: boolean): RemovalStep[] => (exists ? mongoTeardown(slug) : []);

// The container is looked for when reap runs, not when the plan is made, so the plan (and its
// selfchecks) runs no docker.
const oldContainer = (slug: string): RemovalStep => ({
	label: 'its own mongo container, if any',
	run: () => {
		const exists = spawnSync('docker', ['inspect', containerOf(slug)], { stdio: 'ignore' }).status === 0;
		for (const s of oldContainerSteps(slug, exists)) spawnSync(s.cmd!, s.args!, { stdio: 'inherit' });
	},
});

export const pieces = {
	secretsFrom: () => SECRETS,
	names: stackNames,
	servers: portlessServers,
	// portless prune drops the routes whose server died with the worktree; CI=1 keeps it from prompting.
	teardown: ({ slug }) => [oldContainer(slug), { label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } }],
} satisfies Partial<Machine>;
