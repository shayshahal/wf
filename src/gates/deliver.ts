#!/usr/bin/env node
// deliver.ts — wf deliver: after T2 approved (skills/round/SKILL.md). T2 is local and comes first: the
// approval is the merge, and nothing leaves the machine before it (Shay, 2026-09-27).
//   1. `wf check` with the last PLAN.md row's check (the repro)
//   2. the PR: the round's own sections in the order a reviewer reads them, the commits, and
//      VALIDATION.md's verdict and as-built lines (the validate agent's check; a word heuristic
//      here printed "missing: loop" — TJEW-700). Not PLAN.md verbatim — see prBody.
//   3. the merge, and the branch deleted
//   4. the project's tracker note in the round folder (the round skill posts it last; wf never calls the
//      tracker), its path in .wf/state.json for `wf next`
//   5. `wf step merged`
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { runCheck } from './check.ts';
import { baseBranch, trackerNote } from '../project.ts';
import { planCommitRows } from '../round/prompt.ts';
import { openQuestionGate } from '../round/ask.ts';
import { handoffGap } from '../round/handoff.ts';
import { readVerdict } from './review-format.ts';
import { readState, roundOf, toplevelOf, writeState } from '../round/state.ts';
import { runStep } from '../round/step.ts';
import type { State } from '../round/state.ts';

// GitHub refuses a PR body over 65,536 characters (JX-1221, 2026-10-08: PLAN.md 61,331 + VALIDATION.md
// 6,260 + commits, "Body is too long" at `gh pr create`). The budget keeps a margin under it; .length
// counts UTF-16 units, never fewer than GitHub's characters.
export const PR_BODY_BUDGET = 60000;

type PrSources = { ticket: string; plan: string; commitLines: string[]; validation: string; planPath?: string; budget?: number };

// The `## <name>` sections of a round file, by name. A section runs to the next `## ` or the end.
function sectionsOf(text: string) {
	const out: Record<string, string> = {};
	for (const part of text.replace(/\r\n/g, '\n').split(/^## /m).slice(1)) {
		const nl = part.indexOf('\n');
		out[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
	}
	return out;
}

const h1Of = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';
const section = (name: string, text: string | undefined) => (text?.trim() ? `## ${name}\n\n${text.trim()}\n` : '');
const sub = (name: string, text: string) => (text.trim() ? `### ${name}\n\n${text.trim()}\n` : '');

// The `Revision (…)` line an older plan left above `## Build`; new plans keep them in `## Revisions`.
const isRevision = (line: string) => /^Revision \(/.test(line);

// Pure: the PR title — the round's own title, TICKET.md's H1 (`# JX-1221 — דף משתמש …`). Never a
// commit subject: JX-1221's title came from commitLines.at(-1), the round's *first* commit — "split
// /users/[id] into a view-only detail page and a /users/[id]/edit page", a design T2 removed nine
// revisions later (Shay, 2026-10-08). The title is the one line everybody reads.
export function prTitle({ ticket, plan, commitLines }: Pick<PrSources, 'ticket' | 'plan' | 'commitLines'>) {
	return h1Of(ticket) || commitLines.at(0)?.replace(/^- \w+ /, '') || h1Of(plan) || 'round';
}

// Pure: PLAN.md's `## Commits` as the PR lists it — one line per commit. The `files` cell goes (a row
// listed every file it touched: 3,055 characters in one cell on JX-1221) and so do the `Row N:` build
// instructions that follow the table. The hash comes from the pushed commits, matched by message; a
// commit no row names (deliver's own round-folder commit) is listed after them, oldest last.
export function prCommitRows(planText: string, commitLines: string[]) {
	const hashOf = new Map<string, string>();
	for (const line of commitLines) {
		const m = /^- (\w+) (.+)$/.exec(line);
		if (m) hashOf.set(m[2], m[1]);
	}
	const rows = planCommitRows(planText);
	const named = new Set(rows.map((r) => r.message));
	return [
		...rows.map((r) => `| ${r.n} | ${hashOf.get(r.message) ?? '—'} | ${r.message} | ${r.check || '—'} |`),
		...[...hashOf]
			.filter(([subject]) => !named.has(subject))
			.reverse()
			.map(([subject, hash]) => `| — | ${hash} | ${subject} | — |`),
	];
}

// Pure: the PR body — the round's own sections in the order a reviewer reads them, not PLAN.md
// verbatim. JX-1221's body was 46,275 characters: 41% of it the commit table's file lists, a preamble
// of 14 `Revision (…)` paragraphs, and `## Build` — the call stack, the one section that says how —
// the section the budget cut first, because it sits after the first `## ` and the preamble does not.
// Intent, Approach, the commits, the T2 walk, Not doing and VALIDATION.md's verdict are the
// reviewer's minimum and are never cut. The call stack and the plan's history fold under `<details>`;
// over the budget they go first, then the validation's detail, then the oldest commits — and the body
// says where the rest is.
export function prBody({ ticket, plan, commitLines, validation, planPath = 'PLAN.md', budget = PR_BODY_BUDGET }: PrSources) {
	const folder = planPath.replace(/\/PLAN\.md$/, '');
	const P = sectionsOf(plan);
	const K = sectionsOf(ticket);
	const V = sectionsOf(validation);
	// The plan's header is the plan as it stands — Class, Cause, Approach (prompts/plan.md).
	const head = plan.replace(/\r\n/g, '\n').split(/^## /m)[0].split('\n');
	const header = head.slice(1).filter((l) => l.trim() && !isRevision(l));
	const revisions = [...head.filter(isRevision), ...(P.Revisions ?? '').split('\n')]
		.map((l) => l.trim())
		.filter(Boolean);
	// VALIDATION.md's own first lines, minus its `# <round> — validation` title.
	const verdict = validation
		.replace(/\r\n/g, '\n')
		.split(/^## /m)[0]
		.split('\n')
		.filter((l) => l.trim() && !l.startsWith('# '))
		.join('\n');
	const commits = prCommitRows(plan, commitLines);
	const decisions = P.Decisions ? P.Decisions.split('\n').filter((l) => l.trim().startsWith('- ')).length : 0;

	let buildBlock = P.Build ? `<details>\n<summary>Build — the call stack (${P.Build.split('\n').length} lines)</summary>\n\n${P.Build}\n\n</details>\n` : '';
	let historyBlock = revisions.length || P.Decisions ? `<details>\n<summary>Plan history — ${revisions.length} revisions, ${decisions} decisions</summary>\n\n${[P.Decisions, revisions.join('\n')].filter(Boolean).join('\n\n')}\n\n</details>\n` : '';
	let keep = commits.length;
	const valDetail: Array<[string, string]> = [
		['Unplanned', V.Unplanned ?? ''],
		['Live', V.Live ?? ''],
		['Intent', V.Intent ?? ''],
	];
	let cut = false;

	const commitsBlock = () => {
		const earlier = keep < commits.length ? [`| — | — | (${commits.length - keep} earlier commits in the branch) | — |`] : [];
		return `## Commits\n\n| # | commit | message | check |\n|---|---|---|---|\n${[...earlier, ...commits.slice(-keep)].join('\n')}\n`;
	};
	const validationBlock = () => {
		const detail = valDetail.filter(([, body]) => body.trim()).map(([name, body]) => sub(name, body));
		return [verdict, V.Suites ?? '', ...detail].filter((p) => p.trim()).length
			? `## Validation\n\n${[verdict, V.Suites ?? '', ...detail].filter((p) => p.trim()).join('\n\n')}\n`
			: '';
	};
	const assemble = () =>
		[
			cut ? `> Shortened: GitHub limits a PR body to 65,536 characters, so the round folder's own text stops here. PLAN.md, VALIDATION.md and the rest are in the branch at \`${planPath}\`.\n` : '',
			`Round folder: \`${folder}/\`\n`,
			section('Intent', K.Intent),
			section('Approach', header.join('\n')),
			commitsBlock(),
			section('T2 walk', P['T2 walk']),
			section('Not doing', P['Not doing']),
			validationBlock(),
			buildBlock,
			historyBlock,
		]
			.filter((b) => b.trim())
			.join('\n') + '\n';

	// Least read first, and only what can be spared: a reviewer's minimum is above this list.
	const stages: Array<() => boolean> = [
		// The fold goes first: it is collapsed, and PLAN.md is in the same branch as this body.
		() => {
			if (!historyBlock) return false;
			historyBlock = '';
			return true;
		},
		() => {
			if (!buildBlock) return false;
			buildBlock = '';
			return true;
		},
		// Then VALIDATION.md's detail, in valDetail's order: unplanned, live, intent.
		() => {
			const next = valDetail.find(([, body]) => body.trim() && !body.startsWith('(cut here'));
			if (!next) return false;
			next[1] = `(cut here, in \`${folder}/VALIDATION.md\`)`;
			return true;
		},
		// Then the oldest commits, a quarter at a time, never the newest.
		() => {
			if (keep <= 1) return false;
			keep = Math.max(1, keep - Math.ceil(keep / 4));
			return true;
		},
	];
	let text = assemble();
	// One pass is the normal case: the folds, then the validation's detail. A body that is still over
	// (a plan with thousands of commits) takes the same stages again until a pass cuts nothing.
	for (let pass = 0; pass < 20 && text.length > budget; pass++) {
		let changed = false;
		for (const stage of stages) {
			if (text.length <= budget) break;
			if (!stage()) continue;
			cut = true;
			changed = true;
			text = assemble();
		}
		if (!changed) break;
	}
	// Still over with only the reviewer's minimum left: `gh pr create` refuses the body outright, so
	// the body stops here rather than fail the merge (JX-1221 hit "Body is too long" once already).
	if (text.length > budget) text = `${text.slice(0, budget)}\n(cut here, in the branch: \`${planPath}\`)\n`;
	return text;
}

// Pure: null when T2 approved the round (`wf review --done` moved it to step pr), else why deliver,
// which merges, may not run yet.
export function t2Gap(state: State | null, reviewText: string | null) {
	if (state?.step === 'pr' && readVerdict(reviewText ?? '') === 'approved') return null;
	return 'T2 has not approved this round. deliver merges, so it comes after `wf review <branch> --done` with verdict: approved';
}

// Pure: whether a failed push was the project's pre-push hook refusing it (not the network or auth).
export const hookRefused = (output: string) => /pre-push/i.test(output ?? '');

// Pure: the REVIEW.md section a push the hook refused becomes. Its changes-requested verdict is a T2
// fix like any other (wf next dispatches fix-review, then T2 again): TJEW-670's orchestrator built
// this by hand, 2026-09-28, after fallow-audit refused a push T2 had approved.
export function refusedPushSection(output: string, date: string) {
	// The lines that name a failure, not the tail: the hook's last 30 lines were svelte-kit and node
	// warnings, and the file fallow flagged was above them (bench, 2026-09-28).
	const all = output.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
	const named = all.filter((l) => /[\u2717\u2718]|\u{1F94A}|\berror\b|CRITICAL|^\s*(packages|verification|scripts|docs)\/|^\s+:\d+\s/u.test(l) && !/lefthook v\d/.test(l));
	const lines = (named.length ? named : all).slice(-30);
	return `\n## ${date} \u2014 the push was refused by the project's pre-push hook\n\ncomments:\n(the push) \u2014 fix what the hook reports; \`wf check\` runs the same hook on the files you change:\n${lines.map((l) => `    ${l}`).join('\n')}\n\nverdict: changes-requested\n`;
}

const git = (toplevel: string, args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trimEnd();

export async function runDeliver() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	// Run again after the merge, it pushed the deleted branch back and failed at gh pr merge.
	if (state?.step === 'merged') {
		console.error(`wf deliver: already merged${state.note ? ` (tracker note: ${state.note})` : ''}; \`wf next\` says what is left`);
		process.exit(2);
	}
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
	// The id names the commit and the tracker note: without it they said docs(null) and `## null`.
	if (!id) {
		console.error('wf deliver: .wf/state.json has no id or round — run `wf step <step>` in this worktree first, or recreate the round with `wf new --id`');
		refuseCaller();
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
	if (rows.length) writeState(toplevel, { commit: rows.at(-1)!.n });
	await runCheck(); // exits 1 with the failure; silent when the last row's check is green

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
		const output = (pushed.stdout ?? '') + (pushed.stderr ?? '');
		console.error(`FAILED: git push\n${output}`.trimEnd());
		if (hookRefused(output)) {
			appendFileSync(reviewFile, refusedPushSection(output, new Date().toISOString().slice(0, 10)));
			await runStep(['implement']);
			console.error(`wf deliver: the pre-push hook refused the push. ${folder}/REVIEW.md now asks for the fix (verdict: changes-requested); the round is back at implement. \`wf next\` dispatches it, then T2 again.`);
		}
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
	const ticketPath = join(toplevel, folder, 'TICKET.md');
	const ticket = existsSync(ticketPath) ? readFileSync(ticketPath, 'utf8') : '';
	writeFileSync(body, prBody({ ticket, plan: planText, commitLines, validation, planPath: `${folder}/PLAN.md` }));
	const title = prTitle({ ticket, plan: planText, commitLines });
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
	// Every --id the round was made with: a round on subitems has one note per subitem (TJEW-670).
	const note = trackerNote({ ids: state?.ids ?? [id], url: prUrl });
	writeFileSync(join(toplevel, folder, note.file), note.text);
	writeState(toplevel, { note: `${folder}/${note.file}` });
	console.log(`${prUrl} merged; tracker note: ${folder}/${note.file}`);
	await runStep(['merged']);
}

if (process.argv[1]?.endsWith('deliver.ts')) await runDeliver();
