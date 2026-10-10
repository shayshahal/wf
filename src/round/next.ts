#!/usr/bin/env node
// next.ts — wf next: the one thing to do now in this round, from its state and its files. The route
// is the smaller workflow (#110, #111, #112, #113):
//
//   wf new → agree (T1 for B/C) → build ↔ verify+steer → one assessment → T2 → wf deliver
//
// The old research/plan/design/replan handoffs, the per-commit dispatch with its row tokens and
// commit-subject matching, and the validate/critique/as-built/per-rule standards pipeline are gone.
// Build is one phase that resumes in place; a commit is not a workflow transition. `wf next` prints
// one of:
//   dispatch <phase> (model: <m>): <the line to send a fresh round-worker, on that model>
//   wait <person>: <what they owe>        tell them, verbatim; their answer → wf decide, then wf next
//   review | deliver | check | done        the orchestrator runs it, then wf next
// It does the bookkeeping itself (the step, a question the round now waits on).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { addQuestion, blockedQuestion, openRevisions } from './ask.ts';
import { agreementClass, agreementGap, agreementPath, agreementSha, AGREEMENT_FILE, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, assessmentGap, assessmentHead, assessmentMaterial, assessmentVerdict, caseFiles, consequential, REVIEW_FILE, verificationCases } from './agreement.ts';
import { baseBranch, contractPaths as contractPathsFile } from '../project.ts';
import { classFromFiles } from '../gates/classify.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { seams } from '../seams.ts';
import { modelFor } from '../models.ts';
import type { Models } from '../models.ts';
import { readState, resolveRoundBase, toplevelOf, writeState } from './state.ts';
import type { Question, RoundClass } from './state.ts';
import { higherClass, notifyAdapters, runStep } from './step.ts';

// How many times a within-agreement finding is repaired autonomously before one contextual escalation
// (#113.3). An evaluated default, not a universal rule (#110).
export const MAX_REPAIRS = 2;

// Pure: the action for a snapshot of the round.
//   step: classify | agree | build | assess | review | pr | merged | held
//   files: { agreement, assessment, review, blocked } (text or null)
//   t1: agreement material sha, AGREEMENT-REVIEW.md's `agreement-sha` and verdict
//   checks: .wf/checks.log lines; suites: the last whole-suite measurement
//   repairs: autonomous repairs already attempted for the current assessment
export type Snapshot = {
	branch: string;
	entry: string;
	step: string | null;
	klass: RoundClass | null;
	check: boolean;
	questions: Question[];
	answered: Question[];
	files: Record<'agreement' | 'assessment' | 'review' | 'blocked', string | null>;
	t1: { sha: string | null; reviewed: string | null; verdict: string | null };
	commits: { subject: string; at: string }[];
	checks: { row: number | string | null; result: string; rowCheck?: string | null; content?: string }[];
	repro: Record<string, string>;
	head: string;
	suites: { ts: string; head: string; result: 'green' | 'red' } | null;
	note: { file: string; text: string | null } | null;
	models?: Models;
	contractPaths?: string | null;
	folder?: string | null;
	filesChanged?: string[];
	revisions?: { text: string; at: string; sha?: string | null }[];
	blockedAnswered?: number;
	history?: { step: string; at: string }[];
	repairs?: number;
};
export type Effect =
	| { step?: string[]; ask?: { to: string; text: string; dflt: string | null; source: string }; repair?: true; blockedAnswered?: number };

// Pure: the ids of the tracker note's `## <id>` sections not yet marked ` (posted)`.
export function unpostedSections(note: string | null): string[] {
	return [...(note ?? '').matchAll(/^## (\S+)(.*)$/gm)].filter((m) => !/\(posted\)/.test(m[2])).map((m) => m[1]);
}

export function nextAction(s: Snapshot): { say: string; effects: Effect[] } {
	const effects: Effect[] = [];
	const act = (say: string) => ({ say, effects });
	const wf = `node ${s.entry}`;
	// The line a fresh round-worker gets: it runs wf brief itself, so its brief is wf's own text.
	const dispatch = (phase: string, again: string | null = null) => {
		const model = s.models ? ` (model: ${modelFor(phase, s.models)})` : '';
		return act(`dispatch ${phase}${model}: run \`${wf} brief ${phase}\` in this worktree and do exactly what it prints${again ? ` (again: ${again})` : ''}`);
	};
	const open = s.questions ?? [];

	if (open.length) return act(open.map((q) => `wait ${q.to}: q${q.n} ${q.text}${q.default ? ` (default: ${q.default})` : ''}`).join('\n'));
	if (s.step === 'held') return act('wait user: the round is held (wf step <name> resumes it)');
	// The tracker hears last, one section per item; a session can die between two posts, so the note
	// says which are posted and a resumed round posts the rest, never one twice.
	if (s.step === 'merged') {
		const left = unpostedSections(s.note?.text ?? null);
		if (left.length) return act(`post: ${left.join(', ')} — each section of ${s.note!.file} on its own item, with the delivered status (ROUND.md); right after each, its heading gets \` (posted)\`. Then \`${wf} next\``);
		return act(`done: \`${wf} reap ${s.branch}\``);
	}
	// T2 is local, before anything leaves the machine; the approval is the merge.
	if (s.step === 'pr') return act(`deliver: T2 approved — \`${wf} deliver\` (push, PR, merge, the tracker note), then \`${wf} next\``);

	// The class is measured from what the round actually does — a declared `Class:` line, a verification
	// case, or a changed file that reaches a contract path. It runs at every working step, so an A round
	// that edits a contract path without a case (or opens a worktree measured A on an empty diff) cannot
	// keep skipping T1 (#111.4). A class never downgrades; `wf new --class C` stays C. A check round
	// answers a question, not a build, so it is exempt.
	if (!s.check) {
		const cases = verificationCases(s.files.agreement);
		const files = [...cases.flatMap((c) => caseFiles(c)), ...(s.filesChanged ?? [])];
		const byFiles = s.contractPaths ? classFromFiles(files, s.contractPaths) : 'A';
		const planned = higherClass(higherClass(s.klass, agreementClass(s.files.agreement) ?? 'A'), byFiles);
		if (planned !== (s.klass ?? 'A')) {
			effects.push({ step: ['classify', '--class', planned] });
			return act(`classify: the round measures class ${planned} (a declared Class:, a case, or a changed file on a contract path) — \`${wf} next\` takes T1 next`);
		}
	}

	// `wf decide --revise` records the agreement's material sha at the time. The revision is open until
	// that sha moves (a fresh agreement the person can approve); while it is open the round cannot build
	// on the old T1, so the agree session is dispatched again (#111.4).
	const pending = openRevisions(s.revisions ?? [], s.t1.sha);
	if (pending.length) {
		if (s.step !== 'agree') effects.push({ step: ['agree', '--waiting-on', 'user'] });
		// A revision with no recorded sha is a malformed state (the producer always writes one); keep it
		// open and say so, never discharge the requested change silently (N-6).
		const malformed = pending.filter((r) => r.sha === undefined).length;
		const note = malformed ? ` — ${malformed} revision(s) have no recorded agreement sha: .wf/state.json is malformed, fix or delete them` : '';
		return dispatch('agree', `the person asked the agreement to change: ${pending.map((r) => r.text).join(' · ')}${note}`);
	}

	// T1 binds the agreement's agreed material sha. A progress edit to `## Verification`/`## Units`
	// does not change the sha; a change to `## Observed`/`## Agreed` (or `## Intent`) does.
	const t1Approved = s.t1.sha !== null && s.t1.reviewed === s.t1.sha && s.t1.verdict === 'approved';
	// T1 stays live after the build starts: a build or progress edit that changes the agreed material
	// sends the round back to a fresh T1 rather than riding the old approval (#111.4).
	if (s.step === 'build' || s.step === 'assess' || s.step === 'review') {
		if (consequential(s.klass) && !t1Approved) {
			const why = s.t1.reviewed === null ? `no ${AGREEMENT_REVIEW_FILE} yet` : s.t1.reviewed !== s.t1.sha ? 'the agreed material changed since T1' : `T1 verdict is ${s.t1.verdict ?? 'pending'}`;
			effects.push({ step: ['agree', '--waiting-on', 'user'] });
			return act(`wait user: T1 on AGREEMENT.md (${why}) — \`${wf} agree ${s.branch}\``);
		}
	}
	const t2 = `review: T2 — see the fix first (the diff, the agreement and ASSESSMENT.md beside it), then \`${wf} review ${s.branch}\`; once it has a verdict, \`${wf} review ${s.branch} --done\``;
	if (s.step === 'review') {
		if (readVerdict(s.files.review ?? '') === 'dismissed') return act(`wait user: T2 was closed without a verdict — \`${wf} review ${s.branch}\` again when they are ready`);
		return act(t2);
	}

	// agree → build (T1 for B/C), and the check round's "does it reproduce"
	let step = s.step;
	if (!step || step === 'classify' || step === 'agree') {
		// A check round (wf new --check) answers one question: does the ticket reproduce? The working
		// session writes `## Repro` into the agreement (TICKET.md for class A), then `wf check --repro`
		// measures it; a green repro is the finding and the user decides whether to go on.
		if (s.check) {
			if (!/^## Repro[ \t]*$/m.test((s.files.agreement ?? '').replace(/\r\n/g, '\n'))) return dispatch('agree', `no \`## Repro\` in ${consequential(s.klass) ? 'AGREEMENT.md' : 'TICKET.md'} yet`);
			if (step !== 'agree') effects.push({ step: ['agree', '--waiting-on', 'user'] });
			return act(`check: run \`${wf} check --repro\` (it says whether the ticket reproduces), then \`${wf} next\`. Go on: \`${wf} step build\` and set the started status; stop: \`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\``);
		}
		if (consequential(s.klass)) {
			const gap = agreementGap(s.files.agreement, s.klass, s.branch);
			if (gap) return dispatch('agree', gap);
			// T1 approves the agreement's agreed material. A progress update to `## Verification` does
			// not change the material sha and so does not invalidate an approved direction (#111.5).
			if (!t1Approved) {
				// A T1 that asked for changes sends the round back to a fresh agreement; otherwise the round
				// waits on the person at the T1 page.
				if (s.t1.reviewed === s.t1.sha && s.t1.verdict === 'changes-requested') return dispatch('agree', 'T1 asked for changes (AGREEMENT-REVIEW.md)');
				if (step !== 'agree') effects.push({ step: ['agree', '--waiting-on', 'user'] });
				return act(`wait user: T1 on AGREEMENT.md — \`${wf} agree ${s.branch}\``);
			}
		}
		effects.push({ step: ['build'] });
		step = 'build';
	}

	// build: one phase, resumed in place, ended by the build worker running `wf step assess`.
	if (step === 'build') {
		if (s.files.blocked) {
			const q = blockedQuestion(s.files.blocked);
			if (!q) return act(`wait user: BLOCKED.md has no Question: line — read it`);
			// An answer to the blocked question (`wf decide` writes `## Answer`) resumes the build once;
			// a build that comes back still blocked asks the person again with a fresh question.
			const answered = [...(s.answered ?? [])].reverse().find((a) => a.source?.startsWith('BLOCKED.md'));
			if (answered && answered.n !== s.blockedAnswered) {
				effects.push({ blockedAnswered: answered.n });
				return dispatch('build', `the blocked question was answered: ${answered.answer ?? ''}`);
			}
			return act(`wait user: blocked — ${q}`);
		}
		return dispatch('build');
	}

	// assess: one independent final assessment by default (#113). A within-agreement finding repairs
	// autonomously, bounded; unmet intent blocks T2 until fixed, accepted or held; a material change
	// is one contextual escalation.
	if (step === 'assess') {
		const gap = assessmentGap(s.files.assessment);
		if (gap) return dispatch('assess', gap);
		const measured = assessmentHead(s.files.assessment);
		if (measured !== s.head) return dispatch('assess', `ASSESSMENT.md is of ${measured?.slice(0, 10) ?? 'no head'}…, HEAD is ${s.head.slice(0, 10)}…`);
		const verdict = assessmentVerdict(s.files.assessment);
		const material = assessmentMaterial(s.files.assessment);
		if (material) {
			// One contextual escalation, recorded so it cannot repeat. A material change is outside the
			// agreement, so only an explicit `accept` (the literal word, case-insensitive) carries it into
			// T2; any other answer returns to the build, where `wf decide --revise` renews the agreement
			// (#111.4). The question offers only the paths the code takes (N-5): accept, or --revise.
			const source = `ASSESSMENT.md#${measured ?? 'unknown'}#material`;
			const ruling = (s.answered ?? []).find((q) => q.source === source);
			if (!ruling) {
				const q = `the assessment found a material change outside the agreement: ${material}. Answer \`accept\` to carry it into T2, or \`${wf} decide --revise "<the renewed behavior>"\` to renew the agreement (then a fresh T1)`;
				effects.push({ ask: { to: 'user', text: q, dflt: null, source } });
				return act(`wait user: ${q}`);
			}
			if (!/^\s*accept\b/i.test(ruling.answer ?? '')) {
				effects.push({ step: ['build'] });
				return dispatch('build', 'the assessment found a material change outside the agreement and the ruling is not `accept` — bring the work within the agreement, or `wf decide --revise` to renew it');
			}
			// Accepted explicitly: T2 reads the acceptance beside the assessment, never in silence.
		}
		if (verdict === 'blocked') {
			// Unmet intent or a still-reproducing symptom: never silently passed to T2 (#113.4, #75).
			// One recorded fix-or-accept ruling, not a question per finding.
			const source = `ASSESSMENT.md#${measured ?? 'unknown'}`;
			const ruling = (s.answered ?? []).find((q) => q.source === source);
			if (!ruling) {
				const unmet = (s.files.assessment ?? '').replace(/\r\n/g, '\n').split('\n').filter((l) => /(not met:|differs:|still reproduces:)/i.test(l)).map((l) => l.trim().replace(/^-\s*"[^"]*":\s*/, '')).join(' · ');
				const q = `fix or accept: ${unmet || 'ASSESSMENT.md is blocked'} — answer \`accept\` to carry it into T2, or say how to fix it`;
				effects.push({ ask: { to: 'user', text: q, dflt: null, source } });
				return act(`wait user: ${q}`);
			}
			if (!/^\s*accept\b/i.test(ruling.answer ?? '')) {
				effects.push({ step: ['build'] });
				return dispatch('build', 'the assessment is blocked and the ruling is to fix it');
			}
			// Accepted explicitly: T2 reads the acceptance beside the assessment, never in silence.
		}
		if (verdict === 'repair') {
			const attempts = s.repairs ?? 0;
			if (attempts >= MAX_REPAIRS) {
				// The bounded repair ran out: one contextual escalation, recorded so it cannot repeat. An
				// answer that is not `accept` is a ruling to fix (build); `accept` carries into T2.
				const source = `ASSESSMENT.md#${measured ?? 'unknown'}`;
				const ruling = (s.answered ?? []).find((q) => q.source === source);
				if (!ruling) {
					const q = `${MAX_REPAIRS} autonomous repairs did not clear ASSESSMENT.md: read its findings and rule — answer \`accept\` to carry it into T2, or say how to fix it (\`${wf} decide --revise …\` renews the agreement)`;
					effects.push({ ask: { to: 'user', text: q, dflt: null, source } });
					return act(`wait user: ${q}`);
				}
				if (!/^\s*accept\b/i.test(ruling.answer ?? '')) {
					effects.push({ step: ['build'] });
					return dispatch('build', 'the ruling is to fix the assessment, not accept it');
				}
				// Accepted: fall through to T2 with the acceptance beside the assessment.
			} else {
				effects.push({ repair: true, step: ['build'] });
				return dispatch('build', `repair ${attempts + 1} of ${MAX_REPAIRS} for ASSESSMENT.md's findings`);
			}
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
	// A base ref that does not resolve leaves the committed range unknown. `runNext` refuses with one
	// actionable line before this; the snapshot falls back to HEAD so a pure caller still builds.
	const { base } = resolveRoundBase(toplevel, state);
	const agreementReview = read(join(dir, AGREEMENT_REVIEW_FILE)) ?? '';
	const checksLog = read(join(toplevel, '.wf', 'checks.log')) ?? '';
	// The round's changed files (base→worktree, committed and uncommitted, plus untracked), with the
	// round's own paperwork removed: what the class measurement reads to see contract work a case does
	// not name (#111.4).
	const folderPrefix = (state.folder ?? '').replace(/\\/g, '/').replace(/\/?$/, '/');
	const filesChanged = [...new Set([...git('diff', '--name-only', base ?? 'HEAD').split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].map((l) => l.trim()).filter(Boolean))]
		.filter((f) => !f.startsWith('.wf/') && !(folderPrefix && f.startsWith(folderPrefix)));
	return {
		branch,
		entry: seams.entry.replace(/\\/g, '/'),
		step: state.step ?? null,
		klass: state.class ?? null,
		check: state.check ?? false,
		questions: state.questions ?? [],
		answered: state.answered ?? [],
		revisions: state.revisions ?? [],
		blockedAnswered: state.blocked_answered ?? 0,
		history: state.history ?? [],
		repairs: state.repairs ?? 0,
		head: git('rev-parse', 'HEAD'),
		suites: lastSuites(checksLog),
		files: {
			// The agreement is AGREEMENT.md when the working session wrote one (it decided the work is
			// consequential), else the class A ticket. Reading it here is what lets `wf next` measure the
			// declared `Class:` and the case files before the stored class catches up (#111.4).
			agreement: read(join(dir, AGREEMENT_FILE)) ?? read(agreementPath(toplevel, state.class ?? null, state.folder ?? null)),
			assessment: read(join(dir, ASSESSMENT_FILE)),
			review: read(join(dir, REVIEW_FILE)),
			blocked: read(join(dir, 'BLOCKED.md')),
		},
		t1: { sha: agreementSha(toplevel, state.class ?? null, state.folder ?? null), reviewed: lastField(agreementReview, 'agreement-sha'), verdict: readVerdict(agreementReview) },
		commits: commitsSince(git, base ?? 'HEAD'),
		checks: checksLog.split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as { row: number | string | null; result: string }]; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; } }).filter((c) => c.row !== 'repro' && c.row !== 'suites').map((c) => ({ ...c, row: c.row == null ? null : Number(c.row) })),
		repro: Object.fromEntries(checksLog.split('\n').flatMap((l) => { try { const c = JSON.parse(l); return c.row === 'repro' && c.token ? [[c.token as string, c.result as string]] : []; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; } })),
		note: state.note ? { file: state.note, text: read(join(toplevel, state.note)) } : null,
		models: seams.models,
		contractPaths: read(join(toplevel, contractPathsFile)),
		folder: state.folder ?? null,
		filesChanged,
	};
}

export async function runNext() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state?.folder) {
		console.error('wf next: no round here — run it in the round\'s worktree (wf new <branch> --id <id> makes one)');
		refuseCaller();
	}
	// A base ref that does not resolve leaves the round's committed diff unknown; report one actionable
	// line instead of a raw git fatal (N-1).
	const { ref, base } = resolveRoundBase(toplevel, state);
	if (!base) {
		console.error(`wf next: the round's base \`${ref}\` does not resolve — fetch it, or start the round with \`wf new --base <ref>\``);
		process.exit(2);
	}
	let { say, effects } = nextAction(snapshotOf(toplevel));
	for (const e of effects) {
		if (e.step) await runStep(e.step, { quiet: true });
		// A repair attempt is counted against the assessment it answered; the assessment's own `head:`
		// makes a stale count harmless (the next assessment is of a new HEAD).
		if (e.repair) writeState(toplevel, (s) => ({ repairs: (s.repairs ?? 0) + 1 }));
		if (e.blockedAnswered !== undefined) writeState(toplevel, () => ({ blocked_answered: e.blockedAnswered }));
		if (e.ask) writeState(toplevel, (state) => addQuestion(state, e.ask!));
	}
	if (effects.some((e) => e.ask)) {
		await notifyAdapters(readState(toplevel)!);
		({ say } = nextAction(snapshotOf(toplevel)));
	}
	console.log(say);
}
