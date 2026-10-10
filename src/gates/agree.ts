#!/usr/bin/env node
// agree.ts — wf agree <round> — T1: annotate the round agreement's agreed material as a page, fold →
// AGREEMENT-REVIEW.md. This is where the old `wf design` / SPEC.md T1 went (#110): the agreement is
// the one document T1 decides on, and T1 joins the build rather than gating a separate spec.
//
// Class B/C: the page renders `## Observed` + `## Agreed` — the agreed material whose sha T1 binds.
// Class A: the ticket's `## Intent`. Each block of the page carries its agreement line, so a comment
// folds onto the line it was made on. The sha in AGREEMENT-REVIEW.md is over the agreed material
// (agreement.ts), never the mutable `## Verification`/`## Units` working detail.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { openFile, openInEditor, opensWindows } from '../worktrees/editor.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { appendDatedSection, devUrlsFor, foldFeedbackLine, planPage, renderHeader, renderSkeleton, roundArtifacts } from './review-format.ts';
import { agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, consequential, section } from '../round/agreement.ts';
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
	const state = readState(worktree);
	const klass = state?.class ?? 'A';
	const agreement = agreementPath(worktree, klass, state?.folder ?? null);
	if (!existsSync(agreement)) {
		console.error(`no ${agreement} yet — the working session writes it`);
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
	const text = readFileSync(agreement, 'utf8');
	const material = agreedSection(text, klass);
	const toAnnotate = join(worktree, '.wf', 'AGREEMENT-T1.md');
	writeFileSync(toAnnotate, `${material}\n<!-- extracted from ${agreement.split(/[\\/]/).pop()} § the agreed material: what T1 decides. The rest of the agreement is working detail. Annotate here -->\n`);
	const pageFile = join(worktree, '.wf', 'AGREEMENT-T1.html');
	writeFileSync(pageFile, planPage({
		title: `Agreement — ${round} · T1`,
		meta: [`agreement-sha: ${sha ?? 'n/a'}`, 'the agreed material this round is built against'],
		section: material,
		base: agreedOffset(text, klass),
		artifacts: roundArtifacts(dirname(agreement), join(worktree, '.wf')),
	}));
	console.log(`page: ${pageFile}`);
	if (seams.reviewUI?.available()) {
		const line = seams.reviewUI.annotate({ worktree, file: pageFile, since: new Date().toISOString() });
		appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
		console.log(`wrote ${file}`);
		return;
	}
	openFile(pageFile);
	if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) }));
	if (!opensWindows()) {
		console.log(`to annotate: ${toAnnotate}
review file: ${file}
  Claude Code: show the person this section (in plain words if they ask, adding nothing it does not say); write into the review file a \`note —\` line with what you showed them, verbatim, then their comments and the verdict they said`);
		return;
	}
	if (!openInEditor([worktree, toAnnotate])) console.log(`fallback: no editor found — annotate by hand:\n  worktree: ${worktree}\n  agreement: ${toAnnotate}\n  review file: ${file}`);
	else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
}
