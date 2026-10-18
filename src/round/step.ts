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
import { agreementGap, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, ASSESSMENT_FILE, consequential } from './agreement.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { people, proofNamingGap } from '../project.ts';
import { roundFile, readState, writeState, WF_STATE_VERSION } from './state.ts';
import type { RoundClass, State } from './state.ts';
import { stepHistory } from './friction.ts';
import { changedFiles, isRoundPaperwork } from '../gates/check.ts';
import { assessmentContentSha } from './agreement.ts';
import { deliveredCommandGap } from './delivered-round.ts';
import { shouldStopRoundServers } from './round-servers.ts';
import { stopWorktreeServers } from '../worktrees/serve.ts';

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
export function assessmentHandoffGap(toplevel: string, state: State): string | null {
	const dirty = changedFiles(toplevel).filter((f) => !isRoundPaperwork(f, state.folder ?? null));
	if (dirty.length) return `commit the implementation before handoff: ${dirty.join(', ')}`;
	// The handoff itself is mechanical: a committed tree and named proof. The project's protected-oracle
	// rule is enforced at delivery (deliver.ts), where it reads the base the shipping branch carries.
	const proof = proofHandoffGap(toplevel, state);
	if (proof) return proof;
	return null;
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
			// The handoff past the build: a committed, un-fenced tree with named proof. `wf check` is the
			// build's own tool, not a gate here; a person or the independent reviewer owns whether it ran.
			if (step === 'assess' || step === 'review') {
				const gap = assessmentHandoffGap(toplevel, { ...current, class: klass });
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
			const assessmentFile = ASSESSMENT_FILE;
			const assessmentPath = current.folder ? join(toplevel, current.folder, assessmentFile) : null;
			const baseline = step === 'assess' && !(resumeAssessment && current.build_reason?.kind === 'handoff' && current.assessment_baseline?.file === assessmentFile) && (current.step !== 'assess' || current.assessment_baseline?.file !== assessmentFile)
				? { assessment_baseline: { file: assessmentFile, sha: assessmentContentSha(assessmentPath && existsSync(assessmentPath) ? readFileSync(assessmentPath, 'utf8') : null) } }
				: {};
			return {
				...baseline,
				build_reason: step === 'build' ? buildReason ?? current.build_reason ?? null : null,
				wf_version: WF_STATE_VERSION,
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
	if (shouldStopRoundServers({ step: state.step, waitingOn: state.waiting_on })) {
		const stopped = await stopWorktreeServers(toplevel);
		// Cleanup cannot invalidate a phase already committed; explicit serve --stop still refuses.
		if (stopped.kind === 'refused') console.error(stopped.why);
		else if (stopped.kind === 'stopped') console.error(`wf serve: released idle server tree ${stopped.pid}`);
	}
	if (!quiet) console.log(JSON.stringify(state));
}
