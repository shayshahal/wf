// friction.mts — the one line `wf reap` prints and adds to ~/.cache/wf-reaped/ROUNDS.md: where a round
// spent its time and where wf or the person had to step in. Until 2026-09-28 finding that meant reading
// a round's session log by hand (TJEW-670.11: the broken pre-push hook, the as-built file committed by
// hand, the false "deviates"); Factory's Missions measure the same things (cycle time, retries).
// Pure; reap.mts reads the files and writes the line.
import type { State } from './state.mts';

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

// Pure: agents per phase ("implement 1", "implement 2" → implement), from state.briefs counts.
export function agentsPerPhase(briefs: Record<string, { count?: number }> | undefined): string[] {
	const per = new Map<string, number>();
	for (const [key, b] of Object.entries(briefs ?? {})) {
		const phase = key.split(' ')[0];
		per.set(phase, (per.get(phase) ?? 0) + (b.count ?? 1));
	}
	return [...per].map(([phase, n]) => `${phase} ${n}`);
}

const jsonLines = <T,>(text: string): T[] => (text ?? '').split('\n').filter((l) => l.trim()).flatMap((l) => {
	try { return [JSON.parse(l) as T]; } catch { return []; }
});

// Pure: the round's line. checksLog / eventsLog are .wf/checks.log and .wf/events.log, reviewText the
// round's REVIEW.md (each T2 and each refused push is a `verdict:` line in it).
export function frictionLine({ state, checksLog, eventsLog, reviewText, end }: { state: State | null; checksLog: string; eventsLog: string; reviewText: string; end: string }): string {
	const history = state?.history ?? [];
	const start = history[0]?.at ?? Object.values(state?.briefs ?? {}).map((b) => b.at).sort()[0] ?? null;
	const checks = jsonLines<{ result: string }>(checksLog);
	const refusals = jsonLines<{ cmd: string; msg: string }>(eventsLog);
	const verdicts = [...(reviewText ?? '').matchAll(/^verdict:\s*(\S+)\s*$/gm)].map((m) => m[1]).filter((v) => v !== 'pending');
	const pushRefused = (reviewText?.match(/refused by the project's pre-push hook/g) ?? []).length;
	const questions = (state?.answered?.length ?? 0) + (state?.questions?.length ?? 0);
	const parts = [
		`${end.slice(0, 10)} ${state?.id ?? state?.round ?? '?'} (class ${state?.class ?? '?'}, ${state?.step ?? '?'})${start ? `: ${duration(Date.parse(end) - Date.parse(start))}` : ''}`,
		history.length ? timeInSteps(history, end).join(', ') : 'steps not recorded',
		`agents: ${agentsPerPhase(state?.briefs).join(', ') || 'none'}`,
		`checks ${checks.length} (${checks.filter((c) => c.result !== 'green').length} red)`,
		`wf refused ${refusals.length}${refusals.length ? `: ${[...new Set(refusals.map((r) => `${r.cmd}: ${r.msg}`.slice(0, 120)))].slice(0, 3).join('; ')}` : ''}`,
		`questions ${questions}`,
		`T2 ${verdicts.length - pushRefused} (${verdicts.filter((v) => v === 'changes-requested').length - pushRefused} changes-requested), push refused ${pushRefused}`,
	];
	return `- ${parts.join(' | ')}`;
}

// Pure: the .wf/events.log line for a wf command that exited non-zero in a round. `wf check` is left
// out: its runs are in checks.log already.
export function refusalLine({ ts, argv, code, message }: { ts: string; argv: string[]; code: number; message: string }): string | null {
	if (!code || argv[0] === 'check') return null;
	return JSON.stringify({ ts, cmd: argv.slice(0, 2).join(' '), exit: code, msg: (message ?? '').split('\n')[0].trim() });
}
