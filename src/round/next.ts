#!/usr/bin/env node
// next.ts — wf next: the one thing to do now in this round, from its state and its files. The route
// is the smaller workflow (#110, #111, #112, #113):
//
//   wf new → agree (T1 for B/C) → build ↔ assess (per unit, named chunks reviewed) → T2 → deliver
//
// The old research/plan/design/replan handoffs, the per-commit dispatch with its row tokens and
// commit-subject matching, and the validate/critique/as-built/per-rule standards pipeline are gone.
// Small tasks have one build; large plans hand off bounded units, never commits. `wf next` prints
// one of:
//   dispatch <phase> (model: <m>): <the line to send a fresh round-worker, on that model>
//   wait <person>: <what they owe>        tell them, verbatim; their answer → wf decide, then wf next
//   review | deliver | check | done        the orchestrator runs it, then wf next
// It does the bookkeeping itself (the step, a question the round now waits on).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { addQuestion, blockedQuestion, openRevisions } from './ask.ts';
import { agreementClass, agreementGap, agreementPath, agreementSha, revisionSha, AGREEMENT_FILE, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, assessmentGap, assessmentHead, assessmentMaterial, assessmentOpenGaps, assessmentSurviving, assessmentVerdict, caseFiles, consequential, hasT2Walk, REVIEW_FILE, verificationCases } from './agreement.ts';
import { contractPaths as contractPathsFile } from '../project.ts';
import { classFromFiles } from '../gates/classify.ts';
import { changedFiles } from '../gates/check.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { seams } from '../seams.ts';
import { modelFor } from '../models.ts';
import type { Models } from '../models.ts';
import { readState, resolveRoundBase, toplevelOf, writeState } from './state.ts';
import type { Question, RoundClass } from './state.ts';
import { advanceSlice, sliceContext } from './build-units.ts';
import type { SliceProgress } from './build-units.ts';
import { stepHistory } from './friction.ts';
import { assessmentHandoffGap, checkGap, checkGapLine, checksEvidence, higherClass, runStep, suitesGap } from './step.ts';
import type { ChecksEvidence } from './step.ts';
import { assessmentContentSha, assessmentRulingSource, verificationGapsHash } from './assessment-rulings.ts';
import { mergedImplementationGap } from './delivered-round.ts';
import type { MergedImplementationGap } from './delivered-round.ts';

// How many times a within-agreement finding is repaired autonomously before one contextual escalation
// (#113.3). An evaluated default, not a universal rule (#110).
export const MAX_REPAIRS = 2;

// Pure: the action for a snapshot of the round.
//   step: classify | agree | build | assess | review | pr | merged | held
//   files: { agreement, assessment, review, blocked } (text or null)
//   t1: agreement material sha, AGREEMENT-REVIEW.md's `agreement-sha` and verdict
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
	t1: { sha: string | null; revisionSha?: string | null; reviewed: string | null; verdict: string | null };
	head: string;
	note: { file: string; text: string | null } | null;
	models?: Models;
	contractPaths?: string | null;
	folder?: string | null;
	filesChanged?: string[];
	revisions?: { text: string; at: string; sha?: string | null }[];
	blockedAnswered?: number;
	repairs?: number;
	slices?: SliceProgress;
	// .wf/checks.log and the implementation's identity now (step.ts checksEvidence). Absent in a pure arm
	// that tests nothing about checks; snapshotOf always provides it.
	checks?: ChecksEvidence;
	// Content identity captured at handoff, not mutable filesystem timestamps.
	assessmentChangedSinceHandoff?: boolean;
	assessmentBaselineMissing?: boolean;
	assessmentHandoffGap?: string | null;
	returnedFromAssess?: boolean;
	/** A merged round cannot post/reap on the old delivery while carrying new product work. */
	mergedGap?: MergedImplementationGap | null;
};
export type Effect =
	| { step?: string[]; ask?: { to: string; text: string; dflt: string | null; source: string; verification_gaps?: string[] }; repair?: true; blockedAnswered?: number; advance?: { unit: number; head: string } };

// Pure: the ids of the tracker note's `## <id>` sections not yet marked ` (posted)`.
export function unpostedSections(note: string | null): string[] {
	return [...(note ?? '').matchAll(/^## (\S+)(.*)$/gm)].filter((m) => !/\(posted\)/.test(m[2])).map((m) => m[1]);
}

/** Compute the next action; a brief may read an answered build assignment after dispatch consumed it. */
export function nextAction(s: Snapshot, purpose: 'dispatch' | 'brief' = 'dispatch'): { say: string; effects: Effect[] } {
	const effects: Effect[] = [];
	const act = (say: string) => ({ say, effects });
	const wf = `node ${s.entry}`;
	const context = sliceContext(s.files.agreement, s.slices);
	// The line a fresh round-worker gets: it runs wf brief itself, so its brief is wf's own text.
	const dispatch = (phase: string, again: string | null = null) => {
		if (phase === 'assess' && s.step === 'review') effects.push({ step: ['assess'] });
		const model = s.models ? ` (model: ${modelFor(phase, s.models)})` : '';
		return act(`dispatch ${phase}${model}: run \`${wf} brief ${phase}\` in this worktree and do exactly what it prints${context.kind === 'unit' ? ` (scope: unit:${context.unit.n} — ${context.unit.title})` : context.kind === 'integration' ? ' (scope: integration)' : ''}${again ? ` (again: ${again})` : ''}`);
	};
	const open = s.questions ?? [];

	if (open.length) return act(open.map((q) => `wait ${q.to}: q${q.n} ${q.text}${q.default ? ` (default: ${q.default})` : ''}`).join('\n'));
	if (s.step === 'held') return act('wait user: the round is held (wf step <name> resumes it)');
	// The tracker hears last, one section per item; a session can die between two posts, so the note
	// says which are posted and a resumed round posts the rest, never one twice.
	if (s.step === 'merged') {
		if (s.mergedGap?.kind === 'changed') return act(`wait user: ${s.mergedGap.reason}`);
		const left = unpostedSections(s.note?.text ?? null);
		if (left.length) return act(`post: ${left.join(', ')} — each section of ${s.note!.file} on its own item, with the delivered status (ROUND.md); right after each, its heading gets \` (posted)\`. Then \`${wf} next\``);
		if (s.mergedGap) return act(`wait user: ${s.mergedGap.reason}`);
		return act(`done: \`${wf} reap ${s.branch}\``);
	}
	if (s.step === 'pr' && context.kind !== 'single' && context.kind !== 'integration') return act('wait user: unit approval is not delivery approval — finish the units and integration');
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
	const pending = openRevisions(s.revisions ?? [], s.t1.revisionSha === undefined ? s.t1.sha : s.t1.revisionSha);
	if (pending.length) {
		if (s.step !== 'agree') effects.push({ step: ['agree', '--waiting-on', 'user'] });
		// A revision with no recorded sha is a malformed state (the producer always writes one); keep it
		// open and say so, never discharge the requested change silently (N-6).
		const malformed = pending.filter((r) => r.sha === undefined).length;
		const note = malformed ? ` — ${malformed} revision(s) have no recorded agreement sha: .wf/state.json is malformed, fix or delete them` : '';
		return dispatch('agree', `the person asked the agreement to change: ${pending.map((r) => r.text).join(' · ')}${note}`);
	}

	if (context.kind === 'invalid' && !s.slices) return dispatch('agree', context.why);
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
	if (context.kind === 'invalid') return act(`wait user: units — ${context.why}`);
	const assessmentFile = context.kind === 'unit' ? context.assessmentFile : ASSESSMENT_FILE;
	const label = context.kind === 'unit' ? `chunk — ${context.unit.reviewAfter ?? context.unit.title} (approval continues the build, not delivery)` : context.kind === 'integration' ? 'final delivery — integration verified; approval permits merge' : '';
	const t2 = `review: T2${label ? ` ${label}` : ''} — see the fix first (the diff, the agreement and ${assessmentFile} beside it), then \`${wf} review ${s.branch}\`; once it has a verdict, \`${wf} review ${s.branch} --done\``;
	// JX-275, 2026-10-12 (#127): a rebase at review looped between next's T2 line and step's
	// stale-assessment refusal. Review uses the assess policy too, before dismissal or T2.
	// Direct step review already evaluates this same branch; keep one owner for its gates.
	let step = s.step === 'review' ? 'assess' : s.step;

	// agree → build (T1 for B/C), and the check round's "does it reproduce"
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
		if (context.kind === 'pending') {
			effects.push({ step: ['build'] });
			return dispatch('build', 'start the first bounded unit');
		}
		if (s.files.blocked) {
			const q = blockedQuestion(s.files.blocked);
			if (!q) return act(`wait user: BLOCKED.md has no Question: line — read it`);
			// An answer to the blocked question (`wf decide` writes `## Answer`) resumes the build once;
			// a build that comes back still blocked asks the person again with a fresh question.
			const answered = [...(s.answered ?? [])].reverse().find((a) => a.source?.startsWith('BLOCKED.md'));
			// JX-1101 (#141): next consumes the dispatch, but the assigned worker still needs its brief.
			// A rewritten block must not inherit the previous answer, even with the same Question.
			if (answered && answered.text === q && /^## Answer[ \t]*\r?$/m.test(s.files.blocked) && (answered.n !== s.blockedAnswered || purpose === 'brief')) {
				if (purpose === 'dispatch') effects.push({ blockedAnswered: answered.n });
				return dispatch('build', `the blocked question was answered: ${answered.answer ?? ''}`);
			}
			return act(`wait user: blocked — ${q}`);
		}
		// A build that ended with its check unable to run (not red on the code) is a harness trouble no
		// redispatch changes: stop and say what, once, instead of looping the build (JX-1239).
		const trouble = s.checks ? checkGap(s.checks) : null;
		if (trouble?.kind === 'harness') return act(`wait user: harness — ${checkGapLine(trouble)}. Once fixed, run \`${wf} check\`, then \`${wf} next\``);
		// JX-154, 2026-10-13: the old next consumed a pre-handoff verdict and its fix ruling,
		// bouncing assess straight back to build. Recover that recorded bounce, not a normal repair.
		const source = assessmentRulingSource(s.files.assessment, context);
		const fix = s.answered.some((q) => (q.source === source || q.source?.startsWith(`${source}#`)) && !/^\s*accept\b/i.test(q.answer ?? ''));
		if (!trouble && s.files.assessment && s.assessmentChangedSinceHandoff === false && s.returnedFromAssess && fix) {
			if (s.assessmentHandoffGap) return dispatch('build', s.assessmentHandoffGap);
			effects.push({ step: ['assess'] });
			return dispatch('assess', 'the completed build still needs a fresh assessment of the new evidence, even at the same HEAD');
		}
		return dispatch('build');
	}

	// assess: one independent final assessment by default (#113). A within-agreement finding repairs
	// autonomously, bounded; unmet intent blocks T2 until fixed, accepted or held; a material change
	// is one contextual escalation.
	if (step === 'assess') {
		// The assessment judges an implementation wf check measured: a hand-off without a green of these
		// bytes (a direct `wf step assess` is refused too, step.ts) goes back, never on to the assessor.
		const unchecked = s.checks ? checkGap(s.checks) : null;
		if (unchecked?.kind === 'harness') return act(`wait user: harness — ${checkGapLine(unchecked)}. Once fixed, run \`${wf} check\`, then \`${wf} next\``);
		if (unchecked) {
			effects.push({ step: ['build'] });
			return dispatch('build', checkGapLine(unchecked));
		}
		if (s.assessmentChangedSinceHandoff === false) {
			if (s.assessmentBaselineMissing) {
				if (s.assessmentHandoffGap) {
					effects.push({ step: ['build'] });
					return dispatch('build', s.assessmentHandoffGap);
				}
				// Legacy visits have no durable report identity. Capture it once before dispatch;
				// touching an old report must not make it a new assessment.
				if (s.step !== 'review') effects.push({ step: ['assess'] });
			}
			return dispatch('assess', s.files.assessment ? 'the assessment has not changed since handoff; judge the new evidence even at the same HEAD' : `write ${assessmentFile} for this handoff`);
		}
		const future = context.kind === 'unit' ? context.plan.units.filter((u) => u.n > context.unit.n).map((u) => u.n) : [];
		const gap = assessmentGap(s.files.assessment, future);
		if (gap) return dispatch('assess', gap);
		if (context.kind === 'single' && /^unit:/i.test(lastField(s.files.assessment ?? '', 'scope') ?? '')) return dispatch('assess', 'a single-task assessment cannot claim a unit scope');
		if (context.kind === 'unit' || context.kind === 'integration') {
			const expected = context.kind === 'unit' ? `unit:${context.unit.n}` : 'integration';
			if (lastField(s.files.assessment ?? '', 'scope') !== expected) return dispatch('assess', `${assessmentFile} must name scope: ${expected}; another slice's verdict cannot hand off this one`);
			if (context.kind === 'unit' && lastField(s.files.assessment ?? '', 'base') !== context.base) return dispatch('assess', `${assessmentFile} must judge this unit's diff from base: ${context.base}`);
		}
		const measured = assessmentHead(s.files.assessment);
		if (measured !== s.head) return dispatch('assess', `ASSESSMENT.md is of ${measured?.slice(0, 10) ?? 'no head'}…, HEAD is ${s.head.slice(0, 10)}…`);
		const assessmentSource = assessmentRulingSource(s.files.assessment, context);
		const verdict = assessmentVerdict(s.files.assessment);
		const material = assessmentMaterial(s.files.assessment);
		const surviving = assessmentSurviving(s.files.assessment);
		const findingSource = surviving.length ? `${assessmentSource}#surviving:${verificationGapsHash(surviving)}` : assessmentSource;
		const choices = surviving.length
			? `say how to fix it within the agreement, or use \`${wf} decide --revise --q <n> "<the renewed behavior>"\` to accept an exception with a renewed agreement`
			: 'answer `accept` to carry it into T2, or say how to fix it';
		if (material) {
			// One contextual escalation, recorded so it cannot repeat. A material change is outside the
			// agreement, so only an explicit `accept` (the literal word, case-insensitive) carries it into
			// T2; any other answer returns to the build, where `wf decide --revise` renews the agreement
			// (#111.4). The question offers only the paths the code takes (N-5): accept, or --revise.
			const source = `${findingSource}#material`;
			const ruling = (s.answered ?? []).findLast((q) => q.source === source);
			if (!ruling || (surviving.length && /^\s*accept\b/i.test(ruling.answer ?? ''))) {
				const q = surviving.length
					? `the assessment found a material change outside the agreement: ${material} · surviving: ${surviving.join(' · ')} — ${choices}`
					: `the assessment found a material change outside the agreement: ${material}. Answer \`accept\` to carry it into T2, or \`${wf} decide --revise "<the renewed behavior>"\` to renew the agreement (then a fresh T1)`;
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
			const source = findingSource;
			const ruling = (s.answered ?? []).findLast((q) => q.source === source);
			if (!ruling || (surviving.length && /^\s*accept\b/i.test(ruling.answer ?? ''))) {
				const unmet = (s.files.assessment ?? '').replace(/\r\n/g, '\n').split('\n').filter((l) => /(not met:|differs:|still reproduces:)/i.test(l)).map((l) => l.trim().replace(/^-\s*"[^"]*":\s*/, '')).join(' · ');
				const q = `fix or ${surviving.length ? 'revise' : 'accept'}: ${unmet || 'ASSESSMENT.md is blocked'}${surviving.length ? ` · surviving: ${surviving.join(' · ')}` : ''} — ${choices}`;
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
				const source = findingSource;
				const ruling = (s.answered ?? []).findLast((q) => q.source === source);
				if (!ruling || (surviving.length && /^\s*accept\b/i.test(ruling.answer ?? ''))) {
					const q = `${MAX_REPAIRS} autonomous repairs did not clear ASSESSMENT.md: read its findings and rule${surviving.length ? ` · surviving: ${surviving.join(' · ')}` : ''} — ${choices} (\`${wf} decide --revise …\` renews the agreement)`;
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
		// A clean verdict does not pass a verification gap the assessment states (INCONCLUSIVE, NOT
		// VERIFIED, NOT MEASURED) or a suite that is red at these bytes: one fix-or-accept ruling, tied
		// to this assessment's head and these very lines. "The file is untouched" is not a ruling.
		const redSuites = s.checks ? suitesGap(s.checks) : null;
		const open = verdict === 'clean' ? [...assessmentOpenGaps(s.files.assessment), ...(redSuites ? [redSuites] : [])] : [];
		if (open.length) {
			const source = `${assessmentSource}#open:${verificationGapsHash(open)}`;
			const ruling = (s.answered ?? []).findLast((q) => q.source === source);
			if (!ruling) {
				const q = `the assessment is clean but leaves verification open: ${open.join(' · ')} — answer \`accept\` to carry it into T2, or say how to fix it (a broken harness or a stale recipe is fixed first, a test is not weakened)`;
				effects.push({ ask: { to: 'user', text: q, dflt: null, source, verification_gaps: open } });
				return act(`wait user: ${q}`);
			}
			if (!/^\s*accept\b/i.test(ruling.answer ?? '')) {
				effects.push({ step: ['build'] });
				return dispatch('build', `close the verification: ${open.join(' · ')} — the person's ruling: ${ruling.answer ?? ''}`);
			}
		}
		// #138: assessment can add captures after build handoff. Return them to the owner before
		// offering T2 (or accepting --done), not only when step review later refuses to open it.
		if (s.assessmentHandoffGap) {
			effects.push({ step: ['build'] });
			return dispatch('build', s.assessmentHandoffGap);
		}
		if (s.step === 'review' && readVerdict(s.files.review ?? '') === 'dismissed') return act(`wait user: T2 was closed without a verdict — \`${wf} review ${s.branch}\` again when they are ready`);
		if (context.kind === 'unit' && !context.unit.reviewAfter) {
			effects.push({ advance: { unit: context.unit.n, head: s.head } });
			return act(`advance: unit ${context.unit.n} assessed — the next bounded unit gets a fresh builder`);
		}
		// Class A's agreement is TICKET.md, so agreementGap never asked it for a T2 walk. `wf show` needs
		// one to open the round's page, and a round with nothing visible must say so. The build records it
		// (it knows the page it drove); enforced only at final T2, never on a unit checkpoint (#139 JX-1068).
		if (!consequential(s.klass) && context.kind !== 'unit' && !hasT2Walk(s.files.agreement)) {
			effects.push({ step: ['build'] });
			return dispatch('build', 'TICKET.md needs a T2 walk before T2: a `- **T2 walk.**` bullet with the `open:` line `wf show` follows and any `setup:` lines the scenario needs, or `none — <why no walk is needed>`');
		}
		return act(t2);
	}
	return act(`wait user: step "${step}" has no next action`);
}

// ── the shell ────────────────────────────────────────────────────────────────

const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

export function snapshotOf(toplevel: string): Snapshot {
	const state = readState(toplevel) ?? {};
	const dir = join(toplevel, state.folder ?? '');
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();
	const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
	// 2026-10-10: `wf brief` read this snapshot directly and bypassed runNext's base refusal, emitting
	// a build prompt with the committed range unknown. Both callers must refuse at the shared reader.
	const { ref, base } = resolveRoundBase(toplevel, state);
	if (!base) {
		console.error(`wf next: the round's base \`${ref}\` does not resolve — fetch it, or start the round with \`wf new --base <ref>\``);
		process.exit(2);
	}
	const agreementReview = read(join(dir, AGREEMENT_REVIEW_FILE)) ?? '';
	const agreementText = read(join(dir, AGREEMENT_FILE)) ?? read(agreementPath(toplevel, state.class ?? null, state.folder));
	const context = sliceContext(agreementText, state.slices);
	const assessmentFile = context.kind === 'unit' ? context.assessmentFile : ASSESSMENT_FILE;
	const assessment = read(join(dir, assessmentFile));
	const baseline = state.assessment_baseline?.file === assessmentFile ? state.assessment_baseline : null;
	const assessmentBaselineMissing = !baseline && !!state.history?.some((visit) => visit.step === 'assess');
	const assessmentChangedSinceHandoff = baseline ? assessment !== null && assessmentContentSha(assessment) !== baseline.sha : assessmentBaselineMissing ? false : undefined;
	// 2026-10-10: worktree-vs-base missed an index-only contract edit restored in the worktree. Use
	// the check fence's committed + worktree + index + untracked set, so class and scope see the same
	// work (#111.4); only the round's own paperwork is removed for class measurement.
	const folderPrefix = (state.folder ?? '').replace(/\\/g, '/').replace(/\/?$/, '/');
	const filesChanged = changedFiles(toplevel, base)
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
		repairs: state.repairs ?? 0,
		slices: state.slices,
		assessmentChangedSinceHandoff,
		assessmentBaselineMissing,
		assessmentHandoffGap: assessmentHandoffGap(toplevel, state, 'assess'),
		returnedFromAssess: state.history?.at(-2)?.step === 'assess' && state.history?.at(-1)?.step === 'build',
		head: git('rev-parse', 'HEAD'),
		files: {
			// The agreement is AGREEMENT.md when the working session wrote one (it decided the work is
			// consequential), else the class A ticket. Reading it here is what lets `wf next` measure the
			// declared `Class:` and the case files before the stored class catches up (#111.4).
			agreement: agreementText,
			assessment,
			review: read(join(dir, context.kind === 'unit' ? context.reviewFile : REVIEW_FILE)),
			blocked: read(join(dir, 'BLOCKED.md')),
		},
		t1: { sha: agreementSha(toplevel, state.class ?? null, state.folder ?? null), revisionSha: revisionSha(toplevel, state.class ?? null, state.folder ?? null), reviewed: lastField(agreementReview, 'agreement-sha'), verdict: readVerdict(agreementReview) },
		note: state.note ? { file: state.note, text: read(join(toplevel, state.note)) } : null,
		models: seams.models,
		contractPaths: read(join(toplevel, contractPathsFile)),
		folder: state.folder ?? null,
		filesChanged,
		checks: checksEvidence(toplevel, state),
		mergedGap: mergedImplementationGap(toplevel, state),
	};
}

export async function runNext() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state?.folder) {
		console.error('wf next: no round here — run it in the round\'s worktree (wf new <branch> --id <id> makes one)');
		refuseCaller();
	}
	let { say, effects } = nextAction(snapshotOf(toplevel));
	for (const e of effects) {
		if (e.step) await runStep(e.step, { quiet: true });
		if (e.advance) {
			const receipt = e.advance;
			writeState(toplevel, (current) => {
				// A retried or concurrent next that already completed these bytes is a no-op.
				if (current.slices?.completed.some((done) => done.n === receipt.unit && done.head === receipt.head)) return {};
				const now = snapshotOf(toplevel);
				const context = sliceContext(now.files.agreement, current.slices);
				if (context.kind !== 'unit' || !current.slices || context.unit.n !== receipt.unit || now.head !== receipt.head || context.unit.reviewAfter || !nextAction(now).effects.some((effect) => effect.advance)) throw new Error('wf next: unit completion changed before advancement — run wf next again');
				const since = new Date().toISOString();
				return { slices: advanceSlice(context, current.slices, now.head, { reviewed: false }), repairs: 0, step: 'build', since, waiting_on: null, history: stepHistory(current.history, 'build', since) };
			});
		}
		// Repairs are bounded per build scope; completing a unit resets the next unit's budget.
		if (e.repair) writeState(toplevel, (s) => ({ repairs: (s.repairs ?? 0) + 1 }));
		if (e.blockedAnswered !== undefined) writeState(toplevel, () => ({ blocked_answered: e.blockedAnswered }));
		if (e.ask) writeState(toplevel, (state) => addQuestion(state, e.ask!));
	}
	if (effects.some((e) => e.ask || e.advance)) ({ say } = nextAction(snapshotOf(toplevel)));
	console.log(say);
}
