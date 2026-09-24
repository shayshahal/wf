// stack/db.mjs — one MongoDB per worktree: up, seed, down.
//   up:   jewelryx-mongo-<slug> on 40000+(P-10000) (stack/mongo.compose.yml), healthy before it returns
//   seed: the project's fixture set (packages/backend/scripts/seed_fixtures.py, docs/agents/seed.md),
//         snapshotted once per cache key in ~/.cache/jewelryx-seed and restored into the worktree's DB
//   down: container, volume and compose network; each tolerates "already gone"
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mongoPortForBase } from '../worktree.mjs';

export const containerOf = (slug) => `jewelryx-mongo-${slug}`;
export const volumeOf = (slug) => `jewelryx-wt-mongo-${slug}`;
export const composeProjectOf = (slug) => `jewelryx-wt-${slug}`;
export const worktreeDatabase = (slug) => `jewelryx_${slug}`;
export const worktreeMongoUrl = (base) => `mongodb://localhost:${mongoPortForBase(base)}`;

// The seeder always writes this scratch database inside the worktree's own container; the archive
// is restored from it into the worktree's database. A constant name lets one archive serve every
// worktree.
export const SEED_DB = 'jewelryx_seed';
export const cacheDir = join(homedir(), '.cache', 'jewelryx-seed');

// The key is the seeder plus every model: change either and the snapshot is re-made. LF-normalised
// because Windows checkouts are CRLF and must hash the same as CI's.
export function seedCacheKey(worktree) {
	const backend = join(worktree, 'packages', 'backend');
	const models = join(backend, 'app', 'models');
	const files = [
		join(backend, 'scripts', 'seed_fixtures.py'),
		// The permission catalogue is seeded too: a new event must invalidate the cached archive.
		join(backend, 'app', 'services', 'permission_seed.py'),
		join(backend, 'app', 'data', 'permission_events.py'),
		...readdirSync(models).filter((f) => f.endsWith('.py')).sort().map((f) => join(models, f)),
	];
	const hash = createHash('sha256');
	for (const file of files) hash.update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
	return hash.digest('hex');
}

// Pure: `docker port <container> 27017` → the URL the host-side seeder writes to. It must be the
// container the archive is then dumped from: the worktree's .env names its own mongo, so seeding
// another target from it dumped an empty scratch DB.
export function mongoUrlFromDockerPort(output) {
	const port = /:(\d+)\s*$/m.exec(output)?.[1];
	return port ? `mongodb://127.0.0.1:${port}` : undefined;
}

// Pure: the only decision in the seed path.
export function seedPlan({ archiveExists, reset }) {
	return { seed: !archiveExists, dropTarget: Boolean(reset) };
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
// the container to seed; `database` is the target.
export function seedDatabase({ worktree, slug, database, reset = false }) {
	const container = containerOf(slug);
	const backendDir = join(worktree, 'packages', 'backend');
	const key = seedCacheKey(worktree);
	const archive = join(cacheDir, `${key}.archive`);
	const plan = seedPlan({ archiveExists: existsSync(archive), reset });
	const t0 = Date.now();
	// `void` keeps dropDatabase()'s result document out of the hook log.
	const mongosh = (js) => run('mongosh', 'docker', ['exec', container, 'mongosh', '--quiet', '--eval', `void (${js})`]);

	if (plan.seed) {
		// Cache miss: seed the scratch DB, then dump it. mongodump/mongorestore live inside the
		// container, not on the host PATH.
		mongosh(`db.getSiblingDB('${SEED_DB}').dropDatabase()`);
		const mongoUrl = mongoUrlFromDockerPort(spawnSync('docker', ['port', container, '27017'], { encoding: 'utf8' }).stdout ?? '');
		run('seeder', 'uv', ['run', '--directory', backendDir, 'python', '-m', 'scripts.seed_fixtures'], {
			env: { ...process.env, DATABASE_NAME: SEED_DB, ...(mongoUrl && { MONGODB_URL: mongoUrl }) },
		});
		mkdirSync(cacheDir, { recursive: true });
		// pid in the name: two worktrees can be created at once, and a shared partial would
		// interleave two dumps into one archive.
		const partial = `${archive}.${process.pid}.partial`;
		const fd = openSync(partial, 'w');
		try {
			run('mongodump', 'docker', ['exec', container, 'mongodump', '--archive', '--quiet', `--db=${SEED_DB}`], { stdio: ['ignore', fd, 'inherit'] });
		} finally {
			closeSync(fd);
		}
		try {
			renameSync(partial, archive);
		} catch (e) {
			// Windows refuses to rename over an archive another seed is restoring from (EPERM): that
			// seed dumped the same key, so its archive stands and ours is dropped.
			if (!existsSync(archive)) throw e;
			rmSync(partial, { force: true });
		}
	}

	if (plan.dropTarget) mongosh(`db.getSiblingDB('${database}').dropDatabase()`);
	const fd = openSync(archive, 'r');
	try {
		run('mongorestore', 'docker', ['exec', '-i', container, 'mongorestore', '--archive', '--quiet', '--drop', `--nsFrom=${SEED_DB}.*`, `--nsTo=${database}.*`], {
			stdio: [fd, 'inherit', 'inherit'],
		});
	} finally {
		closeSync(fd);
	}
	console.log(`worktree db: seed ${plan.seed ? 'MISS (seeded + cached)' : 'HIT'}${reset ? ' --reset' : ''} ${database} ← ${key.slice(0, 12)}.archive in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
