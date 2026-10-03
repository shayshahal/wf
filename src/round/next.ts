#!/usr/bin/env node
// next.ts — wf next: the one thing to do now in this round, from its state and its files (kit and
// env plan, step 4). It was the round skill's *On each result* table, which only the orchestrator's
// reading of it enforced. The orchestrator's loop: run `wf next`, do what it prints, run it again.
// wf next does the bookkeeping itself (the step, a question the round now waits on) and prints
// one of:
//   dispatch <phase>: <the line to send a fresh round-worker>
//   wait <person>: <what they owe>        tell them, verbatim; their answer → wf decide, then wf next
//   design | deliver | review | merge: <what to run>   the orchestrator runs it, then wf next
//   done
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addQuestion, blockedQuestion, overruledAsks } from './ask.ts';
import { briefKey, handoffFile, handoffGap, HANDOFF_FILES, planAsks, planClass, rowDone, validationVerdict } from './handoff.ts';
import { reportFile, roundChecks } from '../gates/standards.ts';
import { baseBranch } from '../project.ts';
import { planCommitRows } from './prompt.ts';
import { lastField, readVerdict, specShaFor } from '../gates/review-format.ts';
import { seams } from '../seams.ts';
import { readState, toplevelOf, writeState } from './state.ts';
import type { Brief, Question, RoundClass } from './state.ts';
import { notifyAdapters, runStep } from './step.ts';

// A phase briefed this many times without a handoff goes to Shay, not to a third agent.
const MAX_BRIEFS = 2;

// Pure: the action for a snapshot of the round:
//   { branch, entry, step, klass, check, questions, answered, briefs, commit,
//     files: { research, plan, blocked, asBuilt, validation, review } (text or null),
//     t1: { spec, reviewed, verdict } (SPEC.md's sha, SPEC-REVIEW.md's last spec-sha and verdict),
//     subjects (commit subjects since the base), checks (.wf/checks.log lines),
//     fixesAfterValidate (fix(review) commits since the validate brief's head),
//     note (the tracker note wf deliver wrote: its path and text, or null),
//     standards (each .agents/checks rule that covers the diff: its id, its report's text or null,
//     and the fix(review) commits since its brief) }
// → { say, effects }, effects being { step: [args] } | { ask: { to, text, dflt, source } }.
export type Snapshot = {
	branch: string;
	entry: string;
	step: string | null;
	klass: RoundClass | null;
	check: boolean;
	questions: Question[];
	answered: Question[];
	briefs: Record<string, Brief>;
	commit: number | null;
	files: Record<'research' | 'plan' | 'blocked' | 'asBuilt' | 'validation' | 'review', string | null>;
	t1: { spec: string | null; reviewed: string | null; verdict: string | null };
	subjects: string[];
	checks: { row: number | null; result: string }[];
	// The last `wf check --repro` result per research token: stable | unstable | green (checks.log, row `repro`).
	repro: Record<string, string>;
	fixesAfterValidate: number;
	note: { file: string; text: string | null } | null;
	standards?: { id: string; text: string | null; fixesAfter: number }[];
};
export type Effect = { step: string[]; ask?: undefined } | { ask: { to: string; text: string; dflt: string | null; source: string }; step?: undefined };

export function nextAction(s: Snapshot): { say: string; effects: Effect[] } {
	const effects: Effect[] = [];
	const act = (say: string) => ({ say, effects });
	const briefs = s.briefs ?? {};
	const brief = (phase: string, n?: number | string | null): Brief | undefined => briefs[briefKey(phase, n)];
	const wf = `node ${s.entry}`;
	// The line a fresh round-worker gets: it runs wf brief itself, so its brief is wf's own text.
	const dispatch = (phase: string, args: (number | string | null)[] = [], gap: string | null = null) => {
		const b = brief(phase, args[0]);
		const label = [phase, ...args].join(' ');
		if (b && gap && (b.count ?? 1) >= MAX_BRIEFS) return act(`wait user: ${label} was briefed ${b.count} times and ${gap} — a harness gap (round skill, When a round goes wrong)`);
		return act(`dispatch ${label}: run \`${wf} brief ${label}\` in this worktree and do exactly what it prints${b && gap ? ` (again: ${gap})` : ''}`);
	};
	const asked = (source: string) => [...(s.questions ?? []), ...(s.answered ?? [])].some((q) => q.source === source);
	const open = s.questions ?? [];

	if (open.length) return act(open.map((q) => `wait ${q.to}: q${q.n} ${q.text}${q.default ? ` (default: ${q.default})` : ''}`).join('\n'));
	if (s.step === 'held') return act('wait user: the round is held (wf step <name> resumes it)');
	// The tracker hears last, one section per item, and a session can die between two posts: the note
	// says which are posted, so a resumed round posts the rest and never one twice (2026-10-03: `done`
	// right after deliver left a half-posted note with nothing to say so).
	if (s.step === 'merged') {
		const left = unpostedSections(s.note?.text ?? null);
		if (left.length) return act(`post: ${left.join(', ')} — each section of ${s.note!.file} on its own item, with the delivered status (ROUND.md); right after each, its heading gets \` (posted)\`. Then \`${wf} next\``);
		return act(`done: \`${wf} reap ${s.branch}\``);
	}
	// T2 is local, before anything leaves the machine; the approval is the merge, and the tracker hears
	// last (Shay, 2026-09-27: BJEW-562's PR was merged in GitHub before its T2, and Monday said
	// Fixed in Local before anyone had looked).
	if (s.step === 'pr') return act(`deliver: T2 approved — \`${wf} deliver\` (push, PR, merge, the tracker note), then \`${wf} next\``);
	const t2 = `review: T2 — see the fix first (ROUND.md's T2, as the round skill's *Dispatch in this harness* says), then \`${wf} review ${s.branch}\`; once it has a verdict, \`${wf} review ${s.branch} --done\``;
	if (s.step === 'review') {
		if (readVerdict(s.files.review ?? '') === 'dismissed') return act(`wait user: T2 was closed without a verdict — \`${wf} review ${s.branch}\` again when they are ready`);
		return act(t2);
	}

	// research → plan
	let step = s.step;
	if (!step || step === 'classify' || step === 'research') {
		const gap = handoffGap('research', s.files.research, brief('research'));
		if (gap) return dispatch('research', [], gap);
		// A check (wf new --check) stops here: whether the ticket reproduces is the answer asked for,
		// and the tracker hears nothing until Shay says go (BJEW-461, 2026-09-28: it did not reproduce,
		// and a round would have said In Progress for a ticket that went back to its reporter).
		if (s.check) {
			if (step !== 'research') effects.push({ step: ['research', '--waiting-on', 'user'] });
			return act(`wait user: check — RESEARCH.md says whether it reproduces. Go on: \`${wf} step plan\`, then set the started status; stop: \`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\``);
		}
		// Plan builds on the repro being a measurement: `wf check --repro` found it red at one place three
		// times for this brief (TJEW-665: a repro racing hydration blocked commit 2). A check round stops
		// above: its repro may be green, which is its answer.
		const token = brief('research')?.token;
		const repro = token ? (s.repro ?? {})[token] : 'stable';
		if (repro === 'green') {
			if (step !== 'research') effects.push({ step: ['research', '--waiting-on', 'user'] });
			return act(`wait user: it does not reproduce — \`${wf} check --repro\` was green on every run (RESEARCH.md says what was measured). Go on anyway: \`${wf} step plan\`; stop: \`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\``);
		}
		if (repro !== 'stable') return dispatch('research', [], `\`${wf} check --repro\` has not found its repro red at one place on every run`);
		effects.push({ step: ['plan'] });
		step = 'plan';
	}

	// plan → its Asks, T1 (class B/C) or implement
	let klass = s.klass ?? 'A';
	if (step === 'plan' || step === 'design') {
		const gap = handoffGap('plan', s.files.plan, brief('plan'));
		if (gap) return dispatch('plan', [], gap);
		const token = brief('plan')?.token ?? 'plan';
		const asks = planAsks(s.files.plan).map((a, i) => ({ ...a, source: `PLAN.md#${token}:${i + 1}` })).filter((a) => !asked(a.source));
		if (asks.length) {
			for (const a of asks) effects.push({ ask: { to: 'user', text: a.text, dflt: a.dflt, source: a.source } });
			return act(asks.map((a) => `wait user: ${a.text}${a.dflt ? ` (default: ${a.dflt})` : ''}`).join('\n'));
		}
		// An Ask answered against its default: the plan is revised to the answer first (ask.ts).
		if (overruledAsks(s.answered, token).length) return dispatch('plan', ['--revise'], null);
		const planned = planClass(s.files.plan);
		if ((planned === 'B' || planned === 'C') && planned !== klass && klass !== 'C') {
			effects.push({ step: ['plan', '--class', planned] });
			klass = planned;
		}
		if (klass === 'B' || klass === 'C') {
			if (!s.t1.spec || step !== 'design') return act('design: start the design session (round skill, Dispatch in this harness); it writes SPEC.md with the user and runs `wf step design`');
			if (s.t1.reviewed === s.t1.spec && s.t1.verdict === 'changes-requested') return dispatch('plan', ['--revise'], null);
			if (s.t1.reviewed !== s.t1.spec || s.t1.verdict !== 'approved') return act(`wait user: T1 on SPEC.md — \`${wf} design ${s.branch}\``);
		}
		effects.push({ step: ['implement'] });
		step = 'implement';
	}

	// implement → as-built (B/C) → validate → deliver, and the fixes T2 or a validation asked for
	if (step === 'implement') {
		const rows = planCommitRows(s.files.plan ?? '');
		if (s.files.blocked) {
			if (/^## Answer[ \t]*$/m.test(s.files.blocked.replace(/\r\n/g, '\n'))) return dispatch('implement', [s.commit], null);
			const q = blockedQuestion(s.files.blocked);
			if (!q) return act(`wait user: BLOCKED.md at commit ${s.commit} has no Question: line — read it`);
			effects.push({ ask: { to: 'user', text: q, dflt: null, source: 'BLOCKED.md' } });
			return act(`wait user: blocked at commit ${s.commit} — ${q}`);
		}
		const pending = rows.find((r) => !rowDone(r, s));
		if (pending) return dispatch('implement', [pending.n], brief('implement', pending.n) ? `commit ${pending.n} is not in git log with a green \`wf check\`` : null);
		if (klass === 'B' || klass === 'C') {
			const gap = handoffGap('as-built', s.files.asBuilt, brief('as-built'));
			if (gap) return dispatch('as-built', [], gap);
		}
		// Every fix asked for (a T2 changes-requested, a validation ruled `fix`) is one fix(review) commit.
		const rulings = (s.answered ?? []).filter((q) => q.source?.startsWith('VALIDATION.md#') && /^\s*fix\b/i.test(q.answer ?? ''));
		const t2Fixes = [...(s.files.review ?? '').matchAll(/^verdict:\s*changes-requested\s*$/gm)].length;
		const fixed = s.subjects.filter((x) => x.startsWith('fix(review):')).length;
		if (fixed < t2Fixes + rulings.length) return dispatch('fix-review', fixed < t2Fixes ? [] : ['--from', 'VALIDATION.md'], null);
		const vGap = handoffGap('validate', s.files.validation, brief('validate'));
		const vToken = brief('validate')?.token ?? 'validate';
		// A validation whose deviations were fixed is judged again, and so is one a T2 fix came after: it
		// is what the PR carries (TJEW-670, 2026-09-28: its review fix merged under the older validation).
		if (vGap || rulings.some((q) => q.source === `VALIDATION.md#${vToken}`)) return dispatch('validate', [], vGap);
		// No gap passed: the last validation did hand off, and a gap would count toward MAX_BRIEFS.
		if (s.fixesAfterValidate > 0) return dispatch('validate', [], null);
		if (validationVerdict(s.files.validation) === 'deviates') {
			const source = `VALIDATION.md#${vToken}`;
			const ruling = (s.answered ?? []).find((q) => q.source === source);
			if (!ruling) {
				const lines = (s.files.validation ?? '').replace(/\r\n/g, '\n').split('\n').filter((l) => /\b(differs|missing|not met|extra|red):/.test(l)).map((l) => l.replace(/^[-*]\s*/, '').trim());
				const text = `fix or accept: ${lines.join(' · ') || 'VALIDATION.md says deviates'}`;
				effects.push({ ask: { to: 'user', text, dflt: null, source } });
				return act(`wait user: ${text}`);
			}
			if (!/^\s*accept\b/i.test(ruling.answer ?? '')) return act(`wait user: q${ruling.n}'s answer "${ruling.answer}" is neither fix nor accept — ask again with \`${wf} ask\``);
		}
		// The standards axis, once spec is settled: one fresh agent per rule that covers the diff, one at
		// a time (the hook judges a stopping agent by the last brief), and again after a fix(review)
		// commit, as validate is. Their reports go to T2 as they are (standards.ts).
		for (const c of s.standards ?? []) {
			const gap = handoffGap('standards', c.text, brief('standards', c.id), handoffFile('standards', c.id));
			if (gap) return dispatch('standards', [c.id], gap);
			if (c.fixesAfter > 0) return dispatch('standards', [c.id], null);
		}
		return act(t2);
	}
	return act(`wait user: step "${step}" has no next action`);
}

// ── the shell ────────────────────────────────────────────────────────────────

const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

// Pure: the ids of the tracker note's `## <id>` sections not yet marked ` (posted)`. No note (a
// round delivered before wf deliver recorded it) has nothing left to post.
export function unpostedSections(note: string | null): string[] {
	return [...(note ?? '').matchAll(/^## (\S+)(.*)$/gm)].filter((m) => !/\(posted\)/.test(m[2])).map((m) => m[1]);
}

// fix(review) commits after `head` (a validate brief from before this field: none counted).
function fixesSince(git: (...args: string[]) => string, head: string | undefined): number {
	if (!head) return 0;
	try { return git('log', '--format=%s', `${head}..HEAD`).split('\n').filter((x) => x.startsWith('fix(review):')).length; } catch { return 0; }
}

export function snapshotOf(toplevel: string): Snapshot {
	const state = readState(toplevel) ?? {};
	const dir = join(toplevel, state.folder ?? '');
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	const base = git('merge-base', state.base ?? `origin/${baseBranch}`, 'HEAD');
	const specReview = read(join(dir, 'SPEC-REVIEW.md')) ?? '';
	return {
		branch,
		entry: seams.entry.replace(/\\/g, '/'),
		step: state.step ?? null,
		klass: state.class ?? null,
		check: state.check ?? false,
		questions: state.questions ?? [],
		answered: state.answered ?? [],
		briefs: state.briefs ?? {},
		commit: state.commit ?? null,
		files: Object.fromEntries([['research', 'RESEARCH.md'], ['plan', 'PLAN.md'], ['blocked', 'BLOCKED.md'], ['asBuilt', HANDOFF_FILES['as-built']], ['validation', 'VALIDATION.md'], ['review', 'REVIEW.md']].map(([k, f]) => [k, read(join(dir, f))])) as Snapshot['files'],
		t1: { spec: specShaFor(toplevel), reviewed: lastField(specReview, 'spec-sha'), verdict: readVerdict(specReview) },
		subjects: git('log', '--format=%s', `${base}..HEAD`).split('\n').filter(Boolean),
		fixesAfterValidate: fixesSince(git, state.briefs?.validate?.head),
		note: state.note ? { file: state.note, text: read(join(toplevel, state.note)) } : null,
		standards: roundChecks(toplevel, base).map((c) => ({ id: c.id, text: read(join(dir, reportFile(c.id))), fixesAfter: fixesSince(git, state.briefs?.[briefKey('standards', c.id)]?.head) })),
		repro: Object.fromEntries((read(join(toplevel, '.wf', 'checks.log')) ?? '').split('\n').flatMap((l) => { try { const c = JSON.parse(l); return c.row === 'repro' && c.token ? [[c.token as string, c.result as string]] : []; } catch { return []; } })),
		checks: (read(join(toplevel, '.wf', 'checks.log')) ?? '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as { row: number | string | null; result: string }]; } catch { return []; } }).filter((c) => c.row !== 'repro').map((c) => ({ ...c, row: c.row == null ? null : Number(c.row) })),
	};
}

export async function runNext() {
	const toplevel = toplevelOf();
	if (!readState(toplevel)?.folder) {
		console.error('wf next: no round here — run it in the round\'s worktree (wf new <branch> --id <id> makes one)');
		process.exit(2);
	}
	let { say, effects } = nextAction(snapshotOf(toplevel));
	for (const e of effects) {
		if (e.step) await runStep(e.step, { quiet: true });
		else writeState(toplevel, addQuestion(readState(toplevel)!, e.ask));
	}
	// A question just recorded is printed as an open one, with the q<n> that `wf decide --q` takes.
	if (effects.some((e) => e.ask)) {
		await notifyAdapters(readState(toplevel)!);
		({ say } = nextAction(snapshotOf(toplevel)));
	}
	console.log(say);
}
