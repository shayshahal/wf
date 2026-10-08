// state-trace.selfcheck.ts — node state-trace.selfcheck.ts → exit 0 when green.
// The arm that matters: a write whose patch carries a `briefs` map built from an older read drops the
// phase briefed in between (JX-252, 2026-10-07), and the line names what went and who wrote.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState } from './state.ts';
import { briefsCounts, droppedBriefs, STATE_WRITES_LOG, stateWriteLine } from './state-trace.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const at = '2026-10-07T16:40:00.000Z';
const disk: State = { round: 'fix/jx-252', briefs: {
  research: { token: 'cc8138', at, count: 1 }, plan: { token: '508d77', at, count: 3 },
  validate: { token: '264620', at, count: 3 }, critique: { token: 'ed3c1c', at, count: 2 } } };
const briefs = disk.briefs!;

check('counts in briefing order', briefsCounts(briefs) === 'research=1 plan=3 validate=3 critique=2', briefsCounts(briefs));
check('a round with no briefs is empty', briefsCounts(undefined) === '' && briefsCounts({}) === '');

// The rewind, and the writes that are not one.
check('a lower count is a drop', droppedBriefs(disk, { ...disk, briefs: { ...briefs, validate: { token: '48e6c0', at, count: 1 } } }).join() === 'validate:3->1');
check('a brief gone is a drop', droppedBriefs(disk, { ...disk, briefs: { research: briefs.research, plan: briefs.plan } }).join(';') === 'validate:3->0;critique:2->0');
check('a write with no briefs at all drops every one it replaced', droppedBriefs(disk, { ...disk, briefs: {} }).length === 4);
check('a precise patch that keeps them all is not', droppedBriefs(disk, { ...disk }).length === 0);
check('a phase briefed for the first time is not', droppedBriefs(disk, { ...disk, briefs: { ...briefs, 'implement 10': { token: 'aaaaaa', at, count: 1 } } }).length === 0);
check('a grown count is not', droppedBriefs(disk, { ...disk, briefs: { ...briefs, plan: { token: '508d77', at, count: 4 } } }).length === 0);
check('nothing on disk yet is not', droppedBriefs(null, { briefs: { validate: { token: 'aaaaaa', at, count: 1 } } }).length === 0);

const line = JSON.parse(stateWriteLine({ ts: at, pid: 1, ppid: 2, up: 0.3, entry: 'C:/wf/env/wf.mjs', cmd: 'brief validate', cwd: 'C:/r', patch: ['briefs'], before: disk, after: { ...disk, briefs: { ...briefs, validate: { token: '48e6c0', at, count: 1 } } } }));
check('the line names the writer', line.pid === 1 && line.ppid === 2 && line.entry === 'C:/wf/env/wf.mjs' && line.cmd === 'brief validate' && line.patch.join() === 'briefs', JSON.stringify(line));
check('the line carries the drop and the counted map', line.dropped.join() === 'validate:3->1' && line.briefs === 'research=1 plan=3 validate=1 critique=2', JSON.stringify(line));

// End to end: the second write is the stale one a phase brief makes after a slower writer read first.
const root = mkdtempSync(join(tmpdir(), 'wf-state-trace-'));
writeState(root, { round: 'fix/jx-252', briefs });
writeState(root, { briefs: { research: briefs.research, plan: briefs.plan, validate: { token: '48e6c0', at, count: 1 } } });
const lines = readFileSync(join(root, '.wf', STATE_WRITES_LOG), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('one line per write', lines.length === 2, String(lines.length));
check('the second line names what it dropped', lines[1].dropped.join(';') === 'validate:3->1;critique:2->0', JSON.stringify(lines[1]));
check('the first line dropped nothing', lines[0].dropped.length === 0);
check('the write itself still merged the fields it does not own', JSON.parse(readFileSync(join(root, '.wf', 'state.json'), 'utf8')).round === 'fix/jx-252');
rmSync(root, { recursive: true, force: true });

process.exit(failures ? 1 : 0);
