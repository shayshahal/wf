// stack/db.mjs — one MongoDB per worktree: up, seed, down.
//   up:   jewelryx-mongo-<slug> on 40000+(P-10000) (stack/mongo.compose.yml), healthy before it returns
//   seed: the project's fixture set (packages/backend/scripts/seed_fixtures.py, docs/agents/seed.md),
//         run straight into the target database. No snapshot: seeding an empty database took
//         6-8 s, restoring a cached mongodump ~11 s (measured 2026-09-24), and a snapshot needs a
//         key that knows which project files decide the data.
//   down: container, volume and compose network; each tolerates "already gone"
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mongoPortForBase } from '../worktree.mjs';

export const containerOf = (slug) => `jewelryx-mongo-${slug}`;
export const volumeOf = (slug) => `jewelryx-wt-mongo-${slug}`;
export const composeProjectOf = (slug) => `jewelryx-wt-${slug}`;
export const worktreeDatabase = (slug) => `jewelryx_${slug}`;
export const worktreeMongoUrl = (base) => `mongodb://localhost:${mongoPortForBase(base)}`;

// Pure: `docker port <container> 27017` → the URL the seeder writes to. The seeder's own .env may
// name another mongo (the permanent stacks seed from dev's checkout), so it is always pointed at
// the target container.
export function mongoUrlFromDockerPort(output) {
	const port = /:(\d+)\s*$/m.exec(output)?.[1];
	return port ? `mongodb://127.0.0.1:${port}` : undefined;
}

function waitForPort(port, timeoutMs = 90000) {
	const t0 = Date.now();
	return new Promise((resolve, reject) => {
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

function run(label, cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
	if (r.status !== 0) throw new Error(`worktree db: ${label} failed (exit ${r.status})`);
}

export async function mongoUp({ slug, base }) {
	const mongoPort = mongoPortForBase(base);
	const composeFile = join(dirname(fileURLToPath(import.meta.url)), 'mongo.compose.yml');
	// --wait: return only once the compose healthcheck passes. The host port accepts connections
	// before mongod does (Docker's proxy), so waitForPort alone let the seed race it: ECONNREFUSED
	// inside the container on a fresh create (BJEW-603 round, 2026-09-23).
	run('docker compose up', 'docker', ['compose', '-f', composeFile, '-p', composeProjectOf(slug), 'up', '-d', '--wait'], {
		env: { ...process.env, WT_SLUG: slug, WT_MONGO_PORT: String(mongoPort) },
	});
	const waited = await waitForPort(mongoPort);
	console.log(`worktree db: ${containerOf(slug)} listening on ${mongoPort} (waited ${waited.toFixed(1)}s)`);
}

// Returns the failures; an already-removed piece is not one.
export function mongoDown(slug) {
	const failures = [];
	for (const args of [['rm', '-f', containerOf(slug)], ['volume', 'rm', volumeOf(slug)], ['network', 'rm', `${composeProjectOf(slug)}_default`]]) {
		const r = spawnSync('docker', args, { encoding: 'utf8' });
		const out = (r.stdout ?? '') + (r.stderr ?? '');
		if (r.status !== 0 && !/no such (container|volume|network)|not found/i.test(out)) failures.push(`docker ${args.join(' ')}: ${out.trim()}`);
	}
	return failures;
}

// `worktree` holds the seeder (a round's worktree, or dev for the permanent stacks); `slug` names
// the container; `database` is the target. Seeding again puts every fixture back to its fixed
// values (fixed ids, so counts never move); `reset` first drops everything else too.
export function seedDatabase({ worktree, slug, database, reset = false }) {
	const container = containerOf(slug);
	const t0 = Date.now();
	// `void` keeps dropDatabase()'s result document out of the hook log.
	if (reset) run('mongosh', 'docker', ['exec', container, 'mongosh', '--quiet', '--eval', `void (db.getSiblingDB('${database}').dropDatabase())`]);
	const mongoUrl = mongoUrlFromDockerPort(spawnSync('docker', ['port', container, '27017'], { encoding: 'utf8' }).stdout ?? '');
	if (!mongoUrl) throw new Error(`worktree db: ${container} publishes no port; is it up?`);
	run('seeder', 'uv', ['run', '--quiet', '--directory', join(worktree, 'packages', 'backend'), 'python', '-m', 'scripts.seed_fixtures'], {
		env: { ...process.env, DATABASE_NAME: database, MONGODB_URL: mongoUrl },
	});
	console.log(`worktree db: seeded${reset ? ' (reset)' : ''} ${database} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
