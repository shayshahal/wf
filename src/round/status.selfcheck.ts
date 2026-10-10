// status.selfcheck.ts — node status.selfcheck.ts → exit 0 when green.
// Two fake worktrees, stubbed list + gh via inject, assert mine-first ordering and the ← YOU marker.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug } from '../seams.ts';
import { allLines, collectRows, formatRow, liveRounds, prLabel, formatAgeSince, processesIn, realDetailFor, inspectRound, porcelainEntries, lastEvidence, formatInspect } from './status.ts';
import type { Question, State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const root = mkdtempSync(join(tmpdir(), 'wf-status-'));
const fake = (dir: string, state: State | null) => {
  const p = join(root, dir);
  mkdirSync(join(p, '.wf'), { recursive: true });
  if (state) writeFileSync(join(p, '.wf', 'state.json'), JSON.stringify(state));
  return p;
};
const now = Date.parse('2026-09-17T15:00:00.000Z');
const old = fake('wt-old', { round: 'feat/x', class: 'A', step: 'implement', waiting_on: null, since: '2026-09-17T12:00:00.000Z' });
const mine = fake('wt-mine', { round: 'feat/y', class: 'B', step: 'review', waiting_on: 'user', since: '2026-09-17T14:00:00.000Z' });
const bare = fake('wt-bare', null);
const states = new Map([[old, JSON.parse(readFileSync(join(old, '.wf', 'state.json'), 'utf8'))], [mine, JSON.parse(readFileSync(join(mine, '.wf', 'state.json'), 'utf8'))]]);
const prs = [{ headRefName: 'feat/y', number: 42, isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ conclusion: 'FAILURE' }] }];

const mid = fake('wt-mid', { round: 'feat/z', class: 'A', step: 'pr', waiting_on: 'ci', since: '2026-09-17T14:30:00.000Z' });
states.set(mid, JSON.parse(readFileSync(join(mid, '.wf', 'state.json'), 'utf8')));
const rows = await collectRows({ paths: [mid, old, bare, mine], readState: (p) => states.get(p) ?? null, pullRequests: prs, now });
check('mine-waiting row sorts first', rows[0].path === mine, rows.map((r) => r.path).join(','));
check('longest-waiting sorts before newer within a group', rows[1].path === old && rows[2].path === mid, rows.map((r) => r.path).join(','));
check('stateless worktree sorts last as —', rows.at(-1)!.path === bare && formatRow(rows.at(-1)!).endsWith('—'));
check('first row carries the ← YOU marker', formatRow(rows[0], now).includes('← YOU'));
check('other rows carry no marker', !formatRow(rows[1], now).includes('← YOU'));
check('PR column shows number + decision + failing CI', formatRow(rows[0], now).includes('#42 approved ✗ci'), formatRow(rows[0], now));
check('missing PR shows -', formatRow(rows[1], now).includes(' · -'), formatRow(rows[1], now));
check('age renders hours', formatAgeSince('2026-09-17T14:00:00.000Z', now) === '1h', formatAgeSince('2026-09-17T14:00:00.000Z', now));
check('prLabel tolerates null', prLabel(null) === '-');

// stack arm (offline: stubbed port derivation + probe, no wt, no network).
const ports: Record<string, number> = { 'feat/y': 15748, 'feat/x': 15749, 'feat/z': 15750 };
const ups: Record<number, boolean> = { 15748: true, 15749: false, 15750: true };
const brows = await collectRows({
  paths: [old, mine],
  readState: (p) => states.get(p) ?? null,
  pullRequests: [],
  now,
  basePortFor: async (branch) => ports[branch],
  probeStack: async (port) => ups[port] ?? false,
});
check('stack column shows port + ✓ when the probe answers', formatRow(brows.find((r) => r.path === mine)!, now).includes('stack :15748 ✓'));
check('stack column shows port + ✗ when the probe refuses', formatRow(brows.find((r) => r.path === old)!, now).includes('stack :15749 ✗'));

// Names arm: with a slug the column shows the project's first address for a person (probe unchanged):
// the direct one with no machine plugged in, the machine's name for it when it has one (portless).
const slugs: Record<string, string> = { 'feat/y': 'feat-y', 'feat/x': 'feat-x' };
const nrows = await collectRows({
  paths: [old, mine],
  readState: (p) => states.get(p) ?? null,
  pullRequests: [],
  now,
  basePortFor: async (branch) => ports[branch],
  probeStack: async (port) => ups[port] ?? false,
  slugFor: async (branch) => slugs[branch],
});
check('stack column shows the first app\'s direct address with no machine names', formatRow(nrows.find((r) => r.path === mine)!, now).includes('stack http://localhost:15748 ✓'), formatRow(nrows.find((r) => r.path === mine)!, now));
plug({ project: { names: (slug: string) => ({ b2b: `http://${slug}.b2b.example.localhost` }) } });
const named = await collectRows({ paths: [mine], readState: (p) => states.get(p) ?? null, pullRequests: [], now, basePortFor: async (branch) => ports[branch], probeStack: async (port) => ups[port] ?? false, slugFor: async (branch) => slugs[branch] });
check('stack column shows the machine\'s name for the first app when it has one', formatRow(named[0], now).includes('stack http://feat-y.b2b.example.localhost ✓'), formatRow(named[0], now));

// --all arm: the grouped morning screen over the same fixture worktrees (offline, detail stubbed).
const allStates = new Map<string, State>([
  [old, { id: 'BJEW-1', folder: 'bug-reports/BJEW-1', step: 'build', waiting_on: null, since: '2026-09-17T14:57:00.000Z' }],
  [mine, { id: 'BJEW-2', step: 'review', waiting_on: 'user', since: '2026-09-16T15:00:00.000Z' }],
  [mid, { id: 'BJEW-3', step: 'held', waiting_on: 'einat', since: '2026-09-17T13:00:00.000Z' }],
]);
allStates.set(mine, { ...allStates.get(mine), questions: [{ n: 1, to: 'user', text: 'hide or delete?', default: 'hide' } as Question] });
const readAll = (p: string) => allStates.get(p) ?? null;
const all = allLines({ paths: [old, mine, mid, bare], readState: readAll, detailFor: (_p, s) => (s.step === 'build' ? '2 verification cases' : s.step === 'review' ? 'https://pr/2' : ''), now });
check('groups printed in order: waiting on you, running, held', all.filter((l) => !l.startsWith(' ')).join('|') === 'waiting on you:|running:|held:', all.join('|'));
check('the waiting line is id, step, who, age, detail', all[1] === '  BJEW-2  review  user  24h  https://pr/2', JSON.stringify(all[1]));
check('an open question sits under its round, not sorted away from it', all[2] === '      ? q1 → user: hide or delete? (default: hide)', JSON.stringify(all[2]));
check('a round nobody waits on reads "running"', all[4] === '  BJEW-1  build  running  3m  2 verification cases', JSON.stringify(all[4]));
check('a worktree with no state is not a round', !all.join('|').includes('wt-bare'), all.join('|'));
check('no rounds → no lines', allLines({ paths: [bare], readState: readAll, detailFor: () => '', now }).length === 0);
check('liveRounds counts everything but merged and held', liveRounds({ paths: [old, mine, mid, bare], readState: readAll }).map((r) => r.state.id).join() === 'BJEW-1,BJEW-2', JSON.stringify(liveRounds({ paths: [old, mine, mid, bare], readState: readAll }).map((r) => r.state.id)));
mkdirSync(join(old, 'bug-reports', 'BJEW-1'), { recursive: true });
writeFileSync(join(old, 'bug-reports', 'BJEW-1', 'TICKET.md'), '# t\n\n## Intent\n- x\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | a | b | c |\n| 2 | a | b | c |\n');
const ticketText = readFileSync(join(old, 'bug-reports', 'BJEW-1', 'TICKET.md'), 'utf8').replace(/\r\n/g, '\n').trimEnd();
check('real detail for agree counts the agreement lines', realDetailFor(old, { ...readAll(old), step: 'agree' }) === `TICKET.md ${ticketText.split('\n').length} lines`, realDetailFor(old, { ...readAll(old), step: 'agree' }));
check('real detail for build counts the verification cases', realDetailFor(old, { ...readAll(old), step: 'build' }) === '2 verification cases', realDetailFor(old, { ...readAll(old), step: 'build' }));

// What still runs in a worktree (seams.processCwds): its own folder and below, nothing beside it.
const cwds = ['C:\\Users\\S\\wt\\fix-a\\', 'C:\\Users\\S\\wt\\fix-a\\packages\\backend\\', 'C:\\Users\\S\\wt\\fix-ab\\', 'C:\\Users\\S\\'];
check('procs: the worktree and below, from a process block, with backslashes and a trailing one', processesIn('C:/Users/S/wt/fix-a', cwds, true) === 2);
check('procs: a sibling whose name starts the same is not inside', processesIn('C:/Users/S/wt/fix-ab', cwds, true) === 1);
check('procs: case-blind on Windows only', processesIn('c:/users/s/wt/fix-a', cwds, true) === 2 && processesIn('c:/users/s/wt/fix-a', cwds, false) === 0);
check('procs: shown in the row when counted, absent when not', formatRow({ path: 'p', state: null, pr: '-', stack: null, processes: 3 }).endsWith(' · 3 procs') && !formatRow({ path: 'p', state: null, pr: '-', stack: null }).includes('procs'));

// The inspect block (#114): the in-flight diff, evidence, facts and references, from injected git.
const ir = join(root, 'wt-inspect');
const irFolder = join(ir, 'bug-reports', 'BJEW-9');
mkdirSync(join(ir, '.wf'), { recursive: true });
mkdirSync(irFolder, { recursive: true });
writeFileSync(join(irFolder, 'AGREEMENT.md'), '# a\n\n## Observed\n- x at `a.ts:1`\n\n## Agreed\n- do it\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | a | b | c |\n');
writeFileSync(join(irFolder, 'ASSESSMENT.md'), 'Verdict: repair\nhead: abcd1234\n\n## Intent\nmet: before: 1 after: 2\n');
writeFileSync(join(irFolder, 'AGREEMENT-REVIEW.md'), 'agreement-sha: deadbeef\n\nverdict: approved\n');
writeFileSync(join(irFolder, 'option-a.html'), '<p>x</p>\n');
writeFileSync(join(ir, '.wf', 'checks.log'), '{"row":1,"result":"red"}\nnot json\n{"row":3,"result":"green","content":"run 3"}\n');
const irState: State = { wf_version: 2, class: 'B', folder: 'bug-reports/BJEW-9', step: 'build', base: 'dev', questions: [{ n: 1, to: 'user', text: 'hide or delete?', asked: '2026-10-10T00:00:00Z' }], session: { harness: 'pi', id: 'sess-1234567890', transcript: 'C:/t/s.jsonl', step: 'build', at: '2026-10-10T01:00:00Z' }, decisions: [{ text: 'keep it', at: '2026-10-10T00:30:00Z' }] };
const gitFake = (args: string[]) => args[0] === 'status' ? ' M packages/x.ts\n?? bug-reports/BJEW-9/new.md\n' : ' packages/x.ts | 5 +++--\n 2 files changed, 5 insertions(+), 2 deletions(-)\n';
check('porcelain: staged/unstaged/untracked and a rename\'s new path', JSON.stringify(porcelainEntries('M  a.ts\n M b.ts\n?? c.ts\nR  old.ts -> new.ts\n')) === JSON.stringify([{ status: 'M', path: 'a.ts' }, { status: 'M', path: 'b.ts' }, { status: '??', path: 'c.ts' }, { status: 'R', path: 'new.ts' }]));
check('last evidence skips a line cut mid-write', JSON.stringify(lastEvidence('{"row":1,"result":"red"}\nnot json\n')) === JSON.stringify({ row: 1, result: 'red' }));
const insp = inspectRound({ path: ir, state: irState, git: gitFake, guidance: ['docs/agents'], wfRoot: '/wf' });
check('inspect names the agreement for the class', insp.agreement.file === 'bug-reports/BJEW-9/AGREEMENT.md' && insp.agreement.exists && !!insp.agreement.sha, JSON.stringify(insp.agreement));
check('inspect lists the in-flight diff (staged, unstaged, untracked)', insp.diff.files.map((f) => `${f.status} ${f.path}`).join() === 'M packages/x.ts,?? bug-reports/BJEW-9/new.md', JSON.stringify(insp.diff.files));
check('inspect carries the diff stat summary', (insp.diff.stat ?? '').includes('2 files changed'), String(insp.diff.stat));
check('inspect reads the latest check evidence', insp.evidence?.row === 3 && insp.evidence?.result === 'green' && insp.evidence?.content === 'run 3', JSON.stringify(insp.evidence));
check('inspect facts: assessment verdict + head, T1, questions, decisions', insp.facts.assessment?.verdict === 'repair' && insp.facts.assessment?.head === 'abcd1234' && insp.facts.t1.verdict === 'approved' && insp.facts.questions[0]?.n === 1 && insp.facts.decisions[0]?.text === 'keep it', JSON.stringify(insp.facts));
check('inspect says blocked only when BLOCKED.md is there', insp.facts.blocked === false && (writeFileSync(join(irFolder, 'BLOCKED.md'), 'Question: x\n'), inspectRound({ path: ir, state: irState, git: gitFake }).facts.blocked === true));
check('inspect references the session, artifacts and guidance', insp.refs.session?.id === 'sess-1234567890' && insp.refs.artifacts.includes('option-a.html') && insp.refs.guidance.includes('docs/agents') && insp.refs.guidance.some((g) => g.endsWith('ROUND.md')), JSON.stringify(insp.refs));
check('inspect survives git that cannot read the worktree', inspectRound({ path: ir, state: irState, git: () => { throw new Error('no git'); } }).diff.files.length === 0);
check('the inspect block names the agreement, diff, evidence, facts and refs', ['agreement:', 'diff:', 'evidence:', 'facts:', 'refs:'].every((k) => formatInspect(insp).includes(`  ${k}`)), formatInspect(insp));
rmSync(root, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
