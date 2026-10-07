// env/projects/jewelryx/rework.selfcheck.ts — node env/projects/jewelryx/rework.selfcheck.ts
import { addedRanges, blamedShas, fateOf, isCode, isShay, kindOf, report } from './rework.ts';
import type { Row } from './rework.ts';

let failed = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : ` — ${detail}`}`); if (!cond) failed++; };

check('a change that brings a round folder with RESEARCH.md is a wf round', kindOf(['bug-reports/fix-x/RESEARCH.md', 'packages/a.ts'], 'Merge pull request #1 from o/fix/x') === 'wf');
check('a ticket id in the branch or subject is ticket work', kindOf([], 'Merge pull request #274 from o/fix/bjew629-drawer') === 'ticket' && kindOf([], 'fix(TJEW-670): back') === 'ticket' && kindOf([], 'Merge pull request #320 from o/fix/jx-1112-nav') === 'ticket');
check('a v1 folder alone (the 09-09 import) is not a wf round', kindOf(['cr-reports/TJEW-1/FROZEN.txt'], 'docs(bug-reports): track the rounds') === 'other');

check('app code under packages/ counts', isCode('packages/frontend/b2b/src/routes/+page.svelte') && isCode('packages/backend/app/x.py'));
check('generated code, json and code outside packages/ do not', !isCode('packages/frontend/shared/types/src/generated/types.gen.ts') && !isCode('packages/frontend/b2b/messages/en.json') && !isCode('scripts/x.mjs'));

const diff = [
	'diff --git a/packages/a.ts b/packages/a.ts', '--- a/packages/a.ts', '+++ b/packages/a.ts',
	'@@ -10 +10 @@', '-x', '+y',
	'@@ -20,3 +20,0 @@', '-a', '-b', '-c',
	'@@ -40,0 +38,4 @@', '+1', '+2', '+3', '+4',
	'diff --git a/packages/gone.ts b/packages/gone.ts', '--- a/packages/gone.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-p', '-q',
	'diff --git a/packages/m/en.json b/packages/m/en.json', '--- a/packages/m/en.json', '+++ b/packages/m/en.json', '@@ -1 +1 @@', '-"a"', '+"b"',
].join('\n');
const r = addedRanges(diff);
check('added ranges: a one-line hunk, a pure deletion skipped, a four-line add', JSON.stringify(r.get('packages/a.ts')) === '[[10,10],[38,41]]', JSON.stringify(r.get('packages/a.ts')));
check('a deleted file and a non-code file give no ranges', r.size === 1);

const a = 'a'.repeat(40), b = 'b'.repeat(40);
check('porcelain: one sha per line, header repeated or not', blamedShas(`${a} 1 1 2\nauthor x\n\tline\n${a} 2 2\n\tline\n${b} 9 3 1\n\tline`).join() === [a, a, b].join());

const fate = (subject: string, files = 3) => fateOf({ subject, files }, 40);
check('a revert is a revert, whatever its size', fate('Revert "feat: x"', 500) === 'revert');
check('a step over the sweep size is a sweep', fate('Merge pull request #277 from Raynw-MediaTech/chore/linting', 739) === 'sweep');
check('a fix/ branch or a fix: subject is a fix', fate('Merge pull request #240 from Raynw-MediaTech/fix/bjew562-label') === 'fix' && fate('fix(b2b): label') === 'fix');
check('a branch with "fix" inside its name is not a fix', fate('Merge pull request #9 from org/feat/fix-later-list') === 'other');
check('a step naming a bug board ticket is a fix, a task board one is not', fate('Merge pull request #12 from org/intake/BJEW-430') === 'fix' && fate('Merge pull request #13 from org/feat/tjew721-menu') === 'other');
check('a lint fix is a sweep, not a fix', fate('Merge pull request #254 from Raynw-MediaTech/fix/lint-unknown-returns') === 'sweep');
check('a prefix is not a fix', fate('feat: fixture loader') === 'other');

check('Shay, not Einat Shahal', isShay('shayshahal') && isShay('Shay Shahal') && !isShay('Einat Shahal') && !isShay('Riftins'));

const row = (kind: Row['kind'], shay: boolean, lines: number, fix: number, other: number): Row =>
	({ sha: 'x', date: '2026-09-01', kind, pr: true, shay, subject: 's', lines, fates: { 7: { kept: lines - fix - other, fix, revert: 0, sweep: 0, other } } });
const text = report([row('wf', true, 100, 10, 5), row('wf', true, 100, 0, 0), row('other', false, 50, 0, 25)], [7, 14]);
check('report: one group per kind, PR or direct, and person; shares of lines', /wf PR Shay\s+2\s+200\s+7\.5%\s+5\.0%\s+1 \(50%\)/.test(text), text);
check('report: a window no change is old enough for is left out', !text.includes('Within 14 days'));

console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
