// base-freshness.ts — deliver never ships a branch behind its base (2026-11-02, JewelryX).
// PR #657 merged into dev at 10:06 with a test importing `CartRequest`. PR #662's branch was cut before
// it; there knip saw CartRequest unused and #662 un-exported it. #662 was pushed at 10:37, 31 minutes
// behind a dev that had #657; its pre-push hook checked only the branch tree (no importer) and passed, it
// merged at 10:38, and dev's svelte-check went red. Nothing checks the merge result (branch protection is
// paywalled, PR CI on demand), so deliver now fetches the base and, when it moved, rebases the branch
// before the push: the pre-push hook then checks the tree that will be merged.
//
// A rebase whose patch is identical (`git patch-id`) keeps T2's approval (approval-carry.ts); any other
// rebase — a conflict, or a moved base that changes the patch's context — is put back and refused, and
// the agent rebases by hand, re-runs the checks and gets a fresh assessment and T2.
import { spawnSync } from 'node:child_process';
import { approvalIdentity } from './content-identity.ts';
import { nextCarry } from './approval-carry.ts';
import type { ApprovalBound, ApprovalCarry } from './approval-carry.ts';

export type Freshness =
	| { kind: 'current'; tip: string; lease: string | null }
	| { kind: 'carried'; tip: string; carry: ApprovalCarry; lease: string; line: string }
	| { kind: 'refused'; why: string };

// A fetch or ls-remote that hangs on the network must not hold the delivery lock forever.
const NETWORK_MS = 120_000;
const git = (toplevel: string, args: string[], input?: string) =>
	spawnSync('git', ['-C', toplevel, ...args], { encoding: 'utf8', input, timeout: args[0] === 'fetch' || args[0] === 'ls-remote' ? NETWORK_MS : undefined, maxBuffer: 1024 * 1024 * 1024 });
const out = (r: ReturnType<typeof git>) => (r.stdout ?? '').trim();
const said = (r: ReturnType<typeof git>) => `${r.stderr ?? ''}${r.stdout ?? ''}${r.error ? r.error.message : ''}`.trim().split('\n').slice(-5).join(' / ');

// Pure: the refusal for a rebase deliver will not carry: what to do by hand, and why it costs a review.
export function rebaseByHand(baseRef: string, tip: string, reason: string): string {
	return `${baseRef} moved to ${tip.slice(0, 12)} since this round branched, and ${reason}; nothing was pushed. Rebase by hand (\`git rebase ${baseRef}\`), resolve, re-run the checks, then \`wf next\`: a changed patch needs a fresh assessment and T2`;
}

// Pure: the one line a carried rebase prints.
export function carriedLine(baseRef: string, carry: ApprovalCarry): string {
	return `wf deliver: rebased onto ${baseRef} ${carry.onto.slice(0, 12)}; the patch is identical (patch-id ${carry.patch_id.slice(0, 12)}), so T2's approval is carried; the pre-push hook re-runs the checks on the rebased tree`;
}

// The patch between two commits, as `git patch-id --verbatim`: whitespace counts (a YAML or Python
// indent is behaviour), `--binary` puts binary bytes in the hash (without it every binary change reads
// "Binary files differ"), and renames/external diff/textconv are off so local config cannot change it.
// Context lines are hashed, so a base that moved the lines around the change gives another id.
function patchId(toplevel: string, from: string, to: string): string | null {
	const diff = git(toplevel, ['diff', '--binary', '--full-index', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color', from, to]);
	if (diff.status !== 0) return null;
	if (!diff.stdout) return '';
	const id = git(toplevel, ['patch-id', '--verbatim'], diff.stdout);
	return id.status === 0 ? out(id).split(/\s+/)[0] ?? '' : null;
}

// The remote branch a plain push cannot fast-forward because an earlier deliver rebased the branch and
// its push was then refused (a pre-push hook failing after the carry, on an open PR): the remote still
// holds the commit that rebase started from, or an ancestor of it — this round's own push. Returned as
// the lease to replace it under; null means push as before, and anything else on the remote is left for
// the push to refuse.
function earlierRebasedPush(toplevel: string, branch: string, previous: ApprovalCarry | null | undefined): string | null {
	if (!previous) return null;
	const remote = git(toplevel, ['ls-remote', 'origin', `refs/heads/${branch}`]);
	const at = remote.status === 0 ? out(remote).split(/\s+/)[0] ?? '' : '';
	if (!at || git(toplevel, ['merge-base', '--is-ancestor', at, 'HEAD']).status === 0) return null;
	return git(toplevel, ['merge-base', '--is-ancestor', at, previous.rebased_from]).status === 0 ? at : null;
}

/**
 * Bring the round's branch onto the fetched tip of its PR base, or say why not. Runs after the
 * round-folder commit, before the push; nothing is pushed here. `bound` is REVIEW.md's binding and
 * `previous` the state's carry, if any. Untracked paperwork (REVIEW.md, the tracker note, .wf/) is never
 * touched: rebase and reset move tracked files only.
 */
export function freshenBase(o: { toplevel: string; baseBranch: string; branch: string; folder: string; notePath: string | null; bound: ApprovalBound; previous: ApprovalCarry | null | undefined }): Freshness {
	const { toplevel } = o;
	const baseRef = `origin/${o.baseBranch}`;
	const fetched = git(toplevel, ['fetch', '-q', 'origin', `+refs/heads/${o.baseBranch}:refs/remotes/${baseRef}`]);
	if (fetched.status !== 0) return { kind: 'refused', why: `could not fetch ${o.baseBranch} from origin (${said(fetched)}), so whether the branch is behind it cannot be proven; nothing was pushed. Fix the remote and run wf deliver again` };
	const tip = out(git(toplevel, ['rev-parse', '--verify', `refs/remotes/${baseRef}^{commit}`]));
	if (!/^[a-f0-9]{40}$/.test(tip)) return { kind: 'refused', why: `${baseRef} does not resolve after the fetch; nothing was pushed` };
	if (git(toplevel, ['merge-base', '--is-ancestor', tip, 'HEAD']).status === 0) return { kind: 'current', tip, lease: earlierRebasedPush(toplevel, o.branch, o.previous) };

	const before = out(git(toplevel, ['rev-parse', 'HEAD']));
	const old = git(toplevel, ['merge-base', tip, 'HEAD']);
	if (old.status !== 0) return { kind: 'refused', why: rebaseByHand(baseRef, tip, 'the branch shares no history with it') };
	// The push after a rebase replaces the remote branch. Only this round's own earlier push may be
	// replaced (an interrupted delivery, or the open PR being repaired): a remote tip that is not in the
	// pre-rebase HEAD, nor in the commit an earlier carried rebase started from, is somebody else's
	// commit, and a force would drop it.
	const remote = git(toplevel, ['ls-remote', 'origin', `refs/heads/${o.branch}`]);
	if (remote.status !== 0) return { kind: 'refused', why: `could not ask origin for ${o.branch} (${said(remote)}); nothing was pushed` };
	const lease = out(remote).split(/\s+/)[0] ?? '';
	const ours = (commit: string) => git(toplevel, ['merge-base', '--is-ancestor', lease, commit]).status === 0;
	if (lease && !ours(before) && !(o.previous && ours(o.previous.rebased_from))) return { kind: 'refused', why: `origin's ${o.branch} is at ${lease.slice(0, 12)}, which this worktree does not have; fetch and integrate it by hand. Nothing was pushed` };
	const oldPatch = patchId(toplevel, out(old), before);
	if (oldPatch === null) return { kind: 'refused', why: rebaseByHand(baseRef, tip, 'the branch\'s patch could not be read') };
	let identityBefore;
	try { identityBefore = approvalIdentity(toplevel, o.folder, o.notePath); }
	catch (error) { return { kind: 'refused', why: `could not read the implementation before the rebase (${error instanceof Error ? error.message : String(error)}); nothing was pushed` }; }

	const rebased = git(toplevel, ['rebase', '-q', '--no-autostash', tip]);
	if (rebased.status !== 0) {
		// --abort after a rebase that never started (a dirty tree) says "no rebase in progress": the
		// HEAD check below is what proves the branch is back.
		git(toplevel, ['rebase', '--abort']);
		const back = out(git(toplevel, ['rev-parse', 'HEAD'])) === before;
		return { kind: 'refused', why: rebaseByHand(baseRef, tip, `the rebase did not apply cleanly (${said(rebased)})${back ? '' : `; HEAD is not back at ${before.slice(0, 12)}, check it by hand`}`) };
	}
	const restore = (reason: string): Freshness => {
		const reset = git(toplevel, ['reset', '-q', '--hard', before]);
		return { kind: 'refused', why: rebaseByHand(baseRef, tip, `${reason}${reset.status === 0 ? '' : `; restoring ${before.slice(0, 12)} failed (${said(reset)}), run \`git reset --hard ${before}\``}`) };
	};
	const newPatch = patchId(toplevel, tip, 'HEAD');
	if (newPatch === null) return restore('the rebased patch could not be read');
	let identityAfter;
	try { identityAfter = approvalIdentity(toplevel, o.folder, o.notePath); }
	catch (error) { return restore(`the rebased implementation could not be read (${error instanceof Error ? error.message : String(error)})`); }
	const decision = nextCarry({ bound: o.bound, previous: o.previous, before: identityBefore, after: identityAfter, onto: tip, rebasedFrom: before, oldPatch, newPatch });
	if (decision.kind === 'refused') return restore(decision.why);
	return { kind: 'carried', tip, carry: decision.carry, lease, line: carriedLine(baseRef, decision.carry) };
}
