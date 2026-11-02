// merged-base.selfcheck.ts — node merged-base.selfcheck.ts → exit 0 when green.
// The merged-base result's persisted shape and its words: red is loud, unchecked is never green.
import { lastLines, mergedBaseLines, mergedBaseNextNote, mergedBaseResultGap } from './merged-base.ts';
import type { MergedBaseResult } from './merged-base.ts';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const stamp = { base: 'origin/dev', sha: 'a'.repeat(40), delivered: 'b'.repeat(40), at: '2026-11-02T10:38:00.000Z' };
const green: MergedBaseResult = { ...stamp, result: 'green' };
const red: MergedBaseResult = { ...stamp, result: 'red', command: 'pnpm check:gate (in packages/frontend/b2b)', tail: "src/routes/cart.test.ts:3:10\nError: Module '\"./support\"' has no exported member 'CartRequest'." };
const unknown: MergedBaseResult = { ...stamp, result: 'not-checked', why: 'pnpm install ran out of the 15 min bound' };

check('every result shape reads back', [green, red, unknown].every((r) => mergedBaseResultGap(r) === null));
check('a malformed result is refused', mergedBaseResultGap({ ...stamp, result: 'red' }) !== null && mergedBaseResultGap({ ...stamp, result: 'maybe' }) !== null && mergedBaseResultGap({ ...stamp, delivered: 'HEAD', result: 'green' }) !== null && mergedBaseResultGap(null) !== null);

const g = mergedBaseLines(green);
check('green is one quiet line', g.out.length === 1 && g.err.length === 0 && /merged base origin\/dev aaaaaaaaaaaa is green/.test(g.out[0]), JSON.stringify(g));
const r = mergedBaseLines(red);
check('red is a banner on stderr with the command and its error lines', r.out.length === 0 && r.err.some((l) => l === 'wf deliver: the merged base origin/dev aaaaaaaaaaaa is RED: pnpm check:gate (in packages/frontend/b2b) failed') && r.err.some((l) => l.includes('CartRequest')) && r.err.some((l) => /merge already happened/.test(l)), JSON.stringify(r));
const u = mergedBaseLines(unknown);
check('not checked says so and is not green', u.out.length === 0 && /NOT CHECKED: pnpm install ran out/.test(u.err[0]) && /not known to be green/.test(u.err[0]), JSON.stringify(u));

check('wf next adds nothing for green or no record', mergedBaseNextNote(green) === null && mergedBaseNextNote(undefined) === null);
check('wf next tells the user about red', /merged base origin\/dev aaaaaaaaaaaa is RED \(pnpm check:gate/.test(mergedBaseNextNote(red) ?? ''));
check('wf next tells the user about not checked', /NOT CHECKED \(pnpm install ran out/.test(mergedBaseNextNote(unknown) ?? ''));
check('lastLines keeps the last non-blank lines', lastLines('a\n\nb\r\nc\n\n', 2) === 'b\nc');

process.exitCode = failures ? 1 : 0;
