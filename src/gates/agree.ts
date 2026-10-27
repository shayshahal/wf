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
import { agreementApprovalBinding, appendDatedSection, devUrlsFor, foldFeedbackLine, readVerdict, renderHeader, renderSkeleton, VERDICTS } from './review-format.ts';
import { agreementGap, agreementPath, agreementSha, AGREEMENT_REVIEW_FILE, consequential, concisenessGap, notAskedFor, notAskedForGap, section, t2WalkRecipeGap } from '../round/agreement.ts';
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

/** Prepare T1, or record the person's explicit verdict against the material already shown. */
export async function runAgree(argv: string[]): Promise<void> {
	const usage = (): never => {
		console.error('usage: wf agree <round> [--verdict approved|changes-requested|dismissed --sha <agreement-sha> --note "<the person’s words>"]');
		return refuseCaller();
	};
	const [round, ...args] = argv;
	if (!round || round.startsWith('-')) usage();
	const flags = new Map<string, string>();
	for (let i = 0; i < args.length; i += 2) {
		const key = args[i], value = args[i + 1];
		if (!['--verdict', '--sha', '--note'].includes(key) || flags.has(key) || !value || value.startsWith('--')) usage();
		flags.set(key, value);
	}
	const verdict = flags.get('--verdict');
	const expectedSha = flags.get('--sha');
	const note = flags.get('--note')?.replace(/\s+/g, ' ').trim();
	if (args.length && (flags.size !== 3 || !VERDICTS.includes(verdict ?? '') || !expectedSha || !note)) usage();
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
	const gap = agreementGap(text, klass, round) ?? (consequential(klass) ? notAskedForGap(text) ?? concisenessGap(text) : t2WalkRecipeGap(text));
	if (gap) {
		console.error(`wf agree: ${gap} — finish the agreement before T1`);
		process.exit(2);
	}
	const sha = agreementSha(worktree, klass, state?.folder ?? null);
	const header = () => renderHeader({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) });
	const file = roundFile(worktree, AGREEMENT_REVIEW_FILE);
	if (verdict) {
		if (expectedSha !== sha) {
			console.error('wf agree: agreement sha changed — show the current material and obtain the person’s verdict again');
			process.exit(2);
		}
		if (!existsSync(file) || agreementApprovalBinding(readFileSync(file, 'utf8')).agreementSha !== sha) {
			console.error(`wf agree: no prepared review for this material — run wf agree ${round}, then show it to the person`);
			process.exit(2);
		}
	}
	const previous = process.cwd();
	process.chdir(worktree);
	try {
		await runStep(['agree', '--waiting-on', 'user', '--round', round]);
	} finally {
		process.chdir(previous);
	}
	if (verdict) {
		// Newlines in quoted feedback cannot inject a review header or a second verdict.
		appendDatedSection(file, `${header()}note — ${note}\nverdict: ${verdict}`);
		console.log(`wf agree: recorded ${verdict} for agreement-sha ${sha} in ${file}`);
		return;
	}
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
		const feedback = line ? foldFeedbackLine(line) : 'verdict: dismissed';
		appendDatedSection(file, `${header()}${feedback}`);
		console.log(`wrote ${file}`);
		if (readVerdict(feedback) === 'dismissed') {
			console.log(`wf agree: review dismissed — no approval was recorded. Ask the person for their verdict, then record only what they actually said:\n  wf agree ${round} --verdict <approved|changes-requested|dismissed> --sha ${sha} --note "<the person’s words>"`);
		}
		return;
	}
	if (!existsSync(file) || agreementApprovalBinding(readFileSync(file, 'utf8')).agreementSha !== sha) {
		appendDatedSection(file, renderSkeleton({ round, klass, agreementSha: sha, urls: devUrlsFor(worktree) }));
	}
	console.log(`record the person's actual verdict:\n  wf agree ${round} --verdict <approved|changes-requested|dismissed> --sha ${sha} --note "<the person’s words>"`);
	if (!opensWindows()) {
		console.log(`to annotate: ${toAnnotate}
review file: ${file}
  Show the person this section using the available UI; write into the review file a \`note —\` line with what you showed them, verbatim, then their comments and the verdict they actually gave`);
		return;
	}
	if (!openInEditor([worktree, toAnnotate])) console.log(`fallback: no editor found — annotate by hand:\n  worktree: ${worktree}\n  agreement: ${toAnnotate}\n  review file: ${file}`);
	else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
}
