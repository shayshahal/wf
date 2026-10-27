// Checks releaseBaseGap: a v1.1 ticket refuses a dev base, and only that.
import { releaseBaseGap } from './release-base.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { if (!ok) { failed++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); } };

const gap = releaseBaseGap({ 'JX-9': ['v1.1', 'urgent'] }, 'origin/dev');
check('a v1.1 ticket on a dev base is refused, naming the fix', !!gap && gap.includes('JX-9') && gap.includes('--base origin/v1.1'), String(gap));
check('a v1.1 ticket on origin/v1.1 passes', releaseBaseGap({ 'JX-9': ['v1.1'] }, 'origin/v1.1') === null);
check('a ticket with other labels passes on dev', releaseBaseGap({ 'JX-9': ['bug', 'urgent'] }, 'origin/dev') === null);
check('a ticket with no labels passes on dev', releaseBaseGap({ 'JX-9': [] }, 'origin/dev') === null);
check('one of several tickets labelled v1.1 refuses', releaseBaseGap({ 'JX-1': [], 'JX-2': ['v1.1'] }, 'origin/dev') !== null);
check('a v1 label with no origin/v1 branch passes on dev', releaseBaseGap({ 'JX-9': ['v1'] }, 'origin/dev', (n) => n === 'v1.1') === null);
check('v1.1 still refuses when its branch exists', releaseBaseGap({ 'JX-9': ['v1.1'] }, 'origin/dev', (n) => n === 'v1.1') !== null);

if (failed) { console.log(`${failed} FAILURE(S)`); process.exit(1); }
console.log('release-base: all checks passed');
