#!/usr/bin/env node
// prompt.ts — wf prompt <agree | build | assess>
// Prints the composed prompt for a phase agent to stdout. The three phases of the smaller
// route (#111): agree writes the working agreement (TICKET.md for class A, AGREEMENT.md for B/C),
// build implements within it, assess judges intent/behavior/design/standards once. The old research,
// plan, implement-N, validate, critique, as-built, standards and fix-review phases are gone.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { changedFiles, isRoundPaperwork } from '../gates/check.ts';
import { baseBranch, directUrls, guidance, name as projectName } from '../project.ts';
import { WF_HOME, WF_ROOT, wfCommand } from '../paths.ts';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { seams } from '../seams.ts';
import { readVerdict } from '../gates/review-format.ts';
import { basePortForBranch } from '../worktrees/worktree.ts';
import { agreementFile, agreementPath, revisionSha, ASSESSMENT_FILE, caseFiles, CHECKPOINT_REVIEW_FILE, consequential, REVIEW_FILE, section, TICKET_FILE, verificationCases } from './agreement.ts';
import { openQuestionGate, openRevisions, overruledAsks } from './ask.ts';
import { guidanceSection, notesFor, readNotes } from './guidance.ts';
import { readState, resolveRoundBase, roundOf, toplevelOf } from './state.ts';
import { correctionContext } from './corrections.ts';
import { decisionSheetGuidance } from './presentation.ts';
import { canonicalSkillSource } from '../skill/skill-export.ts';

export function renderPrompt(template: string, vars: Record<string, unknown>) {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

// The latest `changes-requested` section across the final REVIEW.md and any checkpoint review, so a
// build that follows either sees its corrections. `dated` reads the append-only `## <date>` headers.
function latestReviewRepair(folderDir: string): string | null {
	const dated = (text: string) => [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]).at(-1) ?? '';
	let best: { at: string; text: string | null } = { at: '', text: null };
	for (const name of [REVIEW_FILE, CHECKPOINT_REVIEW_FILE]) {
		const file = join(folderDir, name);
		if (!existsSync(file)) continue;
		const text = readFileSync(file, 'utf8');
		const repair = reviewRepairText(text);
		if (repair && dated(text) >= best.at) best = { at: dated(text), text: repair };
	}
	return best.text;
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

// Pure: the brief lines for decisions recorded in state before the agreement existed.
export const preAgreementDecisions = (decisions: { text: string }[] = [], before = '') =>
	decisions.length ? `${before ? '\n\n' : ''}Decided before this agreement existed — write each into ## Decisions:\n${decisions.map((d) => `- ${d.text}`).join('\n')}` : '';

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
type PromptVars = { round: string; folder: string | null; base: string; intent?: string | null; agreement?: string; assessment?: string; revisions?: string; answers: string; [app: string]: unknown };

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
	const skill = canonicalSkillSource(WF_ROOT);
	if (!skill) throw new Error(`${phase}: round skill source is missing; restore this runtime's skill folder`);
	let ticket = '';
	try { ticket = readFileSync(join(toplevel, folder!, TICKET_FILE), 'utf8'); } catch { /* reported below */ }
	const intent = ticketIntent(ticket);
	if (!intent && (phase !== 'agree' || consequential(klass))) throw new Error(`${phase}: ${folder}/TICKET.md has no \`## Intent\` — the requester's words, verbatim and attributed`);
	const agreementText = existsSync(agreementPath(toplevel, klass, folder)) ? readFileSync(agreementPath(toplevel, klass, folder), 'utf8') : '';
	// Owner feedback (`## Decisions`, wf decide) reaches the build and the assessment through
	// `agreedMaterial` in the `{{agreement}}` of both templates — one projection, so the text is not
	// duplicated (#114 closure, F2).
	const vars: PromptVars = { phase, skill: skill.replaceAll('\\', '/'), worktree: toplevel.replaceAll('\\', '/'), presentation: `${decisionSheetGuidance()}\n${seams.presentation?.guidance ?? ''}`, round: id, folder, base: state?.base ?? `origin/${baseBranch}`, intent: intent ?? `No requester intent is recorded yet. Write \`${folder}/TICKET.md\` with \`## Intent\`: the requester's words, verbatim and attributed, from the current task or its linked source. If that source is unavailable, ask the person for the request before proceeding; do not invent it.`, agreement: agreedMaterial(agreementText, klass), file: agreementFile(klass), assessment: '', review: '', answers: '', assessmentFile: ASSESSMENT_FILE, assessmentBase: state?.base ?? `origin/${baseBranch}` };
	const assessmentFile = ASSESSMENT_FILE;
	// The project's direct URLs, {{<app>}}: Node on Windows cannot resolve *.localhost.
	try {
		const base = basePortForBranch(execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
		Object.assign(vars, directUrls(base));
	} catch { /* not in a round worktree */ }
	// The previous updater anchors every *.md, including during the first upgrade to this release.
	// .md.in retains pristine templates for export even through that updater (2026-10-19 review P1).
	const templateName = phase === 'agree' && !consequential(klass) ? 'agree-a' : phase;
	let template = readFileSync(join(templatesDir, `${templateName}.md.in`), 'utf8');
	// Cold reviewers receive no parent skill or chat. The shared context names authoritative inputs
	// and persistent constraints once; each phase template owns only its current assignment.
	vars.context = renderPrompt(readFileSync(join(templatesDir, 'phase-context.md.in'), 'utf8'), vars);
	// agree: the round's name tells the agent which file holds the agreement.
	if (phase === 'agree') {
		const overruled = overruledAsks(state?.answered);
		const revisions = openRevisions(state?.revisions, revisionSha(toplevel, klass, folder));
		vars.revisions = [...overruled.map((q) => `- q${q.n}: ${q.text}${q.default ? ` (default: ${q.default})` : ''} → ${q.answer}`), ...revisions.map((r) => `- ${r.text}`)].join('\n');
		// Decided before any agreement existed (wf decide at classify): agree writes them into ## Decisions.
		if (!agreementText) vars.revisions += preAgreementDecisions(state?.decisions, vars.revisions);
	}
	// build: the verification cases and, after a `repair` assessment, its findings.
	let files: string[] = [];
	if (phase === 'build' || phase === 'assess') {
		const cases = verificationCases(agreementText);
		// 2026-10-10: case-only matching left ordinary rounds and newly discovered helpers without
		// guidance. Share the check gate's full diff (including committed and index-only work).
		const { ref, base } = resolveRoundBase(toplevel, state);
		if (!base) throw new Error(`${phase}: the round's base \`${ref}\` does not resolve — fetch it, or start the round with \`wf new --base <ref>\``);
		files = [...new Set([...cases.flatMap((c) => caseFiles(c)), ...changedFiles(toplevel, base).filter((f) => !isRoundPaperwork(f, folder))])];
	}
	if ((phase === 'build' || phase === 'assess') && folder && existsSync(join(toplevel, folder, assessmentFile))) {
		const a = readFileSync(join(toplevel, folder, assessmentFile), 'utf8');
		vars.assessment = `## Prior assessment

${a.trim()}`;
	}
	if (phase === 'build' || phase === 'assess') {
		vars.answers = (state?.answered ?? []).map((q) => `### q${q.n}

${q.text}

The person's answer, verbatim:
${q.answer ?? '(no answer recorded)'}`).join('\n\n');
		if (vars.answers) vars.answers = `## Recorded question answers

${vars.answers}`;
	}
	if (phase === 'build' && folder) {
		const repair = latestReviewRepair(join(toplevel, folder));
		if (repair) vars.review = `## Corrections from the latest T2 review\n\n${repair}`;
	}
	// The project's notes for this phase: what its repo, apps and tests look like.
	const notes = join(WF_ROOT, 'projects', projectName, 'prompts', `${phase}.md`);
	if (existsSync(notes)) template += `\n${readFileSync(notes, 'utf8')}`;
	const wf = wfCommand(seams.entry);
	// #126/#130: anchor template instructions before inserting people's verbatim rulings.
	// Recorded answers are inserted after anchoring for the same reason.
	// Source words are inserted after anchoring: a quoted wf command is the author's text,
	// not a template to rewrite. Both phases consume the same durable instruction projection.
	const corrections = phase === 'build' || phase === 'assess' ? correctionContext(state) : '';
	const text = template.split(/(\{\{answers\}\}|\{\{corrections\}\})/)
		.map((part) => part === '{{answers}}' ? vars.answers : part === '{{corrections}}' ? corrections : anchorToolPaths(renderPrompt(part, vars).replace(/`wf /g, `\`${wf} `), WF_HOME, projectName))
		.join('') + guidanceSection(notesFor(readNotes(toplevel, guidance), files));
	return { text, toplevel, state, folder, phase, assessmentFile, n: null, key: phase };
}

// wf prompt: the prompt as it is, for reading. A work packet runs `wf brief`, which adds the handoff note.
export function runPrompt(argv: string[]) {
	try {
		process.stdout.write(composePrompt(argv).text);
	} catch (e) {
		console.error(`wf prompt ${(e as Error).message}`);
		refuseCaller();
	}
}

if (process.argv[1]?.endsWith('prompt.ts')) runPrompt(process.argv.slice(2));
