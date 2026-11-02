// approval-carry.selfcheck.ts — node approval-carry.selfcheck.ts → exit 0 when green.
// The pure carry rules: what a rebase with an identical patch may carry, and that nothing else is
// accepted (#106: exactly the approved patch is shipped).
import { approvalCarryGap, approvedIdentity, carriedIdentity, nextCarry } from './approval-carry.ts';
import type { ApprovalCarry } from './approval-carry.ts';
import { approvalContentGap } from './review-format.ts';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const t = (c: string) => `tree:${c.repeat(40)}`;
const bound = { contentSha: t('a'), headSha: t('b') };
const carry: ApprovalCarry = { from: { worktree: t('a'), head: t('b') }, to: { worktree: t('c'), head: t('c') }, onto: 'd'.repeat(40), rebased_from: '1'.repeat(40), patch_id: 'e'.repeat(40) };

// Acceptance.
check('the binding itself is approved, carry or not', approvedIdentity(bound, null, { worktree: t('a'), head: t('b') }) && approvedIdentity(bound, carry, { worktree: t('a'), head: t('a') }));
check('the carried identity is approved', approvedIdentity(bound, carry, { worktree: t('c'), head: t('c') }));
check('…not without the carry', !approvedIdentity(bound, null, { worktree: t('c'), head: t('c') }));
check('a carry from another binding (T2 re-approved since) covers nothing', !approvedIdentity({ contentSha: t('f'), headSha: t('f') }, carry, { worktree: t('c'), head: t('c') }) && carriedIdentity({ contentSha: t('f'), headSha: t('f') }, carry) === null);
check('a carry from the same worktree but another HEAD covers nothing', carriedIdentity({ contentSha: t('a'), headSha: t('9') }, carry) === null);
check('an unbound REVIEW.md accepts nothing, even a matching carry', !approvedIdentity({ contentSha: null, headSha: null }, carry, { worktree: t('c'), head: t('c') }));
check('a change after the carry is not approved', !approvedIdentity(bound, carry, { worktree: t('9'), head: t('c') }) && !approvedIdentity(bound, carry, { worktree: t('c'), head: t('9') }));

// approvalContentGap (the shared T2 gate) through the carry.
const review = `content-sha: ${t('a')}\nhead-sha: ${t('b')}\n\nverdict: approved\n`;
check('approvalContentGap accepts a carried identity', approvalContentGap(review, { worktree: t('c'), head: t('c') }, carry) === null);
check('…and refuses it without the carry, as before', /working tree changed after T2 approved/.test(approvalContentGap(review, { worktree: t('c'), head: t('c') }) ?? ''));
check('…and still refuses an unbound review with a carry', /no content-sha\/head-sha/.test(approvalContentGap('verdict: approved\n', { worktree: t('c'), head: t('c') }, carry) ?? ''));

// Recording.
const before = { worktree: t('a'), head: t('a') };
const after = { worktree: t('c'), head: t('c') };
const first = nextCarry({ bound, previous: null, before, after, onto: 'd'.repeat(40), rebasedFrom: '1'.repeat(40), oldPatch: 'e'.repeat(40), newPatch: 'e'.repeat(40) });
check('equal patch ids carry from the binding', first.kind === 'carry' && first.carry.from.worktree === t('a') && first.carry.from.head === t('b') && first.carry.to === after, JSON.stringify(first));
const changed = nextCarry({ bound, previous: null, before, after, onto: 'd'.repeat(40), rebasedFrom: '1'.repeat(40), oldPatch: 'e'.repeat(40), newPatch: 'f'.repeat(40) });
check('different patch ids refuse, naming both', changed.kind === 'refused' && /changed the patch/.test(changed.why) && changed.why.includes('eeeeeeeeeeee') && changed.why.includes('ffffffffffff'), JSON.stringify(changed));
check('an empty patch carries nothing', nextCarry({ bound, previous: null, before, after, onto: 'd'.repeat(40), rebasedFrom: '1'.repeat(40), oldPatch: '', newPatch: '' }).kind === 'refused');
check('a rebase from an unapproved identity carries nothing', nextCarry({ bound, previous: null, before: { worktree: t('9'), head: t('9') }, after, onto: 'd'.repeat(40), rebasedFrom: '1'.repeat(40), oldPatch: 'e'.repeat(40), newPatch: 'e'.repeat(40) }).kind === 'refused');
// A second rebase starts from the first carry's `to` and keeps the binding as `from`: chainable.
const again = nextCarry({ bound, previous: carry, before: after, after: { worktree: t('7'), head: t('7') }, onto: '8'.repeat(40), rebasedFrom: '2'.repeat(40), oldPatch: 'e'.repeat(40), newPatch: 'e'.repeat(40) });
check('a repeated rebase chains: from stays the binding, to moves', again.kind === 'carry' && again.carry.from.head === t('b') && again.carry.to.worktree === t('7') && approvedIdentity(bound, again.carry, { worktree: t('7'), head: t('7') }), JSON.stringify(again));

// Persisted shape.
check('a well-formed carry reads', approvalCarryGap(carry) === null);
check('a malformed carry is refused', approvalCarryGap({ ...carry, onto: 'main' }) !== null && approvalCarryGap({ ...carry, to: { worktree: 'x' } }) !== null && approvalCarryGap([]) !== null && approvalCarryGap({ ...carry, patch_id: 3 }) !== null && approvalCarryGap({ ...carry, rebased_from: undefined }) !== null);

process.exitCode = failures ? 1 : 0;
