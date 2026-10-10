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
import { agreementFile, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, assessmentHead, assessmentVerdict, consequential, REVIEW_FILE, verificationCases } from './agreement.ts';
import { seams } from '../seams.ts';
import { approvalBinding, approvalContentGap, lastField, readVerdict } from '../gates/review-format.ts';
import { approvalIdentity, trackerNotePath, worktreeContentSha } from '../gates/content-identity.ts';
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
// T1, T2) and references to the session/artifacts/guidance. References, never copies: the agreement
// file and the session are named, not reproduced (DIRECTION, records). Pure: `git` and the content
// identity are injected; the reason strings are wf's own, never git's raw stderr.
type GitRun = (args: string[]) => string;
// `status` is git's exact two-column XY (`M ` staged, ` M` unstaged, `MM` both, `??` untracked,
// `R ` renamed), never trimmed: staged and unstaged must stay distinguishable (2026-10-10 review,
// r9-final-edges).
export type PorcelainEntry = { status: string; path: string };
// One entry in the round's diff: a worktree change (porcelain's XY, vs HEAD) or a committed change
// with no worktree change (`committed: true`, git's name-status letter, vs the round's base). The
// committed half is what porcelain alone never lists (#114 closure, F3).
export type DiffEntry = PorcelainEntry & { committed?: true };
// One `wf check` line: `row` is a case number or `'suites'`/`'repro'`; `content` is the row-scope
// identity the run measured (content-identity.ts), what a binding compares the tree against.
export type EvidenceLine = { row: string | number | null; result: string; content?: string };
// Whether a case line's recorded content still names the worktree: `unknown` when it recorded none
// or git cannot recompute it — an unverifiable binding is never shown as fresh or stale.
export type EvidenceBinding = 'current' | 'stale' | 'unknown';
// T1's record against the agreement as it now stands. `required` is true for a B/C round, whose build
// gate is T1 (step.ts t1Gap); an A round has none to show.
export type T1Fact = { sha: string | null; reviewed: string | null; verdict: string | null; required: boolean };
// T2's verdict and the identity it approved, with whether that identity is still this tree (`fresh`
// null = the binding could not be recomputed). Null when the round has no REVIEW.md.
export type T2Fact = { verdict: string | null; contentSha: string | null; headSha: string | null; fresh: boolean | null };
export type RoundInspect = {
  agreement: { file: string; sha: string | null; exists: boolean };
  // `files` null = git could not read the worktree (UNKNOWN, never an empty-as-clean list); it is the
  // whole base..worktree change set — committed (name-status vs base) + staged + unstaged + untracked
  // — so a clean worktree ahead of base is not shown as `(clean)` (#114 closure, F3). `error` and
  // `statError` are wf's own reasons, one per attempt, so a base git cannot resolve never drops the
  // listing and never claims clean (2026-10-10 review, P1-1).
  diff: { base: string | null; stat: string | null; files: DiffEntry[] | null; error: string | null; statError: string | null };
  evidence: { case: EvidenceLine | null; suites: EvidenceLine | null; binding: EvidenceBinding };
  facts: {
    assessment: { verdict: string | null; head: string | null } | null;
    blocked: boolean;
    questions: { n: number; to: string; text: string }[];
    t1: T1Fact;
    t2: T2Fact | null;
    decisions: { text: string; at: string }[];
  };
  // `openedBy` is `state.opened_by`, the opener `wf new` recorded (seams.opener), as the reference a
  // reader can follow; null when nobody was recorded (#114 closure, F4).
  refs: { session: State['session'] | null; openedBy: Record<string, string> | null; artifacts: string[]; guidance: string[] };
};

// Pure: `git status --porcelain -z` as entries. The `-z` contract is one NUL-separated record per
// file (`XY<space>path`), so a Hebrew, spaced or otherwise special path arrives as its real bytes —
// `-z` never quotes (git's default `core.quotePath` octal-escapes every byte ≥ 0x80). A rename/copy
// record carries its original path as the next field, which is skipped; the new path is the file.
export function porcelainEntries(out: string): PorcelainEntry[] {
  const fields = out.split('\0');
  const entries: PorcelainEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    if (rec.length < 3) continue; // the trailing empty field, or a record too short to hold `XY `
    const status = rec.slice(0, 2);
    entries.push({ status, path: rec.slice(3) });
    if (status[0] === 'R' || status[0] === 'C') i++; // its original path is the next NUL field
  }
  return entries;
}

// Pure: the committed half of the round's diff, `git diff --name-status -z <base> HEAD` as entries.
// `-z` never quotes, so a Hebrew/spaced/renamed path arrives as its real bytes; a rename/copy record
// carries its original path before its destination, which is skipped. The status is git's name-status
// letter (`M`, `A`, `D`, `R100`) from the base, which porcelain (vs HEAD) cannot see.
export function nameStatusEntries(out: string): DiffEntry[] {
  const fields = out.split('\0');
  const entries: DiffEntry[] = [];
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i];
    if (!/^[A-Z]\d*$/.test(status)) continue;
    if (status[0] === 'R' || status[0] === 'C') {
      const dest = fields[i + 2];
      if (dest === undefined) continue;
      entries.push({ status, path: dest, committed: true });
      i += 2;
    } else {
      const path = fields[i + 1];
      if (path === undefined) continue;
      entries.push({ status, path, committed: true });
      i++;
    }
  }
  return entries;
}

// Pure: the trailing summary line of `git diff --stat`, or null when there is no diff.
export const lastStatLine = (out: string): string | null => out.split('\n').map((s) => s.trim()).filter(Boolean).at(-1) ?? null;

// Pure: the round's last check evidence, the last case line and the last whole-suite measurement read
// separately. A `suites` line is not a case (`friction.ts`), and since `wf check --suites` is the
// build's normal last line (67a4c14), the last case would otherwise hide behind it. Each kind reads
// its last parseable line, so a line cut off mid-write is skipped.
export function lastEvidence(checksLog: string): { case: EvidenceLine | null; suites: EvidenceLine | null } {
  let caseLine: EvidenceLine | null = null;
  let suitesLine: EvidenceLine | null = null;
  for (const line of checksLog.split('\n').reverse()) {
    if (!line.trim()) continue;
    let c: { row?: string | number | null; result?: unknown; content?: unknown };
    try {
      c = JSON.parse(line) as typeof c;
    } catch {
      continue; // a line cut off mid-write: skipped, the earlier one is the round's
    }
    if (typeof c !== 'object' || c === null) continue;
    const ev: EvidenceLine = { row: c.row ?? null, result: String(c.result ?? ''), ...(c.content ? { content: String(c.content) } : {}) };
    if (c.row === 'suites') suitesLine ??= ev;
    else if (c.row !== 'repro') caseLine ??= ev;
    if (caseLine && suitesLine) break;
  }
  return { case: caseLine, suites: suitesLine };
}

// The implementation identity a check's green was measured over: `wf check`'s own row scope
// (content-identity.ts), so a binding compares the tree with the producer that wrote it, never a
// second hash that could drift. Injected so the selfcheck stays offline.
type EvidenceIdentity = (toplevel: string, folder: string | null) => string;
const checkRowIdentity: EvidenceIdentity = (toplevel, folder) => worktreeContentSha(toplevel, folder, null, 'row');

// Pure: whether the case line's recorded content still names the worktree. `unknown` when the line
// recorded no content or the identity could not be recomputed — never a fabricated fresh or stale.
export function evidenceBinding(caseLine: EvidenceLine | null, current: string | null): EvidenceBinding {
  if (!caseLine?.content) return 'unknown';
  if (current === null) return 'unknown';
  return current === caseLine.content ? 'current' : 'stale';
}

// Run one git read; a failure is null, not an empty result. The reason the caller reports is its own
// (`could not resolve base`, `could not read this worktree`), so git's stderr never reaches a reader.
function attempt(run: () => string): string | null {
  try {
    return run();
  } catch {
    // git could not answer (no git, an unreadable worktree, or a base it cannot resolve): null is
    // read as UNKNOWN by the caller, never as an empty list or a clean tree.
    return null;
  }
}

export function inspectRound({ path, state, git, guidance = [], wfRoot = WF_ROOT, identity = checkRowIdentity }: { path: string; state: State; git: GitRun; guidance?: string[]; wfRoot?: string; identity?: EvidenceIdentity }): RoundInspect {
  const klass = state.class ?? null;
  const folder = state.folder ?? '';
  const agreementName = agreementFile(klass);
  const agreement = { file: [folder, agreementName].filter(Boolean).join('/'), sha: agreementSha(path, klass, state.folder ?? null), exists: existsSync(agreementPath(path, klass, state.folder ?? null)) };
  const base = state.base ?? null;
  // Three independent attempts: a base git cannot resolve must not take the worktree listing with it.
  const statusOut = attempt(() => git(['status', '--porcelain', '-z']));
  const statOut = attempt(() => git(['diff', '--stat', base ?? 'HEAD']));
  // The committed set (base..HEAD): porcelain is vs HEAD, so without this a clean worktree ahead of
  // base had 0 entries beside a non-empty stat, reading as no diff (#114 closure, F3).
  const nameStatusOut = attempt(() => git(['diff', '--name-status', '-z', base ?? 'HEAD', 'HEAD']));
  const working = statusOut === null ? null : porcelainEntries(statusOut);
  const committed = nameStatusOut === null ? [] : nameStatusEntries(nameStatusOut);
  // A file carries its worktree XY when it has one; only a committed-only file is added.
  const files = working === null ? null : [...committed.filter((c) => !working.some((w) => w.path === c.path)), ...working];
  const diff: RoundInspect['diff'] = {
    base,
    stat: statOut === null ? null : lastStatLine(statOut),
    files,
    error: files === null ? 'git could not read this worktree' : null,
    statError: statOut === null ? `could not resolve base ${base ?? 'HEAD'}` : null,
  };
  const checksLog = (() => { try { return readFileSync(join(path, '.wf', 'checks.log'), 'utf8'); } catch { /* no checks run here: the inspect block says evidence: none */ return ''; } })();
  const assessmentText = (() => { try { return readFileSync(join(path, folder, ASSESSMENT_FILE), 'utf8'); } catch { /* no assessment yet: facts.assessment is null */ return null; } })();
  const reviewText = (() => { try { return readFileSync(join(path, folder, AGREEMENT_REVIEW_FILE), 'utf8'); } catch { /* T1 has not run: its fields read as null */ return null; } })();
  const t2Text = (() => { try { return readFileSync(join(path, folder, REVIEW_FILE), 'utf8'); } catch { /* T2 has not run: facts.t2 is null */ return null; } })();
  // wf's own rendered pages, when they are there (the round folder's own HTML, then .wf/): an actual
  // file, never a promised one (2026-10-10 review, P3 artifacts).
  const artifacts = (() => {
    const round = (() => { try { return readdirSync(join(path, folder)).filter((f) => f.endsWith('.html')).sort(); } catch { /* no round folder (or none of it readable): no artifacts to reference */ return []; } })();
    const pages = ['.wf/AGREEMENT.html', '.wf/before-after.html'].filter((f) => existsSync(join(path, f)));
    return [...round, ...pages].sort();
  })();
  const evidence = lastEvidence(checksLog);
  const currentRow = evidence.case?.content ? attempt(() => identity(path, state.folder ?? null)) : null;
  return {
    agreement,
    diff,
    evidence: { ...evidence, binding: evidenceBinding(evidence.case, currentRow) },
    facts: {
      assessment: assessmentText ? { verdict: assessmentVerdict(assessmentText), head: assessmentHead(assessmentText) } : null,
      blocked: existsSync(join(path, folder, 'BLOCKED.md')),
      questions: (state.questions ?? []).map((q) => ({ n: q.n, to: q.to, text: q.text })),
      t1: { sha: agreement.sha, reviewed: lastField(reviewText ?? '', 'agreement-sha'), verdict: readVerdict(reviewText ?? ''), required: consequential(klass) },
      t2: t2Fact(t2Text, path, state.folder ?? null),
      decisions: state.decisions ?? [],
    },
    refs: { session: state.session ?? null, openedBy: state.opened_by ?? null, artifacts, guidance: [...guidance, join(wfRoot, 'projects', projectName, 'ROUND.md')] },
  };
}

// T2's verdict and the two identities it bound, with freshness from the same producer the deliver
// boundary uses (review-format.ts approvalContentGap over content-identity.ts): null when there is
// no REVIEW.md, `fresh` null when the binding is absent or cannot be recomputed (UNKNOWN).
function t2Fact(t2Text: string | null, path: string, folder: string | null): T2Fact | null {
  if (t2Text === null) return null;
  const binding = approvalBinding(t2Text);
  let fresh: boolean | null = null;
  if (binding.contentSha && binding.headSha) {
    try {
      fresh = approvalContentGap(t2Text, approvalIdentity(path, folder, trackerNotePath(folder))) === null;
    } catch {
      // git cannot recompute the approved identity: freshness reads UNKNOWN, not fresh or stale
      fresh = null;
    }
  }
  return { verdict: binding.verdict, contentSha: binding.contentSha, headSha: binding.headSha, fresh };
}

const shortSha = (sha: string) => sha.slice(0, 12);

// Pure: the T1 fact. `approved` only when the reviewed sha is the agreement's current material sha;
// a moved agreement, a non-approved verdict and a missing review each read as they are.
function t1Line(t1: T1Fact): string {
  if (!t1.reviewed && !t1.verdict && !t1.required) return '';
  if (!t1.reviewed) return ' · T1 MISSING';
  if (t1.reviewed !== t1.sha) return ` · T1 STALE (approved ${shortSha(t1.reviewed)}, agreement now ${t1.sha ? shortSha(t1.sha) : 'absent'})`;
  if (t1.verdict === 'approved') return ` · T1 approved (${shortSha(t1.sha!)})`;
  return ` · T1 ${t1.verdict ?? 'pending'}`;
}

// Pure: the T2 fact. `approved` carries whether the approved identity is still this tree; an
// unverifiable binding reads UNKNOWN, never a fabricated approved.
function t2Line(t2: T2Fact | null): string {
  if (!t2) return '';
  if (!t2.verdict) return ' · T2 pending';
  if (t2.verdict !== 'approved') return ` · T2 ${t2.verdict}`;
  if (t2.fresh === true) return ` · T2 approved (${t2.contentSha ? shortSha(t2.contentSha) : '?'})`;
  if (t2.fresh === false) return ' · T2 approved but STALE (tree moved since)';
  return ' · T2 approved (freshness UNKNOWN)';
}

// Pure: the evidence line. The last case and the last whole-suite run are named apart (a build ends
// with `wf check --suites`), and the case carries its binding: current, stale, or unknown when the
// line recorded no identity or git cannot recompute it.
function evidenceLine(e: RoundInspect['evidence']): string {
  const parts: string[] = [];
  if (e.case) parts.push(`case row ${e.case.row ?? '?'} ${e.case.result}${e.case.content ? ` · ${e.case.content}` : ''} · ${e.binding === 'current' ? 'current' : e.binding === 'stale' ? 'STALE (source changed since this run)' : 'UNKNOWN (no verifiable identity)'}`);
  if (e.suites) parts.push(`suites ${e.suites.result}`);
  return parts.length ? parts.join(' · ') : 'none';
}

// Pure: the inspect block for a person. One line per fact, references as paths.
export function formatInspect(i: RoundInspect): string {
  const out: string[] = [];
  out.push(`  agreement: ${i.agreement.file}${i.agreement.exists ? '' : ' (absent)'}${i.agreement.sha ? ` · sha ${i.agreement.sha.slice(0, 12)}` : ''}`);
  const d = i.diff;
  if (d.files === null) {
    // UNKNOWN, never an empty list: an unreadable worktree is not a clean one.
    out.push(`  diff: unknown${d.error ? ` — ${d.error}` : ''}`);
  } else {
    const n = d.files.length;
    const withCommitted = d.files.filter((f) => f.committed).length;
    const clean = n === 0 && !d.statError;
    // A committed-only change is not a clean worktree ahead of base; name the working tree's state
    // instead of reading the whole branch as empty (#114 closure, F3).
    const workingClean = !clean && n > 0 && withCommitted === n;
    out.push(`  diff: ${n} entr${n === 1 ? 'y' : 'ies'} vs ${d.base ?? 'HEAD'}${clean ? ' (clean)' : workingClean ? ' (working tree clean)' : ''}`);
    for (const f of d.files.slice(0, 20)) out.push(`      ${f.status} ${f.path}${f.committed ? ' (committed)' : ''}`);
    if (n > 20) out.push(`      … ${n - 20} more`);
    if (d.stat) out.push(`      ${d.stat}`);
    else if (d.statError) out.push(`      diff stat unavailable — ${d.statError}`);
  }
  out.push(`  evidence: ${evidenceLine(i.evidence)}`);
  const a = i.facts.assessment;
  out.push(`  facts: ${a ? `assessment ${a.verdict ?? '?'} (head ${a.head ? a.head.slice(0, 10) : '?'})` : 'no assessment'}${i.facts.blocked ? ' · blocked' : ''} · ${i.facts.questions.length} open question${i.facts.questions.length === 1 ? '' : 's'}${t1Line(i.facts.t1)}${t2Line(i.facts.t2)}`);
  // The local feedback `wf decide` recorded: a person reading (or a resumed session) sees it here as
  // well as in the build brief (`wf brief`), so a correction does not need the agreement opened.
  for (const d of i.facts.decisions) out.push(`  decision: ${d.at.slice(0, 10)} ${d.text}`);
  const s = i.refs.session;
  // The opener `wf new` recorded, as it was written (a reference a reader can follow): pane/session
  // keys, never a fabricated `claude --resume` id (#114 closure, F4).
  const o = i.refs.openedBy;
  out.push(`  refs: session ${s ? `${s.harness} ${s.id.slice(0, 12)}${s.transcript ? ` (${s.transcript})` : ''} at ${s.step ?? '?'}` : 'none'} · ${i.refs.artifacts.length} artifact${i.refs.artifacts.length === 1 ? '' : 's'}${o ? ` · opened by ${Object.entries(o).map(([k, v]) => `${k}=${v}`).join(', ')}` : ''} · guidance ${i.refs.guidance.join(', ')}`);
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

// Pure: the grouped morning screen. `detailFor(path, state)` is the one-line tail; `inspectFor(path,
// state)` is the optional per-round inspect block (`wf status --all --inspect`, #114).
export function allLines({ paths, readState, detailFor, now = Date.now(), inspectFor }: { paths: string[]; readState: ReadState; detailFor: DetailFor; now?: number; inspectFor?: (path: string, state: State) => string }): string[] {
  const groups: Record<'waiting on you' | 'running' | 'held', { line: string; questions: string[]; inspect?: string }[]> = { 'waiting on you': [], running: [], held: [] };
  const rounds = paths.map((p) => ({ path: p, state: readState(p) })).filter((r) => r.state) as { path: string; state: State }[];
  for (const { path, state } of rounds) {
    const group = state.step === 'held' ? 'held' : state.waiting_on === 'user' ? 'waiting on you' : 'running';
    const cells = [state.id ?? state.round, state.step, state.waiting_on ?? 'running', formatAgeSince(state.since, now), detailFor(path, state) ?? ''];
    // Open questions (wf ask) under their round: what the round waits for, not only on whom.
    groups[group].push({ line: cells.join('  ').trimEnd(), questions: questionLines(state), ...(inspectFor ? { inspect: inspectFor(path, state) } : {}) });
  }
  const out: string[] = [];
  for (const [name, lines] of Object.entries(groups)) {
    if (!lines.length) continue;
    lines.sort((a, b) => (a.line < b.line ? -1 : a.line > b.line ? 1 : 0));
    out.push(`${name}:`, ...lines.flatMap((l) => [`  ${l.line}`, ...l.questions.map((q) => `      ${q}`), ...(l.inspect ? l.inspect.split('\n') : [])]));
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
  const wantInspect = argv.includes('--inspect');
  // stderr is ignored: a git error's reason is wf's own (`inspectRound`), never raw `fatal:` text
  // on the person's screen (2026-10-10 review, P1-1).
  const git = inject.git ?? ((path: string, args: string[]) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const guidance = [guidanceDir, 'AGENTS.md'];
  const readState = inject.readState ?? realReadState;
  const inspectTextFor = (path: string, state: State) => formatInspect(inspectRound({ path, state, git: (args) => git(path, args), guidance }));
  if (argv.includes('--all')) {
    // `--all --inspect` carries the same per-round block as `--inspect`, not only the morning screen.
    const lines = allLines({ paths, readState, detailFor: inject.detailFor ?? realDetailFor, now: inject.now ?? Date.now(), inspectFor: wantInspect ? inspectTextFor : undefined });
    console.log(lines.length ? lines.join('\n') : 'no rounds');
    return;
  }
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
  if (wantInspect) for (const r of rows) if (r.state) r.inspect = inspectRound({ path: r.path, state: r.state, git: (args) => git(r.path, args), guidance });
  if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else for (const r of rows) console.log(wantInspect && r.inspect ? `${formatRow(r, inject.now)}\n${formatInspect(r.inspect)}` : formatRow(r, inject.now));
}
