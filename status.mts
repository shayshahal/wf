#!/usr/bin/env node
// status.mts — wf status [--json]: one table row per git worktree:
// round · class · step · waiting_on · age · PR#/state · stack <url>|:port ✓|✗. waiting_on=shay first, marked ← YOU.
// `wf status --all` is the morning screen instead: every worktree that holds a round,
// one line each, grouped waiting on you / running / held. No LLM, no network but `gh pr view`.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { questionLines } from './ask.mts';
import { stackUrls } from './project.mts';
import { basePortForBranch, listWorktrees, portsAndSlugsForBranches, slugForBranch } from './worktree.mts';
import type { State } from './state.mts';

export type PullRequest = { headRefName: string; number: number; isDraft: boolean; reviewDecision: string | null; statusCheckRollup: { conclusion?: string; state?: string; status?: string }[] | null };
export type StatusRow = { path: string; state: State | null; pr: string; stack: { port: number; up: boolean; name: string | null } | null };
type ReadState = (path: string) => State | null;
type DetailFor = (path: string, state: State) => string | null | undefined;
type BasePortFor = (branch: string) => number | Promise<number>;
type ProbeStack = (port: number) => boolean | Promise<boolean>;
type SlugFor = (branch: string) => string | Promise<string>;

export const WF_YOU_MARKER = '← YOU';

export function formatAgeSince(since: string | undefined, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(since as string)) / 60000));
  if (!Number.isFinite(m)) return '-';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function prLabel(pr: PullRequest | null | undefined): string {
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
// `basePortFor(branch)` maps a round to its wt base port; `probeStack(port)` reports server-up.
// Both are injected so the selfcheck stays offline (real impls below). A failing probe is ✗, never fatal.
export async function collectRows({ paths, readState, pullRequests = [], now = Date.now(), basePortFor = null, probeStack = null, slugFor = null }: { paths: string[]; readState: ReadState; pullRequests?: PullRequest[]; now?: number; basePortFor?: BasePortFor | null; probeStack?: ProbeStack | null; slugFor?: SlugFor | null }): Promise<StatusRow[]> {
  const rows: StatusRow[] = [];
  for (const path of paths) {
    const state = readState(path);
    const pr = pullRequests.find((p) => p.headRefName === state?.round || branchOf(path) === p.headRefName);
    let stack: StatusRow['stack'] = null;
    const branch = state?.round ?? branchOf(path);
    if (branch && basePortFor && probeStack) {
      try {
        const port = await basePortFor(branch);
        const up = await probeStack(port);
        // Display the first app's name (the one on the base port); the probe stays on the port.
        const name = slugFor ? Object.values(stackUrls({ slug: await slugFor(branch), port }))[0] : null;
        stack = { port, up, name };
      } catch { stack = null; }
    }
    rows.push({ path, state, pr: pr ? prLabel(pr) : '-', stack });
  }
  // waiting_on=shay first; within a group the longest-waiting first; stateless worktrees last.
  const ageMs = (r: StatusRow) => (r.state?.since ? now - Date.parse(r.state.since) : -Infinity);
  return rows.sort((a, b) => {
    const ay = a.state?.waiting_on === 'user' ? 0 : 1;
    const by = b.state?.waiting_on === 'user' ? 0 : 1;
    return ay - by || ageMs(b) - ageMs(a);
  });
}

// Branch name = last path segment is wrong for detached worktrees; read the real one lazily.
const branches = new Map<string, string | null>();
function branchOf(path: string): string | null | undefined {
  if (!branches.has(path)) {
    try {
      branches.set(path, execFileSync('git', ['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    } catch {
      branches.set(path, null);
    }
  }
  return branches.get(path);
}

// The bare repository is listed by git but holds no checkout: no round, no stack (it showed as a row
// probing whichever branch HEAD named, 2026-09-24).
export function realWorktrees(): string[] {
  const trees = listWorktrees().filter((t) => !t.bare);
  // The list already names each branch: seed branchOf, which spawned git once per worktree.
  for (const t of trees) {
    const branch = t.branch ?? (t.detached ? 'HEAD' : null);
    if (branch) branches.set(t.path, branch);
  }
  return trees.map((t) => t.path);
}

export function realPrs(): PullRequest[] {
  try {
    return JSON.parse(execFileSync('gh', ['pr', 'list', '--json', 'headRefName,number,isDraft,reviewDecision,statusCheckRollup', '--state', 'open'], { encoding: 'utf8' })) as PullRequest[];
  } catch {
    return []; // gh missing or unauthenticated → column shows '-'
  }
}

export function realReadState(path: string): State | null {
  const f = join(path, '.wf', 'state.json');
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as State;
  } catch {
    return null;
  }
}

export function formatRow(r: StatusRow, now = Date.now()): string {
  const s = r.state;
  const stack = r.stack ? ` · stack ${r.stack.name ?? `:${r.stack.port}`} ${r.stack.up ? '✓' : '✗'}` : '';
  if (!s) return `${r.path}  —${stack}`;
  const you = s.waiting_on === 'user' ? ` ${WF_YOU_MARKER}` : '';
  return `${s.round} · ${s.class ?? '—'} · ${s.step} · ${s.waiting_on ?? '—'} · ${formatAgeSince(s.since, now)} · ${r.pr}${stack}${you}`;
}

// 1-second HEAD probe of the server on the worktree's base port. Any answer (even 5xx) is up; only refusal/timeout is down.
export async function realProbeStack(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/`, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

// --- wf status --all ---------------------------------------------------------

// Pure: the grouped morning screen. `detailFor(path, state)` is the one-line tail.
export function allLines({ paths, readState, detailFor, now = Date.now() }: { paths: string[]; readState: ReadState; detailFor: DetailFor; now?: number }): string[] {
  const groups: Record<'waiting on you' | 'running' | 'held', { line: string; questions: string[] }[]> = { 'waiting on you': [], running: [], held: [] };
  const rounds = paths.map((p) => ({ path: p, state: readState(p) })).filter((r) => r.state) as { path: string; state: State }[];
  for (const { path, state } of rounds) {
    const group = state.step === 'held' ? 'held' : state.waiting_on === 'user' ? 'waiting on you' : 'running';
    const cells = [state.id ?? state.round, state.step, state.waiting_on ?? 'running', formatAgeSince(state.since, now), detailFor(path, state) ?? ''];
    // Open questions (wf ask) under their round: what the round waits for, not only on whom.
    groups[group].push({ line: cells.join('  ').trimEnd(), questions: questionLines(state) });
  }
  const out: string[] = [];
  for (const [name, lines] of Object.entries(groups)) {
    if (!lines.length) continue;
    lines.sort((a, b) => (a.line < b.line ? -1 : a.line > b.line ? 1 : 0));
    out.push(`${name}:`, ...lines.flatMap((l) => [`  ${l.line}`, ...l.questions.map((q) => `      ${q}`)]));
  }
  return out;
}

// Rounds that still hold a worktree — `wf new` refuses a third one.
export function liveRounds({ paths, readState }: { paths: string[]; readState: ReadState }): { path: string; state: State }[] {
  return paths.map((p) => ({ path: p, state: readState(p) })).filter((r) => r.state && !(['merged', 'held'] as (string | undefined)[]).includes(r.state.step)) as { path: string; state: State }[];
}

// plan → how long PLAN.md is · implement → which commit of how many · review → the PR url.
export function realDetailFor(path: string, state: State): string {
  const plan = state.folder ? join(path, state.folder, 'PLAN.md') : null;
  const rows = plan && existsSync(plan) ? readFileSync(plan, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n') : null;
  if (state.step === 'plan') return rows ? `PLAN.md ${rows.length} lines` : 'no PLAN.md yet';
  if (state.step === 'implement') {
    const total = rows ? rows.filter((l) => /^\|\s*\d+\s*\|/.test(l)).length : '?';
    return `commit ${state.commit ?? '?'} of ${total}`;
  }
  if (state.step === 'review' || state.step === 'pr') {
    const pr = spawnSync('gh', ['pr', 'view', '--json', 'url'], { cwd: path, encoding: 'utf8' });
    return pr.status === 0 ? (JSON.parse(pr.stdout) as { url: string }).url : 'no PR';
  }
  return '';
}

export async function runStatus(argv: string[], inject: { paths?: string[]; readState?: ReadState; detailFor?: DetailFor; now?: number; pullRequests?: PullRequest[]; basePortFor?: BasePortFor; probeStack?: ProbeStack; slugFor?: SlugFor } = {}): Promise<void> {
  const paths = inject.paths ?? realWorktrees();
  if (argv.includes('--all')) {
    const lines = allLines({ paths, readState: inject.readState ?? realReadState, detailFor: inject.detailFor ?? realDetailFor, now: inject.now ?? Date.now() });
    console.log(lines.length ? lines.join('\n') : 'no rounds');
    return;
  }
  const readState = inject.readState ?? realReadState;
  // Every worktree's port and slug in one pass (portsAndSlugsForBranches).
  const known = inject.basePortFor ? new Map<string, { port: number; slug: string }>() : portsAndSlugsForBranches([...new Set(paths.map((p) => readState(p)?.round ?? branchOf(p)).filter(Boolean) as string[])]);
  const rows = await collectRows({
    paths,
    readState,
    pullRequests: inject.pullRequests ?? realPrs(),
    now: inject.now ?? Date.now(),
    basePortFor: inject.basePortFor ?? ((b: string) => known.get(b)?.port ?? basePortForBranch(b)),
    probeStack: inject.probeStack ?? realProbeStack,
    slugFor: inject.slugFor ?? ((b: string) => known.get(b)?.slug ?? slugForBranch(b)),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) console.log(formatRow(r, inject.now));
}
