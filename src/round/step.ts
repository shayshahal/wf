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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { CLASSIFY } from '../paths.ts';
import { agreementGap, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, consequential } from './agreement.ts';
import { lastField, readVerdict } from '../gates/review-format.ts';
import { people } from '../project.ts';
import { roundFile, roundOf, readState, writeState, WF_STATE_VERSION } from './state.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import type { RoundClass, State } from './state.ts';
import { stepHistory } from './friction.ts';

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
export type ChecksEvidence = { log: string; content: string | null };
type LogLine = { row?: unknown; result?: string; cause?: string; content?: string; tasks?: { label?: string; exit?: number | null; missing?: string }[] };
const logLines = (log: string): LogLine[] => log.split(/\r?\n/).filter((l) => l.trim()).flatMap((l) => {
	try { return [JSON.parse(l) as LogLine]; } catch { /* a line cut off mid-write: skipped, the rest still read */ return []; }
});

// Pure: null when checks.log holds a wf check green of exactly the implementation as it is now — the
// identity check.ts records on every run (row scope: product and tests, not the round folder or .wf,
// so a paperwork-only commit leaves it in force). Else `harness` when the check cannot run at all
// (git cannot compute the tree, or the last run of these bytes was an environment red / an unreadable
// tree): rerunning the build changes nothing, a person or the build's BLOCKED.md must name it. Else
// `check`: no run, other bytes or a code red — the build runs `wf check`. 2026-10-12 JX-1239: a build ran
// `wf step assess` on a round whose tree computation was broken, with no wf-recorded pass, and a clean
// assessment then reached T2.
export function checkGap({ log, content }: ChecksEvidence): { kind: 'harness' | 'check'; say: string } | null {
	if (content === null) return { kind: 'harness', say: "git cannot compute the implementation's tree, so wf check cannot name what it measures" };
	const runs = logLines(log).filter((l) => l.row !== 'repro' && l.row !== 'suites');
	const mine = runs.filter((l) => l.content === content).at(-1);
	const last = runs.at(-1);
	const trouble = (l: LogLine | undefined) => l !== undefined && (l.result === 'unavailable' || (l.result === 'red' && l.cause === 'environment')) && (l.content === content || l.content === undefined);
	if (trouble(last)) {
		const why = (last!.tasks ?? []).map((t) => t.missing).find(Boolean) ?? (last!.result === 'unavailable' ? 'git could not read the tree before and after the run' : 'a task could not run');
		return { kind: 'harness', say: `the last wf check could not run (${why})` };
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
	const last = logLines(log).filter((l) => l.row === 'suites' && l.content !== undefined && l.content === content).at(-1);
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

// `quiet`: wf next steps a round as bookkeeping and prints only its own line.
export async function runStep(argv: string[], { quiet = false } = {}) {
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
			// The handoff past the build needs a wf check green of the implementation as it is: a build
			// that skipped `wf check`, or whose check could not run, does not reach the assessment or T2.
			if (step === 'assess' || step === 'review') {
				const gap = checkGap(checksEvidence(toplevel, current));
				if (gap) throw new StepGateError(checkGapLine(gap));
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
			return {
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
	if (!quiet) console.log(JSON.stringify(state));
}
