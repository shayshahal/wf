// identity.ts — the fixed identity one review is bound to, and the staleness comparison.
// Pure, so the runner, the control client and the process-kill test share one definition of
// "the same review" (issue #116: a result identifies the reviewed diff/agreement; if the
// selected content changes, that result is reported as stale rather than treated as approval).
import { createHash } from 'node:crypto';

/** The part of a review target that does not change once captured: request ID plus content hashes. */
export type ReviewIdentity = {
	requestId: string;
	worktree: string;
	base: string;
	agreementPath: string;
	headSha: string;
	diffHash: string;
	agreementHash: string;
};

/** A captured review target: identity plus the frozen text the reviewer is shown. */
export type ReviewTarget = ReviewIdentity & {
	diffText: string;
	agreementText: string;
	capturedAt: string;
	/** True when the selection exceeded the review budget, so `diffText` is only a prefix. */
	partial: boolean;
};

/** Lowercase hex SHA-256 of `text`; the identity hashes and the request ID use it. */
export function sha256Hex(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

/**
 * Stable across content changes: a new commit or a new diff keeps the same request ID, so a restart
 * finds the existing submission instead of submitting a second review. A caller who wants a fresh
 * review of new content passes a new agreement path (or edits the base), which changes the ID.
 */
export function requestIdFor(worktree: string, base: string, agreementPath: string): string {
	return `review:${sha256Hex([worktree, base, agreementPath].join('\0')).slice(0, 16)}`;
}

/** The identity half of a captured target. */
export function identityOf(target: ReviewTarget): ReviewIdentity {
	return {
		requestId: target.requestId,
		worktree: target.worktree,
		base: target.base,
		agreementPath: target.agreementPath,
		headSha: target.headSha,
		diffHash: target.diffHash,
		agreementHash: target.agreementHash,
	};
}

/**
 * True when the worktree no longer holds the content the review was captured against, or the
 * worktree could not be read at all. A stale result is reported as stale, never as approval.
 */
export function isStale(captured: ReviewIdentity, current: Omit<ReviewIdentity, 'requestId' | 'worktree' | 'base' | 'agreementPath'> | undefined): boolean {
	if (current === undefined) return true;
	return captured.headSha !== current.headSha || captured.diffHash !== current.diffHash || captured.agreementHash !== current.agreementHash;
}
