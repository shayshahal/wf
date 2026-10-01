// review.selfcheck.mts — node review.selfcheck.mts → exit 0 when green.
// Fixture JSONL lines (one review with a range, one annotate with a blockId-only
// comment) → folded lines + verdict mapping; resolveWorktree throws helpfully.
import assert from 'node:assert/strict';
import { reviewFiles } from './review.mts';
import { beforeAfterPage, captionFor, proofPairs } from './review-format.mts';
import { asBuiltFile, foldFeedbackLine, lastField, renderHeader, renderSkeleton, readVerdict, specShaFor } from './review-format.mts';
import { appendDecision, STEPS, t1Gap } from './step.mts';
import { forT1Section } from './design.mts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
// A temp worktree with SPEC.md = 'x'; `review` is the SPEC-REVIEW.md text, with `<real>` replaced by the true sha.
function t1GapFor(review: string | null) {
  const d = mkdtempSync(pjoin(tmpdir(), 'wf-t1-'));
  writeFileSync(pjoin(d, 'SPEC.md'), 'x');
  if (review !== null) writeFileSync(pjoin(d, 'SPEC-REVIEW.md'), review.replace('<real>', specShaFor(d)!));
  const out = t1Gap(d);
  rmSync(d, { recursive: true });
  return out;
}

import { resolveWorktree } from './worktree.mts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

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

const annotate = {
  v: 1, ts: '2026-09-17T20:01:00.000Z', client: 'test', project: 'x', surface: 'annotate',
  decision: 'approved', target: 'SPEC.md', feedback: '',
  annotations: [{ blockId: 'usage-table', text: 'add a row' }],
};
// The adapter hands the parsed line, fold also takes its JSON text. Until 2026-10-01 the variants
// below spread the text, which copies its characters, not its fields: none carried the annotation.
const annotateLine = JSON.stringify(annotate);
const folded2 = foldFeedbackLine(annotateLine);
check('blockId-only comment targets SPEC.md', folded2.includes('SPEC.md:usage-table — add a row'), folded2);
check('approved maps to approved', folded2.endsWith('verdict: approved'), folded2);
const lgtm = foldFeedbackLine({ ...annotate, decision: 'lgtm' });
check('review-surface lgtm maps to approved (plannotator 0.27.16)', lgtm.endsWith('verdict: approved') && lgtm.includes('SPEC.md:usage-table — add a row'), lgtm);
const withNotes = foldFeedbackLine({ ...annotate, decision: 'approved-with-notes' });
check('an approval with a comment (approved-with-notes) maps to approved, keeping the comment', withNotes.endsWith('verdict: approved') && withNotes.includes('SPEC.md:usage-table — add a row'), withNotes);
const meh = foldFeedbackLine({ ...annotate, decision: 'meh' });
check('unknown decision maps to changes-requested, keeping the comment', meh.endsWith('verdict: changes-requested') && meh.includes('SPEC.md:usage-table — add a row'), meh);

const skel = renderSkeleton({ round: 'feat/x', klass: 'A', base: 'dev', date: '2026-09-17', files: ['a.ts'] });
check('skeleton verdict is not a real verdict', readVerdict(skel) === null, skel);
const targetLine = { ...annotate, decision: "lgtm", target: { review: { base: "dev", changedFiles: 124 } } };
check('fold records what plannotator actually reviewed', foldFeedbackLine(targetLine).includes("reviewed: dev (124 files)"));
check('lastField takes the newest dated section', lastField('base: dev\nverdict: approved\n## 2\nbase: tools/wf-runtime\n', 'base') === 'tools/wf-runtime');
check('the as-built file counts uncommitted: the as-built phase does not commit it (TJEW-670.11)', asBuiltFile(reviewFiles(['a.ts'], 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md', true)) === 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md' && asBuiltFile(reviewFiles(['a.ts'], 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md', false)) === null && reviewFiles(['bug-reports/r/proof/CALL-STACK-AS-BUILT.md'], 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md', true).length === 1);
check('as-built file found anywhere in the diff', asBuiltFile(['x.ts', 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md']) === 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md');
check('header lists the as-built file first under look at', renderHeader({ round: 'r', klass: 'B', base: 'dev', urls: 'b2b:   http://localhost:1\n', files: ['packages/frontend/b2b/src/routes/(auth)/login/+page.svelte', 'bug-reports/r/proof/CALL-STACK-AS-BUILT.md'] }).match(/^look at: .*$/m)![0].includes('CALL-STACK-AS-BUILT'));
check('t1Gap null when SPEC-REVIEW approves the current sha', t1GapFor('spec-sha: <real>\nverdict: approved\n') === null);
check('t1Gap names a re-spec', /is of sha256:0ld, SPEC.md is now sha256:/.test(t1GapFor('spec-sha: sha256:0ld\nverdict: approved\n')!));
check('t1Gap names a changes-requested verdict', /verdict is changes-requested/.test(t1GapFor('spec-sha: <real>\nverdict: changes-requested\n')!));
check('forT1Section extracts only the T1 section', forT1Section('# S\n## For T1\na\nb\n\n## As-is\nx\n') === '## For T1\na\nb\n');
check('forT1Section null on the older shape', forT1Section('# S\n## As-is\nx\n') === null);
check('t1Gap names a missing review', t1GapFor(null) === 'no SPEC-REVIEW.md');
check('last verdict line wins', readVerdict(`${skel}\n## 2026-09-18\n\nc.ts:1 — x\nverdict: approved`) === 'approved');

assert.throws(() => resolveWorktree('no-such-round-xyz'), /candidates:/);
check('resolveWorktree throws with candidates on a bogus name', true);

// step.mts: the round's phases, and `wf decide` writing into PLAN.md § Decisions.
check('STEPS carry research and plan before design', STEPS.join(' ') === 'classify research plan design implement review pr merged held', STEPS.join(' '));
const planNoSection = '# p\n\n## Asks\nnone\n';
check('decide creates ## Decisions when there is none', appendDecision(planNoSection, 'use 30 days', '2026-09-22') === '# p\n\n## Asks\nnone\n\n## Decisions\n- 2026-09-22 use 30 days\n', JSON.stringify(appendDecision(planNoSection, 'use 30 days', '2026-09-22')));
const twice = appendDecision(appendDecision(planNoSection, 'a', '2026-09-22'), 'b', '2026-09-23');
check('a second decision appends under the same heading', twice.endsWith('## Decisions\n- 2026-09-22 a\n- 2026-09-23 b\n') && twice.match(/## Decisions/g)!.length === 1, JSON.stringify(twice));
const mid = appendDecision('# p\n\n## Decisions\n- 2026-09-01 old\n\n## T2 walk\nopen /x\n', 'new one', '2026-09-22');
check('a decision lands inside the section, not at the end of the file', mid.includes('- 2026-09-01 old\n- 2026-09-22 new one\n\n## T2 walk'), JSON.stringify(mid));

// Before/after: research's proof/before-<n>.png and validate's proof/after-<n>.png, paired for T2.
const pairs = proofPairs(['after-2.png', 'before-1.png', 'CALL-STACK-AS-BUILT.md', 'after-1.png', 'listing.png', 'before-10.png']);
check('screenshots pair by number, in order; other proof files are not pictures of a pair', JSON.stringify(pairs) === JSON.stringify([{ n: 1, before: 'before-1.png', after: 'after-1.png' }, { n: 2, after: 'after-2.png' }, { n: 10, before: 'before-10.png' }]), JSON.stringify(pairs));
const research = '## Before\n`proof/before-1.png` \u2014 admin on /admin/listings: the pending row, no countdown\n';
const validation = '## Live\nVERIFIED \u2014 the row counts down 23:59:58 \u2014 proof/after-1.png\n';
check('a before caption is its RESEARCH.md line without the name', captionFor('before-1.png', [research, validation]) === 'admin on /admin/listings: the pending row, no countdown', captionFor('before-1.png', [research, validation]));
check('an after caption is its Live line without the name', captionFor('after-1.png', [research, validation]) === 'VERIFIED \u2014 the row counts down 23:59:58', captionFor('after-1.png', [research, validation]));
check('a picture no file names has no caption', captionFor('after-2.png', [research, validation]) === '');
const page = beforeAfterPage({ round: 'TJEW-1', pairs, captions: { 'before-1.png': 'a <b>' }, src: '../bug-reports/TJEW-1/proof' });
check('the page shows each side from the proof folder, escaped, and says when a side is missing', page.includes('src="../bug-reports/TJEW-1/proof/before-1.png"') && page.includes('a &lt;b&gt;') && page.includes('class="none"'), page);
const withPage = renderHeader({ round: 'r', files: [], beforeAfter: '/w/.wf/before-after.html' });
check('the T2 header points at the before/after page', withPage.includes('look at: /w/.wf/before-after.html'), withPage);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
