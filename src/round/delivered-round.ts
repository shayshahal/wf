// delivered-round.ts — a delivered round is one PR, never the owner of a second implementation.
// JX-1350, 2026-10-13 (#129): 17 follow-up commits lived under the first delivery's merged state.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvalBinding } from '../gates/review-format.ts';
import { approvalPaperworkExcluded, commitContentSha, headContentSha, worktreeContentSha } from '../gates/content-identity.ts';
import type { State } from './state.ts';
import { outstandingCorrections } from './corrections.ts';

/** The remote merge and product content delivered; round paperwork may still be filled or posted. */
export type DeliveryReceipt = { readonly url: string; readonly head: string; readonly contentSha: string };

/** Reject malformed persisted delivery evidence rather than treating it as a missing receipt. */
export function deliveryReceiptGap(value: unknown): string | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'invalid delivery receipt';
	if (!('url' in value) || typeof value.url !== 'string' || !/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/.test(value.url)) return 'invalid delivery receipt url';
	if (!('head' in value) || typeof value.head !== 'string' || !/^[a-f0-9]{40}$/.test(value.head)) return 'invalid delivery receipt head';
	if (!('contentSha' in value) || typeof value.contentSha !== 'string' || !/^tree:[a-f0-9]{40}$/.test(value.contentSha)) return 'invalid delivery receipt contentSha';
	return null;
}

/** A fresh branch keeps the earlier round's assessment, approval and phase history intact. */
export function followupRoundLine(state: State): string {
	const ids = state.ids ?? [state.id ?? state.round ?? '<ticket>'];
	return `start a fresh round with wf new <new-branch> --reopen --class A|B|C ${ids.map((id) => `--id ${id}`).join(' ')}; read its EARLIER.md, refresh the ticket/scope, then agreement, build, assessment and T2 — the previous approval does not cover follow-up work`;
}

/** Refuse workflow mutations that would reuse a merged round's evidence or erase its delivery. */
export function deliveredCommandGap(state: State | null, argv: readonly string[]): string | null {
	const [command, ...flags] = argv;
	if (state?.merge_attempt && ['brief', 'check', 'agree', 'review', 'step'].includes(command) && !(command === 'step' && (flags[0] === 'held' || (flags[0] === 'merged' && state.delivery)))) return 'merge outcome is uncertain; run wf deliver to reconcile it before repair or follow-up';
	if (state?.step !== 'merged' && !state?.delivery) return null;
	if (command === 'step' && flags[0] === 'merged' && state?.delivery) return null;
	// Posting may still need a person's answer. Only an agreement revision would reopen the round.
	if (command === 'decide' && !flags.includes('--revise')) return null;
	if (!['step', 'brief', 'check', 'agree', 'review', 'decide'].includes(command)) return null;
	return `this round is already delivered; ${followupRoundLine(state)}`;
}

/** Changed product blocks posting; missing historical binding blocks only automatic cleanup. */
export type MergedImplementationGap = { readonly kind: 'changed' | 'unbound' | 'corrections'; readonly reason: string };

/** Unknown old evidence may still post its saved note, but neither gap permits automatic cleanup. */
export function mergedImplementationGap(toplevel: string, state: State): MergedImplementationGap | null {
	if (state.merge_attempt) return { kind: 'unbound', reason: 'the recorded merge outcome is uncertain; run wf deliver to reconcile it before cleanup' };
	if (state.step !== 'merged' && !state.delivery) return null;
	const instructions = outstandingCorrections(state);
	if (instructions.length) return { kind: 'corrections', reason: `unresolved post-delivery instructions ${instructions.map((c) => c.id).join(', ')} must reach a fresh follow-up before cleanup; ${followupRoundLine(state)}` };
	if (!state.folder) return { kind: 'unbound', reason: 'the delivered round has no folder to identify its implementation' };
	const roundFolder = state.folder;
	try {
		let delivered = state.delivery?.contentSha ?? null;
		if (!delivered) {
			// Pre-receipt rounds already have T2's approved worktree tree. Project it to product scope:
			// the paperwork commit at delivery may move HEAD, but cannot change the approved product.
			const review = approvalBinding(readFileSync(join(toplevel, state.folder, 'REVIEW.md'), 'utf8'));
			const content = review.contentSha;
			if (review.verdict !== 'approved' || content === null || !/^tree:[a-f0-9]{40}$/.test(content)) return { kind: 'unbound', reason: 'the delivered round has no delivery receipt or bound T2 approval; restore its original bound evidence, or use WF_FORCE_REAP=1 only to intentionally discard the worktree and local branch' };
			delivered = commitContentSha(toplevel, content.slice('tree:'.length), state.folder, null, 'row');
		}
		const committed = headContentSha(toplevel, state.folder, null, 'row');
		const working = worktreeContentSha(toplevel, state.folder, null, 'row');
		// Worktree hashing stages the working bytes in a throwaway index; it cannot see an index-only
		// product edit hidden by a restored working file. Keep that pending commit visible too.
		const folder = state.folder.replace(/\\/g, '/').replace(/\/?$/, '/');
		const staged = execFileSync('git', ['-C', toplevel, 'diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0')
			.filter((file) => file && !file.startsWith(folder) && !approvalPaperworkExcluded(file, roundFolder, null));
		if (staged.length || committed !== delivered || working !== delivered) return { kind: 'changed', reason: `product changes exist after delivery${state.delivery ? ` (${state.delivery.url}, ${state.delivery.head.slice(0, 12)})` : ''}; ${followupRoundLine(state)}` };
		return null;
	} catch (error) {
		return { kind: 'unbound', reason: `the delivered implementation could not be established: ${error instanceof Error ? error.message : String(error)} — restore the original bound evidence, or use WF_FORCE_REAP=1 only to intentionally discard the worktree and local branch; ${followupRoundLine(state)}` };
	}
}
