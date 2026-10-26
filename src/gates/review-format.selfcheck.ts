// review-format.selfcheck.ts — node review-format.selfcheck.ts → exit 0 when green.
// The pure review-format pieces: folding a rendered-page comment onto its agreement line, the proof pairs, the header.
import { isDeepStrictEqual } from 'node:util';
import { pageLine, proofPairs, unpairedProofImages, renderHeader, reviewScopeBinding, scopedApprovalGap } from './review-format.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('a rendered comment on the continuation folds onto its own line', pageLine({ elementSelector: '#wf-src-4', elementPath: 'body > ul > li#wf-src-3 > span#wf-src-4' }) === 4);

check('a comment on a nested bullet folds onto its own line', pageLine({ elementSelector: '#wf-src-2', elementPath: 'body > ul > li#wf-src-1 > ul > li#wf-src-2' }) === 2);

// JX-1239: a round shot after-he-1280-assess.png, after-start-now-checked.png … and wf post attached zero:
// pairing took numbered names only. A meaningful name is a name; a side with no partner is still shown.
const incident = ["after-he-1280-assess.png", "after-he-1024-assess.png", "after-start-now-checked.png", "notes.md"];
const named = proofPairs(incident);
check("named after-only screenshots are all recognized, none invented a before", named.length === 3 && named.every((p) => p.after && !p.before), JSON.stringify(named));
check("named screenshots keep their label and sort by it", JSON.stringify(named.map((p) => ('label' in p ? p.label : p.n))) === JSON.stringify(["he-1024-assess", "he-1280-assess", "start-now-checked"]), JSON.stringify(named));
const mixed = proofPairs(["after-login.png", "before-login.png", "before-2.png", "after-10.png", "after-2.png"]);
check("a before and an after with the same label pair; numbers sort numerically and come before names", isDeepStrictEqual(mixed, [{ n: 2, before: "before-2.png", after: "after-2.png" }, { n: 10, after: "after-10.png" }, { label: "login", before: "before-login.png", after: "after-login.png" }]), JSON.stringify(mixed));
const twins = proofPairs(["before-1.png", "before-01.png", "after-1.jpg", "after-1.png"]).flatMap((p) => [p.before, p.after]).filter(Boolean).sort();
check("no picture is dropped for sharing a number or a label with another", twins.join() === "after-1.jpg,after-1.png,before-01.png,before-1.png", twins.join());
check("jpg, jpeg, webp and upper-case names are screenshots too", proofPairs(["after-a.JPG", "after-b.jpeg", "before-c.webp"]).length === 3);
check("only before-/after- pictures pair: other files and other pictures do not", proofPairs(["listing.png", "trace.zip", "after.md", "afterwards-1.png", "before-.png"]).length === 0);
check("pictures proof/ has that no pair takes are named, so a post can say it refused them", unpairedProofImages(["listing.png", "after-1.png", "trace.zip", "video.webm", "Shot.JPG"]).join() === "listing.png,Shot.JPG", unpairedProofImages(["listing.png", "after-1.png", "trace.zip", "Shot.JPG"]).join());

// A checkpoint review binds its `scope:` in the verdict's own section, so a checkpoint's approval and
// the final review's cannot stand for each other (review-format.ts).
const chunk = 'round: r\nbase: h0\ncontent-sha: tree:w\nhead-sha: tree:h\nscope: checkpoint\n\nverdict: approved\n';
check('the scope is read from the verdict\u2019s own section', reviewScopeBinding(chunk).scope === 'checkpoint' && reviewScopeBinding(chunk).verdict === 'approved', JSON.stringify(reviewScopeBinding(chunk)));
check('a verdict cannot borrow a later section\u2019s scope', reviewScopeBinding('scope: checkpoint\ncontent-sha: tree:a\nhead-sha: tree:a\nverdict: approved\n\n## 2026-10-12\nscope: final\ncontent-sha: tree:w\nhead-sha: tree:h\nverdict: pending (\u2026)\n').scope === 'checkpoint');
check('a scope-less verdict reads as unscoped', reviewScopeBinding('content-sha: tree:w\nhead-sha: tree:h\nverdict: approved\n').scope === null);
check('a checkpoint approval does not stand for the final review', (scopedApprovalGap(chunk, { worktree: 'tree:w', head: 'tree:h' }, 'final') ?? '').includes('not final'));
check('a checkpoint approval stands for the checkpoint it names', scopedApprovalGap(chunk, { worktree: 'tree:w', head: 'tree:h' }, 'checkpoint') === null);
check('a scoped approval still refuses stale content', (scopedApprovalGap(chunk, { worktree: 'tree:x', head: 'tree:h' }, 'checkpoint') ?? '').includes('working tree changed'));
check('the header carries the scope and the chunk\u2019s own lines', (() => { const h = renderHeader({ round: 'r', base: 'h0', contentSha: 'tree:w', headSha: 'tree:h', scope: 'unit:1', chunk: ['chunk: unit 1 \u2014 the API shape', 'cases: 1, 2'] }); return h.includes('scope: unit:1') && h.includes('chunk: unit 1 \u2014 the API shape') && h.includes('cases: 1, 2'); })());
check('a single-build header has no scope line', !renderHeader({ round: 'r', base: 'main', contentSha: 'tree:w', headSha: 'tree:h' }).includes('scope:'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
