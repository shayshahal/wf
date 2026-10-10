#!/usr/bin/env node
// status.ts — wf status [--json|--inspect]: one table row per git worktree:
// round · class · step · waiting_on · age · PR#/state · stack <url>|:port ✓|✗. waiting_on=shay first, marked ← YOU.
// `--inspect` adds, for each round, what is on it now (#114): the agreement, the in-flight diff
// (staged + unstaged + untracked), the last check evidence, the facts and the session/artifact refs.
// `wf status --all` is the morning screen instead: every worktree that holds a round,
// one line each, grouped waiting on you / running / held. No LLM, no network but `gh pr view`.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { questionLines } from './ask.ts';
import { agreementFile, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, assessmentHead, assessmentVerdict, verificationCases } from './agreement.ts';
import { seams } from '../seams.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { WF_ROOT } from '../paths.ts';
import { guidance as guidanceDir, name as projectName, stackUrls } from '../project.ts';
import { basePortForBranch, listWorktrees, portsAndSlugsForBranches, slugForBranch } from '../worktrees/worktree.ts';
import type { State } from './state.ts';

export type PullRequest = { headRefName: string; number: number; isDraft: boolean; reviewDecision: string | null; statusCheckRollup: { conclusion?: string; state?: string; status?: string }[] | null };
export type StatusRow = { path: string; state: State | null; pr: string; stack: { port: number; up: boolean; name: string | null } | null; processes?: number; inspect?: RoundInspect };
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

// Pure: how many of the processes' working folders (seams.processCwds) are the worktree or inside it.
// Folders compare with forward slashes and no trailing one, case-blind on Windows: git lists
// C:/Users/..., a process block holds C:\Users\...\.
export function processesIn(path: string, cwds: string[], caseBlind = process.platform === 'win32'): number {
  const norm = (p: string) => { const s = p.replace(/\\/g, '/').replace(/\/+$/, ''); return caseBlind ? s.toLowerCase() : s; };
  const root = norm(path);
  return cwds.filter((c) => { const n = norm(c); return n === root || n.startsWith(`${root}/`); }).length;
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
    // One round's broken state.json lists it without a state, not stops `wf status` for every round.
    return null;
  }
}

export function formatRow(r: StatusRow, now = Date.now()): string {
  const s = r.state;
  const stack = `${r.stack ? ` · stack ${r.stack.name ?? `:${r.stack.port}`} ${r.stack.up ? '✓' : '✗'}` : ''}${r.processes === undefined ? '' : ` · ${r.processes} procs`}`;
  if (!s) return `${r.path}  —${stack}`;
  const you = s.waiting_on === 'user' ? ` ${WF_YOU_MARKER}` : '';
  return `${s.round} · ${s.class ?? '—'} · ${s.step} · ${s.waiting_on ?? '—'} · ${formatAgeSince(s.since, now)} · ${r.pr}${stack}${you}`;
}

// ── what is on the round now: the inspect block ──────────────────────────────
// The round's own work, discoverable during implementation (`wf status --inspect`, #114): the working
// agreement, the in-flight diff (staged, unstaged and untracked — what the build has now, not only
// what it committed), the last check evidence, the recorded facts (assessment, blocked, questions,
// T1) and references to the session/artifacts/guidance. References, never copies: the agreement file
// and the session are named, not reproduced (DIRECTION, records). Pure: `git` is injected.
type GitRun = (args: string[]) => string;
export type PorcelainEntry = { status: string; path: string };
export type RoundInspect = {
  agreement: { file: string; sha: string | null; exists: boolean };
  diff: { base: string | null; stat: string | null; files: PorcelainEntry[] };
  evidence: { row: string | number | null; result: string; content?: string } | null;
  facts: {
    assessment: { verdict: string | null; head: string | null } | null;
    blocked: boolean;
    questions: { n: number; to: string; text: string }[];
    t1: { sha: string | null; reviewed: string | null; verdict: string | null };
    decisions: { text: string; at: string }[];
  };
  refs: { session: State['session'] | null; artifacts: string[]; guidance: string[] };
};

// Pure: `git status --porcelain` as entries. The first two columns are the index and worktree codes
// (`M ` staged, ` M` unstaged, `MM` both, `??` untracked, `R ` renamed), so one list is the whole
// in-flight change, committed or not. A rename lists `old -> new`; the new path is the file.
export function porcelainEntries(out: string): PorcelainEntry[] {
  return out.split('\n').filter((l) => l.length > 2).map((l) => {
    const status = l.slice(0, 2).trim() || '??';
    const rest = l.slice(3);
    const arrow = rest.indexOf(' -> ');
    const path = (arrow === -1 ? rest : rest.slice(arrow + 4)).replace(/^"|"$/g, '').trim();
    return { status, path };
  });
}

// Pure: the trailing summary line of `git diff --stat`, or null when there is no diff.
export const lastStatLine = (out: string): string | null => out.split('\n').map((s) => s.trim()).filter(Boolean).at(-1) ?? null;

// Pure: the last check a round ran — every checks.log line but the whole-suite measurement, which is
// not a case (`friction.ts`). Reads the last parsed line, so a line cut off mid-write is skipped.
export function lastEvidence(checksLog: string): RoundInspect['evidence'] {
  for (const line of checksLog.split('\n').reverse()) {
    if (!line.trim()) continue;
    try {
      const c = JSON.parse(line) as { row?: string | number | null; result?: unknown; content?: unknown };
      return { row: c.row ?? null, result: String(c.result ?? ''), ...(c.content ? { content: String(c.content) } : {}) };
    } catch { /* a line cut off mid-write: skipped, the earlier one is the round's */ }
  }
  return null;
}

export function inspectRound({ path, state, git, guidance = [], wfRoot = WF_ROOT }: { path: string; state: State; git: GitRun; guidance?: string[]; wfRoot?: string }): RoundInspect {
  const klass = state.class ?? null;
  const folder = state.folder ?? '';
  const agreementName = agreementFile(klass);
  const agreement = { file: [folder, agreementName].filter(Boolean).join('/'), sha: agreementSha(path, klass, state.folder ?? null), exists: existsSync(agreementPath(path, klass, state.folder ?? null)) };
  const base = state.base ?? null;
  let diff: RoundInspect['diff'] = { base, stat: null, files: [] };
  try {
    diff = { base, stat: lastStatLine(git(['diff', '--stat', base ?? 'HEAD'])), files: porcelainEntries(git(['status', '--porcelain'])) };
  } catch { /* git cannot read this worktree: the facts and references below are still the round's */ }
  const checksLog = (() => { try { return readFileSync(join(path, '.wf', 'checks.log'), 'utf8'); } catch { /* no checks run here: the inspect block says evidence: none */ return ''; } })();
  const assessmentText = (() => { try { return readFileSync(join(path, folder, ASSESSMENT_FILE), 'utf8'); } catch { /* no assessment yet: facts.assessment is null */ return null; } })();
  const reviewText = (() => { try { return readFileSync(join(path, folder, AGREEMENT_REVIEW_FILE), 'utf8'); } catch { /* T1 has not run: its fields read as null */ return null; } })();
  const artifacts = (() => { try { return readdirSync(join(path, folder)).filter((f) => f.endsWith('.html')).sort(); } catch { /* no round folder (or none of it readable): no artifacts to reference */ return []; } })();
  return {
    agreement,
    diff,
    evidence: lastEvidence(checksLog),
    facts: {
      assessment: assessmentText ? { verdict: assessmentVerdict(assessmentText), head: assessmentHead(assessmentText) } : null,
      blocked: existsSync(join(path, folder, 'BLOCKED.md')),
      questions: (state.questions ?? []).map((q) => ({ n: q.n, to: q.to, text: q.text })),
      t1: { sha: agreement.sha, reviewed: lastField(reviewText ?? '', 'agreement-sha'), verdict: readVerdict(reviewText ?? '') },
      decisions: state.decisions ?? [],
    },
    refs: { session: state.session ?? null, artifacts, guidance: [...guidance, join(wfRoot, 'projects', projectName, 'ROUND.md')] },
  };
}

// Pure: the inspect block for a person. One line per fact, references as paths.
export function formatInspect(i: RoundInspect): string {
  const out: string[] = [];
  out.push(`  agreement: ${i.agreement.file}${i.agreement.exists ? '' : ' (absent)'}${i.agreement.sha ? ` · sha ${i.agreement.sha.slice(0, 12)}` : ''}`);
  const changes = i.diff.files.map((f) => `${f.status} ${f.path}`);
  out.push(`  diff: ${i.diff.files.length} entr${i.diff.files.length === 1 ? 'y' : 'ies'} vs ${i.diff.base ?? 'HEAD'}${changes.length ? '' : ' (clean)'}`);
  for (const c of changes.slice(0, 20)) out.push(`      ${c}`);
  if (changes.length > 20) out.push(`      … ${changes.length - 20} more`);
  if (i.diff.stat) out.push(`      ${i.diff.stat}`);
  out.push(`  evidence: ${i.evidence ? `row ${i.evidence.row ?? '?'} ${i.evidence.result}${i.evidence.content ? ` · ${i.evidence.content}` : ''}` : 'none'}`);
  const a = i.facts.assessment;
  out.push(`  facts: ${a ? `assessment ${a.verdict ?? '?'} (head ${a.head ? a.head.slice(0, 10) : '?'})` : 'no assessment'}${i.facts.blocked ? ' · blocked' : ''} · ${i.facts.questions.length} open question${i.facts.questions.length === 1 ? '' : 's'}${i.facts.t1.reviewed ? ` · T1 ${i.facts.t1.verdict ?? 'pending'}` : ''}`);
  // The local feedback `wf decide` recorded: a person reading (or a resumed session) sees it here as
  // well as in the build brief (`wf brief`), so a correction does not need the agreement opened.
  for (const d of i.facts.decisions) out.push(`  decision: ${d.at.slice(0, 10)} ${d.text}`);
  const s = i.refs.session;
  out.push(`  refs: session ${s ? `${s.harness} ${s.id.slice(0, 12)}${s.transcript ? ` (${s.transcript})` : ''} at ${s.step ?? '?'}` : 'none'} · ${i.refs.artifacts.length} artifact${i.refs.artifacts.length === 1 ? '' : 's'} · guidance ${i.refs.guidance.join(', ')}`);
  return out.join('\n');
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

// agree → how long the agreement is and its verification cases · build → the last commit · review → the PR url.
export function realDetailFor(path: string, state: State): string {
  const agreement = state.folder ? agreementPath(path, state.class ?? null, state.folder) : null;
  const lines = agreement && existsSync(agreement) ? readFileSync(agreement, 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n') : null;
  if (state.step === 'agree') return lines ? `${agreement!.split(/[\\/]/).pop()} ${lines.length} lines` : 'no agreement yet';
  if (state.step === 'build') {
    const total = lines ? verificationCases(lines.join('\n')).length : 0;
    return `${total} verification case${total === 1 ? '' : 's'}`;
  }
  if (state.step === 'review' || state.step === 'pr') {
    const pr = spawnSync('gh', ['pr', 'view', '--json', 'url'], { cwd: path, encoding: 'utf8' });
    return pr.status === 0 ? (JSON.parse(pr.stdout) as { url: string }).url : 'no PR';
  }
  return '';
}

export async function runStatus(argv: string[], inject: { paths?: string[]; readState?: ReadState; detailFor?: DetailFor; now?: number; pullRequests?: PullRequest[]; basePortFor?: BasePortFor; probeStack?: ProbeStack; slugFor?: SlugFor; cwds?: string[] | null; git?: (path: string, args: string[]) => string } = {}): Promise<void> {
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
    // --no-pr: no `gh` call, for a caller that polls (a sidebar every few seconds).
    pullRequests: inject.pullRequests ?? (argv.includes('--no-pr') ? [] : realPrs()),
    now: inject.now ?? Date.now(),
    basePortFor: inject.basePortFor ?? ((b: string) => known.get(b)?.port ?? basePortForBranch(b)),
    probeStack: inject.probeStack ?? realProbeStack,
    slugFor: inject.slugFor ?? ((b: string) => known.get(b)?.slug ?? slugForBranch(b)),
  });
  const cwds = inject.cwds !== undefined ? inject.cwds : seams.processCwds?.() ?? null;
  if (cwds) for (const r of rows) r.processes = processesIn(r.path, cwds);
  if (argv.includes('--inspect')) {
    const git = inject.git ?? ((path: string, args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }));
    const guidance = [guidanceDir, 'AGENTS.md'];
    for (const r of rows) if (r.state) r.inspect = inspectRound({ path: r.path, state: r.state, git: (args) => git(r.path, args), guidance });
  }
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) console.log(argv.includes('--inspect') && r.inspect ? `${formatRow(r, inject.now)}\n${formatInspect(r.inspect)}` : formatRow(r, inject.now));
}
