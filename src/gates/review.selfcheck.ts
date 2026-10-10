// review.selfcheck.ts — node review.selfcheck.ts → exit 0 when green.
// Fixture JSONL lines (one review with a range, one annotate with a blockId-only
// comment) → folded lines + verdict mapping; resolveWorktree throws helpfully.
import assert from 'node:assert/strict';
import { reviewFiles } from './review.ts';
import { beforeAfterPage, captionFor, proofPairs } from './review-format.ts';
import { commentLine, foldFeedbackLine, lastField, pageLine, planBody, planPage, renderHeader, renderSkeleton, readVerdict, roundArtifacts } from './review-format.ts';
import { appendDecision, STEPS, t1Gap } from '../round/step.ts';
import { agreedOffset, agreedSection } from './agree.ts';
import { agreementSha } from '../round/agreement.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pjoin } from 'node:path';
// A temp worktree with AGREEMENT.md = the observed/agreed material; `review` is AGREEMENT-REVIEW.md's
// text, with `<real>` replaced by the true agreement sha.
function t1GapFor(review: string | null) {
  const d = mkdtempSync(pjoin(tmpdir(), 'wf-t1-'));
  writeFileSync(pjoin(d, 'AGREEMENT.md'), '## Observed\n- x — `a.ts:1`\n\n## Agreed\n- behavior\n');
  if (review !== null) writeFileSync(pjoin(d, 'AGREEMENT-REVIEW.md'), review.replace('<real>', agreementSha(d, 'B', null)!));
  const out = t1Gap(d, { class: 'B' });
  rmSync(d, { recursive: true });
  return out;
}

import { resolveWorktree } from '../worktrees/worktree.ts';

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
check('a review UI digest is not folded: it restates the annotations, section by section', !folded.includes('note —') && !folded.includes('overall good'), folded);
check('annotated maps to changes-requested', folded.endsWith('verdict: changes-requested'), folded);

const annotate = {
  v: 1, ts: '2026-09-17T20:01:00.000Z', client: 'test', project: 'x', surface: 'annotate',
  decision: 'approved', target: 'AGREEMENT.md', feedback: '',
  annotations: [{ blockId: 'usage-table', text: 'add a row' }],
};
// The adapter hands the parsed line, fold also takes its JSON text. Until 2026-10-01 the variants
// below spread the text, which copies its characters, not its fields: none carried the annotation.
const annotateLine = JSON.stringify(annotate);
const folded2 = foldFeedbackLine(annotateLine);
check('blockId-only comment targets the agreement', folded2.includes('AGREEMENT.md:usage-table — add a row'), folded2);
check('approved maps to approved', folded2.endsWith('verdict: approved'), folded2);
check('the review UI\'s own message is the note line (stdout carries only {decision,message})', foldFeedbackLine({ ...annotate, message: 'shown in chat, not in a browser' }).includes('note — shown in chat, not in a browser'), foldFeedbackLine({ ...annotate, message: 'shown in chat, not in a browser' }));
// The shape a real record has: a digest with a section per annotation, a quoted person line, and — the part
// that reached a round's SPEC-REVIEW.md, 2026-10-06 — the element's HTML and box coordinates.
const realDigest = { ...annotate, feedback: '# File Feedback\n\nI\'ve reviewed this file and have 1 pieces of feedback:\n\n## 1. General feedback about the file\n> this is still information overload\n\n- **selector** `#wf-src-50 > strong`\n- **box** 298,315 492×20 (viewport 1680×901)\n\n---\n\n## Label Summary\n' };
check('a real digest folds to its comment lines only — no digest headers, no selectors, no box coordinates', foldFeedbackLine(realDigest) === 'AGREEMENT.md:usage-table — add a row\nverdict: approved', foldFeedbackLine(realDigest));
const lgtm = foldFeedbackLine({ ...annotate, decision: 'lgtm' });
check('review-surface lgtm maps to approved (plannotator 0.27.16)', lgtm.endsWith('verdict: approved') && lgtm.includes('AGREEMENT.md:usage-table — add a row'), lgtm);
const withNotes = foldFeedbackLine({ ...annotate, decision: 'approved-with-notes' });
check('an approval with a comment (approved-with-notes) maps to approved, keeping the comment', withNotes.endsWith('verdict: approved') && withNotes.includes('AGREEMENT.md:usage-table — add a row'), withNotes);
const meh = foldFeedbackLine({ ...annotate, decision: 'meh' });
check('unknown decision maps to changes-requested, keeping the comment', meh.endsWith('verdict: changes-requested') && meh.includes('AGREEMENT.md:usage-table — add a row'), meh);

const skel = renderSkeleton({ round: 'feat/x', klass: 'A', base: 'dev', date: '2026-09-17', files: ['a.ts'] });
check('skeleton verdict is not a real verdict', readVerdict(skel) === null, skel);
const targetLine = { ...annotate, decision: "lgtm", target: { review: { base: "dev", changedFiles: 124 } } };
check('fold records what plannotator actually reviewed', foldFeedbackLine(targetLine).includes("reviewed: dev (124 files)"));
check('lastField takes the newest dated section', lastField('base: dev\nverdict: approved\n## 2\nbase: tools/wf-runtime\n', 'base') === 'tools/wf-runtime');
check('the assessment file counts uncommitted: the assessment phase does not commit it', reviewFiles(['a.ts'], 'bug-reports/r/ASSESSMENT.md', true).includes('bug-reports/r/ASSESSMENT.md') && reviewFiles(['a.ts'], 'bug-reports/r/ASSESSMENT.md', true).length === 2 && reviewFiles(['bug-reports/r/ASSESSMENT.md'], 'bug-reports/r/ASSESSMENT.md', true).length === 1);
// N-4: review.ts's own changedFiles(worktree, base) (review.ts:44) has always taken the base; the T2
// file list is that committed diff plus the round's ASSESSMENT.md, so the check.ts signature change
// does not touch it. The list is the public composition, tested here.
check('N-4: the T2 file list is the committed diff plus the round assessment', JSON.stringify(reviewFiles(['src/Page.svelte', 'src/Other.svelte'], 'bug-reports/r/ASSESSMENT.md', true)) === JSON.stringify(['bug-reports/r/ASSESSMENT.md', 'src/Page.svelte', 'src/Other.svelte']) && JSON.stringify(reviewFiles([], 'bug-reports/r/ASSESSMENT.md', false)) === JSON.stringify([]));
check('t1Gap null when AGREEMENT-REVIEW approves the current material sha', t1GapFor('agreement-sha: <real>\nverdict: approved\n') === null);
check('t1Gap names a re-agreement', /is of 0ld, the agreement is now [0-9a-f]/.test(t1GapFor('agreement-sha: 0ld\nverdict: approved\n')!));
check('t1Gap names a changes-requested verdict', /verdict is changes-requested/.test(t1GapFor('agreement-sha: <real>\nverdict: changes-requested\n')!));
check('agreedSection extracts Observed + Agreed, not the verification cases', agreedSection('# A\n## Observed\no\n\n## Agreed\na\n\n## Verification\n|1|\n', 'B') === '## Observed\no\n\n## Agreed\na');
check('agreedSection for class A is the Intent', agreedSection('# T\n## Intent\ni\n\n## Thread\nx\n', 'A') === '## Intent\ni');
check('agreedOffset: `## Observed` starts at line 3, so a page block carries its agreement line', agreedOffset('# A\n\n## Observed\n\nthe fact\n', 'B') === 2, String(agreedOffset('# A\n\n## Observed\n\nthe fact\n', 'B')));
check('t1Gap names a missing review', t1GapFor(null) === 'no AGREEMENT-REVIEW.md');
check('last verdict line wins', readVerdict(`${skel}\n## 2026-09-18\n\nc.ts:1 — x\nverdict: approved`) === 'approved');

assert.throws(() => resolveWorktree('no-such-round-xyz'), /candidates:/);
check('resolveWorktree throws with candidates on a bogus name', true);

// step.ts: the round's phases, and `wf decide` writing into PLAN.md § Decisions.
check('STEPS are the smaller route', STEPS.join(' ') === 'classify agree build assess review pr merged held', STEPS.join(' '));
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
check('the T2 header carries a manual row as a `manual:` line (prompts/plan.md)', renderHeader({ round: 'r', manual: ['manual: row 2 — the badge shows 3'] }).includes('manual: row 2 — the badge shows 3'));

// The plan page: SHOW-ME.md's views rendered for T1 (.wf/SPEC-T1.html) and T2 (.wf/PLAN.html). Every
// block carries its own markdown line (`wf-src-<line>`) as its first class and as its id, so a comment
// on the page folds back onto that line (pageLine/commentLine below).
const body = planBody('# T\n\n## Build\n\n```diff\n a\n+b\n-c\n~d\n```\n\n- one\n- two\n\n> **ASK-1 (user) — which?**\n');
check('a plan heading becomes h2, the diff markers keep their class', body.includes('<h2 class="wf-src-3" id="wf-src-3">Build</h2>') && body.includes('class="add">+b') && body.includes('class="del">-c') && body.includes('class="chg">~d'), body);
check('every block is tagged with its own line: the tag survives a click inside it', body.includes('<h1 class="wf-src-1" id="wf-src-1">T</h1>') && body.includes('<pre class="wf-src-5 diff" id="wf-src-5">') && body.includes('<blockquote class="wf-src-15 ask" id="wf-src-15">') && body.includes('<li class="wf-src-12" id="wf-src-12">one</li>'), body);
check('a bullet run becomes one list', body.includes('<ul>\n<li class="wf-src-12" id="wf-src-12">one</li>\n<li class="wf-src-13" id="wf-src-13">two</li>\n</ul>'), body);
check('an ASK is a blockquote with a copy button', body.includes('<blockquote class="wf-src-15 ask" id="wf-src-15">') && body.includes('<button class="copy"'), body);
const bare = planBody('```\n+x\n y\n```');
check('a bare fence is coloured like a diff: the call stacks live there', bare.includes('class="add">+x') && bare.includes('class="ctx"> y'), bare);
const indented = planBody('```\n  entry\n    run\n  +    handle\n    ~ changed\n    - gone\n```');
check('an indented hop keeps its marker: a stack indents, so the marker is not at column 0', indented.includes('class="add">  +    handle') && indented.includes('class="chg">    ~ changed') && indented.includes('class="del">    - gone') && indented.includes('class="ctx">  entry'), indented);
const table = planBody('| a | b |\n|---|---|\n');
check('a table is kept as text', table.includes('<pre class="wf-src-1 table" id="wf-src-1">'), table);
const offset = planBody('## H\n\np\n', 10);
check('with a base the tag is the line in the document the section was cut from', offset.includes('<h2 class="wf-src-11" id="wf-src-11">H</h2>') && offset.includes('<p class="wf-src-13" id="wf-src-13">p</p>'), offset);
const withAsk = planPage({ title: 'P', meta: [], section: '> **ASK-1 — which?**\n' });
const withMermaid = planPage({ title: 'P', meta: ['m'], section: '```mermaid\nA->>B: x\n```' });
check('mermaid: the block is drawn by the CDN script', withMermaid.includes('<pre class="wf-src-1 mermaid" id="wf-src-1">A-&gt;&gt;B: x</pre>') && withMermaid.includes('cdn.jsdelivr.net/npm/mermaid'), withMermaid);
check('mermaid follows the page scheme: default writes dark text, unreadable on the dark page', withMermaid.includes('theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"'), withMermaid);
check('the diff markers get a dark-scheme colour too, or they are dim on it', withMermaid.includes('@media (prefers-color-scheme:dark){pre.diff .add{color:#4ade80}'));
check('the copy button falls back when the frame refuses the clipboard API (sandbox, no allow-same-origin)', withAsk.includes('wfCopy') && withAsk.includes('execCommand("copy")') && withAsk.includes('navigator.clipboard'), withAsk);
check('no mermaid script on a page with no mermaid block', !planPage({ title: 'P', meta: [], section: '- a' }).includes('cdn.jsdelivr.net'));
const pageHtml = planPage({ title: '<b>', meta: ['x <y>'], section: '## <i>', artifacts: [{ title: 'v.html', src: '../r/v.html' }] });
check('the page escapes the title, meta and artifact, and embeds it', pageHtml.includes('<title>&lt;b&gt;</title>') && pageHtml.includes('x &lt;y&gt;') && pageHtml.includes('src="../r/v.html"'), pageHtml);
// Folding a comment made on the rendered page back to an agreement line (planBody's tag, pageLine). The
// payloads are what Plannotator 0.28.5 logged for clicks on a styled page (2026-10-06): the tag has to be
// read out of both fields, because elementPath keeps only an element's first class where the selector
// keeps them all, and a click on a `<b>` inside a block reports the block's tag with the `<b>` after it.
const onWrapper = { text: 'here?', elementTag: 'p', elementPath: 'body > div.block:nth-of-type(3)> p', elementSelector: 'div.block.wf-src-12 > p', originalText: 'Comment on this paragraph (the inner element), not the box around it. ← inline comment here' };
check('a page comment folds to the line of the block it landed on, quoting what it landed on', commentLine(onWrapper) === 'AGREEMENT.md:12 — here? (on: Comment on this paragraph (the inner element), not the box around it. ← inline comment here)', commentLine(onWrapper));
const onNested = { text: 'or here?', elementTag: 'b', elementPath: 'body > div.block:nth-of-type(5) > blockquote.wf-src-77 > b', elementSelector: 'blockquote.wf-src-77 > b', originalText: '← inline comment here' };
check('a click inside a block still folds to the block, quoting only the clicked words', commentLine(onNested) === 'AGREEMENT.md:77 — or here? (on: ← inline comment here)', commentLine(onNested));
check('the deepest tag wins when a branch carries two', pageLine({ elementSelector: 'div.wf-src-12 > p.wf-src-42' }) === 42, String(pageLine({ elementSelector: 'div.wf-src-12 > p.wf-src-42' })));
check('a comment on page chrome the page cannot place says so', commentLine({ text: 'nice', elementPath: 'body > div#scriptcheck', originalText: 'SCRIPTS RUN — mermaid would draw' }) === 'AGREEMENT.md:? — nice (on: SCRIPTS RUN — mermaid would draw)', commentLine({ text: 'nice', elementPath: 'body > div#scriptcheck', originalText: 'SCRIPTS RUN — mermaid would draw' }));
// The markdown surface carries originalText too (Shay's own T1 on wf, 2026-10-06): a blockId plus the
// text of the block that was annotated, which is what the reviser needs and used to be dropped.
check('a markdown-surface comment keeps its blockId and gains the quoted block', commentLine({ text: 'main or dev?', blockId: 'block-14', originalText: 'a Desktop session on their main checkout, not the round worktree' }) === 'AGREEMENT.md:block-14 — main or dev? (on: a Desktop session on their main checkout, not the round worktree)', commentLine({ text: 'main or dev?', blockId: 'block-14', originalText: 'a Desktop session on their main checkout, not the round worktree' }));
check('a quote spanning lines stays on one line, clipped to 96', commentLine({ text: 't', blockId: 'b', originalText: `a\nb ${'x'.repeat(200)}` }).startsWith('AGREEMENT.md:b — t (on: a b ') && /\(on: x{95}…\)$/.test(commentLine({ text: 't', blockId: 'b', originalText: 'x'.repeat(200) })), commentLine({ text: 't', blockId: 'b', originalText: 'x'.repeat(200) }));
check('no quote, no `on:`', commentLine({ text: 't', blockId: 'b' }) === 'AGREEMENT.md:b — t', commentLine({ text: 't', blockId: 'b' }));
const foldedPage = foldFeedbackLine({ decision: 'approved-with-notes', target: 'SPEC-T1.html', annotations: [onWrapper] });
check('a page review folds to the same review-file shape, with a real agreement line', foldedPage.includes('AGREEMENT.md:12 — here?') && foldedPage.endsWith('verdict: approved'), foldedPage);

const artDir = mkdtempSync(pjoin(tmpdir(), 'wf-art-'));
writeFileSync(pjoin(artDir, 'b.html'), 'x');
writeFileSync(pjoin(artDir, 'a.html'), 'x');
writeFileSync(pjoin(artDir, 'note.md'), 'x');
const from = mkdtempSync(pjoin(tmpdir(), 'wf-from-'));
const arts = roundArtifacts(artDir, from);
check('round artifacts are the round folder\'s HTML files, in order, relative to the page', arts.length === 2 && arts[0].title === 'a.html' && arts[0].src.endsWith('/a.html') && arts[0].src.startsWith('../'), JSON.stringify(arts));
check('no round folder, no artifacts', roundArtifacts(pjoin(artDir, 'gone'), from).length === 0);
rmSync(artDir, { recursive: true });
rmSync(from, { recursive: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
