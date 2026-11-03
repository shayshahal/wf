// brief-text.selfcheck.ts — node projects/jewelryx/brief-text.selfcheck.ts → exit 0 when green.
// The JewelryX notes of each phase brief: the stack guidance reaches every phase that drives the app,
// the live re-measure only the assessor (audit of 79 JewelryX sessions, 2026-11: agents killed pids by
// hand and ran `cjx stack down` on a wf stack; 0 of 29 reviewers measured live).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';

let failures = 0;
const check = (name: string, cond: unknown) =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}`) as unknown) || (cond || failures++);

const notes = (phase: string) => readFileSync(join(WF_ROOT, 'projects', 'jewelryx', 'prompts', `${phase}.md`), 'utf8').replace(/\s+/g, ' ');
const STACK = ['wf serve --wait', 'wf serve --stop', 'Never kill server pids by hand', 'control-jewelryx.mjs', '`stack down` does nothing', 'refuses beside a `stack up` stack'];
const LIVE = ['live, with cjx on the round\'s stack', 'NOT MEASURED — <why>', 'no UI or API change'];

for (const phase of ['agree', 'build', 'assess']) {
	const t = notes(phase);
	for (const s of STACK) check(`${phase}: stack guidance has "${s}"`, t.includes(s));
	for (const s of LIVE) check(`${phase}: live re-measure ${phase === 'assess' ? 'has' : 'absent:'} "${s}"`, t.includes(s) === (phase === 'assess'));
}

process.exit(failures ? 1 : 0);
