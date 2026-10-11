// friction.ts — the one line `wf reap` prints and adds to ~/.cache/wf-reaped/ROUNDS.md: where a round
// spent its time, what came of it, and where wf or the person had to step in. Until 2026-09-28 finding
// that meant reading a round's session log by hand (TJEW-670.11: the broken pre-push hook, the as-built
// file committed by hand, the false "deviates"); Factory's Missions measure the same things (cycle
// time, retries).
// Pure; reap.ts reads the files and writes the line.
import type { State } from './state.ts';
import type { RefusalKind } from '../refusal.ts';

type Step = { step: string; at: string };

// Pure: state.history with `step` entered at `at`. A step run again (wf next's bookkeeping re-steps the
// round) is the same stretch of time, not a new one.
export function stepHistory(history: Step[] | undefined, step: string, at: string): Step[] {
	const past = history ?? [];
	return past.at(-1)?.step === step ? past : [...past, { step, at }];
}

// Pure: 95 min → "1h35m", 12 min → "12m", under a minute → "0m".
export function duration(ms: number): string {
	const m = Math.max(0, Math.round(ms / 60000));
	return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// Pure: minutes per step name, summed (a round goes back to implement after a T2 fix), in first-seen order.
export function timeInSteps(history: Step[], end: string): string[] {
	const spent = new Map<string, number>();
	(history ?? []).forEach((h, i) => {
		const until = Date.parse(history[i + 1]?.at ?? end);
		spent.set(h.step, (spent.get(h.step) ?? 0) + (until - Date.parse(h.at)));
	});
	return [...spent].map(([step, ms]) => `${step} ${duration(ms)}`);
}

// Pure: how many times each step was entered, from the round's history. The old per-phase brief counts
// are gone (#112): a step is entered by `wf step`, and its history is that record.
export function visitsPerStep(history: Step[] | undefined): string[] {
	const per = new Map<string, number>();
	for (const h of history ?? []) per.set(h.step, (per.get(h.step) ?? 0) + 1);
	return [...per].map(([step, n]) => `${step} ${n}`);
}

const jsonLines = <T,>(text: string): T[] => (text ?? '').split('\n').filter((l) => l.trim()).flatMap((l) => {
	try { return [JSON.parse(l) as T]; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; }
});

// What came of the round, against `state.step`, which is only where the round *was* when it ended. The
// two were one field in the record: a round that ended with a finding — its repro settled, the answer
// SKILL.md offers the person as `stop`, and the whole point of a `wf new --check` round — was written
// down as `held` or `research`, indistinguishable from one waiting on Shay (BJEW-461, 2026-10-06).
// Derived from what the round already recorded: no state of its own, no new command.
export type Outcome = 'delivered' | 'it does not reproduce' | 'not the defect' | 'nothing run' | `stopped at ${string}`;
export function outcomeOf(state: State | null, checksLog: string): Outcome {
	if (state?.step === 'merged') return 'delivered';
	// What the repro settled, when the round ended where the repro is its answer: a check round parks at
	// `agree` (waiting on the person's call), or `held`. The last repro line is the round's own: there is
	// one repro per check round, and no token to key by any more (#112).
	const settled = state?.step === 'agree' || state?.step === 'classify' || state?.step === 'held';
	const verdict = settled ? jsonLines<{ row?: unknown; result?: string }>(checksLog).filter((c) => c.row === 'repro').at(-1)?.result : undefined;
	if (verdict === 'green') return 'it does not reproduce';
	if (verdict === 'outside') return 'not the defect';
	if (state && !(state.history ?? []).length) return 'nothing run';
	return `stopped at ${state?.step ?? '?'}`;
}

// Pure: the round's line. checksLog / eventsLog are .wf/checks.log and .wf/events.log, reviewText the
// round's REVIEW.md (each T2 and each refused push is a `verdict:` line in it).
export function frictionLine({ state, checksLog, eventsLog, reviewText, end }: { state: State | null; checksLog: string; eventsLog: string; reviewText: string; end: string }): string {
	const history = state?.history ?? [];
	const start = history[0]?.at ?? null;
	// Repro and whole suites are measurements, not a commit's check.
	const all = jsonLines<{ row?: unknown; result: string; cause?: unknown }>(checksLog);
	const checks = all.filter((c) => c.row !== 'repro' && c.row !== 'suites');
	// A red whose cause is `environment` is a gate that never ran (check.ts, BJEW-461): counted apart
	// from a failed check, so a round a dead stack or a missing seed stood in the way of is visible in
	// the record instead of hiding inside the red count.
	const environment = checks.filter((c) => c.cause === 'environment').length;
	const unstable = all.filter((c) => c.row === 'repro' && c.result === 'unstable').length;
	const refusals = jsonLines<{ cmd: string; msg: string; kind?: unknown }>(eventsLog);
	// A refusal wf made before it read the round — argv it will not take, a worktree with no round in it
	// — is not the round's business, and counting it as wf stepping in inflated the record (BJEW-461,
	// 2026-10-06: 3 of its 7 were `usage: wf decide [--q <n>]` and `invalid step ""`). Counted apart,
	// and left out of the messages after the colon, which should say what wf ruled about the round.
	const about = refusals.filter((r) => r.kind !== 'caller');
	const away = refusals.length - about.length;
	const verdicts = [...(reviewText ?? '').matchAll(/^verdict:\s*(\S+)\s*$/gm)].map((m) => m[1]).filter((v) => v !== 'pending');
	const pushRefused = (reviewText?.match(/refused by the project's pre-push hook/g) ?? []).length;
	const questions = (state?.answered?.length ?? 0) + (state?.questions?.length ?? 0);
	const parts = [
		`${end.slice(0, 10)} ${state?.id ?? state?.round ?? '?'} (class ${state?.class ?? '?'}, ${state?.step ?? '?'})${start ? `: ${duration(Date.parse(end) - Date.parse(start))}` : ''}`,
		`outcome: ${outcomeOf(state, checksLog)}`,
		history.length ? timeInSteps(history, end).join(', ') : 'steps not recorded',
		`visits: ${visitsPerStep(state?.history).join(', ') || 'none'}`,
		`checks ${checks.length} (${checks.filter((c) => c.result !== 'green').length} red${environment ? `, ${environment} environment` : ''})${unstable ? `, repro unstable ${unstable}` : ''}`,
		`wf refused ${refusals.length}${away ? ` (${away} not about the round)` : ''}${about.length ? `: ${[...new Set(about.map((r) => `${r.cmd}: ${r.msg}`.slice(0, 120)))].slice(0, 3).join('; ')}` : ''}`,
		`questions ${questions}`,
		`T2 ${verdicts.length - pushRefused} (${verdicts.filter((v) => v === 'changes-requested').length - pushRefused} changes-requested), push refused ${pushRefused}`,
	];
	return `- ${parts.join(' | ')}`;
}

// Pure: the .wf/events.log line for a wf command that exited non-zero in a round. `wf check` is left
// out: its runs are in checks.log already. `kind` is set only for a refusal wf made before it read the
// round (refusal.ts).
export function refusalLine({ ts, argv, code, message, kind }: { ts: string; argv: string[]; code: number; message: string; kind?: RefusalKind | null }): string | null {
	if (!code || argv[0] === 'check') return null;
	return JSON.stringify({ ts, cmd: argv.slice(0, 2).join(' '), exit: code, msg: (message ?? '').split('\n')[0].trim(), ...(kind ? { kind } : {}) });
}
