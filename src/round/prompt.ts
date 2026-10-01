#!/usr/bin/env node
// prompt.ts — wf prompt <research | plan [--revise] | implement N | fix-review>
// Prints the composed prompt for a fresh round agent to stdout (skills/round/SKILL.md).
// Substitutes {{round}} {{folder}} from .wf/state.json, and for `implement N` the row
// N of PLAN.md `## Commits` verbatim ({{row}}), {{n}} and {{total}}.
// `implement N` also records `commit: N` in state — that is what `wf check` fences on.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { baseBranch, directUrls, name as projectName } from '../project.ts';
import { WF_HOME, WF_ROOT } from '../paths.ts';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { seams } from '../seams.ts';
import { basePortForBranch } from '../worktrees/worktree.ts';
import { openQuestionGate, overruledAsks } from './ask.ts';
import { readState, roundOf, toplevelOf, writeState } from './state.ts';

const REVISE = '\nRead `{{folder}}/SPEC-REVIEW.md` (wf design writes it there); revise `{{folder}}/SPEC.md` and `{{folder}}/PLAN.md` to answer every annotation; change nothing it does not mention. `## For T1` is what binds (DESIGN-SESSION.md § 5): an answer that changes the design changes it there, and the Build in PLAN.md agrees with its Build.\n';
// `plan --revise` after an Ask was answered against its default (ask.ts overruledAsks).
const REVISE_ASKS = '\n## This is a revision\n\n`{{folder}}/PLAN.md` exists, and the person answered some of its Asks against the default it was written for. Their answers:\n\n{{overruled}}\n\nRevise `{{folder}}/PLAN.md` to build each answer: its Approach, Commits, *Not doing* and *T2 walk*. Delete the answered Asks, keep `## Decisions` as it is, and change nothing an answer does not touch.\n';

// A `## Commits` row is a table line whose first cell is the commit number; header and
// `|---|` separator rows are not. `line` is verbatim (that is what the prompt shows).
export type PlanRow = { n: number; line: string; message: string; files: string; check: string };
export function planCommitRows(text: string): PlanRow[] {
	const body = text.replace(/\r\n/g, '\n');
	const section = /^## Commits[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
	if (!section) return [];
	const rows: PlanRow[] = [];
	for (const line of section[1].split('\n')) {
		if (!line.trim().startsWith('|')) continue;
		const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
		if (!/^\d+$/.test(cells[0])) continue;
		rows.push({ n: Number(cells[0]), line: line.trimEnd(), message: cells[1] ?? '', files: cells[2] ?? '', check: cells[3] ?? '' });
	}
	return rows;
}

// Whitespace- or comma-separated paths in a row's `files` cell, backticks stripped.
export function rowFiles(row: Pick<PlanRow, 'files'> | null) {
	return (row?.files ?? '').split(/[\s,]+/).map((f) => f.replace(/`/g, '').trim()).filter(Boolean);
}

export function renderPrompt(template: string, vars: Record<string, unknown>) {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

const templatesDir = join(WF_ROOT, 'prompts');

// Pure: the body of TICKET.md's `## Intent` — the requester's words, verbatim — or null. Research and
// plan start from it, and validate judges the diff against it, not only against the plan the round
// wrote for itself (firstmate's "Captain's intent": the reviewer's acceptance criteria).
export function ticketIntent(text: string) {
	const body = text.replace(/\r\n/g, '\n').match(/^## Intent[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1].trim();
	return body || null;
}

const INTENT_PHASES = ['research', 'plan', 'validate'];

// The {{…}} a prompt template substitutes; the project's direct URLs add one per app.
type PromptVars = { round: string; folder: string | null; base: string; review: string; intent?: string | null; overruled?: string; n?: number; total?: number; row?: string; [app: string]: unknown };

export const PHASES = ['research', 'plan', 'implement', 'as-built', 'validate', 'fix-review'];
export const USAGE = 'research | plan [--revise] | implement N | as-built | validate | fix-review';

// The composed prompt for `argv` (`<phase> [N] [--revise]`), with `{ toplevel, state, folder, phase, n }`.
// Throws with the reason it cannot be composed; `wf prompt` and `wf brief` (brief.ts) print it.
// `implement N` records `commit: N` in state, which `wf check` fences on.
export function composePrompt(argv: string[]) {
	const phase = argv[0];
	if (!PHASES.includes(phase)) throw new Error(`usage: <${USAGE}>`);
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { id, folder } = roundOf(state, toplevel);
	if (!id) throw new Error('no round in .wf/state.json — `wf new <branch> --id <id>` first');
	const gate = openQuestionGate(state);
	if (gate) throw new Error(`${phase}: ${gate}`);
	// fix-review works from REVIEW.md (T2), or --from VALIDATION.md when a validation was ruled `fix`.
	const from = argv.indexOf('--from');
	// {{base}}: what the round branched from (wf new --base, kept in state), which validate and
	// as-built diff against. origin/<base branch> for a round cut from another ref put the commits
	// between the two into the diff (the TJEW-682 replay's second validate, 2026-09-27: three
	// "Unplanned" lines, all from the reverts its base was built with).
	const vars: PromptVars = { round: id, folder, base: state?.base ?? `origin/${baseBranch}`, review: from === -1 ? 'REVIEW.md' : argv[from + 1] };
	if (INTENT_PHASES.includes(phase)) {
		let ticket = '';
		try { ticket = readFileSync(join(toplevel, folder!, 'TICKET.md'), 'utf8'); } catch { /* reported below */ }
		vars.intent = ticketIntent(ticket);
		if (!vars.intent) throw new Error(`${phase}: ${folder}/TICKET.md has no \`## Intent\` — the requester's words, verbatim and attributed (round skill, Start 1)`);
	}
	// The project's direct URLs, {{<app>}}: Node on Windows cannot resolve *.localhost, so a spec's API calls need these
	// (TJEW-663 verify, 2026-09-23: ENOTFOUND in auth.setup).
	try {
		const base = basePortForBranch(execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
		Object.assign(vars, directUrls(base));
	} catch { /* not in a round worktree */ }
	let template = readFileSync(join(templatesDir, `${phase}.md`), 'utf8');
	if (phase === 'plan' && argv.includes('--revise')) {
		const overruled = overruledAsks(state?.answered, state?.briefs?.plan?.token);
		vars.overruled = overruled.map((q) => `- q${q.n}: ${q.text} (default: ${q.default ?? 'none'}) \u2192 ${q.answer}`).join('\n');
		template += overruled.length ? REVISE_ASKS : REVISE;
	}
	// The project's notes for this phase: what its repo, apps and tests look like (projects/<name>/prompts/).
	const notes = join(WF_ROOT, 'projects', projectName, 'prompts', `${phase}.md`);
	if (existsSync(notes)) template += `\n${readFileSync(notes, 'utf8')}`;
	if (phase === 'implement') {
		const n = Number(argv[1]);
		const plan = join(toplevel, folder!, 'PLAN.md');
		let rows;
		try {
			rows = planCommitRows(readFileSync(plan, 'utf8'));
		} catch {
			throw new Error(`implement: no ${folder}/PLAN.md`);
		}
		const row = rows.find((r) => r.n === n);
		if (!row) throw new Error(`implement ${argv[1] ?? ''}: ${folder}/PLAN.md has no commit row ${argv[1] ?? ''} (rows: ${rows.map((r) => r.n).join(', ') || 'none'})`);
		Object.assign(vars, { n, total: rows.length, row: row.line });
		writeState(toplevel, { commit: n });
	}
	// A round's tree is cut from the base branch, whose own `wf` may predate these commands: point the
	// agent at the wf that composed its prompt, not at whatever `wf` resolves to in its tree. The entry
	// that is running (seams.entry), so an agent in Shay's round runs his env's wf, not the bare kit.
	const wf = `node ${seams.entry.replace(/\\/g, '/')}`;
	// Same for the docs a prompt cites: a round's worktree does not hold wf.
	const text = anchorToolPaths(renderPrompt(template, vars).replace(/`wf /g, `\`${wf} `), WF_HOME, projectName);
	return { text, toplevel, state, folder, phase, n: vars.n ?? null };
}

// wf prompt: the prompt as it is, for reading. A dispatch runs `wf brief`, which adds the handoff.
export function runPrompt(argv: string[]) {
	try {
		process.stdout.write(composePrompt(argv).text);
	} catch (e) {
		console.error(`wf prompt ${(e as Error).message}`);
		process.exit(2);
	}
}

if (process.argv[1]?.endsWith('prompt.ts')) runPrompt(process.argv.slice(2));
