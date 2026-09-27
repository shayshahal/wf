#!/usr/bin/env node
// deliver.mjs — wf deliver: after T2 approved (skills/round/SKILL.md). T2 is local and comes first: the
// approval is the merge, and nothing leaves the machine before it (Shay, 2026-09-27).
//   1. `wf check` with the last PLAN.md row's check (the repro)
//   2. the PR: PLAN.md verbatim + the pushed commits + VALIDATION.md (the validate agent's
//      hop-by-hop as-built check; a word heuristic here printed "missing: loop" — TJEW-700)
//   3. the merge, and the branch deleted
//   4. the project's tracker note in the round folder (the round skill posts it last; wf never calls the tracker)
//   5. `wf step merged`
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheck } from './check.mjs';
import { baseBranch, trackerNote } from './project.mjs';
import { planCommitRows } from './prompt.mjs';
import { openQuestionGate } from './ask.mjs';
import { handoffGap } from './handoff.mjs';
import { readVerdict } from './review-format.mjs';
import { readState, roundOf, toplevelOf, writeState } from './state.mjs';
import { runStep } from './step.mjs';

export function prBody({ planText, commitLines, validation }) {
	const validated = validation ? `\n${validation.replace(/\r\n/g, '\n').trimEnd()}\n` : '';
	return `${planText.replace(/\r\n/g, '\n').trimEnd()}\n\n## Commits (as pushed)\n${commitLines.join('\n')}\n${validated}`;
}

// Pure: null when T2 approved the round (`wf review --done` moved it to step pr), else why deliver,
// which merges, may not run yet.
export function t2Gap(state, reviewText) {
	if (state?.step === 'pr' && readVerdict(reviewText ?? '') === 'approved') return null;
	return 'T2 has not approved this round. deliver merges, so it comes after `wf review <branch> --done` with verdict: approved';
}

const git = (toplevel, args) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trimEnd();

export async function runDeliver() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const gate = openQuestionGate(state);
	if (gate) {
		console.error(`wf deliver: ${gate}`);
		process.exit(2);
	}
	const { id, folder } = roundOf(state, toplevel);
	const plan = join(toplevel, folder ?? '', 'PLAN.md');
	if (!folder || !existsSync(plan)) {
		console.error(`wf deliver: no ${folder ?? 'round folder'}/PLAN.md`);
		process.exit(2);
	}
	const reviewFile = join(toplevel, folder, 'REVIEW.md');
	const t2 = t2Gap(state, existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : null);
	if (t2) {
		console.error(`wf deliver: ${t2}`);
		process.exit(2);
	}
	// The PR carries VALIDATION.md: it must be the answer to the last validate brief, with a verdict.
	const validationFile = join(toplevel, folder, 'VALIDATION.md');
	const vGap = handoffGap('validate', existsSync(validationFile) ? readFileSync(validationFile, 'utf8') : null, state?.briefs?.validate);
	if (vGap) {
		console.error(`wf deliver: ${vGap}`);
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
	// REVIEW.md and the tracker note are the round's own paperwork, read by nobody after it: they stay
	// uncommitted, and reap keeps them in ~/.cache/wf-reaped (Shay, 2026-09-27).
	const keep = ['--', folder, ...(authIgnored ? [] : [`:(exclude)${folder}/repro/.auth`]), `:(exclude)${folder}/REVIEW.md`];
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

	const base = git(toplevel, ['merge-base', `origin/${baseBranch}`, 'HEAD']);
	const commitLines = git(toplevel, ['log', '--format=- %h %s', `${base}..HEAD`]).split('\n').filter(Boolean);
	if (!commitLines.length) {
		console.error(`wf deliver: no commits since origin/${baseBranch} — nothing to deliver`);
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
		: spawnSync('gh', ['pr', 'create', '--base', baseBranch, '--title', title, '--body-file', body], { cwd: toplevel, encoding: 'utf8' });
	if (pr.status !== 0) {
		console.error(`FAILED: gh pr ${url ? 'edit' : 'create'}\n${(pr.stdout ?? '') + (pr.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}
	const prUrl = url ?? pr.stdout.trim().split('\n').at(-1);
	// Not --delete-branch: gh would then check out the base branch in this worktree, and it is checked
	// out in the person's clone.
	const merged = spawnSync('gh', ['pr', 'merge', prUrl, '--merge'], { cwd: toplevel, encoding: 'utf8' });
	if (merged.status !== 0) {
		console.error(`FAILED: gh pr merge ${prUrl}\n${(merged.stdout ?? '') + (merged.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}
	spawnSync('git', ['-C', toplevel, 'push', '-q', 'origin', '--delete', git(toplevel, ['rev-parse', '--abbrev-ref', 'HEAD'])], { encoding: 'utf8' });
	const note = trackerNote({ planText, url: prUrl });
	writeFileSync(join(toplevel, folder, note.file), note.text);
	console.log(`${prUrl} merged; tracker note: ${folder}/${note.file}`);
	await runStep(['merged']);
}

if (process.argv[1]?.endsWith('deliver.mjs')) await runDeliver();
