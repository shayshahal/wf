// Existing-checkout integration only. Worktrunk/Git keep allocation and cleanup (#158).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { listWorktrees, worktreePathKey } from '../../src/worktrees/worktree-registry.ts';
import type { WorktreeEntry } from '../../src/worktrees/worktree-registry.ts';
import type { Seams } from '../../src/seams.ts';
import { t3WorkspaceHandoff } from '../../src/plugin/t3code.ts';

type HerdrCheckout = WorktreeEntry & { readonly workspace: string | null };
type HerdrFailure = { readonly kind: 'refused' | 'uncertain'; readonly why: string };
type HerdrDiscovery = { readonly kind: 'listed'; readonly worktrees: readonly HerdrCheckout[]; readonly parent: { readonly path: string; readonly workspace: string | null } } | HerdrFailure;

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const workspaceId = (v: unknown): v is string => typeof v === 'string' && /^w[A-Za-z0-9]+$/.test(v);
const refused = (why: string): HerdrFailure => ({ kind: 'refused', why });

function callHerdr(args: string[], cwd: string): { kind: 'reply'; value: unknown } | HerdrFailure {
	const result = spawnSync('herdr', args, { cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true });
	if (result.error || result.status !== 0) return refused(`wf herdr: CLI unavailable or refused ${args[1]} (exit ${result.status ?? 'unknown'}); inspect Herdr directly. No create/remove or trust grant attempted.`);
	try { return { kind: 'reply', value: JSON.parse(result.stdout) }; }
	catch { return refused('wf herdr: malformed CLI response; inspect discovery before another open.'); }
}

// Git owns path/branch authority; Herdr supplies only the workspace mapping. Never accept a foreign
// checkout or mismatched branch from an otherwise well-formed native response.
function discoverHerdr(cwd: string): HerdrDiscovery {
	let trees: WorktreeEntry[];
	try { trees = listWorktrees(cwd); }
	catch { return refused('wf herdr: cannot read Git checkout registration. Nothing opened.'); }
	if (!trees.length) return refused('wf herdr: no registered repository parent. Nothing opened.');
	const parentPath = trees[0].bare ? dirname(trees[0].path) : trees[0].path;
	// Listing from the parent also works when the caller is in a linked checkout. Native open
	// rejects linked sources, and a cwd fallback can implicitly create a parent (#158, native probe).
	const reply = callHerdr(['worktree', 'list', '--cwd', parentPath], cwd);
	if (reply.kind !== 'reply') return reply;
	const envelope = reply.value;
	if (!record(envelope) || !record(envelope.result) || envelope.result.type !== 'worktree_list' || !Array.isArray(envelope.result.worktrees)) return refused('wf herdr: invalid discovery envelope. Nothing opened.');
	const source = envelope.result.source;
	if (!record(source) || typeof source.repo_root !== 'string' || typeof source.source_checkout_path !== 'string' || (source.source_workspace_id !== undefined && !workspaceId(source.source_workspace_id))) return refused('wf herdr: invalid repository-parent discovery. Nothing opened.');
	const worktrees: HerdrCheckout[] = [];
	try {
		if (worktreePathKey(source.repo_root) !== worktreePathKey(parentPath) || worktreePathKey(source.source_checkout_path) !== worktreePathKey(parentPath)) return refused('wf herdr: native source is not the Git repository parent. Nothing opened.');
		for (const row of envelope.result.worktrees) {
			if (!record(row) || typeof row.path !== 'string' || (row.branch !== undefined && row.branch !== null && typeof row.branch !== 'string') || typeof row.is_bare !== 'boolean' || (row.open_workspace_id !== undefined && !workspaceId(row.open_workspace_id))) return refused('wf herdr: invalid discovery entry. Nothing opened.');
			const rowPath = row.path;
			const tree = trees.find((candidate) => worktreePathKey(candidate.path) === worktreePathKey(rowPath));
			if (!tree || tree.branch !== (row.branch ?? null) || tree.bare !== row.is_bare || worktrees.some((existing) => worktreePathKey(existing.path) === worktreePathKey(tree.path))) return refused('wf herdr: discovery disagrees with Git registration. Nothing opened.');
			worktrees.push({ ...tree, workspace: workspaceId(row.open_workspace_id) ? row.open_workspace_id : null });
		}
	} catch { return refused('wf herdr: checkout path identity is unavailable. Nothing opened.'); }
	if (worktrees.length !== trees.length) return refused('wf herdr: incomplete checkout discovery. Nothing opened.');
	const parentWorkspace = workspaceId(source.source_workspace_id) ? source.source_workspace_id : null;
	if (!trees[0].bare && worktrees.find((tree) => tree.path === trees[0].path)?.workspace !== parentWorkspace) return refused('wf herdr: inconsistent repository-parent workspace mapping. Nothing opened.');
	return { kind: 'listed', worktrees, parent: { path: parentPath, workspace: parentWorkspace } };
}

function confirmsHerdrOpen(value: unknown, checkout: HerdrCheckout): boolean {
	if (!record(value) || !record(value.result) || value.result.type !== 'worktree_opened' || !record(value.result.workspace) || !record(value.result.worktree)) return false;
	const row = value.result.worktree;
	if (typeof row.path !== 'string' || (row.branch ?? null) !== checkout.branch || value.result.workspace.workspace_id !== checkout.workspace || row.open_workspace_id !== checkout.workspace) return false;
	try { return worktreePathKey(row.path) === worktreePathKey(checkout.path); }
	catch { return false; /* Path identity lost after open: discovery/recovery remains mandatory. */ }
}

function openHerdrCheckout(input: { cwd: string; path: string }): { kind: 'opened'; checkout: HerdrCheckout; disposition: 'reused' | 'opened' } | HerdrFailure {
	const before = discoverHerdr(input.cwd);
	if (before.kind !== 'listed') return before;
	let target: HerdrCheckout | undefined;
	try {
		const physical = realpathSync.native(input.path);
		target = before.worktrees.find((tree) => worktreePathKey(tree.path) === worktreePathKey(physical));
	} catch { return refused('wf herdr: target checkout does not exist. Nothing created.'); }
	if (!target || target.bare) return refused('wf herdr: target must be an existing registered non-bare checkout. Nothing created.');
	if (!before.parent.workspace) return refused(`wf herdr: repository-parent workspace is not open: ${before.parent.path}. Open that parent explicitly in Herdr, then retry. No workspace opened.`);
	if (target.workspace) return { kind: 'opened', checkout: target, disposition: 'reused' };
	const requested = target;
	// #158: a lost open response may follow a committed workspace. Always reconcile with discovery;
	// never retry a mutation, compensate with removal, or treat an error as proof of no effect.
	const opened = callHerdr(['worktree', 'open', '--workspace', before.parent.workspace, '--path', target.path, '--no-focus'], input.cwd);
	const after = discoverHerdr(input.cwd);
	if (after.kind === 'listed') {
		const found = after.worktrees.find((tree) => tree.path === requested.path);
		if (found?.workspace && found.branch === target.branch) {
			if (opened.kind === 'reply' && confirmsHerdrOpen(opened.value, found)) return { kind: 'opened', checkout: found, disposition: 'opened' };
			return { kind: 'uncertain', why: `wf herdr: open response was not confirmed, but discovery found workspace ${found.workspace} at ${found.path}. No further mutation attempted. Retry explicit open to reuse it; this does not bind the agent session.` };
		}
	}
	return { kind: 'uncertain', why: `wf herdr: open outcome is not confirmed for ${target.path}. Keep the checkout; run discovery with argv ${JSON.stringify(['herdr', 'worktree', 'list', '--cwd', input.cwd])} before another open. No create/remove or trust grant attempted.` };
}

/** Run explicit Herdr discovery/open; never allocate, grant trust, change focus or rebind a session. */
export function runHerdrWorkspaces(argv: string[]): void {
	if (process.env.HERDR_ENV !== '1') {
		console.error('wf herdr: not inside Herdr. Keep using the printed checkout path; no Herdr command was run.');
		process.exitCode = 1;
		return;
	}
	const cwd = process.cwd();
	const result = argv.length === 1 && argv[0] === 'list' ? discoverHerdr(cwd)
		: argv.length === 2 && argv[0] === 'open' ? openHerdrCheckout({ cwd, path: argv[1] })
			: refused('wf herdr: usage: wfk herdr list | wfk herdr open <existing-checkout-path>');
	if (result.kind === 'refused' || result.kind === 'uncertain') {
		console.error(JSON.stringify(result));
		process.exitCode = 1;
	} else console.log(JSON.stringify(result));
}

/** Print an explicit existing-checkout handoff; authenticated native session binding keeps priority. */
export function herdrWorkspaceHandoff(env: NodeJS.ProcessEnv): Seams['workspaceHandoff'] {
	if (env.HERDR_ENV !== '1') return null;
	const native = t3WorkspaceHandoff(env);
	return (path) => [
		...(native ? [native(path)] : []),
		'workspace handoff: Herdr (not opened by wf)',
		`wf-owned checkout: ${path}`,
		`Explicit background open (argv): ${JSON.stringify(['wfk', 'herdr', 'open', path.replace(/\\/g, '/')])}`,
		'The repository-parent workspace must already be open. The helper refuses without creating an implicit parent.',
		'Opening reuses this checkout. It does not bind or replace this agent session. Save context before starting another session.',
		'Closing a Herdr workspace is not wf reap, resource release or delivered work. Use the recorded wf entry for cleanup.',
	].join('\n');
}
