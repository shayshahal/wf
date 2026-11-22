// fetch-base.ts — fetch a round's PR base into its remote-tracking ref, retrying a lost race (2026-11-19).
// Every worktree of a project is a worktree of one repository, so every round shares one
// refs/remotes/origin/<base>. Git moves that ref only if it still holds the value the fetch read when it
// started. At 17:11Z three fetches of JewelryX's origin/dev overlapped: `wf deliver` in JX-705, and the
// JX-1266 and JX-1276 agents' own `git fetch origin dev`. The losers failed with `cannot lock ref
// 'refs/remotes/origin/dev': is at 8078a92d… but expected 99c139f8…`, and deliver refused: "freshness
// unproven". A lock that only wf takes cannot exclude the agents' fetches, so a lost race is retried, and
// the next attempt reads the value the winner wrote. Only that failure is retried: a missing remote or a
// network error fails at once.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

// A fetch that hangs on the network must not hold the delivery lock forever.
const NETWORK_MS = 120_000;
const ATTEMPTS = 5;
const WAIT_MS = 500;

// Pure: git's words for a ref update that another process got to first: the ref moved since it was
// read ("is at … but expected …"), or another update holds its lock file.
export const lostRefRace = (stderr: string): boolean => /cannot lock ref|Unable to create '[^']*\.lock'/.test(stderr);

/** `git fetch origin +refs/heads/<base>:refs/remotes/origin/<base>`, retried a bounded number of times while it loses the ref to another fetch. */
export function fetchBase(toplevel: string, baseBranch: string, attempts = ATTEMPTS): SpawnSyncReturns<string> {
	for (let n = 1; ; n++) {
		const fetched = spawnSync('git', ['-C', toplevel, 'fetch', '-q', 'origin', `+refs/heads/${baseBranch}:refs/remotes/origin/${baseBranch}`], { encoding: 'utf8', timeout: NETWORK_MS });
		if (fetched.status === 0 || n >= attempts || !lostRefRace(fetched.stderr ?? '')) return fetched;
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WAIT_MS * n);
	}
}
