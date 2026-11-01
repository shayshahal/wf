// worktree-registry.ts — repository-explicit Git discovery and workspace placement, without project or round policy.
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { hashPort, sanitizeBranch } from './ports.ts';

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

// ── read ─────────────────────────────────────────────────────────────────────

/** Registered Git workspace identity; bare and detached entries have no branch. */
export type WorktreeEntry = { path: string; branch: string | null; detached: boolean; bare: boolean };

/** Parse Git worktree listings; bare and detached entries carry no branch. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
	return porcelain.replace(/\r\n/g, '\n').split('\n\n').flatMap((block) => {
		const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
		return path ? [{ path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null, detached: /^detached$/m.test(block), bare: /^bare$/m.test(block) }] : [];
	});
}

/** Inspect the explicit repository, or the established round caller cwd when omitted. */
export function listWorktrees(cwd?: string): WorktreeEntry[] {
	return parseWorktreeList(execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', cwd }));
}

// Pure: the repository's main checkout, where a person keeps their clone: the first worktree git
// lists. Null when that is a bare repository (Shay's layout), which checks nothing out.
/** Return the first checkout, never treat a bare repository as an application checkout. */
export function mainCheckout(trees: Pick<WorktreeEntry, 'path' | 'bare'>[]): string | null {
	return trees[0] && !trees[0].bare ? trees[0].path : null;
}

// Pure: the folder the kit's worktrees go in, <repo>/.claude/worktrees: Claude Code Desktop's own
// place for them (kit and env plan, decided 2026-09-27). <repo> is the main checkout, or the folder
// holding a bare repository.
/** Shared workspace placement does not create, move or adopt any checkout. */
export function worktreesHome(trees: Pick<WorktreeEntry, 'path' | 'bare'>[]): string {
	const first = norm(trees[0].path);
	return `${trees[0].bare ? dirname(first) : first}/.claude/worktrees`;
}

// A round, branch, folder name or absolute path → { path, branch }. Throws listing the candidates.
/** Resolve exactly one registered workspace; ambiguous or absent names retain all resources. */
export function resolveWorktree(name: string, trees = listWorktrees()): WorktreeEntry {
	const n = norm(String(name));
	const abs = /^[a-zA-Z]:\//.test(n) || n.startsWith('/');
	const hits = trees.filter((t) => (abs ? norm(t.path) === n : t.branch === n || basename(norm(t.path)) === n));
	if (hits.length === 1) return hits[0];
	const cands = trees.map((t) => `  ${t.branch ?? '(detached)'}  ${t.path}`).join('\n');
	throw new Error(`${hits.length ? `ambiguous "${name}"` : `no worktree for "${name}"`} — candidates:\n${cands}`);
}

// ── names ────────────────────────────────────────────────────────────────────

/** Deterministic branch address allocation; project adapters decide which addresses they require. */
export const basePortForBranch = hashPort;
/** Shared branch-to-folder spelling matches the existing workspace manager contract. */
export const slugForBranch = sanitizeBranch;

// Both values for many branches. It batched `wt step eval` calls when they cost ~0.5 s each (wf
// status, 23 worktrees, 2026-09-23: 28 s); it is pure now and kept for status's single call site.
/** Compute placement names without invoking a workspace manager or starting dependencies. */
export function portsAndSlugsForBranches(branches: string[]): Map<string, { port: number; slug: string }> {
	return new Map(branches.map((b) => [b, { port: hashPort(b), slug: sanitizeBranch(b) }]));
}


// `pattern` joins the repository's exclude file (info/exclude, shared by all its worktrees), once.
/** Ignore shared workspace placement without changing tracked project files. */
export function excludeFromGit(worktree: string, pattern: string): void {
	const common = execFileSync('git', ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const exclude = join(common, 'info', 'exclude');
	mkdirSync(dirname(exclude), { recursive: true });
	if (!(existsSync(exclude) ? readFileSync(exclude, 'utf8') : '').split(/\r?\n/).includes(pattern)) appendFileSync(exclude, `\n${pattern}\n`);
}

/** Compare registered workspace paths through junctions, including after the leaf was removed. */
export function worktreePathKey(path: string): string {
	let parent = resolve(path);
	const missing: string[] = [];
	while (!existsSync(parent)) {
		const next = dirname(parent);
		if (next === parent) throw new Error('workspace path identity: no existing ancestor; cannot compare ownership');
		missing.unshift(basename(parent));
		parent = next;
	}
	const physical = join(realpathSync.native(parent), ...missing).replace(/\\/g, '/').replace(/\/+$/, '');
	return process.platform === 'win32' ? physical.toLowerCase() : physical;
}
