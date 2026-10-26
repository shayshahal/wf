#!/usr/bin/env node
// agree.ts — wf agree <round> — T1: annotate the round agreement's agreed material (a markdown extract), fold →
// AGREEMENT-REVIEW.md. This is where the old `wf design` / SPEC.md T1 went (#110): the agreement is
// the one document T1 decides on, and T1 joins the build rather than gating a separate spec.
//
// Class B/C: the page renders `## Observed` + `## Agreed` — the agreed material whose sha T1 binds.
// Class A: the ticket's `## Intent`. Each block of the page carries its agreement line, so a comment
// folds onto the line it was made on. The sha in AGREEMENT-REVIEW.md is over the agreed material
// (agreement.ts), never the mutable `## Verification` working detail.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { openInEditor, opensWindows } from '../worktrees/editor.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { roundWorkspaceGap } from '../worktrees/session-workspace.ts';
import { appendDatedSection, devUrlsFor, foldFeedbackLine, renderHeader, renderSkeleton } from './review-format.ts';
import { agreementGap, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, consequential, concisenessGap, notAskedFor, notAskedForGap, section } from '../round/agreement.ts';
import { seams } from '../seams.ts';
import { readState, roundFile } from '../round/state.ts';
import { runStep } from '../round/step.ts';

// The agreed material as one markdown section for the page: Observed + Agreed for a consequential
// round, Intent for an ordinary one.
export function agreedSection(text: string, klass: string | null): string {
	const body = text.replace(/\r\n/g, '\n');
	if (consequential(klass as 'A' | 'B' | 'C' | null)) {
		return [`## Observed`, (section(body, 'Observed') ?? '').trimEnd(), '', `## Agreed`, (section(body, 'Agreed') ?? '').trimEnd()].join('\n').trimEnd();
	}
	return `## Intent\n${(section(body, 'Intent') ?? '').trimEnd()}`;
}

// The 0-based line the agreed material starts at in the agreement: the page renders an extract, so
// every block needs the agreement's own line numbers.
export function agreedOffset(text: string, klass: string | null): number {
	const heading = consequential(klass as 'A' | 'B' | 'C' | null) ? '## Observed' : '## Intent';
	return Math.max(0, text.replace(/\r\n/g, '\n').split('\n').findIndex((l) => l.trimEnd() === heading));
}

export async function runAgree(argv: string[]) {
	const round = argv.find((a) => !a.startsWith('-'));
	if (!round) {
		console.error('usage: wf agree <round>');
		refuseCaller();
	}
	const { path: worktree } = resolveWorktree(round);
	const workspaceGap = await roundWorkspaceGap(worktree);
	if (workspaceGap) {
		console.error(`wf agree: ${workspaceGap}`);
		process.exit(2);
	}
	const state = readState(worktree);
	const klass = state?.class ?? 'A';
	const agreement = agreementPath(worktree, klass, state?.folder ?? null);
	if (!existsSync(agreement)) {
		console.error(`no ${agreement} yet — the working session writes it`);
		process.exit(2);
	}
	const text = readFileSync(agreement, 'utf8');
	const gap = agreementGap(text, klass, round) ?? (consequential(klass) ? notAskedForGap(text) ?? concisenessGap(text) : null);
	if (gap) {
		console.error(`wf agree: ${gap} — finish the agreement before T1`);
		process.exit(2);
	}
	const previous = process.cwd();
	process.chdir(worktree);
	try {
		await runStep(['agree', '--waiting-on', 'user', '--round', round]);
	} finally {
		process.chdir(previous);
	}
	const sha = agreementSha(worktree, klass, state?.folder ?? null);
	const header = () => renderHeader({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) });
	const file = roundFile(worktree, AGREEMENT_REVIEW_FILE);
	mkdirSync(join(worktree, '.wf'), { recursive: true });
	const material = agreedSection(text, klass);
	const toAnnotate = join(worktree, '.wf', 'AGREEMENT-T1.md');
	writeFileSync(toAnnotate, `${material}\n<!-- extracted from ${agreement.split(/[\\/]/).pop()} § the agreed material: what T1 decides. The rest of the agreement is working detail. Annotate here -->\n`);
	console.log(`agreement: ${toAnnotate}`);
	// JX-1367 (2026-10-18): an addition no source asked for was approved unseen inside `## Agreed`.
	// Name each one where the person reads first, so T1 decides it on its own.
	const unasked = consequential(klass) ? notAskedFor(text) : [];
	if (unasked.length) console.log([`not asked for — decide each at T1:`, ...unasked.map((item) => `  - ${item}`)].join('\n'));
	if (seams.presentation) {
		// Native tools belong to the calling session. Prepare the bound record without inventing a verdict.
		appendDatedSection(file, renderSkeleton({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) }));
		console.log(seams.presentation.guidance);
		console.log(seams.presentation.reviewHandoff({ kind: 'agreement', worktree, document: toAnnotate, pages: [], reviewFile: file }));
		return;
	}
	if (seams.reviewUI?.available()) {
		const line = seams.reviewUI.annotate({ worktree, file: toAnnotate, since: new Date().toISOString() });
		appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
		console.log(`wrote ${file}`);
		return;
	}
	if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) }));
	if (!opensWindows()) {
		console.log(`to annotate: ${toAnnotate}
review file: ${file}
  Show the person this section using the available UI; write into the review file a \`note —\` line with what you showed them, verbatim, then their comments and the verdict they actually gave`);
		return;
	}
	if (!openInEditor([worktree, toAnnotate])) console.log(`fallback: no editor found — annotate by hand:\n  worktree: ${worktree}\n  agreement: ${toAnnotate}\n  review file: ${file}`);
	else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
}
