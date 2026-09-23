#!/usr/bin/env node
// deliver.mjs — wf deliver: after the last commit of a round (skills/round/SKILL.md).
//   1. `wf check` with the last PLAN.md row's check (the repro)
//   2. the PR: PLAN.md verbatim + the pushed commits + VALIDATION.md (the validate agent's
//      hop-by-hop as-built check; a word heuristic here printed "missing: loop" — TJEW-700)
//   3. MONDAY.md in the round folder (the orchestrator posts it; wf never calls Monday)
//   4. `wf step review`
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck } from './check.mjs';
import { planCommitRows } from './prompt.mjs';
import { readState, roundOf, toplevelOf, writeState } from './state.mjs';
import { runStep } from './step.mjs';

export function prBody({ planText, commitLines, validation }) {
	const validated = validation ? `\n${validation.replace(/\r\n/g, '\n').trimEnd()}\n` : '';
	return `${planText.replace(/\r\n/g, '\n').trimEnd()}\n\n## Commits (as pushed)\n${commitLines.join('\n')}\n${validated}`;
}

// Hebrew scaffolding; Cause/Approach come across verbatim from PLAN.md (wf has no
// translator — a plan written in English arrives in English, marked for the poster).
export function mondayComment({ planText, url }) {
	const body = planText.replace(/\r\n/g, '\n');
	const field = (name) => new RegExp(`^${name}:[ \\t]*(.+)$`, 'm').exec(body)?.[1]?.trim() ?? '';
	return ['<!-- translate: the two quoted lines are PLAN.md verbatim -->', 'תוקן ✅', `סיבה: ${field('Cause')}`, `מה שונה: ${field('Approach')}`, `PR: ${url}`].join('\n') + '\n';
}

const git = (toplevel, args) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trimEnd();

export async function runDeliver() {
	const toplevel = toplevelOf();
	const { id, folder } = roundOf(readState(toplevel), toplevel);
	const plan = join(toplevel, folder ?? '', 'PLAN.md');
	if (!folder || !existsSync(plan)) {
		console.error(`wf deliver: no ${folder ?? 'round folder'}/PLAN.md`);
		process.exit(2);
	}
	const planText = readFileSync(plan, 'utf8');
	const rows = planCommitRows(planText);
	if (rows.length) writeState(toplevel, { commit: rows.at(-1).n });
	runCheck(); // exits 1 with the failure; silent when the last row's check is green

	// The round folder ships with the PR (dev keeps every round's evidence), except
	// repro/.auth, which holds a live login session. PNGs are gitignored (bug-reports/**/*.png).
	// Once .gitignore covers bug-reports/**/.auth/, git add refuses an exclude that names the ignored
	// path (exit 1, "paths are ignored"), so the exclude is only needed while it is not ignored.
	const authIgnored = spawnSync('git', ['-C', toplevel, 'check-ignore', '-q', `${folder}/repro/.auth`]).status === 0;
	const keep = ['--', folder, ...(authIgnored ? [] : [`:(exclude)${folder}/repro/.auth`])];
	if (git(toplevel, ['status', '--porcelain', ...keep])) {
		git(toplevel, ['add', ...keep]);
		git(toplevel, ['commit', '-q', '-m', `docs(${id}): round folder: ticket, research, plan, validation, repro`]);
	}
	// gh pr create cannot push without a terminal; push first (BJEW-603, the first real deliver).
	const pushed = spawnSync('git', ['-C', toplevel, 'push', '-q', '-u', 'origin', 'HEAD'], { encoding: 'utf8' });
	if (pushed.status !== 0) {
		console.error(`FAILED: git push
${(pushed.stdout ?? '') + (pushed.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}

	const base = git(toplevel, ['merge-base', 'origin/dev', 'HEAD']);
	const commitLines = git(toplevel, ['log', '--format=- %h %s', `${base}..HEAD`]).split('\n').filter(Boolean);
	if (!commitLines.length) {
		console.error('wf deliver: no commits since origin/dev — nothing to deliver');
		process.exit(1);
	}
	const body = join(tmpdir(), `wf-pr-${Date.now()}.md`);
	// VALIDATION.md is the read-only validate agent's verdict (wf prompt validate); first thing T2 reads.
	const validationPath = join(toplevel, folder, 'VALIDATION.md');
	const validation = existsSync(validationPath) ? readFileSync(validationPath, 'utf8') : '';
	writeFileSync(body, prBody({ planText, commitLines, validation }));
	const title = commitLines.at(-1).replace(/^- \w+ /, '');
	const existing = spawnSync('gh', ['pr', 'view', '--json', 'url'], { cwd: toplevel, encoding: 'utf8' });
	const url = existing.status === 0 ? JSON.parse(existing.stdout).url : null;
	const pr = url
		? spawnSync('gh', ['pr', 'edit', '--body-file', body], { cwd: toplevel, encoding: 'utf8' })
		: spawnSync('gh', ['pr', 'create', '--base', 'dev', '--title', title, '--body-file', body], { cwd: toplevel, encoding: 'utf8' });
	if (pr.status !== 0) {
		console.error(`FAILED: gh pr ${url ? 'edit' : 'create'}\n${(pr.stdout ?? '') + (pr.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}
	const prUrl = url ?? pr.stdout.trim().split('\n').at(-1);
	writeFileSync(join(toplevel, folder, 'MONDAY.md'), mondayComment({ planText, url: prUrl }));
	console.log(prUrl);
	await runStep(['review', '--waiting-on', 'shay']);
}

if (process.argv[1]?.endsWith('deliver.mjs')) await runDeliver();
