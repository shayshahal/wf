#!/usr/bin/env node
// step.ts — wf step <name> [--waiting-on user|<the project's people>|ci] [--round TJEW-xxx] [--base <ref>] [--class A|B|C]
// The steps of the smaller route (#111): classify → agree → build → assess → review → pr → merged.
// `step classify` runs classify.ts; the measured class can only UPGRADE the stored one (A→B→C). A
// class asserted by --class (wf new --class B) is sticky.
// `step agree` parks the round on the person for T1 (gates/agree.ts writes AGREEMENT-REVIEW.md).
// `step build` on a B/C round requires the agreement's agreed material to be approved by T1: a
// re-agreement is a re-T1.
// `step assess` is how a build worker says implementation is done; `wf next` then dispatches one
// independent assessment.
// Writes <git-toplevel>/.wf/state.json = { round, class, base, step, waiting_on, since }.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { CLASSIFY } from '../paths.ts';
import { agreementGap, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, consequential } from './agreement.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { people, proofNamingGap } from '../project.ts';
import { roundFile, roundOf, readState, writeState, WF_STATE_VERSION } from './state.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { parseChecksLog } from '../gates/checks-log.ts';
import type { CheckLogEntry } from '../gates/checks-log.ts';
import type { RoundClass, State } from './state.ts';
import { stepHistory } from './friction.ts';
import { changedFiles, isRoundPaperwork } from '../gates/check.ts';
import { initializeSlices, parseBuildUnits, sliceContext } from './build-units.ts';
import { verificationCases } from './agreement.ts';
import { assessmentContentSha, verificationFixRulings, verificationProofGap } from './assessment-rulings.ts';
import { deliveredCommandGap } from './delivered-round.ts';

// #138: judge root proof files at both handoffs, while the capture's owner can still repair it.
function proofHandoffGap(toplevel: string, state: State): string | null {
	if (!state.folder) return null;
	const dir = join(toplevel, state.folder, 'proof');
	if (!existsSync(dir)) return null;
	try {
		return proofNamingGap(readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name));
	} catch (error) {
		return `proof handoff: cannot read ${state.folder}/proof: ${error instanceof Error ? error.message : String(error)}`;
	}
}

/** All build handoff gates, shared by direct step and next's recovery before it mutates state. */
export function assessmentHandoffGap(toplevel: string, state: State, phase: 'assess' | 'review'): string | null {
	const agreement = agreementPath(toplevel, state.class ?? null, state.folder);
	const context = sliceContext(existsSync(agreement) ? readFileSync(agreement, 'utf8') : '', state.slices);
	if (context.kind === 'invalid') return context.why;
	if (context.kind === 'pending') return 'start the declared units with wf next before handing off';
	if (context.kind === 'unit' || context.kind === 'integration') {
		const dirty = changedFiles(toplevel).filter((f) => !isRoundPaperwork(f, state.folder ?? null));
		if (dirty.length) return `commit the scoped implementation before handoff: ${dirty.join(', ')}`;
	}
	const evidence = checksEvidence(toplevel, state);
	const gap = checkGap(evidence);
	if (gap) return checkGapLine(gap);
	const proof = proofHandoffGap(toplevel, state);
	if (proof) return proof;
	if (phase !== 'assess' || !state.folder) return null;
	const file = join(toplevel, state.folder, context.kind === 'unit' ? context.assessmentFile : 'ASSESSMENT.md');
	const assessment = existsSync(file) ? readFileSync(file, 'utf8') : null;
	const suite = suitesGap(evidence);
	if (suite && verificationFixRulings(assessment, context, state.answered ?? [], suite).length) return `verification repair: ${suite} — the ruling is to fix it; run wf check --suites or write BLOCKED.md, a selected-case green alone is not the repair`;
	const rulings = verificationFixRulings(assessment, context, state.answered ?? []);
	const head = execFileSync('git', ['-C', toplevel, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	return verificationProofGap(toplevel, { folder: state.folder, rulings, head, content: evidence.content });
}

export const STEPS = ['classify', 'agree', 'build', 'assess', 'review', 'pr', 'merged', 'held'];
const WAITING = ['user', ...people, 'ci'];
const CLASSES = ['A', 'B', 'C'];
// A `step` refused by a gate that reads the state under the write lock (class/agreement). Thrown from
// inside the updater so the gate and the write are one decision (issue #107).
class StepGateError extends Error {}
// null = T1 approved the agreement's agreed material as it now stands; otherwise the one-line reason.
export function t1Gap(toplevel: string, state: State | null): string | null {
	const klass = state?.class ?? 'A';
	if (!consequential(klass)) return null;
	const current = agreementSha(toplevel, klass, state?.folder ?? null);
	if (!current) return `no ${agreementPath(toplevel, klass, state?.folder ?? null)}`;
	let text: string;
	try { text = readFileSync(roundFile(toplevel, AGREEMENT_REVIEW_FILE), 'utf8'); } catch { return `no ${AGREEMENT_REVIEW_FILE}`; }
	const reviewed = lastField(text, 'agreement-sha');
	if (reviewed !== current) return `${AGREEMENT_REVIEW_FILE} is of ${reviewed ?? 'no sha'}, the agreement is now ${current}`;
	const verdict = readVerdict(text);
	if (verdict !== 'approved') return `${AGREEMENT_REVIEW_FILE} verdict is ${verdict ?? 'pending'}`;
	return null;
}
// The wf check evidence a step boundary and wf next read: .wf/checks.log (check.ts) and the row-scope
// identity of the implementation now (content-identity.ts). `content: null` is git unable to compute
// the tree now.
export type ChecksEvidence = { log: string; content: string | null; scope?: string; cases?: { n: number; check: string }[]; requireSuites?: boolean };
// Pure: null when checks.log holds a wf check green of exactly the implementation as it is now — the
// identity check.ts records on every run (row scope: product and tests, not the round folder or .wf,
// so a paperwork-only commit leaves it in force). Else `harness` when the check cannot run at all
// (git cannot compute the tree, or the last run of these bytes was an environment red / an unreadable
// tree): rerunning the build changes nothing, a person or the build's BLOCKED.md must name it. Else
// `check`: no run, other bytes or a code red — the build runs `wf check`. 2026-10-12 JX-1239: a build ran
// `wf step assess` on a round whose tree computation was broken, with no wf-recorded pass, and a clean
// assessment then reached T2.
export function checkGap({ log, content, scope, cases, requireSuites }: ChecksEvidence): { kind: 'harness' | 'check'; say: string } | null {
	if (content === null) return { kind: 'harness', say: "git cannot compute the implementation's tree, so wf check cannot name what it measures" };
	const parsed = parseChecksLog(log);
	const runs = parsed.cases;
	const mine = runs.filter((l) => l.content === content).at(-1);
	const last = runs.at(-1);
	const trouble = (l: CheckLogEntry | undefined) => l !== undefined && (l.result === 'unavailable' || (l.result === 'red' && l.cause === 'environment')) && (l.content === content || l.content === undefined);
	if (trouble(last)) {
		const why = (last!.tasks ?? []).map((t) => t.missing).find(Boolean) ?? (last!.result === 'unavailable' ? 'git could not read the tree before and after the run' : 'a task could not run');
		return { kind: 'harness', say: `the last wf check could not run (${why})` };
	}
	if (cases) {
		for (const c of cases) {
			const run = runs.filter((l) => l.content === content && l.scope === scope && l.row === c.n && l.rowCheck === c.check).at(-1);
			if (run?.result !== 'green') return { kind: 'check', say: `${scope}: verification case ${c.n} has no current green — run wf check for all assigned cases` };
		}
		if (requireSuites) {
			const suite = parsed.suites.filter((l) => l.content === content).at(-1);
			if (suite?.result !== 'green') return { kind: 'check', say: 'integration needs a current green of wf check --suites' };
		}
		return null;
	}
	if (mine?.result === 'green') return null;
	if (!runs.length) return { kind: 'check', say: 'no wf check has run in this round' };
	if (mine) return { kind: 'check', say: `the last wf check of this implementation is ${mine.result ?? 'not green'}` };
	return { kind: 'check', say: 'the implementation changed since the last wf check' };
}

// Pure: the one-line reason a `wf check` green of this implementation is missing, with what to do.
export function checkGapLine(gap: NonNullable<ReturnType<typeof checkGap>>): string {
	return gap.kind === 'harness'
		? `${gap.say} — fix that and run \`wf check\` green, or write BLOCKED.md with a Question: naming it and stop; do not hand off or retry blind`
		: `${gap.say} — run \`wf check\` and fix what it says; \`wf step\` hands off only a green of the implementation as it is`;
}

// Pure: the whole-suites gap of this implementation, or null: the last `wf check --suites` line of
// exactly these bytes is not green. A suites line of other bytes measured something else and is ignored.
export function suitesGap({ log, content }: ChecksEvidence): string | null {
	const last = parseChecksLog(log).suites.filter((l) => l.content !== undefined && l.content === content).at(-1);
	if (!last || last.result === 'green') return null;
	const red = (last.tasks ?? []).filter((t) => t.exit !== 0).map((t) => t.label).filter(Boolean);
	return `suites ${last.result ?? 'not green'} at this implementation${red.length ? `: ${red.join(', ')}` : ''}`;
}

// The shell: the evidence of the round at `toplevel`, as wf check would have recorded it.
export function checksEvidence(toplevel: string, state: State | null): ChecksEvidence {
	let log = '';
	try { log = readFileSync(join(toplevel, '.wf', 'checks.log'), 'utf8'); } catch { /* no wf check has run here: an empty log says so */ }
	let content: string | null = null;
	try { content = worktreeContentSha(toplevel, roundOf(state, toplevel).folder, null, 'row'); } catch { /* git cannot compute the tree: null is the harness gap */ }
	const file = agreementPath(toplevel, state?.class ?? null, state?.folder);
	const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
	const context = sliceContext(text, state?.slices);
	if (context.kind === 'unit' || context.kind === 'integration') {
		const all = verificationCases(text);
		const cases = context.kind === 'unit' ? all.filter((c) => context.cases.includes(c.n)) : all;
		return { log, content, scope: context.kind === 'unit' ? `unit:${context.unit.n}` : 'integration', cases: cases.map(({ n, check }) => ({ n, check })), requireSuites: context.kind === 'integration' };
	}
	return { log, content };
}
export const higherClass = (a: RoundClass | null, b: RoundClass): RoundClass => (CLASSES.indexOf(a ?? 'A') >= CLASSES.indexOf(b ?? 'A') ? a ?? 'A' : b);

const sh = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export const agreementPathOf = (toplevel: string, state: State | null) => agreementPath(toplevel, state?.class ?? null, state?.folder ?? null);

// `wf decide` (ask.ts) writes an answer Shay gave where the implementer will read it: the agreement's
// `## Decisions` section.
export function appendDecision(agreementText: string, text: string, date = new Date().toISOString().slice(0, 10)) {
	const line = `- ${date} ${text.trim()}`;
	const body = agreementText.replace(/\r\n/g, '\n');
	if (!/^## Decisions[ \t]*$/m.test(body)) return `${body.trimEnd()}\n\n## Decisions\n${line}\n`;
	return body.replace(/^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m, (m, section: string) => `## Decisions\n${section.trimEnd() ? `${section.trimEnd()}\n` : ''}${line}\n\n`).trimEnd() + '\n';
}

/** Transition the round under its gates; next may resume a cleared handoff without replacing its baseline. */
export async function runStep(argv: string[], { quiet = false, buildReason, resumeAssessment }: { quiet?: boolean; buildReason?: State['build_reason']; resumeAssessment?: true } = {}) {
	const flag = (name: string) => {
		const i = argv.indexOf(`--${name}`);
		return i >= 0 ? argv[i + 1] : null;
	};
	const positionals: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--waiting-on' || argv[i] === '--round' || argv[i] === '--base' || argv[i] === '--class') i++;
		else if (!argv[i].startsWith('-')) positionals.push(argv[i]);
	}
	const step = positionals[0];
	if (!STEPS.includes(step)) {
		console.error(`invalid step "${step ?? ''}" — one of: ${STEPS.join(' ')}`);
		refuseCaller();
	}
	if (argv.includes('--restart-units') && step !== 'build') {
		console.error('wf step: --restart-units applies only to build');
		refuseCaller();
	}
	const waitingOn = flag('waiting-on') ?? (step === 'agree' ? 'user' : null);
	if (waitingOn && !WAITING.includes(waitingOn)) {
		console.error(`invalid --waiting-on "${waitingOn}" — one of: ${WAITING.join(' ')}`);
		refuseCaller();
	}
	const asserted = flag('class');
	if (asserted && !CLASSES.includes(asserted)) {
		console.error(`invalid --class "${asserted}" — one of: ${CLASSES.join(' ')}`);
		refuseCaller();
	}
	const toplevel = sh(['rev-parse', '--show-toplevel']);
	// agree and build are gated below by the agreement; classify is what measures.
	const round = flag('round') ?? sh(['rev-parse', '--abbrev-ref', 'HEAD']);
	const assertedClass = (asserted ?? null) as RoundClass | null;
	const prev = readState(toplevel) ?? {};
	// --class is an assertion and wins outright; a measurement can only upgrade what is stored.
	let measured: RoundClass | null = null;
	if (step === 'classify') {
		const measureBase = flag('base') ?? prev.base ?? null;
		// A missing contract-path list makes classify exit 2 with one line; report that line, not a stack.
		let out: string;
		try {
			// Capture stderr explicitly: execFileSync otherwise prints it before the catch reports it again.
			out = execFileSync('node', [CLASSIFY, '--json', ...(measureBase ? ['--base', measureBase] : [])], { encoding: 'utf8', stdio: 'pipe' });
		} catch (e) {
			const said = ((e as { stderr?: string }).stderr ?? '').trim();
			console.error(said || `wf step classify: ${(e as Error).message}`);
			process.exit(2);
		}
		measured = JSON.parse(out).class as RoundClass;
		const kept = higherClass(assertedClass ?? prev.class ?? null, measured);
		if ((assertedClass ?? prev.class) && kept !== measured) console.error(`wf step classify: paths measure ${measured}, keeping asserted ${kept} (a class never downgrades)`);
	}
	const since = new Date().toISOString();
	// Direct review/step callers must obey the same assessment rulings as wf next, not bypass it.
	const reviewPolicy = step === 'review' ? await import('./next.ts') : null;
	let state: State;
	try {
		state = writeState(toplevel, (current) => {
			const delivered = deliveredCommandGap(current, ['step', ...argv]);
			if (delivered) throw new StepGateError(delivered);
			const klass: RoundClass | null = step === 'classify'
				? higherClass(assertedClass ?? current.class ?? null, measured as RoundClass)
				: assertedClass ?? current.class ?? null;
			// A consequential round's T1 approval is re-asserted at every step that moves the work forward
			// (build, assess, review): an agent running `wf step assess` directly cannot advance past a
			// changed `## Agreed` on the old approval (#111.4).
			if ((step === 'build' || step === 'assess' || step === 'review') && consequential(klass)) {
				const reason = t1Gap(toplevel, { ...current, class: klass });
				if (reason) throw new StepGateError(`class ${klass} round, ${reason} — T1 (wf agree) must approve the agreement material ${step === 'build' ? 'that is about to be built' : `before \`${step}\``}`);
			}
			const agreement = agreementPath(toplevel, klass, current.folder);
			const context = sliceContext(existsSync(agreement) ? readFileSync(agreement, 'utf8') : '', current.slices);
			const restarting = step === 'build' && argv.includes('--restart-units');
			const plan = restarting ? parseBuildUnits(existsSync(agreement) ? readFileSync(agreement, 'utf8') : '') : null;
			if (restarting && plan?.kind !== 'units') throw new StepGateError('wf step build --restart-units needs a valid ## Units table');
			if (['build', 'assess', 'review', 'pr'].includes(step) && context.kind === 'invalid' && !restarting) throw new StepGateError(context.why);
			if ((step === 'assess' || step === 'review') && context.kind === 'pending') throw new StepGateError('start the declared units with wf next before handing off');
			if (step === 'pr' && context.kind !== 'single' && context.kind !== 'integration') throw new StepGateError('unit approval is not delivery approval — complete the units and integration first');
			// The handoff past the build needs a wf check green of the implementation as it is: a build
			// that skipped `wf check`, or whose check could not run, does not reach the assessment or T2.
			if (step === 'assess' || step === 'review') {
				const gap = assessmentHandoffGap(toplevel, { ...current, class: klass }, step);
				if (gap) throw new StepGateError(gap);
			}
			if (reviewPolicy) {
				const decision = reviewPolicy.nextAction({ ...reviewPolicy.snapshotOf(toplevel), step: 'assess' });
				if (!decision.say.startsWith('review: T2')) throw new StepGateError(`${decision.say} — run wf next to record or resolve it before T2`);
			}
			// A build needs an agreement to build from. Class A's is TICKET.md; B/C's is AGREEMENT.md.
			if (step === 'build') {
				const file = agreementPath(toplevel, klass, current.folder ?? null);
				if (!existsSync(file)) throw new StepGateError(`no ${file} — the agreement is what the build works from`);
				const gap = agreementGap(readFileSync(file, 'utf8'), klass, round);
				if (gap) throw new StepGateError(gap);
			}
			const base = flag('base') ?? current.base ?? null;
			const assessmentFile = context.kind === 'unit' ? context.assessmentFile : 'ASSESSMENT.md';
			const assessmentPath = current.folder ? join(toplevel, current.folder, assessmentFile) : null;
			const baseline = step === 'assess' && !(resumeAssessment && current.build_reason?.kind === 'handoff' && current.assessment_baseline?.file === assessmentFile) && (current.step !== 'assess' || current.assessment_baseline?.file !== assessmentFile)
				? { assessment_baseline: { file: assessmentFile, sha: assessmentContentSha(assessmentPath && existsSync(assessmentPath) ? readFileSync(assessmentPath, 'utf8') : null) } }
				: {};
			return {
				...baseline,
				build_reason: step === 'build' ? buildReason ?? current.build_reason ?? null : null,
				wf_version: WF_STATE_VERSION,
				...(restarting && plan?.kind === 'units' ? { slices: initializeSlices(plan, sh(['rev-parse', 'HEAD'])), repairs: 0 } : step === 'build' && context.kind === 'pending' ? { slices: initializeSlices(context.plan, sh(['rev-parse', 'HEAD'])), repairs: 0 } : {}),
				round, class: klass, base, step, since,
				waiting_on: waitingOn ?? current.questions?.[0]?.to ?? null,
				history: stepHistory(current.history, step, since),
			};
		});
	} catch (e) {
		if (!(e instanceof StepGateError)) throw e;
		console.error(`wf step ${step}: ${e.message}`);
		process.exit(2);
	}
	if (!quiet) console.log(JSON.stringify(state));
}
