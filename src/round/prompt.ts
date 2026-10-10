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
import { baseBranch, directUrls, guidance, name as projectName } from '../project.ts';
import { WF_HOME, WF_ROOT } from '../paths.ts';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { seams } from '../seams.ts';
import { basePortForBranch } from '../worktrees/worktree.ts';
import { agreementFile, agreementPath, ASSESSMENT_FILE, caseFiles, consequential, section, TICKET_FILE, verificationCases } from './agreement.ts';
import { openQuestionGate, overruledAsks, pendingRevisions } from './ask.ts';
import { guidanceSection, notesFor, readNotes } from './guidance.ts';
import { readState, roundOf, toplevelOf } from './state.ts';

export function renderPrompt(template: string, vars: Record<string, unknown>) {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

const templatesDir = join(WF_ROOT, 'prompts');

// Pure: the body of TICKET.md's `## Intent` — the requester's words, verbatim — or null.
export function ticketIntent(text: string) {
	const body = text.replace(/\r\n/g, '\n').match(/^## Intent[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1].trim();
	return body || null;
}

export const PHASES = ['agree', 'build', 'assess'];
export const USAGE = 'agree | build | assess';

// Pure: the agreed material a build works from, as the prompt shows it — the `## Observed`/`## Agreed`
// of a consequential round, the `## Intent` of an ordinary ticket.
export function agreedMaterial(text: string, klass: string | null): string {
	if (consequential(klass as 'A' | 'B' | 'C' | null)) {
		return [section(text, 'Observed'), section(text, 'Agreed')].filter(Boolean).join('\n\n').trim();
	}
	return (ticketIntent(text) ?? '').trim();
}

// The `{{…}}` a prompt template substitutes; the project's direct URLs add one per app.
type PromptVars = { round: string; folder: string | null; base: string; intent?: string | null; agreement?: string; cases?: string; assessment?: string; revisions?: string; [app: string]: unknown };

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
	const vars: PromptVars = { round: id, folder, base: state?.base ?? `origin/${baseBranch}`, intent, agreement: agreedMaterial(agreementText, klass), file: agreementFile(klass) };
	// The project's direct URLs, {{<app>}}: Node on Windows cannot resolve *.localhost.
	try {
		const base = basePortForBranch(execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
		Object.assign(vars, directUrls(base));
	} catch { /* not in a round worktree */ }
	let template = readFileSync(join(templatesDir, `${phase}.md`), 'utf8');
	// agree: the round's name tells the agent which file holds the agreement.
	if (phase === 'agree') {
		const overruled = overruledAsks(state?.answered, undefined);
		const revisions = pendingRevisions(state?.revisions, undefined);
		vars.revisions = [...overruled.map((q) => `- q${q.n}: ${q.text}${q.default ? ` (default: ${q.default})` : ''} → ${q.answer}`), ...revisions.map((r) => `- ${r.text}`)].join('\n');
	}
	// build: the verification cases and, after a `repair` assessment, its findings.
	let files: string[] = [];
	if (phase === 'build' || phase === 'assess') {
		const cases = verificationCases(agreementText);
		vars.cases = cases.length ? cases.map((c) => c.line).join('\n') : '(none: class A — name the case with `wf check --case "<path>::<test id>@<line>"`)';
		files = cases.flatMap((c) => caseFiles(c));
	}
	if (phase === 'build' && existsSync(join(toplevel, folder ?? '', ASSESSMENT_FILE))) {
		const a = readFileSync(join(toplevel, folder!, ASSESSMENT_FILE), 'utf8');
		if (/^Verdict:[ \t]*(repair|blocked)\b/m.test(a)) vars.assessment = `## Findings from the last assessment\n\n${a.trim()}`;
	}
	// The project's notes for this phase: what its repo, apps and tests look like.
	const notes = join(WF_ROOT, 'projects', projectName, 'prompts', `${phase}.md`);
	if (existsSync(notes)) template += `\n${readFileSync(notes, 'utf8')}`;
	if (phase === 'assess') vars.agreementFile = vars.file;
	const wf = `node ${seams.entry.replace(/\\/g, '/')}`;
	const text = anchorToolPaths(renderPrompt(template, vars).replace(/`wf /g, `\`${wf} `), WF_HOME, projectName)
		+ guidanceSection(notesFor(readNotes(toplevel, guidance), files));
	return { text, toplevel, state, folder, phase, n: null, key: phase };
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
