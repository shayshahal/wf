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
import { appendDatedSection, approvalContentGap, beforeAfterPage, captionFor, devUrlsFor, foldFeedbackLine, lastField, needsFreshReviewHeader, agreementPage, proofPairs, readVerdict, renderHeader, renderSkeleton, reviewScopeBinding, roundArtifacts, scopedApprovalGap } from './review-format.ts';
import { approvalIdentity, approvalPaperworkExcluded, trackerNotePath } from './content-identity.ts';
import type { ContentIdentity } from './content-identity.ts';
import { seams } from '../seams.ts';
import { manualCheck } from './check.ts';
import { agreementPath, ASSESSMENT_FILE, CHECKPOINT_REVIEW_FILE, REVIEW_FILE, verificationCases } from '../round/agreement.ts';
import { readState as readRoundState, roundFile, writeState } from '../round/state.ts';
import { correctionGate } from '../round/corrections.ts';
import { deliveredCommandGap } from '../round/delivered-round.ts';
import type { State } from '../round/state.ts';
import { stepHistory } from '../round/friction.ts';
import { runStep } from '../round/step.ts';
import { nextAction, snapshotOf } from '../round/next.ts';

const usage: () => never = () => {
  console.error('usage: wf review <round> [--checkpoint [--base <ref>]] | wf review <round> --done');
  refuseCaller();
};
const inWorktree = async (worktree: string, round: string, step: string, buildReason?: State['build_reason']) => {
  const prev = process.cwd();
  process.chdir(worktree);
  try {
    await runStep([step, '--waiting-on', 'user', '--round', round], { buildReason });
  } finally {
    process.chdir(prev);
  }
};
// No state.json is a worktree wf did not make, and T2 goes on without it. One that does not parse is
// a broken round: it used to read as {}, and the header went out with no base and no round folder.
const readState = (worktree: string): State => readRoundState(worktree) ?? {};
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
// A checkpoint's page is the round's whole proof set, same as the final review's; the person chose the
// diff range, and wf does not track per-chunk picture ownership.
function writeBeforeAfter(worktree: string, round: string, assessmentFiles: string[]) {
  const folder = readState(worktree).folder;
  const proof = folder ? join(worktree, folder, 'proof') : null;
  const assessments = assessmentFiles.map((name) => folder ? join(worktree, folder, name) : null).map((f) => f && existsSync(f) ? readFileSync(f, 'utf8') : '');
  const names = proof && existsSync(proof) ? readdirSync(proof) : [];
  const pairs = proofPairs(names);
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

// The header's assessment line: the round's assessment verdict, read from ASSESSMENT.md.
function assessmentFor(worktree: string, assessmentFile: string): string[] {
  const folder = readState(worktree).folder ?? '';
  const file = [folder, assessmentFile].filter(Boolean).join('/');
  if (!existsSync(join(worktree, file))) return [`assessment: no ${file} yet — the assessment phase writes it before T2`];
  const text = readFileSync(join(worktree, file), 'utf8');
  const verdict = /^Verdict:[ \t]*(\w+)/m.exec(text)?.[1] ?? 'unknown';
  return [`assessment: ${verdict} (${file})`];
}

// The cases whose proof is a person looking (check cell `manual: …`, prompts/agree.md.in): T2 reads each
// as a `manual:` line beside the diff. The whole agreement's cases. `wf check` no longer gates the
// build; the independent reviewer and the person own sufficiency.
function manualFor(worktree: string): string[] {
  const state = readState(worktree);
  const folder = state.folder;
  const agreement = folder && agreementPath(worktree, state.class ?? null, folder);
  if (!agreement || !existsSync(agreement)) return [];
  return verificationCases(readFileSync(agreement, 'utf8')).flatMap((c) => {
    const text = manualCheck(c.check);
    return text ? [`manual: case ${c.n} — ${text}`] : [];
  });
}

// The review a round asks for. The default is the final review: the whole round from its own base,
// against the independent final assessment. `--checkpoint` is a person-chosen review of a named diff
// (the agent owns when one happens), appended to its own file and bound `scope: checkpoint`; its
// verdict — approved or changes-requested — only ever returns the round to build, never to pr.
// Pure, so the routing is checked without a repo.
export type ReviewTarget =
  | { kind: 'final' | 'checkpoint'; reviewFile: string; assessmentFiles: string[]; base: string; expectedBase: string; scope: string | null };

export function reviewTarget(roundBase: string, checkpoint: boolean, checkpointBase?: string | null): ReviewTarget {
  if (checkpoint) {
    const base = checkpointBase ?? roundBase;
    return { kind: 'checkpoint', reviewFile: CHECKPOINT_REVIEW_FILE, assessmentFiles: [], base, expectedBase: base, scope: 'checkpoint' };
  }
  return { kind: 'final', reviewFile: REVIEW_FILE, assessmentFiles: [ASSESSMENT_FILE], base: roundBase, expectedBase: roundBase, scope: null };
}

export async function runReview(argv: string[], { stack = ensureServers }: { stack?: typeof ensureServers } = {}) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) usage();
  const { path: worktree } = resolveWorktree(round);
  const state = readState(worktree);
  // --base names a checkpoint's own range; the final review always covers the round's base.
  const bi = argv.indexOf('--base');
  const checkpoint = argv.includes('--checkpoint');
  if (!checkpoint && bi !== -1) {
    console.error('wf review: the final review covers the round base and takes no --base; use `wf review <round> --checkpoint [--base <ref>]` for a bounded checkpoint review');
    process.exit(2);
  }
  const target = reviewTarget(state.base ?? baseBranch, checkpoint, bi !== -1 ? argv[bi + 1] ?? null : null);
  if (argv.includes('--done')) return runReviewDone(worktree, round, target);
  const base = target.base;
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
  // A checkpoint is a person-chosen side review: it does not move the step (the agent owns when it
  // happens). The final review parks the round on the person.
  if (!checkpoint) await inWorktree(worktree, round, 'review');
  // T2 opens the round's pages: the stack is started for it, since nothing serves a worktree from its
  // creation (2026-10-04, serve.ts). A stack that will not start leaves the diff to review, and says so.
  try { console.log(await stack(worktree, { wait: true })); } catch (e) { /* the diff is still reviewable: the line says why there are no pages */ console.error((e as Error).message); }
  const beforeAfter = writeBeforeAfter(worktree, round, target.assessmentFiles);
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
  const manual = manualFor(worktree);
  // The identities the verdict is bound to, computed once at open and printed in every header this run
  // writes. T2 computes them again at --done; a change since makes the approval stale (content-identity.ts).
  const identity = currentIdentity(worktree);
  const contentSha = identity.worktree;
  const headSha = identity.head;
  const header = () => renderHeader({ round, klass, base, contentSha, headSha, scope: target.scope, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual });
  const file = roundFile(worktree, target.reviewFile);
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
  // First review: the skeleton. Re-opened after the implementation moved (no review screen to append
  // its own header): a fresh dated header with the new shas, so the person writes the verdict under
  // it. Both shas are compared (needsFreshReviewHeader): a commit that changed only HEAD, with the
  // worktree restored, must still force a fresh header, or a valid new review cannot recover a stale
  // HEAD (#106 final review). A checkpoint's range may change without changing either identity;
  // its requested base must still be the one the native handoff tells the person to review.
  const previousBinding = previous === null ? null : { contentSha: lastField(previous, 'content-sha'), headSha: lastField(previous, 'head-sha') };
  if (previous === null || ((seams.presentation || !seams.reviewUI?.available()) && (needsFreshReviewHeader(previousBinding, contentSha, headSha) || lastField(previous, 'base') !== base))) {
    appendDatedSection(file, renderSkeleton({ round, klass, base, contentSha, headSha, scope: target.scope, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual }));
  }
  if (seams.presentation) {
    console.log(seams.presentation.guidance);
    console.log(seams.presentation.reviewHandoff({ kind: 'review', worktree, document: file, pages: [agreementHtml, beforeAfter].filter((page): page is string => page !== null), reviewFile: file }));
    return;
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

async function runReviewDone(worktree: string, round: string, target: ReviewTarget) {
  const currentState = readState(worktree);
  const pending = correctionGate(currentState);
  if (pending || currentState.merge_attempt || currentState.step === 'held') {
    console.error(`wf review --done: ${pending ?? (currentState.merge_attempt ? 'merge outcome needs reconciliation through wf deliver' : 'the round is held')}`);
    process.exit(2);
  }
  const file = roundFile(worktree, target.reviewFile);
  if (!existsSync(file)) {
    console.error(`no ${file} — run wf review ${round}${target.kind === 'checkpoint' ? ' --checkpoint' : ''} first`);
    process.exit(2);
  }
  const text = readFileSync(file, 'utf8');
  // The review must be of the diff this target names: the header base and (with the adapter) the base
  // plannotator actually showed must equal it — a checkpoint's own range, or the round base for the
  // final review.
  for (const [key, shown] of [['base', lastField(text, 'base')], ['reviewed', lastField(text, 'reviewed')]]) {
    if (shown && shown !== target.expectedBase) {
      console.error(`wf review --done: ${key}: ${shown} but this review is of ${target.expectedBase} — that verdict is about a different diff; re-run wf review ${round}${target.kind === 'checkpoint' ? ' --checkpoint' : ''}`);
      process.exit(2);
    }
  }
  const verdict = readVerdict(text);
  if (!verdict) {
    console.error(`no verdict yet — set the verdict: line in ${file} to one of: approved | changes-requested | dismissed`);
    process.exit(2);
  }
  // An approval is only for the implementation it judged: changes-requested and dismissed need no
  // binding, but advancing on a stale approval is the #106 hole (2026-10-09). A checkpoint's review is
  // bound to its own `scope:` — an approval of a chunk is not the final review, or the reverse.
  if (verdict === 'approved') {
    const current = currentIdentity(worktree);
    const gap = target.scope ? scopedApprovalGap(text, current, target.scope) : approvalContentGap(text, current);
    if (gap) {
      console.error(`wf review --done: ${gap}`);
      process.exit(2);
    }
  }
  if (target.kind === 'checkpoint') {
    // A checkpoint approval, like a checkpoint's changes-requested, returns the round to build. It is
    // never delivery: the checkpoint path never writes `pr`, and a copied verdict cannot authorize the
    // final review (deliver.ts refuses a scoped REVIEW.md).
    if (verdict !== 'approved' && verdict !== 'changes-requested') {
      console.error(`review was dismissed — re-run wf review ${round} --checkpoint`);
      process.exit(2);
    }
    const since = new Date().toISOString();
    writeState(worktree, (current) => {
      const delivered = deliveredCommandGap(current, ['review']);
      if (delivered || current.merge_attempt || current.step === 'held' || correctionGate(current)) throw new Error(`wf review --done: ${delivered ?? correctionGate(current) ?? 'round activity changed during review completion; run wf next'}`);
      return {
        step: 'build', repairs: 0, since, waiting_on: current.questions?.[0]?.to ?? null,
        build_reason: { kind: 'work', text: `checkpoint review: ${verdict === 'approved' ? 'approved' : 'changes requested'} (${CHECKPOINT_REVIEW_FILE})` },
        history: stepHistory(current.history, 'build', since),
      };
    });
    console.log(`checkpoint ${verdict === 'approved' ? 'approved' : 'changes requested'}: back to build — a checkpoint approval never permits delivery`);
    return;
  }
  if (verdict === 'approved') {
    // A checkpoint verdict copied into REVIEW.md still carries `scope: checkpoint`; the final review is
    // the unscoped one, and only it reaches `pr`.
    const boundScope = reviewScopeBinding(text).scope;
    if (boundScope) {
      console.error(`wf review --done: REVIEW.md's verdict is scoped ${boundScope} — only the final review (no scope) approves delivery; run wf review ${round}`);
      process.exit(2);
    }
    const decision = nextAction({ ...snapshotOf(worktree), step: 'assess' });
    if (!decision.say.startsWith('review: T2')) {
      console.error(`wf review --done: ${decision.say} — finish the assessment before delivery approval`);
      process.exit(2);
    }
    await inWorktree(worktree, round, 'pr');
  } else if (verdict === 'changes-requested') {
    await inWorktree(worktree, round, 'build', { kind: 'work', text: `T2 requested changes (${REVIEW_FILE})` });
  } else {
    console.error(`review was dismissed — re-run wf review ${round}`);
    process.exit(2);
  }
}
