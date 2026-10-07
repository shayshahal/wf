// projects/jewelryx/db.ts — a worktree's database: its name, and the seed.
//   the database: jewelryx_<slug>, in whichever MongoDB the machine gives the worktree (index.ts
//                 `machine().database`; the repo's own on 27017 unless MONGO_URL names another)
//   seed: the project's fixture set (packages/backend/scripts/seed_fixtures.py, docs/agents/seed.md),
//         run straight into the target database. No snapshot: seeding an empty database took
//         6-8 s, restoring a cached mongodump ~11 s (measured 2026-09-24), and a snapshot needs a
//         key that knows which project files decide the data.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { SpawnSyncOptions } from 'node:child_process';

export const worktreeDatabase = (slug: string): string => `jewelryx_${slug}`;

function run(label: string, cmd: string, args: string[], opts: SpawnSyncOptions = {}) {
	const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
	if (r.status !== 0) throw new Error(`worktree db: ${label} failed (exit ${r.status})`);
}

// `worktree` holds the seeder (the round's worktree); `mongoUrl` is
// the MongoDB to write to, and `database` the target. Seeding again puts every fixture back to its
// fixed values (fixed ids, so counts never move); `reset` first drops everything else too. Both
// through the worktree's own python (pymongo is the backend's), so no mongo shell is needed.
export function seedDatabase({ worktree, database, mongoUrl, reset = false }: { worktree: string; database: string; mongoUrl: string; reset?: boolean }): void {
	const t0 = Date.now();
	if (reset) dropDatabase({ worktree, database, mongoUrl });
	run('seeder', 'uv', ['run', '--quiet', '--directory', join(worktree, 'packages', 'backend'), 'python', '-m', 'scripts.seed_fixtures'], {
		env: { ...process.env, DATABASE_NAME: database, MONGODB_URL: mongoUrl },
	});
	console.log(`worktree db: seeded${reset ? ' (reset)' : ''} ${database} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// Drops `database` through the worktree's python. A missing database is not an error (MongoDB).
export function dropDatabase({ worktree, database, mongoUrl }: { worktree: string; database: string; mongoUrl: string }): void {
	run('drop', 'uv', ['run', '--quiet', '--directory', join(worktree, 'packages', 'backend'), 'python', '-c', 'import sys; from pymongo import MongoClient; MongoClient(sys.argv[1]).drop_database(sys.argv[2])', mongoUrl, database]);
}

// Pure: the databases a pytest run left behind. The backend names each run's database
// <name>_test_<pid>_<8 hex>, plus _<suffix> for a test's extra one (tests/support/database.py), and
// drops it only when the session ends, so a run that is killed or crashes leaves it. 2026-10-07: 21
// of them, every pid dead, in the shared MongoDB. A running pid's database is a run in progress.
export function strandedTestDatabases(names: string[], running: (pid: number) => boolean): string[] {
	return names.filter((n) => {
		const m = /_test_(\d+)_[0-9a-f]{8}(?:_|$)/.exec(n);
		return m !== null && !running(Number(m[1]));
	});
}

const running = (pid: number) => {
	try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

// Drops every stranded test database, through the worktree's python. Only in a MongoDB on this
// machine: a pid says nothing about a run on another machine that shares a MongoDB.
export function dropStrandedTestDatabases({ worktree, mongoUrl }: { worktree: string; mongoUrl: string }): void {
	if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(mongoUrl).hostname)) return;
	const python = (code: string, args: string[]) => ['run', '--quiet', '--directory', join(worktree, 'packages', 'backend'), 'python', '-c', `import sys; from pymongo import MongoClient; c = MongoClient(sys.argv[1]); ${code}`, mongoUrl, ...args];
	const list = spawnSync('uv', python('print("\\n".join(c.list_database_names()))', []), { encoding: 'utf8' });
	if (list.status !== 0) throw new Error(`worktree db: listing databases failed (exit ${list.status})`);
	const stranded = strandedTestDatabases(list.stdout.split(/\r?\n/).filter(Boolean), running);
	if (stranded.length) run('drop stranded test databases', 'uv', python('[c.drop_database(d) for d in sys.argv[2:]]', stranded));
	console.log(`worktree db: ${stranded.length} stranded test database(s) dropped${stranded.length ? `: ${stranded.join(', ')}` : ''}`);
}
