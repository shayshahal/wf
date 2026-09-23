// review.selfcheck.mjs — node JewelryX-Tools/wf/review.selfcheck.mjs → exit 0 when green.
// Fixture JSONL lines (one review with a range, one annotate with a blockId-only
// comment) → folded lines + verdict mapping; resolveWorktree throws helpfully.
import assert from 'node:assert/strict';
import { asBuiltFile, foldFeedbackLine, lastField, renderHeader, renderSkeleton, readVerdict, specShaFor } from './review-format.mjs';
import { appendDecision, STEPS, t1Gap } from './step.mjs';
import { forT1Section } from './design.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
// A temp worktree with SPEC.md = 'x'; `review` is the SPEC-REVIEW.md text, with `<real>` replaced by the true sha.
function t1GapFor(review) {
  const d = mkdtempSync(pjoin(tmpdir(), 'wf-t1-'));
  writeFileSync(pjoin(d, 'SPEC.md'), 'x');
  if (review !== null) writeFileSync(pjoin(d, 'SPEC-REVIEW.md'), review.replace('<real>', specShaFor(d)));
  const out = t1Gap(d);
  rmSync(d, { recursive: true });
  return out;
}

import { resolveWorktree } from './resolve-worktree.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const reviewLine = JSON.stringify({
  v: 1, ts: '2026-09-17T20:00:00.000Z', client: 'test', project: 'x', surface: 'review',
  decision: 'annotated', target: 'branch', feedback: 'overall good',
  annotations: [
    { file: 'a/b.ts', lineStart: 10, lineEnd: 14, text: 'rename this' },
    { file: 'c.ts', lineStart: 3, lineEnd: 3, text: 'nit' },
  ],
});
const folded = foldFeedbackLine(reviewLine);
check('range folds to path:start-end', folded.includes('a/b.ts:10-14 — rename this'), folded);
check('single line folds without range', folded.includes('c.ts:3 — nit'), folded);
check('feedback becomes a note line', folded.includes('note — overall good'), folded);
check('annotated maps to changes-requested', folded.endsWith('verdict: changes-requested'), folded);

const annotateLine = JSON.stringify({
  v: 1, ts: '2026-09-17T20:01:00.000Z', client: 'test', project: 'x', surface: 'annotate',
  decision: 'approved', target: 'SPEC.md', feedback: '',
  annotations: [{ blockId: 'usage-table', text: 'add a row' }],
});
const folded2 = foldFeedbackLine(annotateLine);
check('blockId-only comment targets SPEC.md', folded2.includes('SPEC.md:usage-table — add a row'), folded2);
check('approved maps to approved', folded2.endsWith('verdict: approved'), folded2);
check('review-surface lgtm maps to approved (plannotator 0.27.16)', foldFeedbackLine({ ...annotateLine, decision: 'lgtm' }).endsWith('verdict: approved'));
check('an approval with a comment (approved-with-notes) maps to approved', foldFeedbackLine({ ...annotateLine, decision: 'approved-with-notes' }).endsWith('verdict: approved'));
check('unknown decision maps to changes-requested', foldFeedbackLine({ ...annotateLine, decision: 'meh' }).endsWith('verdict: changes-requested'));

const skel = renderSkeleton({ round: 'feat/x', klass: 'A', base: 'dev', date: '2026-09-17', files: ['a.ts'] });
check('skeleton verdict is not a real verdict', readVerdict(skel) === null, skel);
const targetLine = { ...annotateLine, decision: "lgtm", target: { review: { base: "dev", changedFiles: 124 } } };
check('fold records what plannotator actually reviewed', foldFeedbackLine(targetLine).includes("reviewed: dev (124 files)"));
check('lastField takes the newest dated section', lastField('base: dev\nverdict: approved\n## 2\nbase: tools/wf-runtime\n', 'base') === 'tools/wf-runtime');
check('as-built file found anywhere in the diff', asBuiltFile(['x.ts', 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md']) === 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md');
check('header lists the as-built file first under look at', renderHeader({ round: 'r', klass: 'B', base: 'dev', urls: 'B2B:     http://localhost:1\n', files: ['packages/frontend/b2b/src/routes/(auth)/login/+page.svelte', 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md'] }).match(/^look at: .*$/m)[0].includes('CALL-STACK-AS-BUILT'));
check('t1Gap null when SPEC-REVIEW approves the current sha', t1GapFor('spec-sha: <real>\nverdict: approved\n') === null);
check('t1Gap names a re-spec', /is of sha256:0ld, SPEC.md is now sha256:/.test(t1GapFor('spec-sha: sha256:0ld\nverdict: approved\n')));
check('t1Gap names a changes-requested verdict', /verdict is changes-requested/.test(t1GapFor('spec-sha: <real>\nverdict: changes-requested\n')));
check('forT1Section extracts only the T1 section', forT1Section('# S\n## For T1\na\nb\n\n## As-is\nx\n') === '## For T1\na\nb\n');
check('forT1Section null on the older shape', forT1Section('# S\n## As-is\nx\n') === null);
check('t1Gap names a missing review', t1GapFor(null) === 'no SPEC-REVIEW.md');
check('last verdict line wins', readVerdict(`${skel}\n## 2026-09-18\n\nc.ts:1 — x\nverdict: approved`) === 'approved');

assert.throws(() => resolveWorktree('no-such-round-xyz'), /candidates:/);
check('resolveWorktree throws with candidates on a bogus name', true);

// step.mjs: the round's phases, and `wf decide` writing into PLAN.md § Decisions.
check('STEPS carry research and plan before design', STEPS.join(' ') === 'classify research plan design implement review pr merged held', STEPS.join(' '));
const planNoSection = '# p\n\n## Asks\nnone\n';
check('decide creates ## Decisions when there is none', appendDecision(planNoSection, 'use 30 days', '2026-09-22') === '# p\n\n## Asks\nnone\n\n## Decisions\n- 2026-09-22 use 30 days\n', JSON.stringify(appendDecision(planNoSection, 'use 30 days', '2026-09-22')));
const twice = appendDecision(appendDecision(planNoSection, 'a', '2026-09-22'), 'b', '2026-09-23');
check('a second decision appends under the same heading', twice.endsWith('## Decisions\n- 2026-09-22 a\n- 2026-09-23 b\n') && twice.match(/## Decisions/g).length === 1, JSON.stringify(twice));
const mid = appendDecision('# p\n\n## Decisions\n- 2026-09-01 old\n\n## T2 walk\nopen /x\n', 'new one', '2026-09-22');
check('a decision lands inside the section, not at the end of the file', mid.includes('- 2026-09-01 old\n- 2026-09-22 new one\n\n## T2 walk'), JSON.stringify(mid));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
