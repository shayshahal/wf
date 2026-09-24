// worktree.mjs — wf's one interface to worktrees. Every wf command reads, names, creates and
// removes a worktree through this file; nothing else runs `git worktree` or `wt switch/remove`.
//   read:   `git worktree list --porcelain`: 54 ms, against 2.6 s for `wt list --format json`
//           (measured 2026-09-24, 23 worktrees)
//   names:  wt's own filters (hash_port, sanitize), so wf and the wt hooks agree on every port and name
//   create: `wt switch --create --no-hooks`, then wf's hooks (hook.mjs) install, build, seed and serve
//   remove: removalPlan: stop the tree's processes, `wt remove`, then what `wt remove` leaves behind
// Ports: P = hash_port(branch) (B2B, 10000-19999), API P+10000, admin P+20000, mongo 40000+(P-10000).
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');

// ── read ─────────────────────────────────────────────────────────────────────

// Pure: `git worktree list --porcelain` → [{ path, branch, detached }]; branch is null when detached or bare.
export function parseWorktreeList(porcelain) {
	return porcelain.replace(/\r\n/g, '\n').split('\n\n').flatMap((block) => {
		const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
		return path ? [{ path, branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null, detached: /^detached$/m.test(block) }] : [];
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

export const MONGO_PORT_BASE = 40000;

// Pure: mongo host port for a base port P. Throws outside 10000-19999.
export function mongoPortForBase(basePort) {
	const p = Number(basePort);
	if (!Number.isInteger(p) || p < 10000 || p > 19999) throw new Error(`base port out of range 10000-19999: ${basePort}`);
	return MONGO_PORT_BASE + (p - 10000);
}

const wtEval = (expr) => execFileSync('wt', ['step', 'eval', expr], { encoding: 'utf8' }).trim();

export function basePortForBranch(branch) {
	return Number(wtEval(`{{ "${branch}" | hash_port }}`));
}

export function slugForBranch(branch) {
	return wtEval(`{{ "${branch}" | sanitize }}`);
}

// Both values for many branches in one wt spawn: each `wt step eval` costs ~0.5 s, and wf status
// asked twice per worktree (23 worktrees, 2026-09-23: 28 s of a 15-30 s status).
export function portsAndSlugsForBranches(branches) {
	if (!branches.length) return new Map();
	const lines = wtEval(branches.map((b) => `{{ "${b}" | hash_port }} {{ "${b}" | sanitize }}`).join('\n')).split(/\r?\n/);
	return new Map(branches.map((b, i) => {
		const [port, slug] = lines[i].trim().split(' ');
		return [b, { port: Number(port), slug }];
	}));
}

// Pure: a stack's names behind portless, http://<slug>.<app>.jewelryx.localhost, for a browser.
// <slug> is passed in full: portless's own worktree prefix is the branch's last segment only
// (measured 2026-09-22: branch tools/workflow-v2 gave workflow-v2, not tools-workflow-v2).
export function stackNames(slug) {
	const name = (app) => `http://${slug}.${app}.jewelryx.localhost`;
	return { b2b: name('b2b'), admin: name('admin'), api: name('api') };
}

// Pure: a stack's direct addresses, for Node: Node on Windows cannot resolve *.localhost, and the
// API is 127.0.0.1 because Node tries ::1 first for localhost (docs/agents/testing.md).
export function directUrls(port) {
	return { b2b: `http://localhost:${port}`, admin: `http://localhost:${port + 20_000}`, api: `http://127.0.0.1:${port + 10_000}/api/v1` };
}

// Pure: the lines wf prints under a round's header.
export function stackNameLines(names) {
	return [`B2B:     ${names.b2b}`, `Admin:   ${names.admin}`, `Backend: ${names.api}`].join('\n');
}

// ── create ───────────────────────────────────────────────────────────────────

// Created with no hooks, then only wf's (`wt hook <type> user:`) run inside it. worktrunk reads the
// project's hooks from the folder the command runs in, and 20 older checkouts still carry the
// .config/wt.toml that left JewelryX in #222: from one of them, `wt switch --create` ran those too,
// against scripts the new checkout no longer has, and the create failed (2026-09-24).
// wt's post-start tether keeps the dev servers alive in the background, and they inherit whatever
// stdout wt was given. Under a pipe (an agent harness, `wf new | tee`) that pipe never reaches EOF
// and the caller hangs on the tether (measured 40 min on 2026-09-20). A log file hands the tether a
// descriptor of its own, so this returns as soon as wt exits. Returns the worktree, or throws with
// the log.
export function createWorktree({ branch, base, log }) {
	const fd = openSync(log, 'w');
	const step = (label, args, cwd) => {
		const r = spawnSync('wt', args, { stdio: ['ignore', fd, fd], cwd });
		if (r.status === 0) return;
		closeSync(fd);
		throw new Error(`${readFileSync(log, 'utf8').trimEnd()}\n${label} failed (exit ${r.status})`);
	};
	step('wt switch --create', ['switch', '--create', branch, '--base', base, '--yes', '--no-cd', '--no-hooks']);
	const tree = resolveWorktree(branch);
	step('pre-start hooks', ['hook', 'pre-start', 'user:', '--yes'], tree.path);
	step('post-start hooks', ['hook', 'post-start', 'user:', '--yes'], tree.path);
	closeSync(fd);
	return tree;
}

// ── remove ───────────────────────────────────────────────────────────────────

// Pure: the ordered steps. `rm` is done in-process (fs.rmSync), so it carries no cmd.
export function removalPlan({ branch, path, slug, pid }) {
	// git reports the path with forward slashes, a process command line carries backslashes:
	// match either spelling or the sweep finds nothing.
	const fwd = path.replace(/\\/g, '/').replace(/'/g, "''");
	const bck = fwd.replace(/\//g, '\\');
	const ps = `$ProgressPreference = 'SilentlyContinue'; Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='python.exe'" | Where-Object { ($_.CommandLine -like '*${fwd}*' -or $_.CommandLine -like '*${bck}*') -and $_.ProcessId -ne ${pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
	// Stragglers go first: a live dev server holds the tree, and `wt remove` fails on Windows while
	// it runs, leaving git without the worktree but the folder, container, volume, network and
	// routes in place (measured 2026-09-24: 23 processes). -EncodedCommand, not -Command: the steps
	// run through cmd.exe on Windows, which cut the script at its first `|` (BJEW-454 reap).
	return [
		{ label: 'kill stragglers', cmd: 'powershell', args: ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')] },
		{ label: 'wt remove', cmd: 'wt', args: ['remove', branch, '--no-delete-branch', '--force', '--foreground', '-y'] },
		{ label: 'rm -rf worktree', rm: path },
		{ label: 'git worktree prune', cmd: 'git', args: ['worktree', 'prune'] },
		{ label: 'docker rm mongo', cmd: 'docker', args: ['rm', '-f', `jewelryx-mongo-${slug}`] },
		{ label: 'docker volume rm', cmd: 'docker', args: ['volume', 'rm', `jewelryx-wt-mongo-${slug}`] },
		// The compose network outlives its container; 23 of them exhausted docker's address pools and
		// the next `wf new` failed: "all predefined address pools have been fully subnetted" (3187601171).
		{ label: 'docker network rm', cmd: 'docker', args: ['network', 'rm', `jewelryx-wt-${slug}_default`] },
		{ label: 'portless prune', cmd: 'portless', args: ['prune'], env: { CI: '1' } },
	];
}
