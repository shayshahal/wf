// env/projects/jewelryx/mongo.ts — Shay's machine: one MongoDB container per worktree.
//   up:       jewelryx-mongo-<slug> on 40000+(P-10000) (mongo.compose.yml), healthy before it returns
//   teardown: the container, its volume and its compose network
// The kit names the database and seeds it (projects/jewelryx/db.ts); this is where it lives.
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDatabase } from '../../../projects/jewelryx/db.ts';
import type { Port } from '../../../projects/jewelryx/index.ts';
import type { RemovalStep } from '../../../seams.ts';

// Pure: mongo host port for a base port P. Throws outside 10000-19999.
export function mongoPortForBase(basePort: Port): number {
	const p = Number(basePort);
	if (!Number.isInteger(p) || p < 10000 || p > 19999) throw new Error(`base port out of range 10000-19999: ${basePort}`);
	return 40000 + (p - 10000);
}
export const containerOf = (slug: string): string => `jewelryx-mongo-${slug}`;
export const volumeOf = (slug: string): string => `jewelryx-wt-mongo-${slug}`;
export const composeProjectOf = (slug: string): string => `jewelryx-wt-${slug}`;
export const worktreeMongoUrl = (base: Port): string => `mongodb://localhost:${mongoPortForBase(base)}`;

// Pure: `docker port <container> 27017` → the URL the seeder writes to. The seeder's own .env may
// name another mongo (the permanent stacks seed from dev's checkout), so it is always pointed at
// the target container.
export function mongoUrlFromDockerPort(output: string): string | undefined {
	const port = /:(\d+)\s*$/m.exec(output)?.[1];
	return port ? `mongodb://127.0.0.1:${port}` : undefined;
}

export function containerUrl(slug: string): string {
	const url = mongoUrlFromDockerPort(spawnSync('docker', ['port', containerOf(slug), '27017'], { encoding: 'utf8' }).stdout ?? '');
	if (!url) throw new Error(`worktree db: ${containerOf(slug)} publishes no port; is it up?`);
	return url;
}

function waitForPort(port: number, timeoutMs = 90000) {
	const t0 = Date.now();
	return new Promise<number>((resolve, reject) => {
		const tick = () => {
			const sock = createConnection(port, '127.0.0.1');
			sock.once('connect', () => { sock.end(); resolve((Date.now() - t0) / 1000); });
			sock.once('error', () => {
				sock.destroy();
				if (Date.now() - t0 > timeoutMs) reject(new Error(`port ${port} not open after ${timeoutMs / 1000}s`));
				else setTimeout(tick, 500);
			});
		};
		tick();
	});
}

export async function mongoUp({ slug, base }: { slug: string; base: Port }): Promise<void> {
	const mongoPort = mongoPortForBase(base);
	const composeFile = join(dirname(fileURLToPath(import.meta.url)), 'mongo.compose.yml');
	// --wait: return only once the compose healthcheck passes. The host port accepts connections
	// before mongod does (Docker's proxy), so waitForPort alone let the seed race it: ECONNREFUSED
	// inside the container on a fresh create (BJEW-603 round, 2026-09-23).
	const r = spawnSync('docker', ['compose', '-f', composeFile, '-p', composeProjectOf(slug), 'up', '-d', '--wait'], {
		stdio: 'inherit',
		env: { ...process.env, WT_SLUG: slug, WT_MONGO_PORT: String(mongoPort) },
	});
	if (r.status !== 0) throw new Error(`worktree db: docker compose up failed (exit ${r.status})`);
	const waited = await waitForPort(mongoPort);
	console.log(`worktree db: ${containerOf(slug)} listening on ${mongoPort} (waited ${waited.toFixed(1)}s)`);
}

// Seed the container of `slug` (the permanent stacks: dev's seeder, the container's own port).
export function seedContainer({ worktree, slug, database, reset = false }: { worktree: string; slug: string; database: string; reset?: boolean }): void {
	seedDatabase({ worktree, database, mongoUrl: containerUrl(slug), reset });
}

// Pure: what removing a worktree leaves behind, in order. Each step tolerates "already gone". The
// compose network outlives its container; 23 of them exhausted docker's address pools and the next
// `wf new` failed: "all predefined address pools have been fully subnetted" (3187601171).
export function mongoTeardown(slug: string): RemovalStep[] {
	return [
		{ label: 'docker rm mongo', cmd: 'docker', args: ['rm', '-f', containerOf(slug)] },
		{ label: 'docker volume rm', cmd: 'docker', args: ['volume', 'rm', volumeOf(slug)] },
		{ label: 'docker network rm', cmd: 'docker', args: ['network', 'rm', `${composeProjectOf(slug)}_default`] },
	];
}
