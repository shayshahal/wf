// review-format.selfcheck.ts — node review-format.selfcheck.ts → exit 0 when green.
// The pure renderer the T1/T2 pages come from. The wrapped-bullet arm is the render-check regression
// (2026-10-10): the agreement template wraps a long bullet onto a continuation line, and a comment on
// that line must fold onto the agreement's own line.
import { isDeepStrictEqual } from 'node:util';
import { pageLine, agreementBody, proofPairs, unpairedProofImages, renderHeader, reviewScopeBinding, scopedApprovalGap } from './review-format.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// A wrapped Agreed bullet: the continuation stays inside the <li>, with its own wf-src line.
const wrapped = agreementBody('## Agreed\n\n- a persistent action sidebar on the right.\n  Data and action behavior are unchanged.\n- second\n');
check('a wrapped bullet keeps its continuation in the list item', wrapped.includes('<span class="wf-src-4" id="wf-src-4">Data and action behavior are unchanged.</span></li>'), wrapped);
check('the continuation is not split out as a sibling paragraph', !/<\/ul>\s*<p/.test(wrapped), wrapped);
check('the wrapped item keeps the first line and the closing tag', wrapped.includes('<li class="wf-src-3" id="wf-src-3">a persistent action sidebar on the right. <span'), wrapped);
check('a rendered comment on the continuation folds onto its own line', pageLine({ elementSelector: '#wf-src-4', elementPath: 'body > ul > li#wf-src-3 > span#wf-src-4' }) === 4);
check('the bullet after the continuation is still a list item', wrapped.includes('<li class="wf-src-5" id="wf-src-5">second</li>'), wrapped);

// A blank line closes the list; the next body line is a paragraph, not a continuation.
const after = agreementBody('- one\n\nplain text\n');
check('a blank line closes the list and the next line is a paragraph', after.includes('</ul>') && after.includes('<p class="wf-src-3" id="wf-src-3">plain text</p>'), after);

// A nested bullet is its own list inside the parent item, not flattened into the parent's text
// (2026-10-10 closure, F7): the hierarchy a comment (and a reader) needs survives the render.
const nested = agreementBody('- top item\n  - nested a\n  - nested b\n- second\n');
check('a nested bullet opens a list inside the parent item', nested.includes('<li class="wf-src-1" id="wf-src-1">top item\n<ul>'), nested);
check('each nested bullet is its own item, tagged with its own line', nested.includes('<li class="wf-src-2" id="wf-src-2">nested a</li>\n<li class="wf-src-3" id="wf-src-3">nested b</li>'), nested);
check('the nested list closes inside the parent, before the next top-level item', nested.includes('<li class="wf-src-3" id="wf-src-3">nested b</li>\n</ul></li>\n<li class="wf-src-4" id="wf-src-4">second</li>'), nested);
check('a comment on a nested bullet folds onto its own line', pageLine({ elementSelector: '#wf-src-2', elementPath: 'body > ul > li#wf-src-1 > ul > li#wf-src-2' }) === 2);
const deeper = agreementBody('- top\n  - a\n    - deeper\n  - b\n');
check('a deeper bullet nests inside its parent bullet, not beside it', deeper.includes('<li class="wf-src-2" id="wf-src-2">a\n<ul>\n<li class="wf-src-3" id="wf-src-3">deeper</li>\n</ul></li>\n<li class="wf-src-4" id="wf-src-4">b</li>'), deeper);

// Diff fences colour by marker; hostile text is escaped, never markup.
const diff = agreementBody('```diff\n+ added\n- removed\n~ changed\n context\n```\n');
check('diff markers colour add/del/chg/ctx', ['add', 'del', 'chg', 'ctx'].every((c) => diff.includes(`class="${c}"`)), diff);
check('hostile text is escaped', agreementBody('a <script>x</script> b\n').includes('&lt;script&gt;x&lt;/script&gt;'), agreementBody('a <script>x</script> b\n'));

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

// A planned round's review binds its `scope:` in the verdict's own section, so a chunk's approval and
// the integration's cannot stand for each other (build-units.ts, HUMAN-TOUCHPOINTS.md).
const chunk = 'round: r\nbase: h0\ncontent-sha: tree:w\nhead-sha: tree:h\nscope: unit:1\n\nverdict: approved\n';
check('the scope is read from the verdict\u2019s own section', reviewScopeBinding(chunk).scope === 'unit:1' && reviewScopeBinding(chunk).verdict === 'approved', JSON.stringify(reviewScopeBinding(chunk)));
check('a verdict cannot borrow a later section\u2019s scope', reviewScopeBinding('scope: unit:1\ncontent-sha: tree:a\nhead-sha: tree:a\nverdict: approved\n\n## 2026-10-12\nscope: integration\ncontent-sha: tree:w\nhead-sha: tree:h\nverdict: pending (\u2026)\n').scope === 'unit:1');
check('a scope-less verdict reads as unscoped', reviewScopeBinding('content-sha: tree:w\nhead-sha: tree:h\nverdict: approved\n').scope === null);
check('a chunk approval does not stand for the integration', (scopedApprovalGap(chunk, { worktree: 'tree:w', head: 'tree:h' }, 'integration') ?? '').includes('not integration'));
check('a chunk approval stands for the chunk it names', scopedApprovalGap(chunk, { worktree: 'tree:w', head: 'tree:h' }, 'unit:1') === null);
check('a scoped approval still refuses stale content', (scopedApprovalGap(chunk, { worktree: 'tree:x', head: 'tree:h' }, 'unit:1') ?? '').includes('working tree changed'));
check('the header carries the scope and the chunk\u2019s own lines', (() => { const h = renderHeader({ round: 'r', base: 'h0', contentSha: 'tree:w', headSha: 'tree:h', scope: 'unit:1', chunk: ['chunk: unit 1 \u2014 the API shape', 'cases: 1, 2'] }); return h.includes('scope: unit:1') && h.includes('chunk: unit 1 \u2014 the API shape') && h.includes('cases: 1, 2'); })());
check('a single-build header has no scope line', !renderHeader({ round: 'r', base: 'main', contentSha: 'tree:w', headSha: 'tree:h' }).includes('scope:'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
