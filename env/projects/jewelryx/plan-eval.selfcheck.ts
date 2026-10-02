// env/projects/jewelryx/plan-eval.selfcheck.ts — node env/projects/jewelryx/plan-eval.selfcheck.ts
import { grade, isTest, nameOf, report } from './plan-eval.ts';
import type { Result } from './plan-eval.ts';

let failed = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : ` — ${detail}`}`); if (!cond) failed++; };

const plan = (rows: string, token = 'abc123') => `# r — plan\nClass: A\n\n## Commits\n| # | message | files | check |\n|---|---|---|---|\n${rows}\n\n## Asks\n- none\n<!-- brief: ${token} -->\n`;
const brief = { token: 'abc123' };
const fix = ['packages/b2b/src/A.svelte', 'packages/b2b/messages/en.json', 'packages/backend/tests/test_a.py'];

const good = grade({ plan: plan('| 1 | fix(b2b): a | `packages/b2b/src/A.svelte`, packages/b2b/messages/en.json | repro |'), brief, fix });
check('every product file in a row, last check repro, the token: pass', good.pass && good.rows === 1, JSON.stringify(good));
check('a test the round wrote and the plan did not is no failure, but counts in recall', good.missing.length === 0 && Math.abs(good.recall - 2 / 3) < 1e-9);
const missed = grade({ plan: plan('| 1 | fix(b2b): a | packages/b2b/src/A.svelte | repro |'), brief, fix });
check('a product file no row names: fail, and named', !missed.pass && missed.missing.join() === 'packages/b2b/messages/en.json' && !missed.scoped.length);
const aside = (sections: string) => plan('| 1 | fix(b2b): a | packages/b2b/src/A.svelte | repro |').replace('## Asks\n- none', sections);
const notDoing = grade({ plan: aside('## Not doing\n- the en.json strings stay\n\n## Asks\n- none'), brief, fix });
check('named under Not doing: scoped out, still a fail', !notDoing.pass && notDoing.scoped.join() === 'packages/b2b/messages/en.json');
check('asked about: scoped out', grade({ plan: aside('## Asks\n- also en.json? \u2014 default: no'), brief, fix }).scoped.length === 1);
check('named only in Build: missed, not scoped', grade({ plan: aside('## Build\nen.json unchanged\n\n## Asks\n- none'), brief, fix }).scoped.length === 0);
const made = ['packages/admin/src/lib/components/layout/BackButton.svelte'];
const layoutBefore = ['packages/admin/src/lib/components/layout/detail-topbar.svelte'];
const elsewhere = (path: string) => grade({ plan: plan(`| 1 | feat: back | ${path} | repro |`), brief, fix: made, created: made, before: layoutBefore });
check('a file the round created: the same name elsewhere, or in kebab case, is that file', elsewhere('packages/admin/src/lib/components/admin/BackButton.svelte').pass && elsewhere('packages/admin/src/lib/components/layout/back-button.svelte').pass);
check('a file the round created: a new file of its kind in its folder is that file', elsewhere('packages/admin/src/lib/components/layout/BackLink.svelte').pass);
check('a file the round created: not an existing file of its folder, nor a new one of another kind or folder', !elsewhere('packages/admin/src/lib/components/layout/detail-topbar.svelte').pass && !elsewhere('packages/admin/src/lib/components/layout/back.ts').pass && !elsewhere('packages/admin/src/lib/nav/ReturnLink.svelte').pass);
check('a file that existed: only its own path counts', !grade({ plan: plan('| 1 | fix: a | packages/other/BackButton.svelte | repro |'), brief, fix: made }).pass);
check('a route file is named by its last three segments', nameOf('packages/b2b/src/routes/(store)/listing/[id]/+page.svelte') === 'listing/[id]/+page.svelte' && nameOf('a/b/marketplace_service.py') === 'marketplace_service.py');
check('the last check not repro: fail', !grade({ plan: plan('| 1 | fix: a | packages/b2b/src/A.svelte packages/b2b/messages/en.json | packages/b2b/a.test.ts |'), brief, fix }).pass);
const stale = grade({ plan: plan('| 1 | fix: a | packages/b2b/src/A.svelte packages/b2b/messages/en.json | repro |', 'fff000'), brief, fix });
check('another brief\'s token: fail on the handoff, as wf next would', !stale.pass && /not the answer/.test(stale.handoff ?? ''));
const none = grade({ plan: null, brief, fix });
check('no PLAN.md: fail, no PLAN.md', !none.pass && none.handoff === 'no PLAN.md' && none.recall === 0);
check('tests: tests/ folders, test_*.py, *.test.ts and *.spec.ts', isTest('packages/backend/tests/x.py') && isTest('a/test_b.py') && isTest('a/b.test.ts') && isTest('a/b.spec.ts') && !isTest('a/latest.svelte') && !isTest('a/contest.ts'));

const r = (arm: string, c: string, pass: boolean): Result => ({ arm, case: c, run: 1, grade: { ...good, pass, missing: pass ? [] : ['x.ts', 'y.ts'], scoped: pass ? [] : ['y.ts'] }, cost: 1, seconds: 60 });
const text = report([r('main', 'A', true), r('main', 'B', false), r('new', 'A', true), r('new', 'B', true)], ['main', 'new']);
check('the report: pass per arm, each case, and the difference from the first arm', text.includes('main | 1/2 | 1/2') && text.includes('new | 2/2 | 2/2') && text.includes('B — main: fail (missed x.ts; scoped out y.ts) · new: pass') && text.includes('new vs main: +50 points'), text);

console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
