#!/usr/bin/env node
// next.ts — wf next: the one thing to do now in this round, from its state and its files. The route
// is the smaller workflow (#110, #111, #112, #113):
//
//   wf new → agree (T1 for B/C) → build ↔ assess → T2 → deliver
//
// The old research/plan/design/replan handoffs, the per-commit dispatch with its row tokens and
// commit-subject matching, the validate/critique/as-built/per-rule standards pipeline, and the
// executable-unit runtime are gone. A large change may take human-agreed checkpoints (`wf review
// --checkpoint`), but wf schedules none of them: the agent owns when one happens. `wf next` prints
// one of:
//   dispatch <phase> (model: <m>): <the line to send a fresh round-worker, on that model>
//   wait <person>: <what they owe>        tell them, verbatim; their answer → wf decide, then wf next
//   review | deliver | check | done        the orchestrator runs it, then wf next
// It does the bookkeeping itself (the step, a question the round now waits on).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { addQuestion, blockedQuestion, openRevisions } from './ask.ts';
import { agreementClass, agreementGap, agreementPath, agreementSha, revisionSha, AGREEMENT_FILE, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, assessmentGap, assessmentHead, assessmentVerdict, caseFiles, consequential, hasT2Walk, notAskedForGap, REVIEW_FILE, verificationCases } from './agreement.ts';
import { contractPaths as contractPathsFile } from '../project.ts';
import { classFromFiles } from '../gates/classify.ts';
import { anticipatedPaths, TICKET_FILE } from './agreement.ts';
import { changedFiles } from '../gates/check.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { seams } from '../seams.ts';
import { modelFor } from '../models.ts';
import type { Models } from '../models.ts';
import { readState, resolveRoundBase, toplevelOf, writeState } from './state.ts';
import type { Question, RoundClass, State } from './state.ts';
import { stepHistory } from './friction.ts';
import { assessmentHandoffGap, higherClass, runStep } from './step.ts';
import { assessmentContentSha, assessmentRulingSource } from './agreement.ts';
import { followupRoundLine, mergedImplementationGap } from './delivered-round.ts';
import { correctionStateSha, outstandingCorrections } from './corrections.ts';
import { shouldStopRoundServers } from './round-servers.ts';
import { stopWorktreeServers } from '../worktrees/serve.ts';
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
	/** Ticket path hints remain available after AGREEMENT.md becomes the working agreement. */
	pathsAnticipated?: string[];
	revisions?: { text: string; at: string; sha?: string | null }[];
	blockedAnswered?: number;
	repairs?: number;
	// Content identity captured at handoff, not mutable filesystem timestamps.
	assessmentChangedSinceHandoff?: boolean;
	assessmentBaselineMissing?: boolean;
	assessmentHandoffGap?: string | null;
	buildReason?: State['build_reason'];
	corrections?: State['corrections'];
	mergeAttempt?: State['merge_attempt'];
	delivery?: State['delivery'];
	id?: string;
	ids?: string[];
	/** A merged round cannot post/reap on the old delivery while carrying new product work. */
	mergedGap?: MergedImplementationGap | null;
};
export type Effect =
	| { step?: string[]; ask?: { to: string; text: string; dflt: string | null; source: string }; repair?: true; blockedAnswered?: number; buildReason?: State['build_reason']; resumeAssessment?: true };

// Pure: the ids of the tracker note's `## <id>` sections not yet marked ` (posted)`.
export function unpostedSections(note: string | null): string[] {
	return [...(note ?? '').matchAll(/^## (\S+)(.*)$/gm)].filter((m) => !/\(posted\)/.test(m[2])).map((m) => m[1]);
}

/** Compute the next action; a brief may read an answered build assignment after dispatch consumed it. */
export function nextAction(s: Snapshot, purpose: 'dispatch' | 'brief' = 'dispatch'): { say: string; effects: Effect[] } {
	const effects: Effect[] = [];
	const act = (say: string) => ({ say, effects });
	const wf = `node ${s.entry}`;
	// The line a fresh round-worker gets: it runs wf brief itself, so its brief is wf's own text.
	const dispatch = (phase: string, again: string | null = null, kind: 'work' | 'handoff' = 'work') => {
		if (phase === 'build') {
			again ??= s.buildReason?.text ?? 'implement and verify the current agreement';
			const transition = effects.find((e) => e.step?.[0] === 'build');
			const buildReason = { kind, text: again };
			if (transition) transition.buildReason = buildReason;
			else effects.push({ step: ['build'], buildReason });
		}
		if (phase === 'assess' && s.step === 'review') effects.push({ step: ['assess'] });
		const model = s.models ? ` (model: ${modelFor(phase, s.models)})` : '';
		return act(`dispatch ${phase}${model}: run \`${wf} brief ${phase}\` in this worktree and do exactly what it prints${again ? ` (again: ${again})` : ''}`);
	};
	const open = s.questions ?? [];

	if (open.length) return act(open.map((q) => `wait ${q.to}: q${q.n} ${q.text}${q.default ? ` (default: ${q.default})` : ''}`).join('\n'));
	if (s.step === 'held') return act('wait user: the round is held (wf step <name> resumes it)');
	// The tracker hears last, one section per item; a session can die between two posts, so the note
	// says which are posted and a resumed round posts the rest, never one twice.
	const corrections = outstandingCorrections({ corrections: s.corrections });
	if (s.mergeAttempt || (s.delivery && s.step !== 'merged')) return act(`deliver: reconcile the recorded merge outcome before repair or follow-up — \`${wf} deliver\`; do not assume the merge was prevented`);
	if (s.step === 'merged') {
		if (corrections.length) return act(`follow-up: instructions arrived after delivery: ${corrections.map((c) => `${c.id}: ${c.text}`).join(' | ')}. ${followupRoundLine({ round: s.branch, id: s.id, ids: s.ids })}. Carry the exact source and instruction to the fresh round before recording its transfer here; never reuse this approval.`);
		if (s.mergedGap?.kind === 'changed') return act(`wait user: ${s.mergedGap.reason}`);
		const left = unpostedSections(s.note?.text ?? null);
		if (left.length) return act(`post: ${left.join(', ')} — each section of ${s.note!.file} on its own item, with the delivered status (ROUND.md); right after each, its heading gets \` (posted)\`. Then \`${wf} next\``);
		if (s.mergedGap) return act(`wait user: ${s.mergedGap.reason}`);
		return act(`done: \`${wf} reap ${s.branch}\``);
	}
	if (s.step === 'pr' && !corrections.length) return act(`deliver: T2 approved — \`${wf} deliver\` (push, PR, merge, the tracker note), then \`${wf} next\``);

	// The class is measured from what the round actually does — a declared `Class:` line, a verification
	// case, or a changed file that reaches a contract path. It runs at every working step, so an A round
	// that edits a contract path without a case (or opens a worktree measured A on an empty diff) cannot
	// keep skipping T1 (#111.4). A class never downgrades; `wf new --class C` stays C. A check round
	// answers a question, not a build, so it is exempt.
	if (!s.check) {
		const cases = verificationCases(s.files.agreement);
		const files = [...cases.flatMap((c) => caseFiles(c)), ...anticipatedPaths(s.files.agreement), ...(s.pathsAnticipated ?? []), ...(s.filesChanged ?? [])];
		const byFiles = s.contractPaths ? classFromFiles(files, s.contractPaths) : 'A';
		const planned = higherClass(higherClass(s.klass, agreementClass(s.files.agreement) ?? 'A'), byFiles);
		if (planned !== (s.klass ?? 'A')) {
			effects.push({ step: ['classify', '--class', planned] });
			return act(`classify: the round measures class ${planned} (a declared Class:, an anticipated path, a case, or a changed file on a contract path) — \`${wf} next\` takes T1 next`);
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

	// T1 binds the agreement's agreed material sha. A progress edit to `## Verification`
	// does not change the sha; a change to `## Observed`/`## Agreed` (or `## Intent`) does.
	const t1Approved = s.t1.sha !== null && s.t1.reviewed === s.t1.sha && s.t1.verdict === 'approved';
	// T1 stays live after the build starts: a build or progress edit that changes the agreed material
	// sends the round back to a fresh T1 rather than riding the old approval (#111.4).
	if (s.step === 'build' || s.step === 'assess' || s.step === 'review' || (s.step === 'pr' && corrections.length)) {
		if (consequential(s.klass) && !t1Approved) {
			const why = s.t1.reviewed === null ? `no ${AGREEMENT_REVIEW_FILE} yet` : s.t1.reviewed !== s.t1.sha ? 'the agreed material changed since T1' : `T1 verdict is ${s.t1.verdict ?? 'pending'}`;
			effects.push({ step: ['agree', '--waiting-on', 'user'] });
			return act(`wait user: T1 on AGREEMENT.md (${why}) — \`${wf} agree ${s.branch}\``);
		}
	}
	const assessmentFile = ASSESSMENT_FILE;
	const t2 = `review: T2 — see the fix first (the diff, the agreement and ${assessmentFile} beside it), then \`${wf} review ${s.branch}\`; once it has a verdict, \`${wf} review ${s.branch} --done\``;
	// JX-275, 2026-10-12 (#127): a rebase at review looped between next's T2 line and step's
	// stale-assessment refusal. Review uses the assess policy too, before dismissal or T2.
	// Direct step review already evaluates this same branch; keep one owner for its gates.
	let step = s.step === 'review' ? 'assess' : s.step;

	// agree → build (T1 for B/C), and the check round's "does it reproduce"
	if (!step || step === 'classify' || step === 'agree') {
		// A check round (wf new --check) answers one question: does the ticket reproduce? The agree
		// worker writes `## Repro` into the agreement and runs the project's own repro directly; wf does
		// not interpret the result. Once `## Repro` is there, the person decides whether to go on.
		if (s.check) {
			if (!/^## Repro[ \t]*$/m.test((s.files.agreement ?? '').replace(/\r\n/g, '\n'))) return dispatch('agree', `no \`## Repro\` in ${consequential(s.klass) ? 'AGREEMENT.md' : 'TICKET.md'} yet — write it and run the project's repro, recording its real output`);
			return act(`wait user: the repro result is in the agreement — the person decides. Go on: \`${wf} step build\` and set the started status; stop: \`WF_FORCE_REAP=1 ${wf} reap ${s.branch}\``);
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
				// Only before T1: an agreement approved before this rule (JX-1367, 2026-10-18) is not reopened.
				const unasked = notAskedForGap(s.files.agreement);
				if (unasked) return dispatch('agree', unasked);
				if (step !== 'agree') effects.push({ step: ['agree', '--waiting-on', 'user'] });
				return act(`wait user: T1 on AGREEMENT.md — \`${wf} agree ${s.branch}\``);
			}
		}
		effects.push({ step: ['build'] });
		step = 'build';
	}

	if (corrections.length) {
		const blocked = corrections.filter((c) => c.outcome.kind === 'blocked');
		if (blocked.length) return act(blocked.map((c) => c.outcome.kind === 'blocked' ? `wait ${c.outcome.owner}: correction ${c.id} — ${c.outcome.note}; instruction: ${c.text}` : '').join('\n'));
		return dispatch('build', `address recorded corrections: ${corrections.map((c) => `${c.id}: ${c.text}`).join(' | ')}; record each disposition with evidence or a concrete blocker, not merely a transport acknowledgement`);
	}

	// build: one phase, resumed in place, ended by the build worker running `wf step assess`.
	if (step === 'build') {
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
		if (s.buildReason?.kind === 'handoff') {
			if (s.assessmentHandoffGap) return dispatch('build', s.assessmentHandoffGap, 'handoff');
			// JX-1392 (#151): re-evaluate the current assessment, not an empty repair or a new baseline.
			effects.push({ step: ['assess'], resumeAssessment: true });
			step = 'assess';
		} else return dispatch('build');
	}

	// The independent reviewer's explicit outcome owns sufficiency, not words in its evidence.
	// Repairs are bounded; blocked outcomes and exhausted repairs need a durable user ruling.
	if (step === 'assess') {
		if (s.assessmentChangedSinceHandoff === false) {
			if (s.assessmentBaselineMissing) {
				if (s.assessmentHandoffGap) {
					effects.push({ step: ['build'] });
					return dispatch('build', s.assessmentHandoffGap, 'handoff');
				}
				// Legacy visits have no durable report identity. Capture it once before dispatch;
				// touching an old report must not make it a new assessment.
				if (s.step !== 'review') effects.push({ step: ['assess'] });
			}
			return dispatch('assess', s.files.assessment ? 'the assessment has not changed since handoff; judge the new evidence even at the same HEAD' : `write ${assessmentFile} for this handoff`);
		}
		const gap = assessmentGap(s.files.assessment);
		if (gap) return dispatch('assess', gap);
		const measured = assessmentHead(s.files.assessment);
		if (measured !== s.head) return dispatch('assess', `ASSESSMENT.md is of ${measured?.slice(0, 10) ?? 'no head'}…, HEAD is ${s.head.slice(0, 10)}…`);
		const assessmentSource = assessmentRulingSource(s.files.assessment);
		const verdict = assessmentVerdict(s.files.assessment);
		if (verdict === 'blocked' || (verdict === 'repair' && (s.repairs ?? 0) >= MAX_REPAIRS)) {
			const source = `${assessmentSource}#report:${assessmentContentSha(s.files.assessment)}`;
			const ruling = s.answered.findLast((q) => q.source === source);
			if (!ruling) {
				const reason = verdict === 'blocked' ? 'the reviewer explicitly blocked the round' : `${MAX_REPAIRS} autonomous repairs did not clear the review`;
				const text = `${reason}. Read ${assessmentFile} and rule: answer \`accept\` to carry this outcome into T2, give repair direction, or use \`${wf} decide --revise <renewed behavior>\` to renew the agreement.

${s.files.assessment}`;
				effects.push({ ask: { to: 'user', text, dflt: null, source } });
				return act(`wait user: ${text}`);
			}
			if (!/^\s*accept\b/i.test(ruling.answer ?? '')) {
				effects.push({ step: ['build'] });
				return dispatch('build', `the person's assessment ruling: ${ruling.answer ?? ''}`);
			}
		} else if (verdict === 'repair') {
			const attempts = s.repairs ?? 0;
			effects.push({ repair: true, step: ['build'] });
			return dispatch('build', `repair ${attempts + 1} of ${MAX_REPAIRS} for ${assessmentFile}'s findings`);
		}
		// #138: assessment can add captures after build handoff. Return them to the owner before
		// offering T2 (or accepting --done), not only when step review later refuses to open it.
		if (s.assessmentHandoffGap) {
			effects.push({ step: ['build'] });
			return dispatch('build', s.assessmentHandoffGap, 'handoff');
		}
		if (s.step === 'review' && readVerdict(s.files.review ?? '') === 'dismissed') return act(`wait user: T2 was closed without a verdict — \`${wf} review ${s.branch}\` again when they are ready`);
		// Class A's agreement is TICKET.md, so agreementGap never asked it for a T2 walk. `wf show` needs
		// one to open the round's page, and a round with nothing visible must say so. The build records it
		// (it knows the page it drove); enforced only at final T2 (#139 JX-1068).
		if (!consequential(s.klass) && !hasT2Walk(s.files.agreement)) {
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
	const assessmentFile = ASSESSMENT_FILE;
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
		buildReason: state.build_reason,
		corrections: state.corrections,
		mergeAttempt: state.merge_attempt,
		delivery: state.delivery,
		id: state.id,
		ids: state.ids,
		repairs: state.repairs ?? 0,
		assessmentChangedSinceHandoff,
		assessmentBaselineMissing,
		assessmentHandoffGap: assessmentHandoffGap(toplevel, state),
		head: git('rev-parse', 'HEAD'),
		files: {
			// The agreement is AGREEMENT.md when the working session wrote one (it decided the work is
			// consequential), else the class A ticket. Reading it here is what lets `wf next` measure the
			// declared `Class:` and the case files before the stored class catches up (#111.4).
			agreement: agreementText,
			assessment,
			review: read(join(dir, REVIEW_FILE)),
			blocked: read(join(dir, 'BLOCKED.md')),
		},
		t1: { sha: agreementSha(toplevel, state.class ?? null, state.folder ?? null), revisionSha: revisionSha(toplevel, state.class ?? null, state.folder ?? null), reviewed: lastField(agreementReview, 'agreement-sha'), verdict: readVerdict(agreementReview) },
		note: state.note ? { file: state.note, text: read(join(toplevel, state.note)) } : null,
		models: seams.models,
		contractPaths: read(join(toplevel, contractPathsFile)),
		folder: state.folder ?? null,
		filesChanged,
		pathsAnticipated: anticipatedPaths(read(join(dir, TICKET_FILE))),
		mergedGap: mergedImplementationGap(toplevel, state),
	};
}

// A private expected abort inside writeState: no stale side-effect reaches persisted authority.
class NextCorrectionRace extends Error {}

export async function runNext() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	if (!state?.folder) {
		console.error('wf next: no round here — run it in the round\'s worktree (wf new <branch> --id <id> makes one)');
		refuseCaller();
	}
	const snapshot = snapshotOf(toplevel);
	const expectedCorrections = correctionStateSha({ corrections: snapshot.corrections });
	let { say, effects } = nextAction(snapshot);
	for (const e of effects) {
		if (e.step) await runStep(e.step, { quiet: true, buildReason: e.buildReason, resumeAssessment: e.resumeAssessment, expectedCorrections });
		// All effects consume the same instruction snapshot, including a question/repair update
		// after an asynchronous step. A stale assessment must not park a newly admitted instruction.
		if (e.repair || e.blockedAnswered !== undefined || e.ask) {
			try {
				writeState(toplevel, (current) => {
					if (correctionStateSha(current) !== expectedCorrections) throw new NextCorrectionRace();
					return {
						...(e.repair ? { repairs: (current.repairs ?? 0) + 1 } : {}),
						...(e.blockedAnswered !== undefined ? { blocked_answered: e.blockedAnswered } : {}),
						...(e.ask ? addQuestion(current, e.ask) : {}),
					};
				});
			} catch (error) {
				if (!(error instanceof NextCorrectionRace)) throw error;
				console.error('wf next: corrections changed during dispatch; run wf next again for the current instruction');
				process.exitCode = 2;
				return;
			}
		}
	}
	if (effects.some((e) => e.ask)) ({ say } = nextAction(snapshotOf(toplevel)));
	const current = readState(toplevel);
	if (shouldStopRoundServers({ step: current?.step, waitingOn: current?.waiting_on, say })) {
		const stopped = await stopWorktreeServers(toplevel);
		// A stale PID is a cleanup warning, not a refusal of the next action already selected.
		if (stopped.kind === 'refused') console.error(stopped.why);
		else if (stopped.kind === 'stopped') console.error(`wf serve: released idle server tree ${stopped.pid}`);
	}
	console.log(say);
}
