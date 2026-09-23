// worktree-ports.mjs — one home for the worktree port/slug scheme.
// P = wt's hash_port for the branch (b2b, 10000-19999); backend is P+10000,
// admin P+20000 (scripts/dev-worktree.mjs — do not touch that scheme).
// Mongo sits at 40000+(P-10000), clear of all three server ports.
// Used by scripts/worktree-db.mjs, scripts/sanitize-worktree-env.mjs
// (--base-port) and wf (status.mjs, stacks.mjs, …).
import { execFileSync } from 'node:child_process';

export const MONGO_PORT_BASE = 40000;

// Pure: mongo host port for a wt base port P. Throws outside 10000-19999.
export function mongoPortForBase(basePort) {
	const p = Number(basePort);
	if (!Number.isInteger(p) || p < 10000 || p > 19999)
		throw new Error(`base port out of range 10000-19999: ${basePort}`);
	return MONGO_PORT_BASE + (p - 10000);
}

// wt is the source of truth for branch hashing; mirror nothing here.
const wtEval = (expr) => execFileSync('wt', ['step', 'eval', expr], { encoding: 'utf8' }).trim();

export function basePortForBranch(branch) {
	return Number(wtEval(`{{ "${branch}" | hash_port }}`));
}

export function slugForBranch(branch) {
	return wtEval(`{{ "${branch}" | sanitize }}`);
}

// Both values for many branches in one wt spawn: each `wt step eval` costs ~0.5s, and wf status
// asked twice per worktree (23 worktrees, 2026-09-23: 28s of a 15-30s status).
export function portsAndSlugsForBranches(branches) {
	if (!branches.length) return new Map();
	const lines = wtEval(branches.map((b) => `{{ "${b}" | hash_port }} {{ "${b}" | sanitize }}`).join('\n')).split(/\r?\n/);
	return new Map(branches.map((b, i) => {
		const [port, slug] = lines[i].trim().split(' ');
		return [b, { port: Number(port), slug }];
	}));
}

// Portless names: http://<slug>.<role>.jewelryx.localhost on the proxy's
// port 80 (--no-tls, plain HTTP). <slug> is {{ branch | sanitize }}, so wf
// derives the name without asking portless — portless's own worktree
// prefixing yields the branch's last segment only (measured 2026-09-22:
// branch tools/workflow-v2 → prefix workflow-v2 ≠ slug tools-workflow-v2),
// so callers pass the full dotted name via --name explicitly.
export function portlessOriginsForSlug(slug) {
	const s = String(slug);
	return {
		b2b: `http://${s}.b2b.jewelryx.localhost`,
		admin: `http://${s}.admin.jewelryx.localhost`,
		api: `http://${s}.api.jewelryx.localhost`,
	};
}
