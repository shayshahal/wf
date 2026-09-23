#!/usr/bin/env node
// prompt.mjs — wf prompt <research | plan [--revise] | implement N | fix-review>
// Prints the composed prompt for a fresh round agent to stdout (skills/round/SKILL.md).
// Substitutes {{round}} {{folder}} from .wf/state.json, and for `implement N` the row
// N of PLAN.md `## Commits` verbatim ({{row}}), {{n}} and {{total}}.
// `implement N` also records `commit: N` in state — that is what `wf check` fences on.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basePortForBranch } from './scripts/worktree-ports.mjs';
import { readState, roundOf, toplevelOf, writeState } from './state.mjs';

const REVISE = '\nRead `{{folder}}/SPEC-REVIEW.md` (wf design writes it there); revise `{{folder}}/SPEC.md` and `{{folder}}/PLAN.md` to answer every annotation; change nothing it does not mention.\n';

// A `## Commits` row is a table line whose first cell is the commit number; header and
// `|---|` separator rows are not. `line` is verbatim (that is what the prompt shows).
export function planCommitRows(text) {
	const body = text.replace(/\r\n/g, '\n');
	const section = /^## Commits[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body);
	if (!section) return [];
	const rows = [];
	for (const line of section[1].split('\n')) {
		if (!line.trim().startsWith('|')) continue;
		const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
		if (!/^\d+$/.test(cells[0])) continue;
		rows.push({ n: Number(cells[0]), line: line.trimEnd(), message: cells[1] ?? '', files: cells[2] ?? '', check: cells[3] ?? '' });
	}
	return rows;
}

// Whitespace- or comma-separated paths in a row's `files` cell, backticks stripped.
export function rowFiles(row) {
	return (row?.files ?? '').split(/[\s,]+/).map((f) => f.replace(/`/g, '').trim()).filter(Boolean);
}

export function renderPrompt(template, vars) {
	return template.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), 'prompts');

export function runPrompt(argv) {
	const phase = argv[0];
	if (!['research', 'plan', 'implement', 'as-built', 'validate', 'fix-review'].includes(phase)) {
		console.error('usage: wf prompt <research | plan [--revise] | implement N | as-built | validate | fix-review>');
		process.exit(2);
	}
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const { id, folder } = roundOf(state, toplevel);
	if (!id) {
		console.error('wf prompt: no round in .wf/state.json — `wf new <branch> --id <id>` first');
		process.exit(2);
	}
	const vars = { round: id, folder };
	// Direct ports (scripts/dev-worktree.mjs): Node on Windows cannot resolve *.localhost, so a
	// spec's API calls need these (TJEW-663 verify, 2026-09-23: ENOTFOUND in auth.setup).
	try {
		const base = basePortForBranch(execFileSync('git', ['-C', toplevel, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
		Object.assign(vars, { b2b: `http://localhost:${base}`, api: `http://127.0.0.1:${base + 10_000}/api/v1`, admin: `http://localhost:${base + 20_000}` });
	} catch { /* not in a round worktree */ }
	let template = readFileSync(join(templatesDir, `${phase}.md`), 'utf8');
	if (phase === 'plan' && argv.includes('--revise')) template += REVISE;
	if (phase === 'implement') {
		const n = Number(argv[1]);
		const plan = join(toplevel, folder, 'PLAN.md');
		let rows;
		try {
			rows = planCommitRows(readFileSync(plan, 'utf8'));
		} catch {
			console.error(`wf prompt implement: no ${folder}/PLAN.md`);
			process.exit(2);
		}
		const row = rows.find((r) => r.n === n);
		if (!row) {
			console.error(`wf prompt implement ${argv[1] ?? ''}: ${folder}/PLAN.md has no commit row ${argv[1] ?? ''} (rows: ${rows.map((r) => r.n).join(', ') || 'none'})`);
			process.exit(2);
		}
		Object.assign(vars, { n, total: rows.length, row: row.line });
		writeState(toplevel, { commit: n });
	}
	// A round's tree is cut from origin/dev, whose own `wf` may predate these commands: point the
	// agent at the wf that composed its prompt, not at whatever `pnpm wf` resolves to in its tree.
	const wf = `node ${fileURLToPath(new URL('./wf.mjs', import.meta.url)).replace(/\\/g, '/')}`;
	// Same for the docs a prompt cites: they live on the tooling branch only, so dev's agents never
	// load them as instructions (link-tools links every JewelryX-Tools skill into a dev worktree).
	const home = fileURLToPath(new URL('./', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
	process.stdout.write(
		renderPrompt(template, vars)
			.replace(/`pnpm wf /g, `\`${wf} `)
			.split('{{wf}}').join(home),
	);
}

if (process.argv[1]?.endsWith('prompt.mjs')) runPrompt(process.argv.slice(2));
