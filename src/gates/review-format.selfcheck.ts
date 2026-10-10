// review-format.selfcheck.ts — node review-format.selfcheck.ts → exit 0 when green.
// The pure renderer the T1/T2 pages come from. The wrapped-bullet arm is the render-check regression
// (2026-10-10): the agreement template wraps a long bullet onto a continuation line, and a comment on
// that line must fold onto the agreement's own line.
import { pageLine, planBody } from './review-format.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// A wrapped Agreed bullet: the continuation stays inside the <li>, with its own wf-src line.
const wrapped = planBody('## Agreed\n\n- a persistent action sidebar on the right.\n  Data and action behavior are unchanged.\n- second\n');
check('a wrapped bullet keeps its continuation in the list item', wrapped.includes('<span class="wf-src-4" id="wf-src-4">Data and action behavior are unchanged.</span></li>'), wrapped);
check('the continuation is not split out as a sibling paragraph', !/<\/ul>\s*<p/.test(wrapped), wrapped);
check('the wrapped item keeps the first line and the closing tag', wrapped.includes('<li class="wf-src-3" id="wf-src-3">a persistent action sidebar on the right. <span'), wrapped);
check('a rendered comment on the continuation folds onto its own line', pageLine({ elementSelector: '#wf-src-4', elementPath: 'body > ul > li#wf-src-3 > span#wf-src-4' }) === 4);
check('the bullet after the continuation is still a list item', wrapped.includes('<li class="wf-src-5" id="wf-src-5">second</li>'), wrapped);

// A blank line closes the list; the next body line is a paragraph, not a continuation.
const after = planBody('- one\n\nplain text\n');
check('a blank line closes the list and the next line is a paragraph', after.includes('</ul>') && after.includes('<p class="wf-src-3" id="wf-src-3">plain text</p>'), after);

// Diff fences colour by marker; hostile text is escaped, never markup.
const diff = planBody('```diff\n+ added\n- removed\n~ changed\n context\n```\n');
check('diff markers colour add/del/chg/ctx', ['add', 'del', 'chg', 'ctx'].every((c) => diff.includes(`class="${c}"`)), diff);
check('hostile text is escaped', planBody('a <script>x</script> b\n').includes('&lt;script&gt;x&lt;/script&gt;'), planBody('a <script>x</script> b\n'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
