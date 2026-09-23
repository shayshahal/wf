// status.selfcheck.mjs — node status.selfcheck.mjs → exit 0 when green.
// Two fake worktrees, stubbed list + gh via inject, assert shay-first ordering and the ← YOU marker.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allLines, collectRows, formatRow, liveRounds, prLabel, formatAgeSince, realDetailFor } from './status.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const root = mkdtempSync(join(tmpdir(), 'wf-status-'));
const fake = (dir, state) => {
  const p = join(root, dir);
  mkdirSync(join(p, '.wf'), { recursive: true });
  if (state) writeFileSync(join(p, '.wf', 'state.json'), JSON.stringify(state));
  return p;
};
const now = Date.parse('2026-09-17T15:00:00.000Z');
const old = fake('wt-old', { round: 'feat/x', class: 'A', step: 'implement', waiting_on: null, since: '2026-09-17T12:00:00.000Z' });
const shay = fake('wt-shay', { round: 'feat/y', class: 'B', step: 'review', waiting_on: 'shay', since: '2026-09-17T14:00:00.000Z' });
const bare = fake('wt-bare', null);
const states = new Map([[old, JSON.parse(readFileSync(join(old, '.wf', 'state.json'), 'utf8'))], [shay, JSON.parse(readFileSync(join(shay, '.wf', 'state.json'), 'utf8'))]]);
const prs = [{ headRefName: 'feat/y', number: 42, isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ conclusion: 'FAILURE' }] }];

const mid = fake('wt-mid', { round: 'feat/z', class: 'A', step: 'pr', waiting_on: 'ci', since: '2026-09-17T14:30:00.000Z' });
states.set(mid, JSON.parse(readFileSync(join(mid, '.wf', 'state.json'), 'utf8')));
const rows = await collectRows({ paths: [mid, old, bare, shay], readState: (p) => states.get(p) ?? null, pullRequests: prs, now });
check('shay-waiting row sorts first', rows[0].path === shay, rows.map((r) => r.path).join(','));
check('longest-waiting sorts before newer within a group', rows[1].path === old && rows[2].path === mid, rows.map((r) => r.path).join(','));
check('stateless worktree sorts last as —', rows.at(-1).path === bare && formatRow(rows.at(-1)).endsWith('—'));
check('first row carries the ← YOU marker', formatRow(rows[0], now).includes('← YOU'));
check('other rows carry no marker', !formatRow(rows[1], now).includes('← YOU'));
check('PR column shows number + decision + failing CI', formatRow(rows[0], now).includes('#42 approved ✗ci'), formatRow(rows[0], now));
check('missing PR shows -', formatRow(rows[1], now).includes(' · -'), formatRow(rows[1], now));
check('age renders hours', formatAgeSince('2026-09-17T14:00:00.000Z', now) === '1h', formatAgeSince('2026-09-17T14:00:00.000Z', now));
check('prLabel tolerates null', prLabel(null) === '-');

// b2b arm (offline: stubbed port derivation + probe, no wt, no network).
const ports = { 'feat/y': 15748, 'feat/x': 15749, 'feat/z': 15750 };
const ups = { 15748: true, 15749: false, 15750: true };
const brows = await collectRows({
  paths: [old, shay],
  readState: (p) => states.get(p) ?? null,
  pullRequests: [],
  now,
  basePortFor: async (branch) => ports[branch],
  probeB2b: async (port) => ups[port] ?? false,
});
check('b2b column shows port + ✓ when the probe answers', formatRow(brows.find((r) => r.path === shay), now).includes('b2b :15748 ✓'));
check('b2b column shows port + ✗ when the probe refuses', formatRow(brows.find((r) => r.path === old), now).includes('b2b :15749 ✗'));

// Portless arm: with a slug the column shows the .localhost name (probe unchanged).
const slugs = { 'feat/y': 'feat-y', 'feat/x': 'feat-x' };
const nrows = await collectRows({
  paths: [old, shay],
  readState: (p) => states.get(p) ?? null,
  pullRequests: [],
  now,
  basePortFor: async (branch) => ports[branch],
  probeB2b: async (port) => ups[port] ?? false,
  slugFor: async (branch) => slugs[branch],
});
check('b2b column shows the portless name when a slug is known', formatRow(nrows.find((r) => r.path === shay), now).includes('b2b http://feat-y.b2b.jewelryx.localhost ✓'), formatRow(nrows.find((r) => r.path === shay), now));

// --all arm: the grouped morning screen over the same fixture worktrees (offline, detail stubbed).
const allStates = new Map([
  [old, { id: 'BJEW-1', folder: 'bug-reports/BJEW-1', step: 'implement', waiting_on: null, since: '2026-09-17T14:57:00.000Z', commit: 2 }],
  [shay, { id: 'BJEW-2', step: 'review', waiting_on: 'shay', since: '2026-09-16T15:00:00.000Z' }],
  [mid, { id: 'BJEW-3', step: 'held', waiting_on: 'einat', since: '2026-09-17T13:00:00.000Z' }],
]);
const readAll = (p) => allStates.get(p) ?? null;
const all = allLines({ paths: [old, shay, mid, bare], readState: readAll, detailFor: (_p, s) => (s.step === 'implement' ? `commit ${s.commit} of 3` : s.step === 'review' ? 'https://pr/2' : ''), now });
check('groups printed in order: waiting on you, running, held', all.filter((l) => !l.startsWith(' ')).join('|') === 'waiting on you:|running:|held:', all.join('|'));
check('the waiting line is id, step, who, age, detail', all[1] === '  BJEW-2  review  shay  24h  https://pr/2', JSON.stringify(all[1]));
check('a round nobody waits on reads "running"', all[3] === '  BJEW-1  implement  running  3m  commit 2 of 3', JSON.stringify(all[3]));
check('a worktree with no state is not a round', !all.join('|').includes('wt-bare'), all.join('|'));
check('no rounds → no lines', allLines({ paths: [bare], readState: readAll, detailFor: () => '', now }).length === 0);
check('liveRounds counts everything but merged and held', liveRounds({ paths: [old, shay, mid, bare], readState: readAll }).map((r) => r.state.id).join() === 'BJEW-1,BJEW-2', JSON.stringify(liveRounds({ paths: [old, shay, mid, bare], readState: readAll }).map((r) => r.state.id)));
mkdirSync(join(old, 'bug-reports', 'BJEW-1'), { recursive: true });
writeFileSync(join(old, 'bug-reports', 'BJEW-1', 'PLAN.md'), '# p\n\n## Commits\n| # | m | f | c |\n| 1 | a | b | c |\n| 2 | a | b | c |\n');
check('real detail for implement counts the PLAN.md rows', realDetailFor(old, readAll(old)) === 'commit 2 of 2', realDetailFor(old, readAll(old)));
check('real detail for plan counts PLAN.md lines', realDetailFor(old, { ...readAll(old), step: 'plan' }) === 'PLAN.md 6 lines', realDetailFor(old, { ...readAll(old), step: 'plan' }));

rmSync(root, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
