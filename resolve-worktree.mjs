// resolve-worktree.mjs — resolve a round/branch/dir-name/abs-path to { path, branch }
// via `git worktree list --porcelain`. Throws listing candidates when ambiguous/missing.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
export function listWorktrees() {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  return out.split('\n\n').flatMap((block) => {
    const w = (block.match(/^worktree (.+)$/m) || [])[1];
    return w ? [{ path: w.trim(), branch: ((block.match(/^branch refs\/heads\/(.+)$/m) || [])[1] ?? null) }] : [];
  });
}
export function resolveWorktree(name) {
  const trees = listWorktrees();
  const n = norm(String(name));
  const abs = /^[a-zA-Z]:\//.test(n) || n.startsWith('/');
  const hits = trees.filter((t) => (abs ? norm(t.path) === n : t.branch === n || basename(norm(t.path)) === n));
  if (hits.length === 1) return hits[0];
  const cands = trees.map((t) => `  ${t.branch ?? '(detached)'}  ${t.path}`).join('\n');
  throw new Error(`${hits.length ? `ambiguous "${name}"` : `no worktree for "${name}"`} — candidates:\n${cands}`);
}
