// env/projects/jewelryx/index.ts — JewelryX on Shay's machine: what the kit's project folder reads
// from the machine (`machine()` in projects/jewelryx/index.ts lists it), and his own commands.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { containerUrl, mongoTeardown, mongoUp, worktreeMongoUrl } from './mongo.ts';
import type { Machine, Origins, Wrap } from '../../../projects/jewelryx/index.ts';
import type { Command } from '../../../seams.ts';

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

export const pieces = {
	secretsFrom: () => SECRETS,
	database: {
		url: ({ port }) => worktreeMongoUrl(port!),
		up: ({ slug, port }) => mongoUp({ slug, base: port }),
		seedUrl: ({ slug }) => containerUrl(slug),
		teardown: ({ slug }) => mongoTeardown(slug),
	},
	names: stackNames,
	servers: portlessServers,
	// portless prune drops the routes whose server died with the worktree; CI=1 keeps it from prompting.
	teardown: () => [{ label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } }],
} satisfies Partial<Machine>;

export const commands: Record<string, Command> = {
	stacks: async (argv) => (await import('./stacks.ts')).runStacks(argv),
};
