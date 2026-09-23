#!/usr/bin/env node
// wf review <round> [--base dev] — T2: skeleton REVIEW.md, browser diff review, fold → REVIEW.md.
// wf review <round> --done — verdict → step implement (changes-requested) | pr (approved).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlannotatorPresent, reviewDiff } from './adapters/plannotator.mjs';
import { openInEditor } from './editor.mjs';
import { resolveWorktree } from './resolve-worktree.mjs';
import { appendDatedSection, asBuiltFile, devUrlsFor, foldFeedbackLine, lastField, readVerdict, renderHeader, renderSkeleton, specShaFor, wfDir } from './review-format.mjs';
import { roundFile } from './state.mjs';
import { runStep } from './step.mjs';

const usage = () => {
  console.error('usage: wf review <round> [--base dev] | wf review <round> --done');
  process.exit(2);
};
const inWorktree = async (worktree, round, step) => {
  const prev = process.cwd();
  process.chdir(worktree);
  try {
    await runStep([step, '--waiting-on', 'shay', '--round', round]);
  } finally {
    process.chdir(prev);
  }
};
const readState = (worktree) => {
  try {
    return JSON.parse(readFileSync(join(worktree, '.wf', 'state.json'), 'utf8'));
  } catch {
    return {};
  }
};
const persistedBase = (worktree) => readState(worktree).base ?? null;
// REVIEW.md is written after deliver committed the round folder: commit it and push it to the PR
// branch, so the merge carries the T2 record (dev has no branch protection: the push does not hold it).
const keepReview = (worktree, file, round) => {
  const rel = relative(worktree, file).replace(/\\/g, '/');
  const git = (args) => spawnSync('git', ['-C', worktree, ...args], { encoding: 'utf8' });
  if (git(['status', '--porcelain', '--', rel]).stdout.trim() === '') return;
  git(['add', '--', rel]);
  const verdict = readVerdict(readFileSync(file, 'utf8')) ?? 'pending';
  const committed = git(['commit', '-q', '-m', `docs(${readState(worktree).id ?? round}): T2 review — ${verdict}`, '--', rel]);
  if (committed.status !== 0) return console.error(`wf review: could not commit ${rel}: ${`${committed.stdout}${committed.stderr}`.trim().split('\n').at(-1)}`);
  const pushed = git(['push', '-q']);
  if (pushed.status !== 0) console.error(`wf review: committed ${rel}, the push failed — push before merging: ${pushed.stderr.trim().split('\n').at(-1)}`);
};
const changedFiles = (worktree, base) => {
  try {
    return execFileSync('git', ['-C', worktree, 'diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
};
const classify = (worktree, base) => {
  try {
    return JSON.parse(execFileSync('node', [join(wfDir, 'classify.mjs'), '--base', base, '--json'], { cwd: worktree, encoding: 'utf8' })).class;
  } catch {
    return '—'; // classify.mjs not installed yet (Task 1 worktree) — header says so
  }
};

export async function runReview(argv) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) usage();
  const { path: worktree } = resolveWorktree(round);
  if (argv.includes('--done')) return runReviewDone(worktree, round);
  // Base: --base, else the round's persisted base (wf new --base), else dev. A round cut from
  // tools/wf-runtime reviewed against dev showed 124 files and class B — the runtime's own commits.
  const bi = argv.indexOf('--base');
  const base = bi === -1 ? (persistedBase(worktree) ?? 'dev') : (argv[bi + 1] ?? usage());
  // The stored class is the asserted one (B/C never downgrade); the measurement is only a fallback.
  const klass = readState(worktree).class ?? classify(worktree, base);
  const files = changedFiles(worktree, base);
  if ((klass === 'B' || klass === 'C') && !asBuiltFile(files)) {
    console.error(`wf review: class ${klass} round without proof/CALL-STACK-AS-BUILT.md in its diff — the worker delivers it before T2 (the contract change is what T2 reads first)`);
    process.exit(2);
  }
  await inWorktree(worktree, round, 'review');
  const header = () => renderHeader({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files });
  const file = roundFile(worktree, 'REVIEW.md');
  if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, klass, base, specSha: specShaFor(worktree), urls: devUrlsFor(worktree), files }));
  if (!isPlannotatorPresent()) {
    if (!openInEditor([worktree, file])) console.log(`fallback: no editor found — review by hand:\n  worktree: ${worktree}\n  review file: ${file}`);
    else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
    return;
  }
  // merge-base, not branch: branch diffs against the tip of base, so a dev that moved on showed its
  // newer commits as reverts inside the round (TJEW-700). plannotator computes the merge-base itself.
  const line = reviewDiff({ worktree, base, diffType: 'merge-base', since: new Date().toISOString() });
  appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
  console.log(`wrote ${file}`);
  keepReview(worktree, file, round);
}

async function runReviewDone(worktree, round) {
  const file = roundFile(worktree, 'REVIEW.md');
  if (!existsSync(file)) {
    console.error(`no ${file} — run wf review ${round} first`);
    process.exit(2);
  }
  keepReview(worktree, file, round); // the editor fallback: Shay filled it by hand
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
