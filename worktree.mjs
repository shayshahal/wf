// worktree.mjs — wf's one interface to worktrees. Every wf command reads, names, creates and
// removes a worktree through this file; nothing else runs `git worktree` or `wt switch/remove`.
//   read:   `git worktree list --porcelain`: 54 ms, against 2.6 s for `wt list --format json`
//           (measured 2026-09-24, 23 worktrees)
//   names:  wt's own filters (hash_port, sanitize), so wf and the wt hooks agree on every port and name;
//           the project turns them into its apps' URLs (project.mjs)
//   create: `wt switch --create --no-hooks`, then wf's hooks (hook.mjs) install, build, seed and serve
//   remove: removalPlan: stop the tree's processes, `wt remove`, then the project's teardown
// Ports: P = hash_port(branch), 10000-19999; the project spreads its apps from there.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { teardown } from './project.mjs';

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

// Pure: the lines wf prints under a round's header, one per app: `<app>: <url>`.
export function urlLines(urls) {
	const width = Math.max(...Object.keys(urls).map((app) => app.length)) + 2;
	return Object.entries(urls).map(([app, url]) => `${`${app}:`.padEnd(width)}${url}`).join('\n');
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
	excludeWfFolder(tree.path);
	step('pre-start hooks', ['hook', 'pre-start', 'user:', '--yes'], tree.path);
	step('post-start hooks', ['hook', 'post-start', 'user:', '--yes'], tree.path);
	closeSync(fd);
	return tree;
}

// wf's own files in a worktree (.wf/: state, logs) stay out of git without the project naming
// them: the exclude file is shared by every worktree of the repository.
function excludeWfFolder(worktree) {
	const common = execFileSync('git', ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
	const exclude = join(common, 'info', 'exclude');
	mkdirSync(dirname(exclude), { recursive: true });
	if (!(existsSync(exclude) ? readFileSync(exclude, 'utf8') : '').split(/\r?\n/).includes('.wf/')) appendFileSync(exclude, '\n.wf/\n');
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
		...teardown(slug),
	];
}
