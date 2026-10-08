#!/usr/bin/env node
// next.ts — wf next: the one thing to do now in this round, from its state and its files (kit and
// env plan, step 4). It was the round skill's *On each result* table, which only the orchestrator's
// reading of it enforced. The orchestrator's loop: run `wf next`, do what it prints, run it again.
// wf next does the bookkeeping itself (the step, a question the round now waits on) and prints
// one of:
//   dispatch <phase> (model: <m>): <the line to send a fresh round-worker, on that model>
//   wait <person>: <what they owe>        tell them, verbatim; their answer → wf decide, then wf next
//   design | deliver | review | merge | suites: <what to run>   the orchestrator runs it, then wf next
//   done
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { addQuestion, blockedQuestion, overruledAsks, pendingRevisions, reviseState, rulingsOwed, t2Revisions } from './ask.ts';
import { briefKey, handoffFile, handoffGap, HANDOFF_FILES, planAsks, planClass, rowDone, rowSubject, tokenOf, validationVerdict } from './handoff.ts';
import { critiqueVerdict, MAX_EXCHANGES } from '../gates/critique.ts';
import { reportFile, roundChecks } from '../gates/standards.ts';
import { baseBranch } from '../project.ts';
import { planCommitRows } from './prompt.ts';
import { lastField, readVerdict, specShaFor } from '../gates/review-format.ts';
import { seams } from '../seams.ts';
import { modelFor } from '../models.ts';
import type { Models } from '../models.ts';
import { readState, toplevelOf, writeState } from './state.ts';
import type { Brief, Question, RoundClass } from './state.ts';
import { notifyAdapters, runStep } from './step.ts';

// A phase briefed this many times without a handoff goes to Shay, not to a third agent.
const MAX_BRIEFS = 2;

// Pure: the action for a snapshot of the round:
//   { branch, entry, step, klass, check, questions, answered, briefs, commit,
//     files: { research, plan, blocked, asBuilt, validation, critique, review } (text or null),
//     t1: { spec, reviewed, verdict } (SPEC.md's sha, SPEC-REVIEW.md's last spec-sha and verdict),
//     subjects (commit subjects since the base), checks (.wf/checks.log lines),
//     fixesAfterValidate (fix(review) commits since the validate brief's head),
//     note (the tracker note wf deliver wrote: its path and text, or null),
//     standards (each .agents/checks rule that covers the diff: its id, its report's text or null,
//     and the fix(review) commits since its brief),
//     models (the model each effort level runs on here: seams.models; none, no model is named),
//     revisions (the answers that say the plan must change: `wf decide --revise`),
//     history (the steps the round went through, with when: a revision answering a T2 shows in it),
//     researchRequests (the answers that say research must measure more: `wf decide --research`),
//     head (HEAD's sha), suites (the last `wf check --suites` line: the head it measured and its
//     result, or null before the first run) }
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
	files: Record<'research' | 'plan' | 'blocked' | 'asBuilt' | 'validation' | 'critique' | 'review', string | null>;
	t1: { spec: string | null; reviewed: string | null; verdict: string | null };
	subjects: string[];
	// The commits since the base, oldest first, with their committer times (ISO): when a fix(review) was made. Absent: subjects, with no time.
	commits?: { subject: string; at: string }[];
	checks: { row: number | null; result: string }[];
	// The last `wf check --repro` result per research token: stable | unstable | green | outside (checks.log, row `repro`).
	repro: Record<string, string>;
	fixesAfterValidate: number;
	note: { file: string; text: string | null } | null;
	standards?: { id: string; text: string | null; fixesAfter: number }[];
	models?: Models;
	revisions?: { text: string; at: string }[];
	history?: { step: string; at: string }[];
	researchRequests?: { text: string; at: string }[];
	head?: string;
	suites?: { ts: string; head: string; result: 'green' | 'red' } | null;
};
export type Effect = { step: string[]; ask?: undefined; revise?: undefined } | { ask: { to: string; text: string; dflt: string | null; source: string }; step?: undefined; revise?: undefined } | { revise: string; step?: undefined; ask?: undefined };

export function nextAction(s: Snapshot): { say: string; effects: Effect[] } {
	const effects: Effect[] = [];
	const act = (say: string) => ({ say, effects });
	const briefs = s.briefs ?? {};
	const brief = (phase: string, n?: number | string | null): Brief | undefined => briefs[briefKey(phase, n)];
	const wf = `node ${s.entry}`;
	// The line a fresh round-worker gets: it runs wf brief itself, so its brief is wf's own text. The
	// model is this machine's for the phase's effort level (models.ts), not the orchestrator's pick.
	const dispatch = (phase: string, args: (number | string | null)[] = [], gap: string | null = null) => {
		const b = brief(phase, args[0]);
		const label = [phase, ...args].join(' ');
		if (b && gap && (b.count ?? 1) >= MAX_BRIEFS) return act(`wait user: ${label} was briefed ${b.count} times and ${gap} — a harness gap (round skill, When a round goes wrong)`);
		const model = s.models ? ` (model: ${modelFor(phase, s.models)})` : '';
		return act(`dispatch ${label}${model}: run \`${wf} brief ${label}\` in this worktree and do exactly what it prints${b && gap ? ` (again: ${gap})` : ''}`);
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
		// New evidence came in (`wf decide --research`): a fresh research, whatever RESEARCH.md says. Its
		// brief is newer than the request, so this is asked once, and the old token's repro verdict no
		// longer counts. Never on its own: only the user's answer sends it.
		if (pendingRevisions(s.researchRequests, brief('research')?.at).length) return dispatch('research', [], null);
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
			return act(`wait user: it does not reproduce — \`${wf} check --repro\` was green on every run (RESEARCH.md says what was measured). Go on anyway: \`${wf} step plan\`; new evidence to measure: \`${wf} decide --research "<what research must now measure>"\`; stop: \`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\``);
		}
		// Red outside the repro's files is a precondition that failed (BJEW-461, 2026-10-06: the shared
		// setup's login), and research again meets it again unless it is fixed first.
		if (repro === 'outside') return dispatch('research', [], `\`${wf} check --repro\` was red outside the repro on every run, a precondition (login, setup, data) and not the defect: RESEARCH.md says what failed, and it is fixed before research runs again`);
		if (repro !== 'stable') return dispatch('research', [], `\`${wf} check --repro\` has not found its repro red at one place on every run`);
		effects.push({ step: ['plan'] });
		step = 'plan';
	}

	// plan → its Asks, T1 (class B/C) or implement
	let klass = s.klass ?? 'A';
	if (step === 'plan' || step === 'design') {
		const gap = handoffGap('plan', s.files.plan, brief('plan'), undefined, s.branch);
		if (gap) return dispatch('plan', [], gap);
		// An answer said the plan must change (`wf decide --revise`): revised before anything else is built.
		if (pendingRevisions(s.revisions, brief('plan')?.at).length) return dispatch('plan', ['--revise'], null);
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
			// An approved SPEC.md that has not changed since stands, whatever step the round is at: `wf decide
			// --revise` sets the step back to plan, and that is no reason for a second design session or T1.
			const approved = s.t1.spec !== null && s.t1.reviewed === s.t1.spec && s.t1.verdict === 'approved';
			if (!approved) {
				if (!s.t1.spec || step !== 'design') return act('design: start the design session (round skill, Dispatch in this harness); it writes SPEC.md with the user and runs `wf step design`');
				if (s.t1.reviewed === s.t1.spec && s.t1.verdict === 'changes-requested') return dispatch('plan', ['--revise'], null);
				return act(`wait user: T1 on SPEC.md — \`${wf} design ${s.branch}\``);
			}
			// A plan briefed before any SPEC.md existed was written without the design T1 approved: it is revised
			// to it before a row is built (BJEW-669, 2026-10-06: the approved SPEC replaced PLAN.md's commit 1 with
			// a migration, and `wf next` dispatched implement 1 of the old plan until the orchestrator ran
			// `wf decide --revise` by hand). A plan briefed after (its brief holds a SPEC sha) was written with it.
			if (brief('plan')?.spec === null) {
				effects.push({ revise: `T1 approved SPEC.md (${s.t1.spec!.slice(0, 15)}…), which PLAN.md was written before. Rewrite PLAN.md's commits to the design SPEC.md says: its rows, files and checks as its Build says. A row the design replaces is dropped or replaced by a new row, not kept; change nothing in PLAN.md that SPEC.md does not touch.` });
				return dispatch('plan', ['--revise'], null);
			}
		}
		effects.push({ step: ['implement'] });
		step = 'implement';
	}

	// implement → as-built (B/C) → validate → deliver, and the fixes T2 or a validation asked for
	if (step === 'implement') {
		const rows = planCommitRows(s.files.plan ?? '');
		if (s.files.blocked) {
			if (/^## Answer[ \t]*$/m.test(s.files.blocked.replace(/\r\n/g, '\n'))) {
				// The agent briefed after the last answer came back with the row still blocked: that answer
				// did not unblock it, and another agent would only block again. The user answers anew, holds
				// or ends the round (BJEW-461, 2026-10-06: "stop and ask QA" was answered, and wf next went
				// on dispatching implement 1).
				const b = brief('implement', s.commit);
				const last = (s.answered ?? []).filter((q) => q.source?.startsWith('BLOCKED.md') && q.answered).map((q) => q.answered!).sort().at(-1);
				if (!b || !last || b.at < last) return dispatch('implement', [s.commit], null);
				const q = `commit ${s.commit} is still blocked after the answer: ${blockedQuestion(s.files.blocked) ?? 'BLOCKED.md says why'} Answer anew, or hold the round (\`${wf} step held\`) or end it (\`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\`)`;
				effects.push({ ask: { to: 'user', text: q, dflt: null, source: `BLOCKED.md#${b.token}` } });
				return act(`wait user: ${q}`);
			}
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
		// A T2 comment answered with `wf decide --revise` is built by the revised plan's rows, not by a
		// fix(review) commit: it is not counted either (JX-1221, 2026-10-07: see t2Revisions).
		const t2Fixes = Math.max(0, [...(s.files.review ?? '').matchAll(/^verdict:\s*changes-requested\s*$/gm)].length - t2Revisions(s.history, s.revisions));
		// A fix(review) commit that is a PLAN.md row's own (a row built after `wf decide --revise`) is that row's,
		// not a fix a ruling or a T2 asked for (JX-1221, 2026-10-08: rows 5, 6, 9 and 10 met a ruling nobody had built).
		const rowMessages = new Set(planCommitRows(s.files.plan ?? '').map(rowSubject));
		const fixCommits = (s.commits ?? s.subjects.map((subject) => ({ subject, at: '' }))).filter((c) => c.subject.startsWith('fix(review):') && !rowMessages.has(c.subject));
		// A ruling `wf decide --revise` sent back to plan is built by the plan's own row, under the row's
		// message, which need not start with fix(review): — it is not owed (TJEW-670, 2026-10-06: q6 was
		// built by row 4 `fix(admin): …`, and `wf next` dispatched fix-review again and again; the agent found
		// nothing to fix). The rows being done is what satisfies it; validate still judges it again below.
		const { owed, used } = rulingsOwed(rulings, s.revisions, fixCommits.map((c) => Date.parse(c.at) || 0));
		const forT2 = fixCommits.length - used;
		if (forT2 < t2Fixes || owed.length) return dispatch('fix-review', forT2 < t2Fixes ? [] : ['--from', 'VALIDATION.md'], null);
		// The suites the round's diff reaches, on this HEAD, before validate judges it, and again after any commit
		// (a fix moves HEAD): validate reads the line, and a red one is a deviation like any other.
		// 2026-10-05: the changed tests passed, while tests no row touched had broken.
		if (s.suites !== undefined && s.suites?.head !== s.head) return act(`suites: \`${wf} check --suites\` (the whole suites of what this round changed, on this HEAD), then \`${wf} next\``);
		const vGap = handoffGap('validate', s.files.validation, brief('validate'));
		const vToken = brief('validate')?.token ?? 'validate';
		// A validation whose deviations were fixed is judged again, and so is one a T2 fix came after: it
		// is what the PR carries (TJEW-670, 2026-09-28: its review fix merged under the older validation).
		// A validation answering a critique that did not hand off is briefed again as an answer.
		if (vGap || rulings.some((q) => q.source === `VALIDATION.md#${vToken}`)) return dispatch('validate', vGap && brief('validate')?.answers ? ['--answer'] : [], vGap);
		// A resumed round may already have validation from before the first suites run; a rerun on
		// the same HEAD can also change the evidence. That older judge never saw this result.
		const validationAt = brief('validate')?.at;
		if (s.suites && (!validationAt || s.suites.ts > validationAt)) return dispatch('validate', [], null);
		// No gap passed: the last validation did hand off, and a gap would count toward MAX_BRIEFS.
		if (s.fixesAfterValidate > 0) return dispatch('validate', [], null);
		// The critic, before the person sees the validation (gates/critique.ts): a fresh agent audits
		// VALIDATION.md with the code frozen; a disagreement sends validate back to answer it, up to
		// MAX_EXCHANGES critiques, and one still open goes to T2 beside it.
		const critique = brief('critique');
		if (critique?.of !== tokenOf(s.files.validation)) return dispatch('critique', [], null);
		const cGap = handoffGap('critique', s.files.critique, critique);
		if (cGap) return dispatch('critique', [], cGap);
		if (critiqueVerdict(s.files.critique) !== 'AGREE' && (critique.exchange ?? 1) < MAX_EXCHANGES) return dispatch('validate', ['--answer'], null);
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

/** Read the latest whole-suite measurement; ignore malformed or incomplete log entries. */
export function lastSuites(checksLog: string): NonNullable<Snapshot['suites']> | null {
	let last: NonNullable<Snapshot['suites']> | null = null;
	for (const l of checksLog.split('\n')) {
		try {
			const c: unknown = JSON.parse(l);
			if (typeof c === 'object' && c !== null && 'row' in c && c.row === 'suites' && 'head' in c && typeof c.head === 'string' && c.head && 'ts' in c && typeof c.ts === 'string' && 'result' in c && (c.result === 'green' || c.result === 'red')) last = { ts: c.ts, head: c.head, result: c.result };
		} catch { /* a line cut off mid-write, or the blank last line: skipped */ }
	}
	return last;
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

// The commits since the base, oldest first, each with its committer time (ISO). A subject is cut at the first tab
// only: the time has none. PR #90 read this field and nothing filled it, so every fix ruling stayed owed (JX-1221, 2026-10-08).
function commitsSince(git: (...args: string[]) => string, base: string): { subject: string; at: string }[] {
	return git('log', '--reverse', '--format=%cI%x09%s', `${base}..HEAD`).split('\n').filter(Boolean).map((line) => {
		const tab = line.indexOf('\t');
		return { subject: line.slice(tab + 1), at: line.slice(0, tab) };
	});
}

export function snapshotOf(toplevel: string): Snapshot {
	const state = readState(toplevel) ?? {};
	const dir = join(toplevel, state.folder ?? '');
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	const base = git('merge-base', state.base ?? `origin/${baseBranch}`, 'HEAD');
	const specReview = read(join(dir, 'SPEC-REVIEW.md')) ?? '';
	const commits = commitsSince(git, base);
	return {
		branch,
		entry: seams.entry.replace(/\\/g, '/'),
		step: state.step ?? null,
		klass: state.class ?? null,
		check: state.check ?? false,
		questions: state.questions ?? [],
		answered: state.answered ?? [],
		revisions: state.revisions ?? [],
		history: state.history ?? [],
		researchRequests: state.researchRequests ?? [],
		briefs: state.briefs ?? {},
		commit: state.commit ?? null,
		head: git('rev-parse', 'HEAD'),
		suites: lastSuites(read(join(toplevel, '.wf', 'checks.log')) ?? ''),
		files: Object.fromEntries([['research', 'RESEARCH.md'], ['plan', 'PLAN.md'], ['blocked', 'BLOCKED.md'], ['asBuilt', HANDOFF_FILES['as-built']], ['validation', 'VALIDATION.md'], ['critique', HANDOFF_FILES.critique], ['review', 'REVIEW.md']].map(([k, f]) => [k, read(join(dir, f))])) as Snapshot['files'],
		t1: { spec: specShaFor(toplevel), reviewed: lastField(specReview, 'spec-sha'), verdict: readVerdict(specReview) },
		subjects: commits.map((c) => c.subject),
		commits,
		fixesAfterValidate: fixesSince(git, state.briefs?.validate?.head),
		note: state.note ? { file: state.note, text: read(join(toplevel, state.note)) } : null,
		models: seams.models,
		standards: roundChecks(toplevel, base).map((c) => ({ id: c.id, text: read(join(dir, reportFile(c.id))), fixesAfter: fixesSince(git, state.briefs?.[briefKey('standards', c.id)]?.head) })),
		repro: Object.fromEntries((read(join(toplevel, '.wf', 'checks.log')) ?? '').split('\n').flatMap((l) => { try { const c = JSON.parse(l); return c.row === 'repro' && c.token ? [[c.token as string, c.result as string]] : []; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; } })),
		checks: (read(join(toplevel, '.wf', 'checks.log')) ?? '').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as { row: number | string | null; result: string }]; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; } }).filter((c) => c.row !== 'repro' && c.row !== 'suites').map((c) => ({ ...c, row: c.row == null ? null : Number(c.row) })),
	};
}

export async function runNext() {
	const toplevel = toplevelOf();
	if (!readState(toplevel)?.folder) {
		console.error('wf next: no round here — run it in the round\'s worktree (wf new <branch> --id <id> makes one)');
		refuseCaller();
	}
	let { say, effects } = nextAction(snapshotOf(toplevel));
	for (const e of effects) {
		if (e.step) await runStep(e.step, { quiet: true });
		else if (e.revise !== undefined) writeState(toplevel, reviseState(readState(toplevel)!, e.revise));
		else writeState(toplevel, addQuestion(readState(toplevel)!, e.ask));
	}
	// A question just recorded is printed as an open one, with the q<n> that `wf decide --q` takes.
	if (effects.some((e) => e.ask)) {
		await notifyAdapters(readState(toplevel)!);
		({ say } = nextAction(snapshotOf(toplevel)));
	}
	console.log(say);
}
