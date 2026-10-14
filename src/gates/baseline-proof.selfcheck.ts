// baseline-proof.selfcheck.ts — node baseline-proof.selfcheck.ts → exit 0 when green.
// Pure arms plus one temp folder for the file-reading probe: the identity of a red-base ("before")
// measurement and the conservative rule that reuses a validated one (#133).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baselineCandidates, baselineProofKey, environmentDigest, probeContentSha, probeInputs, reusableBaseline } from './baseline-proof.ts';
import type { BaselineTarget } from './baseline-proof.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const target: BaselineTarget = { file: 'verification/specs/slider.spec.ts', id: 'old slider', line: 42, refactor: false };
const task = { cmd: 'pnpm', args: ['exec', 'playwright', 'test', 'specs/slider.spec.ts'], cwd: 'verification' };
const base = { base: 'abc123', task, target, probe: 'sha256:probe', environment: 'sha256:env', isolated: true };
const key = baselineProofKey(base);
check('the same proof obligation has one key', baselineProofKey({ ...base }) === key);
check('a changed baseline commit is a different proof', baselineProofKey({ ...base, base: 'def456' }) !== key);
check('a changed command or cwd is a different proof', baselineProofKey({ ...base, task: { ...task, args: [...task.args, '--grep', 'x'] } }) !== key && baselineProofKey({ ...base, task: { ...task, cwd: '.' } }) !== key);
check('a changed assertion (id, line or refactor flag) is a different proof', baselineProofKey({ ...base, target: { ...target, line: 43 } }) !== key && baselineProofKey({ ...base, target: { ...target, id: 'new slider' } }) !== key && baselineProofKey({ ...base, target: { ...target, refactor: true } }) !== key);
check('changed probe content is a different proof', baselineProofKey({ ...base, probe: 'sha256:other' }) !== key);
// A changed effective run env (the exact object the runner is handed) is a different proof: a test can
// change outcome (CI, TZ, a tool path) while the code stands.
check('a changed run environment is a different proof', baselineProofKey({ ...base, environment: 'sha256:other' }) !== key);
check('a run that was isolated differently is a different proof', baselineProofKey({ ...base, isolated: false }) !== key);
// environmentDigest is order-free and ignores unset entries.
check('environmentDigest is order-free and drops unset entries', environmentDigest({ A: '1', B: undefined, C: '2' }) === environmentDigest({ C: '2', A: '1', B: undefined }) && environmentDigest({ A: '1' }) !== environmentDigest({ A: '2' }));
// A multiline value (or one containing `=`) must not collide with two entries: the old newline-joined
// `name=value` text did (#133 review).
check('environmentDigest cannot be fooled by a newline or `=` inside a value', environmentDigest({ FIRST: 'x\nSECOND=y' }) !== environmentDigest({ FIRST: 'x', SECOND: 'y' }) && environmentDigest({ A: 'B=C' }) !== environmentDigest({ A: 'B', C: '' }), JSON.stringify([environmentDigest({ FIRST: 'x\nSECOND=y' }), environmentDigest({ FIRST: 'x', SECOND: 'y' })]));

const folder = 'bug-reports/BJEW-133';
check('probe inputs are the test plus the case files inside the round folder, sorted and unique', JSON.stringify(probeInputs({ testPath: `${folder}/repro/slider.spec.ts`, files: [`${folder}/repro/fixture.ts`, 'packages/backend/app/x.py', `${folder}/repro/slider.spec.ts`, 'verification/tests/support/login.ts'], folder })) === JSON.stringify([`${folder}/repro/fixture.ts`, `${folder}/repro/slider.spec.ts`]), JSON.stringify(probeInputs({ testPath: `${folder}/repro/slider.spec.ts`, files: [`${folder}/repro/fixture.ts`, 'packages/backend/app/x.py'], folder })));
check('a test outside the round folder still binds (it is the row\'s own test)', probeInputs({ testPath: 'verification/specs/slider.spec.ts', files: ['verification/tests/support/login.ts'], folder }).includes('verification/specs/slider.spec.ts'));
// #133 review: a helper/fixture/config the case's spec loads is a probe input, so it is copied into
// the isolated baseline instead of being absent there and reading as a product red. The project owns
// the predicate (`isTestInput`); core stays project-blind.
const testInput = (f: string) => f.startsWith('verification/') || f.includes('/tests/');
check('a declared test/helper/config outside the round folder is a probe input', probeInputs({ testPath: 'verification/specs/slider.spec.ts', files: ['verification/tests/support/login.ts', 'packages/backend/app/slider.py'], folder, testInput }).includes('verification/tests/support/login.ts'));
check('the implementation the row measures is not copied (testInput says no)', !probeInputs({ testPath: 'verification/specs/slider.spec.ts', files: ['verification/tests/support/login.ts', 'packages/backend/app/slider.py'], folder, testInput }).includes('packages/backend/app/slider.py'));
// An implementation file the red-base run takes back to the baseline must not be copied into the
// scratch (it would carry the fix where the baseline has none), even if it sits in the round folder.
check('a reverted implementation file is not a probe input', !probeInputs({ testPath: 'verification/specs/slider.spec.ts', files: [`${folder}/impl.ts`, `${folder}/repro/fixture.ts`], folder, exclude: [`${folder}/impl.ts`] }).includes(`${folder}/impl.ts`) && probeInputs({ testPath: 'x.ts', files: [`${folder}/impl.ts`, `${folder}/repro/fixture.ts`], folder, exclude: [`${folder}/impl.ts`] }).includes(`${folder}/repro/fixture.ts`));
// The project resolves the runner's own config (a per-round fallback config never in the base, the
// shared config's global setup/tsconfig) and hands it as `runtime`. It must be copied and hashed even
// when the case declared only its spec, or the before side runs with no config at all (review: an
// older base without the shared config). The `testInput` filter must not drop it.
const runtimeInput = `${folder}/repro/playwright.config.ts`;
check('a resolved runtime config is a probe input even when the case declares only its spec', probeInputs({ testPath: `${folder}/repro/slider.spec.ts`, files: [], runtime: [runtimeInput], folder, testInput: () => false }).includes(runtimeInput), JSON.stringify(probeInputs({ testPath: `${folder}/repro/slider.spec.ts`, files: [], runtime: [runtimeInput], folder, testInput: () => false })));

const dir = mkdtempSync(join(tmpdir(), 'wf-baseline-proof-'));
try {
	writeFileSync(join(dir, 'spec.ts'), 'expect(old).toBe(new)\n');
	writeFileSync(join(dir, 'fixture.ts'), 'export const seed = 1\n');
	const before = probeContentSha(dir, ['spec.ts', 'fixture.ts']);
	check('probe content identity is stable for the same bytes', probeContentSha(dir, ['fixture.ts', 'spec.ts']) === before);
	writeFileSync(join(dir, 'fixture.ts'), 'export const seed = 2\n');
	check('a changed fixture changes the probe identity', probeContentSha(dir, ['spec.ts', 'fixture.ts']) !== before);
	rmSync(join(dir, 'spec.ts'));
	check('a deleted input changes the probe identity', probeContentSha(dir, ['spec.ts', 'fixture.ts']) !== probeContentSha(dir, ['fixture.ts']));
} finally {
	rmSync(dir, { recursive: true, force: true });
}

// Reuse: only the exact obligation and only a framework-bound verdict.
const identity = { base: 'abc123', key, current: 'tree:current', command: task.cmd, argv: task.args, target, probe: 'sha256:probe', environment: 'sha256:env', isolated: true };
const red = { verdict: 'behavioral-failure' as const, say: 'failed at the old slider' };
const pass = { verdict: 'passed' as const, say: 'the named test passed' };
const unavailable = { verdict: 'unavailable' as const, say: 'no framework assertion' };
const candidates = [{ baseline: identity, evidence: red, exit: 1 }];
check('a matching proof with the needed verdict is reusable', reusableBaseline(candidates, { key, current: 'tree:current', want: 'behavioral-failure' })?.evidence === red);
check('the same proof is not reusable for a different needed verdict', reusableBaseline(candidates, { key, current: 'tree:current', want: 'passed' }) === null);
check('a changed current implementation invalidates the proof', reusableBaseline(candidates, { key, current: 'tree:other', want: 'behavioral-failure' }) === null);
check('a changed key (test/setup/baseline) invalidates the proof', reusableBaseline(candidates, { key: 'sha256:other', current: 'tree:current', want: 'behavioral-failure' }) === null);
check('a recorded exit with no runner verdict is never reused (no status-only reuse)', reusableBaseline([{ baseline: identity, exit: 1 }], { key, current: 'tree:current', want: 'behavioral-failure' }) === null && reusableBaseline([{ baseline: identity, evidence: unavailable, exit: 1 }], { key, current: 'tree:current', want: 'behavioral-failure' }) === null);
check('the last matching proof wins, so a repair that invalidated an earlier one is not resurrected', reusableBaseline([{ baseline: identity, evidence: red, exit: 1 }, { baseline: identity, evidence: unavailable, exit: 1 }, { baseline: identity, evidence: pass, exit: 0 }], { key, current: 'tree:current', want: 'passed' })?.evidence === pass && reusableBaseline([{ baseline: identity, evidence: red, exit: 1 }, { baseline: { ...identity, current: 'tree:other' }, evidence: pass, exit: 0 }], { key, current: 'tree:current', want: 'behavioral-failure' })?.evidence === red);
check('candidates come from every line\'s recorded tasks, in append order', baselineCandidates([{ tasks: [{ baseline: identity, evidence: red, exit: 1 }] }, {}, { tasks: [{ exit: 0 }] }]).length === 2);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
