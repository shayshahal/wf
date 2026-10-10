// review-format.selfcheck.ts — node review-format.selfcheck.ts → exit 0 when green.
// The pure renderer the T1/T2 pages come from. The wrapped-bullet arm is the render-check regression
// (2026-10-10): the agreement template wraps a long bullet onto a continuation line, and a comment on
// that line must fold onto the agreement's own line.
import { pageLine, agreementBody } from './review-format.ts';

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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
