#!/usr/bin/env node
// wf review <round> [--base dev] — T2: skeleton REVIEW.md, browser diff review, fold → REVIEW.md.
// wf review <round> --done — verdict → step implement (changes-requested) | pr (approved).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { CLASSIFY } from '../paths.ts';
import { openFile, openInEditor, opensWindows } from '../worktrees/editor.ts';
import { baseBranch, ticketChanges } from '../project.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { appendDatedSection, approvalContentGap, beforeAfterPage, captionFor, devUrlsFor, foldFeedbackLine, lastField, needsFreshReviewHeader, agreementPage, proofPairs, readVerdict, renderHeader, renderSkeleton, roundArtifacts, scopedApprovalGap } from './review-format.ts';
import { approvalIdentity, approvalPaperworkExcluded, trackerNotePath } from './content-identity.ts';
import type { ContentIdentity } from './content-identity.ts';
import { seams } from '../seams.ts';
import { manualCheck } from './check.ts';
import { agreementPath, ASSESSMENT_FILE, caseFiles, REVIEW_FILE, verificationCases } from '../round/agreement.ts';
import { roundFile, writeState } from '../round/state.ts';
import type { State } from '../round/state.ts';
import { advanceSlice, sliceContext, unitAssessmentFile } from '../round/build-units.ts';
import type { SliceProgress } from '../round/build-units.ts';
import { stepHistory } from '../round/friction.ts';
import { runStep } from '../round/step.ts';
import { nextAction, snapshotOf } from '../round/next.ts';

const usage: () => never = () => {
  console.error('usage: wf review <round> [--base dev] | wf review <round> --done');
  refuseCaller();
};
const inWorktree = async (worktree: string, round: string, step: string) => {
  const prev = process.cwd();
  process.chdir(worktree);
  try {
    await runStep([step, '--waiting-on', 'user', '--round', round]);
  } finally {
    process.chdir(prev);
  }
};
// No state.json is a worktree wf did not make, and T2 goes on without it. One that does not parse is
// a broken round: it used to read as {}, and the header went out with no base and no round folder.
const readState = (worktree: string): State => {
  const file = join(worktree, '.wf', 'state.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};
// A diff git cannot take stops T2: it used to read as no files, and the header listed nothing to review.
const changedFiles = (worktree: string, base: string): string[] => {
  try {
    return execFileSync('git', ['-C', worktree, 'diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.error(`wf review: git diff ${base}...HEAD failed in ${worktree}: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
};
const classify = (worktree: string, base: string): string => {
  try {
    return JSON.parse(execFileSync('node', [CLASSIFY, '--base', base, '--json'], { cwd: worktree, encoding: 'utf8' })).class;
  } catch {
    return '—'; // classify.ts not installed yet (Task 1 worktree) — header says so
  }
};

// The worktree and HEAD identities of the implementation, read through the round's folder; a git that
// cannot read the tree is refused, not approved blind (#106).
const currentIdentity = (worktree: string): ContentIdentity => {
  const folder = readState(worktree).folder ?? null;
  try {
    return approvalIdentity(worktree, folder, trackerNotePath(folder));
  } catch (e) {
    console.error(`wf review: could not read the implementation: ${(e as Error).message}`);
    process.exit(2);
  }
};

// Pure: the product/test files changed but not committed. The review screen diffs the committed
// branch, so uncommitted product was never shown to T2; approving it would bind a verdict to bytes
// nobody saw (#106 review, 2026-10-09). The round folder's own evidence is allowed: it is read as
// files, not through the diff.
function dirtyProduct(worktree: string, folder: string | null, notePath: string | null): string[] {
  const git = (args: string[]) => execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  const dirty = [...new Set([...git(['diff', '--name-only', 'HEAD']), ...git(['diff', '--name-only', '--cached']), ...git(['ls-files', '--others', '--exclude-standard'])])];
  return dirty.filter((p) => !approvalPaperworkExcluded(p, folder, notePath) && !(folder && (p === folder || p.startsWith(`${folder}/`))));
}

// Pure: the files T2 is shown. The round folder's ASSESSMENT.md is read as a file, not through the
// diff; a diff git cannot take already stopped T2 above.
export function reviewFiles(diff: string[], assessment: string, onDisk: boolean) {
  return onDisk && !diff.includes(assessment) ? [assessment, ...diff] : diff;
}

// The round's before/after page (.wf/before-after.html, outside the round folder: deliver commits that
// folder, and the PNGs it shows are gitignored), or null when the round has no before/after pictures.
/** Checkpoint pictures come from its own unit assessments, not every round's before/after pair. */
export function chunkProofPairs(names: string[], assessments: string[]) {
  return proofPairs(names).filter((p) => assessments.some((text) => [p.before, p.after].some((name) => name && text.includes(`proof/${name}`))));
}

function writeBeforeAfter(worktree: string, round: string, assessmentFiles: string[], chunk: boolean) {
  const folder = readState(worktree).folder;
  const proof = folder ? join(worktree, folder, 'proof') : null;
  const assessments = assessmentFiles.map((name) => folder ? join(worktree, folder, name) : null).map((f) => f && existsSync(f) ? readFileSync(f, 'utf8') : '');
  const names = proof && existsSync(proof) ? readdirSync(proof) : [];
  const pairs = chunk ? chunkProofPairs(names, assessments) : proofPairs(names);
  if (!pairs.length) return null;
  // Both are round-owned absolute paths: joining the agreement to worktree again lost its caption,
  // and the bare assessment name read a root-level decoy instead of the round's assessment (#114).
  const agreement = agreementPath(worktree, readState(worktree).class ?? null, folder);
  const texts = [existsSync(agreement) ? readFileSync(agreement, 'utf8') : '', ...assessments];
  const captions = Object.fromEntries((pairs.flatMap((p) => [p.before, p.after]).filter(Boolean) as string[]).map((n) => [n, captionFor(n, texts)]));
  const file = join(worktree, '.wf', 'before-after.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, beforeAfterPage({ round, pairs, captions, src: `../${folder}/proof` }));
  return file;
}

// The agreement as a page (.wf/AGREEMENT.html): what the diff is judged against, with its Build views
// drawn (SHOW-ME.md, review-format.ts agreementPage). Null when the round has no agreement file.
function writeAgreement(worktree: string, round: string) {
  const state = readState(worktree);
  const folder = state.folder;
  if (!folder) return null;
  const agreement = agreementPath(worktree, state.class ?? null, folder);
  if (!existsSync(agreement)) return null;
  const file = join(worktree, '.wf', 'AGREEMENT.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, agreementPage({
    title: `Agreement — ${round}`,
    meta: [`class ${state.class ?? '—'} · base ${state.base ?? baseBranch}`, 'the agreement the diff is judged against — the markdown is the file of record'],
    section: readFileSync(agreement, 'utf8'),
    artifacts: roundArtifacts(join(worktree, folder), join(worktree, '.wf')),
  }));
  return file;
}

// The header's assessment line: the slice's assessment verdict, read from its own file — the whole
// round's ASSESSMENT.md, or the active unit's ASSESSMENT-unit-<n>.md (#113, build-units.ts).
function assessmentFor(worktree: string, assessmentFile: string): string[] {
  const folder = readState(worktree).folder ?? '';
  const file = [folder, assessmentFile].filter(Boolean).join('/');
  if (!existsSync(join(worktree, file))) return [`assessment: no ${file} yet — the assessment phase writes it before T2`];
  const text = readFileSync(join(worktree, file), 'utf8');
  const verdict = /^Verdict:[ \t]*(\w+)/m.exec(text)?.[1] ?? 'unknown';
  return [`assessment: ${verdict} (${file})`];
}

// The cases whose proof is a person looking (check cell `manual: …`, prompts/agree.md): T2 reads each
// as a `manual:` line beside the diff. `caseNs` scopes them to the active unit's cases (null = the whole
// round). `wf check` gated the build itself (the fence and the project's checks).
function manualFor(worktree: string, caseNs: number[] | null): string[] {
  const state = readState(worktree);
  const folder = state.folder;
  const agreement = folder && agreementPath(worktree, state.class ?? null, folder);
  if (!agreement || !existsSync(agreement)) return [];
  return verificationCases(readFileSync(agreement, 'utf8')).flatMap((c) => {
    if (caseNs && !caseNs.includes(c.n)) return [];
    const text = manualCheck(c.check);
    return text ? [`manual: case ${c.n} — ${text}`] : [];
  });
}

// The review a round's build state asks for. A planned round's active unit is a chunk since its
// previous checkpoint (`base`), writes `REVIEW-unit-<n>.md` beside `ASSESSMENT-unit-<n>.md`, and binds a
// `unit:<n>` verdict; the integration and a single-build round review the whole round from its own base.
// A unit with no `review after` label has no checkpoint — the build continues into the next unit, so
// there is nothing for T2 to read or approve. Pure, so the routing is checked without a repo.
export type ReviewTarget =
  | { kind: 'refuse'; why: string }
  | { kind: 'single' | 'integration' | 'unit'; reviewFile: string; assessmentFile: string; assessmentFiles: string[]; base: string; expectedBase: string | null; scope: string | null; chunk: string[]; caseNs: number[] | null; unit: number | null };

export function reviewTarget(agreement: string | null | undefined, slices: SliceProgress | undefined, roundBase: string): ReviewTarget {
  const context = sliceContext(agreement, slices);
  if (context.kind === 'invalid') return { kind: 'refuse', why: `this round's build units cannot be read: ${context.why}` };
  if (context.kind === 'pending') return { kind: 'refuse', why: 'this round plans build units and none has started — run wf next to start the first unit' };
  if (context.kind === 'unit') {
    if (context.unit.reviewAfter === null) return { kind: 'refuse', why: `unit ${context.unit.n} (${context.unit.title}) has no checkpoint review — its build continues into the next unit, so there is nothing to review here` };
    return {
      kind: 'unit', unit: context.unit.n,
      reviewFile: context.reviewFile, assessmentFile: context.assessmentFile,
      assessmentFiles: context.reviewUnits.map((u) => unitAssessmentFile(u.n)),
      base: context.reviewBase, expectedBase: context.reviewBase,
      scope: `unit:${context.unit.n}`,
      chunk: [`chunk: unit ${context.unit.n} — ${context.unit.reviewAfter}`, `units: ${context.reviewUnits.map((u) => u.n).join(', ')}`, `cases: ${context.reviewUnits.flatMap((u) => u.cases).join(', ')}`],
      caseNs: context.reviewUnits.flatMap((u) => u.cases),
    };
  }
  return {
    kind: context.kind === 'integration' ? 'integration' : 'single',
    reviewFile: context.kind === 'integration' ? REVIEW_FILE : 'REVIEW.md',
    assessmentFile: ASSESSMENT_FILE, assessmentFiles: [ASSESSMENT_FILE],
    base: roundBase, expectedBase: roundBase,
    scope: context.kind === 'integration' ? 'integration' : null,
    chunk: [], caseNs: null, unit: null,
  };
}

// The checkpoint approval: the reviewed unit is recorded and the next one gets a fresh builder. One
// writeState, so the receipt, the step and the repairs reset move together. A planned round's `pr` is
// never written here; deliver.ts and step.ts also refuse a unit as delivery. Returns the unit now active
// (`null` after the last unit = the integration).
function advanceCheckpoint(worktree: string, target: ReviewTarget & { kind: 'single' | 'integration' | 'unit' }, review: string): number | null {
  const head = execFileSync('git', ['-C', worktree, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const since = new Date().toISOString();
  const state = writeState(worktree, (current) => {
    const agreementFile = agreementPath(worktree, current.class ?? null, current.folder ?? null);
    const context = sliceContext(existsSync(agreementFile) ? readFileSync(agreementFile, 'utf8') : '', current.slices);
    if (context.kind !== 'unit' || context.unit.n !== target.unit || context.reviewBase !== target.base || context.unit.reviewAfter === null || !current.slices) {
      throw new Error('the build moved while the checkpoint was being approved — run wf review again');
    }
    // --done is a public boundary too: a bound verdict alone cannot bypass current verification.
    const decision = nextAction({ ...snapshotOf(worktree), step: 'assess' });
    if (!decision.say.startsWith('review: T2')) throw new Error(`${decision.say} — run wf next before approving this checkpoint`);
    const binding = scopedApprovalGap(review, currentIdentity(worktree), `unit:${context.unit.n}`);
    if (binding) throw new Error(binding);
    return { slices: advanceSlice(context, current.slices, head, { reviewed: true }), repairs: 0, step: 'build', since, waiting_on: null, history: stepHistory(current.history, 'build', since) };
  });
  return state.slices?.unit ?? null;
}

export async function runReview(argv: string[]) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) usage();
  const { path: worktree } = resolveWorktree(round);
  const state = readState(worktree);
  const agreementFile = agreementPath(worktree, state.class ?? null, state.folder ?? null);
  const target = reviewTarget(existsSync(agreementFile) ? readFileSync(agreementFile, 'utf8') : '', state.slices, state.base ?? baseBranch);
  if (target.kind === 'refuse') {
    console.error(`wf review: ${target.why}`);
    process.exit(2);
  }
  if (argv.includes('--done')) return runReviewDone(worktree, round, target);
  // Base: a planned round's checkpoint is bounded to the commit its last checkpoint reached, so --base
  // does not apply; a single-build round keeps --base, else the persisted base (wf new --base), else dev.
  // A round cut from tools/wf-runtime reviewed against dev showed 124 files and class B — the runtime's own commits.
  const bi = argv.indexOf('--base');
  if (target.kind === 'unit' && bi !== -1) {
    console.error(`wf review: a checkpoint is bounded to its previous checkpoint (${target.base}) — --base does not apply`);
    process.exit(2);
  }
  const base = bi === -1 ? target.base : (argv[bi + 1] ?? usage());
  // The stored class is the asserted one (B/C never downgrade); the measurement is only a fallback.
  const klass = state.class ?? classify(worktree, base);
  const files = target.assessmentFiles.reduce((files, name) => {
    const rel = [state.folder, name].filter(Boolean).join('/');
    return reviewFiles(files, rel, existsSync(join(worktree, rel)));
  }, changedFiles(worktree, base));
  // T2 sees the committed diff, so uncommitted product cannot be approved: it was never shown. Refuse
  // before the stack is started, so a dirty tree does not wait on servers it will not use (#106 review).
  const folder = state.folder ?? null;
  const notePath = trackerNotePath(folder);
  const uncommitted = dirtyProduct(worktree, folder, notePath);
  if (uncommitted.length) {
    console.error(`wf review: ${uncommitted.join(', ')} changed but not committed — the review screen shows the committed branch, so T2 cannot approve it; commit it, then run wf review ${round} again`);
    process.exit(2);
  }
  // The tickets are read again before the person is asked to judge: JX-810 (2026-10-12) reached T2, and
  // the post after it, on requirements rewritten mid-round. Unreadable (no credentials, tracker down) is
  // said and T2 goes on: wf post refuses to post unchecked, so the gate itself is still there.
  try {
    const changed = await ticketChanges(readState(worktree));
    if (changed) {
      console.error(`wf review: ${changed}`);
      process.exit(2);
    }
  } catch (e) {
    /* T2 goes on unchecked, said: wf post fails closed on the same trouble */
    console.error(`wf review: tickets not checked for changes (${(e as Error).message}); wf post checks again`);
  }
  await inWorktree(worktree, round, 'review');
  // T2 opens the round's pages: the stack is started for it, since nothing serves a worktree from its
  // creation (2026-10-04, serve.ts). A stack that will not start leaves the diff to review, and says so.
  try { console.log(await ensureServers(worktree, { wait: true })); } catch (e) { /* the diff is still reviewable: the line says why there are no pages */ console.error((e as Error).message); }
  const beforeAfter = writeBeforeAfter(worktree, round, target.assessmentFiles, target.kind === 'unit');
  if (beforeAfter) {
    console.log(`before/after: ${beforeAfter}`);
    openFile(beforeAfter);
  }
  const agreementHtml = writeAgreement(worktree, round);
  if (agreementHtml) {
    console.log(`agreement: ${agreementHtml}`);
    openFile(agreementHtml);
  }
  const assessment = target.assessmentFiles.flatMap((name) => assessmentFor(worktree, name));
  const manual = manualFor(worktree, target.caseNs);
  // The identities the verdict is bound to, computed once at open and printed in every header this run
  // writes. T2 computes them again at --done; a change since makes the approval stale (content-identity.ts).
  const identity = currentIdentity(worktree);
  const contentSha = identity.worktree;
  const headSha = identity.head;
  const header = () => renderHeader({ round, klass, base, contentSha, headSha, scope: target.scope, chunk: target.chunk, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual });
  const file = roundFile(worktree, target.reviewFile);
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
  // First review: the skeleton. Re-opened after the implementation moved (no review screen to append
  // its own header): a fresh dated header with the new shas, so the person writes the verdict under
  // it. Both shas are compared (needsFreshReviewHeader): a commit that changed only HEAD, with the
  // worktree restored, must still force a fresh header, or a valid new review cannot recover a stale
  // HEAD (#106 final review). Same worktree and HEAD: nothing, the verdict stands.
  const previousBinding = previous === null ? null : { contentSha: lastField(previous, 'content-sha'), headSha: lastField(previous, 'head-sha') };
  if (previous === null || (!seams.reviewUI?.available() && needsFreshReviewHeader(previousBinding, contentSha, headSha))) {
    appendDatedSection(file, renderSkeleton({ round, klass, base, contentSha, headSha, scope: target.scope, chunk: target.chunk, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual }));
  }
  // The machine's review screen when it has one (seams.reviewUI: plannotator on Shay's), else an editor.
  if (!seams.reviewUI?.available()) {
    if (!opensWindows()) {
      console.log(`review file: ${file}
  Claude Code: the person comments on lines in the diff view and says the verdict; write both into this file (round skill, T2)`);
      return;
    }
    if (!openInEditor([worktree, file])) console.log(`fallback: no editor found — review by hand:\n  worktree: ${worktree}\n  review file: ${file}`);
    else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
    return;
  }
  // merge-base, not branch: branch diffs against the tip of base, so a dev that moved on showed its
  // newer commits as reverts inside the round (TJEW-700). plannotator computes the merge-base itself.
  const line = seams.reviewUI.reviewDiff({ worktree, base, diffType: 'merge-base', since: new Date().toISOString() });
  appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
  console.log(`wrote ${file}`);
}

async function runReviewDone(worktree: string, round: string, target: ReviewTarget & { kind: 'single' | 'integration' | 'unit' }) {
  const file = roundFile(worktree, target.reviewFile);
  if (!existsSync(file)) {
    console.error(`no ${file} — run wf review ${round} first`);
    process.exit(2);
  }
  const text = readFileSync(file, 'utf8');
  // The review must be of THIS chunk or whole round: header base and (with the adapter) the base
  // plannotator actually showed must both equal the base this review is bounded to — the active unit's
  // previous checkpoint, or the round's own base for the integration and a single-build round.
  for (const [key, shown] of [['base', lastField(text, 'base')], ['reviewed', lastField(text, 'reviewed')]]) {
    if (target.expectedBase && shown && shown !== target.expectedBase) {
      console.error(`wf review --done: ${key}: ${shown} but this review is of ${target.expectedBase} — that verdict is about a different diff; re-run wf review ${round}`);
      process.exit(2);
    }
  }
  const verdict = readVerdict(text);
  if (!verdict) {
    console.error(`no verdict yet — set the verdict: line in ${file} to one of: approved | changes-requested | dismissed`);
    process.exit(2);
  }
  // An approval is only for the implementation it judged: changes-requested and dismissed need no
  // binding, but advancing on a stale approval is the #106 hole (2026-10-09). A planned round's review
  // is also bound to its `scope:` — a unit chunk's approval is not the integration's, or the reverse.
  if (verdict === 'approved') {
    const current = currentIdentity(worktree);
    const gap = target.scope ? scopedApprovalGap(text, current, target.scope) : approvalContentGap(text, current);
    if (gap) {
      console.error(`wf review --done: ${gap}`);
      process.exit(2);
    }
  }
  if (verdict === 'approved') {
    // A checkpoint's approval advances its unit and starts the next build; it is never delivery. The
    // final integration approval is the one that reaches `pr` (deliver.ts re-checks the whole plan).
    if (target.kind === 'unit') {
      let next: number | null;
      try { next = advanceCheckpoint(worktree, target, text); } catch (e) {
        console.error(`wf review --done: ${(e as Error).message}`);
        process.exit(2);
      }
      console.log(`checkpoint approved: unit ${target.unit} reviewed — ${next === null ? 'the integration' : `unit ${next}`} is next; \`wf next\` dispatches it`);
      return;
    }
    if (target.kind === 'integration') {
      const decision = nextAction({ ...snapshotOf(worktree), step: 'assess' });
      if (!decision.say.startsWith('review: T2')) {
        console.error(`wf review --done: ${decision.say} — finish the integration assessment before delivery approval`);
        process.exit(2);
      }
    }
    await inWorktree(worktree, round, 'pr');
  } else if (verdict === 'changes-requested') {
    if (target.kind === 'unit') {
      try { writeState(worktree, (current) => {
        const agreementFile = agreementPath(worktree, current.class ?? null, current.folder ?? null);
        const context = sliceContext(existsSync(agreementFile) ? readFileSync(agreementFile, 'utf8') : '', current.slices);
        if (context.kind !== 'unit' || context.unit.n !== target.unit || context.reviewBase !== target.base || !current.slices) throw new Error('the chunk moved before its feedback was recorded — run wf review again');
        const since = new Date().toISOString();
        return { slices: { ...current.slices, reviewRepair: true }, repairs: 0, step: 'build', since, waiting_on: current.questions?.[0]?.to ?? null, history: stepHistory(current.history, 'build', since) };
      }); } catch (e) {
        console.error(`wf review --done: ${(e as Error).message}`);
        process.exit(2);
      }
    } else await inWorktree(worktree, round, 'build');
  }
  else {
    console.error(`review was dismissed — re-run wf review ${round}`);
    process.exit(2);
  }
}
