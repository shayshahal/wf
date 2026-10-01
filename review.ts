#!/usr/bin/env node
// wf review <round> [--base dev] — T2: skeleton REVIEW.md, browser diff review, fold → REVIEW.md.
// wf review <round> --done — verdict → step implement (changes-requested) | pr (approved).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openFile, openInEditor, opensWindows } from './editor.ts';
import { baseBranch } from './project.ts';
import { resolveWorktree } from './worktree.ts';
import { appendDatedSection, asBuiltFile, beforeAfterPage, captionFor, devUrlsFor, foldFeedbackLine, lastField, proofPairs, readVerdict, renderHeader, renderSkeleton, specShaFor, wfDir } from './review-format.ts';
import { seams } from './seams.ts';
import { roundFile } from './state.ts';
import type { State } from './state.ts';
import { runStep } from './step.ts';

const usage: () => never = () => {
  console.error('usage: wf review <round> [--base dev] | wf review <round> --done');
  process.exit(2);
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
const readState = (worktree: string): State => {
  try {
    return JSON.parse(readFileSync(join(worktree, '.wf', 'state.json'), 'utf8'));
  } catch {
    return {};
  }
};
const persistedBase = (worktree: string) => readState(worktree).base ?? null;
const changedFiles = (worktree: string, base: string): string[] => {
  try {
    return execFileSync('git', ['-C', worktree, 'diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
};
const classify = (worktree: string, base: string): string => {
  try {
    return JSON.parse(execFileSync('node', [join(wfDir, 'classify.ts'), '--base', base, '--json'], { cwd: worktree, encoding: 'utf8' })).class;
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
  const beforeAfter = writeBeforeAfter(worktree, round);
  if (beforeAfter) {
    console.log(`before/after: ${beforeAfter}`);
    openFile(beforeAfter);
  }
  const header = () => renderHeader({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files, beforeAfter });
  const file = roundFile(worktree, 'REVIEW.md');
  if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files, beforeAfter }));
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
