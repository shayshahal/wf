#!/usr/bin/env node
// status.mjs — wf status [--json]: one table row per git worktree:
// round · class · step · waiting_on · age · PR#/state · b2b :port ✓|✗. waiting_on=shay first, marked ← YOU.
// `wf status --all` is the morning screen instead: every worktree that holds a round,
// one line each, grouped waiting on you / running / held. No LLM, no network but `gh pr view`.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePortForBranch, portlessOriginsForSlug, portsAndSlugsForBranches, slugForBranch } from '../../scripts/worktree-ports.mjs';

export const WF_YOU_MARKER = '← YOU';

export function formatAgeSince(since, now = Date.now()) {
  const m = Math.max(0, Math.round((now - Date.parse(since)) / 60000));
  if (!Number.isFinite(m)) return '-';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function prLabel(pr) {
  if (!pr) return '-';
  let s = `#${pr.number}`;
  if (pr.isDraft) s += ' draft';
  else if (pr.reviewDecision && pr.reviewDecision !== 'REVIEW_REQUIRED') s += ` ${pr.reviewDecision.toLowerCase()}`;
  const checks = pr.statusCheckRollup ?? [];
  if (checks.some((c) => c.conclusion === 'FAILURE' || c.state === 'FAILURE')) s += ' ✗ci';
  else if (checks.some((c) => c.status === 'IN_PROGRESS' || c.state === 'PENDING')) s += ' …ci';
  return s;
}

// Pure core: rows from injected worktree paths, state reader and open-PRs list.
// `readState(path)` returns the parsed state.json or null; `pullRequests` is the gh array or [].
// `basePortFor(branch)` maps a round to its wt base port; `probeB2b(port)` reports server-up.
// Both are injected so the selfcheck stays offline (real impls below). A failing probe is ✗, never fatal.
export async function collectRows({ paths, readState, pullRequests = [], now = Date.now(), basePortFor = null, probeB2b = null, slugFor = null }) {
  const rows = [];
  for (const path of paths) {
    const state = readState(path);
    const pr = pullRequests.find((p) => p.headRefName === state?.round || branchOf(path) === p.headRefName);
    let b2b = null;
    const branch = state?.round ?? branchOf(path);
    if (branch && basePortFor && probeB2b) {
      try {
        const port = await basePortFor(branch);
        const up = await probeB2b(port);
        // Display the portless name; the probe stays on the hashed port.
        const name = slugFor ? portlessOriginsForSlug(await slugFor(branch)).b2b : null;
        b2b = { port, up, name };
      } catch { b2b = null; }
    }
    rows.push({ path, state, pr: pr ? prLabel(pr) : '-', b2b });
  }
  // waiting_on=shay first; within a group the longest-waiting first; stateless worktrees last.
  const ageMs = (r) => (r.state?.since ? now - Date.parse(r.state.since) : -Infinity);
  return rows.sort((a, b) => {
    const ay = a.state?.waiting_on === 'shay' ? 0 : 1;
    const by = b.state?.waiting_on === 'shay' ? 0 : 1;
    return ay - by || ageMs(b) - ageMs(a);
  });
}

// Branch name = last path segment is wrong for detached worktrees; read the real one lazily.
const branches = new Map();
function branchOf(path) {
  if (!branches.has(path)) {
    try {
      branches.set(path, execFileSync('git', ['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    } catch {
      branches.set(path, null);
    }
  }
  return branches.get(path);
}

export function realWorktrees() {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  // The porcelain already names each branch: seed branchOf, which spawned git once per worktree.
  for (const block of out.replace(/\r\n/g, '\n').split('\n\n')) {
    const path = /^worktree (.+)$/m.exec(block)?.[1]?.trim();
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? (/^detached$/m.test(block) ? 'HEAD' : null);
    if (path && branch) branches.set(path, branch); // the bare entry has neither: branchOf asks git, as before
  }
  return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
}

export function realPrs() {
  try {
    return JSON.parse(execFileSync('gh', ['pr', 'list', '--json', 'headRefName,number,isDraft,reviewDecision,statusCheckRollup', '--state', 'open'], { encoding: 'utf8' }));
  } catch {
    return []; // gh missing or unauthenticated → column shows '-'
  }
}

export function realReadState(path) {
  const f = join(path, '.wf', 'state.json');
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

export function formatRow(r, now = Date.now()) {
  const s = r.state;
  const b2b = r.b2b ? ` · b2b ${r.b2b.name ?? `:${r.b2b.port}`} ${r.b2b.up ? '✓' : '✗'}` : '';
  if (!s) return `${r.path}  —${b2b}`;
  const you = s.waiting_on === 'shay' ? ` ${WF_YOU_MARKER}` : '';
  return `${s.round} · ${s.class ?? '—'} · ${s.step} · ${s.waiting_on ?? '—'} · ${formatAgeSince(s.since, now)} · ${r.pr}${b2b}${you}`;
}

// 1-second HEAD probe of the worktree's b2b server. Any answer (even 5xx) is up; only refusal/timeout is down.
export async function realProbeB2b(port) {
  try {
    await fetch(`http://localhost:${port}/`, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

// --- wf status --all ---------------------------------------------------------

// Pure: the grouped morning screen. `detailFor(path, state)` is the one-line tail.
export function allLines({ paths, readState, detailFor, now = Date.now() }) {
  const groups = { 'waiting on you': [], running: [], held: [] };
  const rounds = paths.map((p) => ({ path: p, state: readState(p) })).filter((r) => r.state);
  for (const { path, state } of rounds) {
    const group = state.step === 'held' ? 'held' : state.waiting_on === 'shay' ? 'waiting on you' : 'running';
    const cells = [state.id ?? state.round, state.step, state.waiting_on ?? 'running', formatAgeSince(state.since, now), detailFor(path, state) ?? ''];
    groups[group].push(cells.join('  ').trimEnd());
  }
  const out = [];
  for (const [name, lines] of Object.entries(groups)) {
    if (!lines.length) continue;
    out.push(`${name}:`, ...lines.sort().map((l) => `  ${l}`));
  }
  return out;
}

// Rounds that still hold a worktree — `wf new` refuses a third one.
export function liveRounds({ paths, readState }) {
  return paths.map((p) => ({ path: p, state: readState(p) })).filter((r) => r.state && !['merged', 'held'].includes(r.state.step));
}

// plan → how long PLAN.md is · implement → which commit of how many · review → the PR url.
export function realDetailFor(path, state) {
  const plan = state.folder ? join(path, state.folder, 'PLAN.md') : null;
  const rows = plan && existsSync(plan) ? readFileSync(plan, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n') : null;
  if (state.step === 'plan') return rows ? `PLAN.md ${rows.length} lines` : 'no PLAN.md yet';
  if (state.step === 'implement') {
    const total = rows ? rows.filter((l) => /^\|\s*\d+\s*\|/.test(l)).length : '?';
    return `commit ${state.commit ?? '?'} of ${total}`;
  }
  if (state.step === 'review' || state.step === 'pr') {
    const pr = spawnSync('gh', ['pr', 'view', '--json', 'url'], { cwd: path, encoding: 'utf8' });
    return pr.status === 0 ? JSON.parse(pr.stdout).url : 'no PR';
  }
  return '';
}

export async function runStatus(argv, inject = {}) {
  const paths = inject.paths ?? realWorktrees();
  if (argv.includes('--all')) {
    const lines = allLines({ paths, readState: inject.readState ?? realReadState, detailFor: inject.detailFor ?? realDetailFor, now: inject.now ?? Date.now() });
    console.log(lines.length ? lines.join('\n') : 'no rounds');
    return;
  }
  const readState = inject.readState ?? realReadState;
  // One wt spawn for every worktree's port and slug, not two per worktree (portsAndSlugsForBranches).
  const known = inject.basePortFor ? new Map() : portsAndSlugsForBranches([...new Set(paths.map((p) => readState(p)?.round ?? branchOf(p)).filter(Boolean))]);
  const rows = await collectRows({
    paths,
    readState,
    pullRequests: inject.pullRequests ?? realPrs(),
    now: inject.now ?? Date.now(),
    basePortFor: inject.basePortFor ?? ((b) => known.get(b)?.port ?? basePortForBranch(b)),
    probeB2b: inject.probeB2b ?? realProbeB2b,
    slugFor: inject.slugFor ?? ((b) => known.get(b)?.slug ?? slugForBranch(b)),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) console.log(formatRow(r, inject.now));
}
