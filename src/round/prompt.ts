#!/usr/bin/env node
// prompt.ts — wf prompt <agree | build | assess>
// Prints the composed prompt for a fresh round agent to stdout. The three phases of the smaller
// route (#111): agree writes the working agreement (TICKET.md for class A, AGREEMENT.md for B/C),
// build implements within it, assess judges intent/behavior/design/standards once. The old research,
// plan, implement-N, validate, critique, as-built, standards and fix-review phases are gone.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { changedFiles, isRoundPaperwork } from '../gates/check.ts';
import { baseBranch, directUrls, guidance, name as projectName } from '../project.ts';
import { WF_HOME, WF_ROOT } from '../paths.ts';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { seams } from '../seams.ts';
import { readVerdict } from '../gates/review-format.ts';
import { basePortForBranch } from '../worktrees/worktree.ts';
import { agreementFile, agreementPath, revisionSha, assessmentOpenGaps, assessmentSurviving, ASSESSMENT_FILE, caseFiles, consequential, section, TICKET_FILE, verificationCases } from './agreement.ts';
import { openQuestionGate, openRevisions, overruledAsks } from './ask.ts';
import { guidanceSection, notesFor, readNotes } from './guidance.ts';
import { readState, resolveRoundBase, roundOf, toplevelOf } from './state.ts';
import { sliceContext } from './build-units.ts';
import { assessmentRulingSource, verificationFixRulings, verificationGapsHash, verificationProofFile } from './assessment-rulings.ts';
import { checksEvidence, suitesGap } from './step.ts';

export function renderPrompt(template: string, vars: Record<string, unknown>) {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

const templatesDir = join(WF_ROOT, 'prompts');

// Pure: the body of TICKET.md's `## Intent` — the requester's words, verbatim — or null.
export function ticketIntent(text: string) {
	const body = text.replace(/\r\n/g, '\n').match(/^## Intent[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1].trim();
	return body || null;
}

/** Carry the newest rejected T2 review, including evidence references, into the repair build. */
export function reviewRepairText(text: string): string | null {
	if (readVerdict(text) !== 'changes-requested') return null;
	// Review files append dated sections; older comments must not be treated as new scope.
	return text.replace(/\r\n/g, '\n').split(/^## \d{4}-\d{2}-\d{2}[ \t]*$/m).at(-1)?.trim() || null;
}

export const PHASES = ['agree', 'build', 'assess'];
export const USAGE = 'agree | build | assess';

// Pure: the agreed material a build works from, as the prompt shows it — the `## Observed`/`## Agreed`
// of a consequential round, the `## Intent` of an ordinary ticket, plus the `## Decisions` a person
// recorded (wf decide), which bind the build as much as the agreement itself.
export function agreedMaterial(text: string, klass: string | null): string {
	const decisions = section(text, 'Decisions');
	const body = consequential(klass as 'A' | 'B' | 'C' | null)
		? [section(text, 'Observed'), section(text, 'Agreed')].filter(Boolean).join('\n\n').trim()
		: (ticketIntent(text) ?? '').trim();
	return [body, decisions ? `## Decisions\n${decisions.trimEnd()}` : ''].filter(Boolean).join('\n\n');
}

// The `{{…}}` a prompt template substitutes; the project's direct URLs add one per app.
type PromptVars = { round: string; folder: string | null; base: string; intent?: string | null; agreement?: string; cases?: string; assessment?: string; revisions?: string; verificationRepairs: string; [app: string]: unknown };

export function composePrompt(argv: string[]) {
	const phase = argv[0];
	if (!PHASES.includes(phase)) throw new Error(`usage: <${USAGE}>`);
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { id, folder } = roundOf(state, toplevel);
	if (!id) throw new Error('no round in .wf/state.json — `wf new <branch> --id <id>` first');
	const gate = openQuestionGate(state);
	if (gate) throw new Error(`${phase}: ${gate}`);
	const klass = state?.class ?? 'A';
	let ticket = '';
	try { ticket = readFileSync(join(toplevel, folder!, TICKET_FILE), 'utf8'); } catch { /* reported below */ }
	const intent = ticketIntent(ticket);
	if (!intent) throw new Error(`${phase}: ${folder}/TICKET.md has no \`## Intent\` — the requester's words, verbatim and attributed`);
	const agreementText = existsSync(agreementPath(toplevel, klass, folder)) ? readFileSync(agreementPath(toplevel, klass, folder), 'utf8') : '';
	// Owner feedback (`## Decisions`, wf decide) reaches the build and the assessment through
	// `agreedMaterial` in the `{{agreement}}` of both templates — one projection, so the text is not
	// duplicated (#114 closure, F2).
	const vars: PromptVars = { round: id, folder, base: state?.base ?? `origin/${baseBranch}`, intent, agreement: agreedMaterial(agreementText, klass), file: agreementFile(klass), assessment: '', review: '', verificationRepairs: '', scope: 'Whole agreement (single-task route).', assessmentFile: ASSESSMENT_FILE, assessmentBase: state?.base ?? `origin/${baseBranch}` };
	const context = sliceContext(agreementText, state?.slices);
	if (phase !== 'agree' && (context.kind === 'invalid' || context.kind === 'pending')) throw new Error(`${phase}: ${context.kind === 'invalid' ? context.why : 'start the declared units with wf next first'}`);
	const assessmentFile = context.kind === 'unit' ? context.assessmentFile : ASSESSMENT_FILE;
	const reviewFile = context.kind === 'unit' ? context.reviewFile : 'REVIEW.md';
	vars.assessmentFile = assessmentFile;
	if (context.kind === 'unit') {
		vars.assessmentBase = context.base;
		vars.scope = `## Current build unit\n\nscope: unit:${context.unit.n}\nbase: ${context.base}\n\n${context.reviewRepair ? `Repair the reviewed chunk (units ${context.reviewUnits.map((u) => u.n).join(', ')}); own verification cases ${context.cases.join(', ')} until this checkpoint is reapproved.` : `${context.unit.title}. Own only verification cases ${context.cases.join(', ')}.`} Read the whole agreement for context; later units remain future work, not unmet intent. Implement and assess this scoped work and its affected integration, then hand off and end. Write scope: unit:${context.unit.n} and base: ${context.base} into ${assessmentFile}.\n\n## Whole execution plan\n\n${section(agreementText, 'Units')?.trim() ?? ''}`;
	} else if (context.kind === 'integration') {
		vars.scope = '## Final integration\n\nscope: integration\n\nThe build units and their checkpoint reviews are complete. Rerun every verification case and wf check --suites on the current implementation. Assess the whole agreement and cross-unit behavior, using the unit assessments and review records as history, not as proof of unchanged integration. Write scope: integration into ASSESSMENT.md. Any repair stays within the whole agreement; final T2 is the only approval that permits delivery.';
	}
	if (context.kind === 'unit' || context.kind === 'integration') {
		const receipts = (state?.slices?.completed ?? []).map((done) => `- unit ${done.n} at ${done.head}: ${folder}/ASSESSMENT-unit-${done.n}.md${done.reviewed ? `; ${folder}/REVIEW-unit-${done.n}.md (chunk approved, not merge)` : ''}`);
		if (receipts.length) vars.scope += `\n\n## Earlier unit evidence and feedback\n\n${receipts.join('\n')}\n\nRead these where the current change touches earlier behavior. Preserve the agreed corrections; a recorded approval is history, not proof of unchanged behavior.`;
	}
	// The project's direct URLs, {{<app>}}: Node on Windows cannot resolve *.localhost.
	try {
		const base = basePortForBranch(execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
		Object.assign(vars, directUrls(base));
	} catch { /* not in a round worktree */ }
	let template = readFileSync(join(templatesDir, `${phase}.md`), 'utf8');
	// agree: the round's name tells the agent which file holds the agreement.
	if (phase === 'agree') {
		const overruled = overruledAsks(state?.answered);
		const revisions = openRevisions(state?.revisions, revisionSha(toplevel, klass, folder));
		vars.revisions = [...overruled.map((q) => `- q${q.n}: ${q.text}${q.default ? ` (default: ${q.default})` : ''} → ${q.answer}`), ...revisions.map((r) => `- ${r.text}`)].join('\n');
	}
	// build: the verification cases and, after a `repair` assessment, its findings.
	let agreementRulings = '';
	let files: string[] = [];
	if (phase === 'build' || phase === 'assess') {
		const allCases = verificationCases(agreementText);
		const cases = context.kind === 'unit' ? allCases.filter((c) => context.cases.includes(c.n)) : allCases;
		vars.cases = cases.length ? cases.map((c) => c.line).join('\n') : '(none: class A — name the case with `wf check --case "<path>::<test id>@<line>"`)';
		// 2026-10-10: case-only matching left ordinary rounds and newly discovered helpers without
		// guidance. Share the check gate's full diff (including committed and index-only work).
		const { ref, base } = resolveRoundBase(toplevel, state);
		if (!base) throw new Error(`${phase}: the round's base \`${ref}\` does not resolve — fetch it, or start the round with \`wf new --base <ref>\``);
		files = [...new Set([...cases.flatMap((c) => caseFiles(c)), ...changedFiles(toplevel, base).filter((f) => !isRoundPaperwork(f, folder))])];
	}
	if ((phase === 'build' || phase === 'assess') && folder && existsSync(join(toplevel, folder, assessmentFile))) {
		const a = readFileSync(join(toplevel, folder, assessmentFile), 'utf8');
		const surviving = assessmentSurviving(a);
		if (phase === 'build' && surviving.length) {
			const source = `${assessmentRulingSource(a, context)}#surviving:${verificationGapsHash(surviving)}`;
			const rulings = (state?.answered ?? []).filter((q) => q.source === source || q.source === `${source}#material`);
			if (rulings.length) agreementRulings = `\n\n## Agreement mismatch rulings\n\n${rulings.map((q) => `q${q.n}: ${q.text}\nThe person's ruling, verbatim:\n${q.answer ?? '(no answer recorded)'}`).join('\n\n')}`;
		}
		const liveGaps = assessmentOpenGaps(a);
		const suiteGap = suitesGap(checksEvidence(toplevel, state));
		const open = [...liveGaps, ...(suiteGap ? [suiteGap] : [])];
		const rulings = verificationFixRulings(a, context, state?.answered ?? [], suiteGap);
		if (phase === 'build' && (context.kind !== 'single' || /^Verdict:[ \t]*(repair|blocked)\b/m.test(a) || rulings.length)) vars.assessment = `## Findings from the last assessment\n\n${a.trim()}`;
		if (rulings.length) {
			const repairs = rulings.map((q) => {
				const proof = liveGaps.length ? [
					`Proof record: \`${verificationProofFile(folder, q)}\``,
					`Before handoff, the builder writes this record with \`source: ${q.source}\`, \`head: <git rev-parse HEAD>\`, \`content-sha: <latest wf check content>\`, and \`## Measurement\` naming the check actually driven, its observed result and evidence references (including the proof the ruling requests).`,
					'Commit the implementation first; the receipt keeps the head measured as provenance. Committing its paperwork afterwards does not invalidate it: source and implementation content bind the proof. Product/test changes require fresh measurement. Do not edit the assessment to claim closure. If it cannot be measured, write BLOCKED.md instead.',
					'The independent assessor reads this record and its referenced proof, judges whether it answers the ruling, and keeps any unresolved check visibly open.',
				].join('\n\n') : 'Rerun the affected suites and record their current green in .wf/checks.log, or write BLOCKED.md if they cannot run. The independent assessor judges that evidence against this ruling; a case green is not a whole-suite green.';
				return [`### q${q.n}`, `Open verification:\n${open.map((gap) => `- ${gap}`).join('\n')}`, `Question: ${q.text}`, `The person's ruling, verbatim:\n${q.answer ?? '(no answer recorded)'}`, proof].join('\n\n');
			});
			vars.verificationRepairs = `## Verification repair rulings\n\nThese fix rulings bind this repair even if the agreement says no live check is needed. A green wf check alone does not close them.\n\n${repairs.join('\n\n')}`;
		}
	}
	if (phase === 'build' && existsSync(join(toplevel, folder!, reviewFile))) {
		const repair = reviewRepairText(readFileSync(join(toplevel, folder!, reviewFile), 'utf8'));
		if (repair) vars.review = `## Corrections from the latest T2 review\n\n${repair}`;
	}
	// The project's notes for this phase: what its repo, apps and tests look like.
	const notes = join(WF_ROOT, 'projects', projectName, 'prompts', `${phase}.md`);
	if (existsSync(notes)) template += `\n${readFileSync(notes, 'utf8')}`;
	if (phase === 'assess') vars.agreementFile = vars.file;
	const wf = `node ${seams.entry.replace(/\\/g, '/')}`;
	// #126/#130: anchor template instructions before inserting people's verbatim rulings.
	// The agreement mismatch block is appended after anchoring for the same reason.
	const text = template.split('{{verificationRepairs}}')
		.map((part) => anchorToolPaths(renderPrompt(part, vars).replace(/`wf /g, `\`${wf} `), WF_HOME, projectName))
		.join(vars.verificationRepairs) + guidanceSection(notesFor(readNotes(toplevel, guidance), files)) + agreementRulings;
	return { text, toplevel, state, folder, phase, assessmentFile, n: null, key: phase };
}

// wf prompt: the prompt as it is, for reading. A dispatch runs `wf brief`, which adds the handoff note.
export function runPrompt(argv: string[]) {
	try {
		process.stdout.write(composePrompt(argv).text);
	} catch (e) {
		console.error(`wf prompt ${(e as Error).message}`);
		refuseCaller();
	}
}

if (process.argv[1]?.endsWith('prompt.ts')) runPrompt(process.argv.slice(2));
