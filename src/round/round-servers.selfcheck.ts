// round-servers.selfcheck.ts — generated phase/action matrix for idle stack release policy.
import { shouldStopRoundServers } from './round-servers.ts';
import { STEPS } from './step.ts';

let failures = 0;
const idle = new Set(['classify', 'agree', 'held', 'pr', 'merged']);
const waits = ['wait user: T1', 'wait person: question'];
for (const step of [...STEPS, undefined, 'unknown']) {
	for (const say of ['', ...waits, 'work build: continue', 'work assess: continue', 'review: T2']) {
		for (const waitingOn of [undefined, 'user', 'ci']) {
			const expected = waitingOn !== 'ci' && (idle.has(step ?? '') || ((step === 'build' || step === 'assess') && waits.includes(say)));
			if (shouldStopRoundServers({ step, say, waitingOn }) !== expected) { console.error(`FAIL idle stack policy: ${step}/${say}/${waitingOn}`); failures++; }
		}
	}
}
console.log(failures ? `${failures} FAILURE(S)` : 'all phase/action arms green; active build, assessment, CI and T2 preserved');
process.exitCode = failures ? 1 : 0;
