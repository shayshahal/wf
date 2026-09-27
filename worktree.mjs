// worktree.mjs — wf's one interface to worktrees. Every wf command reads, names, creates and
// removes a worktree through this file.
//   read:   `git worktree list --porcelain`: 54 ms, against 2.6 s for `wt list --format json`
//           (measured 2026-09-24, 23 worktrees)
//   names:  wt's own filters (hash_port, sanitize), computed in ports.mjs without wt, so wf and the
//           wt hooks agree on every port and name; the project turns them into its apps' URLs
//   create, remove: through the seams (seams.mjs); Shay's are worktrunk and wf's hooks (env/worktrees.mjs)
// Ports: P = hash_port(branch), 10000-19999; the project spreads its apps from there.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { hashPort, sanitizeBranch } from './ports.mjs';
import { seams } from './seams.mjs';

const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');

// ── read ─────────────────────────────────────────────────────────────────────

// Pure: `git worktree list --porcelain` → [{ path, branch, detached, bare }]; branch is null when detached or bare.
export function parseWorktreeList(porcelain) {
	return porcelain.replace(/\r\n/g, '\n').split('\n\n').flatMap((block) => {
		const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
		return path ? [{ path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null, detached: /^detached$/m.test(block), bare: /^bare$/m.test(block) }] : [];
	});
}

export function listWorktrees(cwd) {
	return parseWorktreeList(execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', cwd }));
}

// A round, branch, folder name or absolute path → { path, branch }. Throws listing the candidates.
export function resolveWorktree(name, trees = listWorktrees()) {
	const n = norm(String(name));
	const abs = /^[a-zA-Z]:\//.test(n) || n.startsWith('/');
	const hits = trees.filter((t) => (abs ? norm(t.path) === n : t.branch === n || basename(norm(t.path)) === n));
	if (hits.length === 1) return hits[0];
	const cands = trees.map((t) => `  ${t.branch ?? '(detached)'}  ${t.path}`).join('\n');
	throw new Error(`${hits.length ? `ambiguous "${name}"` : `no worktree for "${name}"`} — candidates:\n${cands}`);
}

// ── names ────────────────────────────────────────────────────────────────────

export const basePortForBranch = hashPort;
export const slugForBranch = sanitizeBranch;

// Both values for many branches. It batched `wt step eval` calls when they cost ~0.5 s each (wf
// status, 23 worktrees, 2026-09-23: 28 s); it is pure now and kept for status's single call site.
export function portsAndSlugsForBranches(branches) {
	return new Map(branches.map((b) => [b, { port: hashPort(b), slug: sanitizeBranch(b) }]));
}

// Pure: the lines wf prints under a round's header, one per app: `<app>: <url>`.
export function urlLines(urls) {
	const width = Math.max(...Object.keys(urls).map((app) => app.length)) + 2;
	return Object.entries(urls).map(([app, url]) => `${`${app}:`.padEnd(width)}${url}`).join('\n');
}

// ── create and remove ────────────────────────────────────────────────────────

// The machine decides how a worktree is made and removed (seams.mjs): worktrunk and its hooks on
// Shay's (env/worktrees.mjs), the kit's own default elsewhere (kit and env plan, step 3).
export const createWorktree = (o) => seams.createWorktree(o);
export const removalPlan = (o) => seams.removalPlan(o);

// wf's own files in a worktree (.wf/: state, logs) stay out of git without the project naming
// them: the exclude file is shared by every worktree of the repository.
export function excludeWfFolder(worktree) {
	const common = execFileSync('git', ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const exclude = join(common, 'info', 'exclude');
	mkdirSync(dirname(exclude), { recursive: true });
	if (!(existsSync(exclude) ? readFileSync(exclude, 'utf8') : '').split(/\r?\n/).includes('.wf/')) appendFileSync(exclude, '\n.wf/\n');
}
