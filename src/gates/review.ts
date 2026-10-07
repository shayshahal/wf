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
import { appendDatedSection, asBuiltFile, beforeAfterPage, captionFor, devUrlsFor, foldFeedbackLine, lastField, planPage, proofPairs, readVerdict, renderHeader, renderSkeleton, roundArtifacts, specShaFor } from './review-format.ts';
import { seams } from '../seams.ts';
import { manualCheck } from './check.ts';
import { planCommitRows } from '../round/prompt.ts';
import { reportFile, roundChecks, summaryLines } from './standards.ts';
import { CRITIQUE_FILE, critiqueLines } from './critique.ts';
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

// Pure: the files T2 is shown, with the as-built call stack when it is in the worktree. The as-built
// phase does not commit it (only wf deliver commits the round folder), so the diff alone never had
// it, and the gate below refused every class B round (TJEW-670.11, 2026-09-28).
export function reviewFiles(diff: string[], asBuilt: string, onDisk: boolean) {
  return onDisk && !diff.includes(asBuilt) ? [asBuilt, ...diff] : diff;
}

// The round's before/after page (.wf/before-after.html, outside the round folder: deliver commits that
// folder, and the PNGs it shows are gitignored), or null when neither research nor validate took one.
function writeBeforeAfter(worktree: string, round: string) {
  const folder = readState(worktree).folder;
  const proof = folder ? join(worktree, folder, 'proof') : null;
  const pairs = proof && existsSync(proof) ? proofPairs(readdirSync(proof)) : [];
  if (!pairs.length) return null;
  const texts = ['RESEARCH.md', 'VALIDATION.md'].map((f) => (existsSync(join(worktree, folder!, f)) ? readFileSync(join(worktree, folder!, f), 'utf8') : ''));
  const captions = Object.fromEntries((pairs.flatMap((p) => [p.before, p.after]).filter(Boolean) as string[]).map((n) => [n, captionFor(n, texts)]));
  const file = join(worktree, '.wf', 'before-after.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, beforeAfterPage({ round, pairs, captions, src: `../${folder}/proof` }));
  return file;
}

// The plan as a page (.wf/PLAN.html): what the diff is judged against, with its Build views drawn
// (SHOW-ME.md, review-format.ts planPage). Null when the round has no PLAN.md.
function writePlan(worktree: string, round: string) {
  const state = readState(worktree);
  const folder = state.folder;
  if (!folder) return null;
  const plan = join(worktree, folder, 'PLAN.md');
  if (!existsSync(plan)) return null;
  const file = join(worktree, '.wf', 'PLAN.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, planPage({
    title: `PLAN — ${round}`,
    meta: [`class ${state.class ?? '—'} · base ${state.base ?? baseBranch}`, 'the plan the diff is judged against — the markdown is the file of record'],
    section: readFileSync(plan, 'utf8'),
    artifacts: roundArtifacts(join(worktree, folder), join(worktree, '.wf')),
  }));
  return file;
}

// The header's standards lines: each rule that covers the diff and what its report says.
function standardsFor(worktree: string): string[] {
  const folder = readState(worktree).folder ?? '';
  try {
    return summaryLines(roundChecks(worktree).map((c) => {
      const file = [folder, reportFile(c.id)].filter(Boolean).join('/');
      return { id: c.id, file, text: existsSync(join(worktree, file)) ? readFileSync(join(worktree, file), 'utf8') : null };
    }));
  } catch (e) {
    // The header says the reports could not be read, rather than showing no standards at all.
    return [`standards: could not be read: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`];
  }
}

// The header's critique line: a dispute between validate and its critic still open after the last
// exchange (critique.ts); none when they settled.
function critiqueFor(worktree: string): string[] {
  const state = readState(worktree);
  const file = [state.folder, CRITIQUE_FILE].filter(Boolean).join('/');
  return critiqueLines(existsSync(join(worktree, file)) ? readFileSync(join(worktree, file), 'utf8') : null, file, state.briefs?.critique?.exchange ?? null);
}

// The rows whose proof is a person looking (check cell `manual: …`, prompts/plan.md): T2 reads each
// as a `manual:` line beside the diff, so a commit whose only proof is a screen is not left to the one
// T2-walk screen. `wf check` gated the commit itself (the fence and the project's checks).
function manualFor(worktree: string): string[] {
  const folder = readState(worktree).folder;
  const plan = folder && join(worktree, folder, 'PLAN.md');
  if (!plan || !existsSync(plan)) return [];
  return planCommitRows(readFileSync(plan, 'utf8')).flatMap((r) => {
    const text = manualCheck(r.check);
    return text ? [`manual: row ${r.n} — ${text}`] : [];
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
  const asBuilt = [readState(worktree).folder, 'proof', 'CALL-STACK-AS-BUILT.md'].filter(Boolean).join('/');
  const files = reviewFiles(changedFiles(worktree, base), asBuilt, existsSync(join(worktree, asBuilt)));
  if ((klass === 'B' || klass === 'C') && !asBuiltFile(files)) {
    console.error(`wf review: class ${klass} round without ${asBuilt} — the as-built phase writes it before T2 (the contract change is what T2 reads first); wf next dispatches it`);
    process.exit(2);
  }
  await inWorktree(worktree, round, 'review');
  // T2 opens the round's pages: the stack is started for it, since nothing serves a worktree from its
  // creation (2026-10-04, serve.ts). A stack that will not start leaves the diff to review, and says so.
  try { console.log(await ensureServers(worktree, { wait: true })); } catch (e) { /* the diff is still reviewable: the line says why there are no pages */ console.error((e as Error).message); }
  const beforeAfter = writeBeforeAfter(worktree, round);
  if (beforeAfter) {
    console.log(`before/after: ${beforeAfter}`);
    openFile(beforeAfter);
  }
  const planHtml = writePlan(worktree, round);
  if (planHtml) {
    console.log(`plan: ${planHtml}`);
    openFile(planHtml);
  }
  const standards = [...critiqueFor(worktree), ...standardsFor(worktree)];
  const manual = manualFor(worktree);
  const header = () => renderHeader({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files, beforeAfter, standards, manual });
  const file = roundFile(worktree, 'REVIEW.md');
  if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files, beforeAfter, standards, manual }));
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
  if (verdict === 'approved') await inWorktree(worktree, round, 'pr');
  else if (verdict === 'changes-requested') await inWorktree(worktree, round, 'implement');
  else {
    console.error(`review was dismissed — re-run wf review ${round}`);
    process.exit(2);
  }
}
