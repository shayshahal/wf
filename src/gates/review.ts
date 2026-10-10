#!/usr/bin/env node
// wf review <round> [--base dev] — T2: skeleton REVIEW.md, browser diff review, fold → REVIEW.md.
// wf review <round> --done — verdict → step implement (changes-requested) | pr (approved).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { CLASSIFY } from '../paths.ts';
import { openFile, openInEditor, opensWindows } from '../worktrees/editor.ts';
import { baseBranch } from '../project.ts';
import { ensureServers } from '../worktrees/serve.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { appendDatedSection, approvalContentGap, beforeAfterPage, captionFor, devUrlsFor, foldFeedbackLine, lastField, needsFreshReviewHeader, agreementPage, proofPairs, readVerdict, renderHeader, renderSkeleton, roundArtifacts } from './review-format.ts';
import { approvalIdentity, approvalPaperworkExcluded, trackerNotePath } from './content-identity.ts';
import type { ContentIdentity } from './content-identity.ts';
import { seams } from '../seams.ts';
import { manualCheck } from './check.ts';
import { agreementPath, ASSESSMENT_FILE, caseFiles, verificationCases } from '../round/agreement.ts';
import { roundFile } from '../round/state.ts';
import type { State } from '../round/state.ts';
import { runStep } from '../round/step.ts';

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
const persistedBase = (worktree: string) => readState(worktree).base ?? null;
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
// folder, and the PNGs it shows are gitignored), or null when neither research nor validate took one.
function writeBeforeAfter(worktree: string, round: string) {
  const folder = readState(worktree).folder;
  const proof = folder ? join(worktree, folder, 'proof') : null;
  const pairs = proof && existsSync(proof) ? proofPairs(readdirSync(proof)) : [];
  if (!pairs.length) return null;
  const texts = [agreementPath(worktree, readState(worktree).class ?? null, folder), 'ASSESSMENT.md'].map((f) => (f && existsSync(join(worktree, f)) ? readFileSync(join(worktree, f), 'utf8') : ''));
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

// The header's assessment line: the one final assessment's verdict (#113), read from ASSESSMENT.md.
function assessmentFor(worktree: string): string[] {
  const folder = readState(worktree).folder ?? '';
  const file = [folder, ASSESSMENT_FILE].filter(Boolean).join('/');
  if (!existsSync(join(worktree, file))) return [`assessment: no ${file} yet — the assessment phase writes it before T2`];
  const text = readFileSync(join(worktree, file), 'utf8');
  const verdict = /^Verdict:[ \t]*(\w+)/m.exec(text)?.[1] ?? 'unknown';
  return [`assessment: ${verdict} (${file})`];
}

// The cases whose proof is a person looking (check cell `manual: …`, prompts/agree.md): T2 reads each
// as a `manual:` line beside the diff. `wf check` gated the build itself (the fence and the project's
// checks).
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

export async function runReview(argv: string[]) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) usage();
  const { path: worktree } = resolveWorktree(round);
  if (argv.includes('--done')) return runReviewDone(worktree, round);
  // Base: --base, else the round's persisted base (wf new --base), else dev. A round cut from
  // tools/wf-runtime reviewed against dev showed 124 files and class B — the runtime's own commits.
  const bi = argv.indexOf('--base');
  const base = bi === -1 ? (persistedBase(worktree) ?? baseBranch) : (argv[bi + 1] ?? usage());
  // The stored class is the asserted one (B/C never downgrade); the measurement is only a fallback.
  const klass = readState(worktree).class ?? classify(worktree, base);
  const assessmentRel = [readState(worktree).folder, ASSESSMENT_FILE].filter(Boolean).join('/');
  const files = reviewFiles(changedFiles(worktree, base), assessmentRel, existsSync(join(worktree, assessmentRel)));
  await inWorktree(worktree, round, 'review');
  // T2 sees the committed diff, so uncommitted product cannot be approved: it was never shown. Refuse
  // before the stack is started, so a dirty tree does not wait on servers it will not use (#106 review).
  const folder = readState(worktree).folder ?? null;
  const notePath = trackerNotePath(folder);
  const uncommitted = dirtyProduct(worktree, folder, notePath);
  if (uncommitted.length) {
    console.error(`wf review: ${uncommitted.join(', ')} changed but not committed — the review screen shows the committed branch, so T2 cannot approve it; commit it, then run wf review ${round} again`);
    process.exit(2);
  }
  // T2 opens the round's pages: the stack is started for it, since nothing serves a worktree from its
  // creation (2026-10-04, serve.ts). A stack that will not start leaves the diff to review, and says so.
  try { console.log(await ensureServers(worktree, { wait: true })); } catch (e) { /* the diff is still reviewable: the line says why there are no pages */ console.error((e as Error).message); }
  const beforeAfter = writeBeforeAfter(worktree, round);
  if (beforeAfter) {
    console.log(`before/after: ${beforeAfter}`);
    openFile(beforeAfter);
  }
  const agreementHtml = writeAgreement(worktree, round);
  if (agreementHtml) {
    console.log(`agreement: ${agreementHtml}`);
    openFile(agreementHtml);
  }
  const assessment = assessmentFor(worktree);
  const manual = manualFor(worktree);
  // The identities the verdict is bound to, computed once at open and printed in every header this run
  // writes. T2 computes them again at --done; a change since makes the approval stale (content-identity.ts).
  const identity = currentIdentity(worktree);
  const contentSha = identity.worktree;
  const headSha = identity.head;
  const header = () => renderHeader({ round, klass, base, contentSha, headSha, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual });
  const file = roundFile(worktree, 'REVIEW.md');
  const previous = existsSync(file) ? readFileSync(file, 'utf8') : null;
  // First review: the skeleton. Re-opened after the implementation moved (no review screen to append
  // its own header): a fresh dated header with the new shas, so the person writes the verdict under
  // it. Both shas are compared (needsFreshReviewHeader): a commit that changed only HEAD, with the
  // worktree restored, must still force a fresh header, or a valid new review cannot recover a stale
  // HEAD (#106 final review). Same worktree and HEAD: nothing, the verdict stands.
  const previousBinding = previous === null ? null : { contentSha: lastField(previous, 'content-sha'), headSha: lastField(previous, 'head-sha') };
  if (previous === null || (!seams.reviewUI?.available() && needsFreshReviewHeader(previousBinding, contentSha, headSha))) {
    appendDatedSection(file, renderSkeleton({ round, klass, base, contentSha, headSha, urls: devUrlsFor(worktree), files, beforeAfter, assessment, manual }));
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

async function runReviewDone(worktree: string, round: string) {
  const file = roundFile(worktree, 'REVIEW.md');
  if (!existsSync(file)) {
    console.error(`no ${file} — run wf review ${round} first`);
    process.exit(2);
  }
  const text = readFileSync(file, 'utf8');
  // The review must be of THIS round's diff: header base and (with the adapter) the base
  // plannotator actually showed must both equal the persisted base.
  const expected = persistedBase(worktree);
  for (const [key, shown] of [['base', lastField(text, 'base')], ['reviewed', lastField(text, 'reviewed')]]) {
    if (expected && shown && shown !== expected) {
      console.error(`wf review --done: ${key}: ${shown} but the round's base is ${expected} — that verdict is about a different diff; re-run wf review ${round}`);
      process.exit(2);
    }
  }
  const verdict = readVerdict(text);
  if (!verdict) {
    console.error(`no verdict yet — set the verdict: line in ${file} to one of: approved | changes-requested | dismissed`);
    process.exit(2);
  }
  // An approval is only for the implementation it judged: changes-requested and dismissed need no
  // binding, but advancing to delivery on a stale approval is the #106 hole (2026-10-09).
  if (verdict === 'approved') {
    const gap = approvalContentGap(text, currentIdentity(worktree));
    if (gap) {
      console.error(`wf review --done: ${gap}`);
      process.exit(2);
    }
  }
  if (verdict === 'approved') await inWorktree(worktree, round, 'pr');
  else if (verdict === 'changes-requested') await inWorktree(worktree, round, 'build');
  else {
    console.error(`review was dismissed — re-run wf review ${round}`);
    process.exit(2);
  }
}
