// round-servers.ts — release idle stacks at workflow boundaries, not on a timer.
// 2026-10-14: four stacks remained live; two were active builds, one was waiting at agreement,
// and one belonged to a helper checkout without round state. Build/assessment/T2 keep their stack.

/** Stop at idle/terminal phases or a non-review human wait; unknown phases stay untouched. */
export function shouldStopRoundServers({ step, say = '', waitingOn }: { step: string | undefined; say?: string; waitingOn?: string | null }): boolean {
	if (!step || waitingOn === 'ci') return false;
	if (['classify', 'agree', 'held', 'pr', 'merged'].includes(step)) return true;
	return ['build', 'assess'].includes(step) && /^wait /.test(say);
}
