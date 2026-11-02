// approval-carry.ts — a T2 approval carried across a rebase whose patch is identical (2026-11-02).
// JewelryX PR #662 merged 31 minutes behind a dev that had #657, and dev's svelte-check went red: deliver
// never asked whether the base had moved. It now rebases a stale branch before the push (base-freshness.ts).
// A rebase changes the content identity REVIEW.md binds (content-identity.ts), and JX-1587 paid a fresh
// assessment and T2 for an identical patch. When `git patch-id` proves the rebased patch is the approved
// one, deliver records the carry here, in .wf/state.json (wf metadata, outside the content identity).
//
// `from` is always the REVIEW.md binding the carry started from; a repeated rebase replaces `to` and keeps
// `from`, so the chain is checked link by link when each is recorded and only its two ends are kept. A new
// T2 binding leaves an old carry behind: its `from` no longer matches. A carry never covers a patch change
// (#106): it is written only when the patch ids are equal.
import type { ContentIdentity } from './content-identity.ts';

// `rebased_from` is the commit the rebase started from: a push of it (or of an ancestor) that is still on
// the remote is this round's own, and may be replaced (base-freshness.ts).
export type ApprovalCarry = { from: ContentIdentity; to: ContentIdentity; onto: string; rebased_from: string; patch_id: string };
/** What REVIEW.md's verdict section binds: the worktree and HEAD identities T2 approved. */
export type ApprovalBound = { contentSha: string | null; headSha: string | null };

const tree = /^tree:[a-f0-9]{40}$/;
const identityOk = (v: unknown): v is ContentIdentity =>
	typeof v === 'object' && v !== null && !Array.isArray(v) && 'worktree' in v && typeof v.worktree === 'string' && tree.test(v.worktree) && 'head' in v && typeof v.head === 'string' && tree.test(v.head);

/** Why a persisted `approval_carry` is malformed, or null. */
export function approvalCarryGap(value: unknown): string | null {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'invalid approval_carry';
	if (!('from' in value) || !identityOk(value.from) || !('to' in value) || !identityOk(value.to)) return 'invalid approval_carry identities';
	if (!('onto' in value) || typeof value.onto !== 'string' || !/^[a-f0-9]{40}$/.test(value.onto)) return 'invalid approval_carry onto';
	if (!('rebased_from' in value) || typeof value.rebased_from !== 'string' || !/^[a-f0-9]{40}$/.test(value.rebased_from)) return 'invalid approval_carry rebased_from';
	if (!('patch_id' in value) || typeof value.patch_id !== 'string' || !/^[a-f0-9]{40}$/.test(value.patch_id)) return 'invalid approval_carry patch_id';
	return null;
}

// Pure: whether `now` is the approved identity `approved`. The worktree must be the approved bytes; HEAD
// the approved HEAD or the approved worktree itself — deliver commits the round folder after T2 (#106/#108).
export const identityMatches = (approved: ContentIdentity, now: ContentIdentity): boolean =>
	now.worktree === approved.worktree && (now.head === approved.head || now.head === approved.worktree);

// Pure: the REVIEW.md binding as an identity, or null when it is not bound.
const boundIdentity = (bound: ApprovalBound): ContentIdentity | null =>
	bound.contentSha && bound.headSha ? { worktree: bound.contentSha, head: bound.headSha } : null;

// Pure: the carry's `to` when it starts from exactly this binding, else null.
export function carriedIdentity(bound: ApprovalBound, carry: ApprovalCarry | null | undefined): ContentIdentity | null {
	const origin = boundIdentity(bound);
	if (!origin || !carry) return null;
	return carry.from.worktree === origin.worktree && carry.from.head === origin.head ? carry.to : null;
}

// Pure: whether `now` is the binding's identity, or a carry from it.
export function approvedIdentity(bound: ApprovalBound, carry: ApprovalCarry | null | undefined, now: ContentIdentity): boolean {
	const origin = boundIdentity(bound);
	if (!origin) return false;
	if (identityMatches(origin, now)) return true;
	const carried = carriedIdentity(bound, carry);
	return carried !== null && identityMatches(carried, now);
}

// Pure: the carry to record after a rebase, or why none. `before` is the identity the rebase started
// from, which must itself be approved (the binding or the previous carry's `to`); equal patch ids are the
// only proof the rebased patch is the approved one.
export function nextCarry(o: { bound: ApprovalBound; previous: ApprovalCarry | null | undefined; before: ContentIdentity; after: ContentIdentity; onto: string; rebasedFrom: string; oldPatch: string; newPatch: string }): { kind: 'carry'; carry: ApprovalCarry } | { kind: 'refused'; why: string } {
	const origin = boundIdentity(o.bound);
	if (!origin || !approvedIdentity(o.bound, o.previous, o.before)) return { kind: 'refused', why: 'the branch before the rebase was not the implementation T2 approved' };
	if (!o.oldPatch || o.oldPatch !== o.newPatch) return { kind: 'refused', why: `the rebase changed the patch (patch-id ${o.oldPatch.slice(0, 12) || 'none'} before, ${o.newPatch.slice(0, 12) || 'none'} after)` };
	return { kind: 'carry', carry: { from: origin, to: o.after, onto: o.onto, rebased_from: o.rebasedFrom, patch_id: o.newPatch } };
}
