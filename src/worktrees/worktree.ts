// worktree.ts — wf's one interface to worktrees. Every wf command reads, names, creates and
// removes a worktree through this file.
//   read:   `git worktree list --porcelain`: 54 ms, against 2.6 s for `wt list --format json`
//           (measured 2026-09-24, 23 worktrees)
//   names:  wt's own filters (hash_port, sanitize), computed in ports.ts without wt, so wf and the
//           wt hooks agree on every port and name; the project turns them into its apps' URLs
//   create, remove: through the seams (seams.ts): Shay's are worktrunk and wf's hooks
//           (env/worktrees.ts), the kit's own plain git (git-worktree.ts)
// Ports: P = hash_port(branch), 10000-19999; the project spreads its apps from there.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seams } from '../seams.ts';
import { approvalExclusions } from '../gates/content-identity.ts';
import type { RemovalStep, Seams, Worktree } from '../seams.ts';

import { listWorktrees, slugForBranch, worktreesHome } from './worktree-registry.ts';
export { parseWorktreeList, listWorktrees, mainCheckout, worktreesHome, resolveWorktree, basePortForBranch, slugForBranch, portsAndSlugsForBranches, excludeFromGit } from './worktree-registry.ts';
export type { WorktreeEntry } from './worktree-registry.ts';

// Pure: the lines wf prints under a round's header, one per app: `<app>: <url>`.
export function urlLines(urls: Record<string, string>) {
	const width = Math.max(...Object.keys(urls).map((app) => app.length)) + 2;
	return Object.entries(urls).map(([app, url]) => `${`${app}:`.padEnd(width)}${url}`).join('\n');
}

// ── create and remove ────────────────────────────────────────────────────────

/** Allocate a new worktree at wf's shared destination; the machine chooses only how to create/setup it. */
export async function createWorktree(o: Omit<Parameters<NonNullable<Seams['createWorktree']>>[0], 'path'>): Promise<Worktree> {
	const path = `${worktreesHome(listWorktrees())}/${slugForBranch(o.branch)}`;
	return (seams.createWorktree ?? (await import('./git-worktree.ts')).createWorktree)({ ...o, path });
}
export async function removalPlan(o: Parameters<NonNullable<Seams['removalPlan']>>[0]): Promise<RemovalStep[]> {
	return (seams.removalPlan ?? (await import('./git-worktree.ts')).removalPlan)(o);
}

/** Keep round metadata ignored by this worktree, without editing shared Git configuration. */
export function excludeWfFolder(worktree: string): void {
	// JX-1239, 2026-10-12: a parallel round's workaround toggled the shared info/exclude
	// during checks. A local rule makes that toggle irrelevant to the other round's bytes.
	const folder = join(worktree, '.wf');
	const ignore = join(folder, '.gitignore');
	mkdirSync(folder, { recursive: true });
	const existing = (existsSync(ignore) ? readFileSync(ignore, 'utf8') : '').split(/\r?\n/);
	// Use the identity owner's exact metadata paths, not `*`: an unowned .wf script is source.
	const missing = approvalExclusions(null, null, 'row').map((p) => `/${p.slice('.wf/'.length)}`).filter((p) => !existing.includes(p));
	if (missing.length) appendFileSync(ignore, `\n${missing.join('\n')}\n`);
}
