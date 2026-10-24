import { createHash } from 'node:crypto';
import type { State } from '../../src/round/state.ts';

/** A tracker note section retains notification separately from status completion. */
export type Section = { key: string; posted: boolean; text: string };

/** Read tracker note sections without HTML instructions; legacy (posted) marks mean notification only. */
export function sectionsOf(note: string): Section[] {
	const parts = note.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split(/^## /m).slice(1);
	return parts.map((p) => {
		const [head, ...rest] = p.split('\n');
		const [key, ...tail] = head.trim().split(/\s+/);
		return { key, posted: tail.join(' ').includes('(posted)'), text: rest.join('\n').trim() };
	});
}

/** Match post completion only to the same confirmed PR, head and product. */
export const sameDelivery = (a: State['delivery'], b: State['delivery']): boolean => a !== undefined && b !== undefined && a.url === b.url && a.head === b.head && a.contentSha === b.contentSha;
/** Hash the exact notified section content, excluding its notification heading marker. */
export const sectionSha = (s: Section): string => createHash('sha256').update(JSON.stringify([s.key, s.text])).digest('hex');
/** Require the exact delivery URL, not a prefix matching another PR number. */
export const sectionHasDelivery = (s: Section, url: string): boolean => (s.text.match(/https:\/\/github\.com\/[^/\s)]+\/[^/\s)]+\/pull\/\d+/g) ?? []).some((found: string) => found === url);
/** Select sections without a content-bound tracker completion acknowledgement. */
export const pendingCompletion = (state: State | null, note: string): Section[] => sectionsOf(note).filter((s) => !sameDelivery(state?.post_completion?.delivery, state?.delivery) || !state?.post_completion?.sections.some((p) => p.key === s.key && p.sha === sectionSha(s)));

/** Report unfinished tracker completion without network work; notification alone is never a receipt. */
export function trackerCompletionGap(state: State | null, note: string | null): string | null {
	if (state?.step !== 'merged' && !state?.delivery) return null;
	const sections = sectionsOf(note ?? '');
	const keys = [...new Set([...(state?.ids ?? (state?.id ? [state.id] : [])), ...sections.map((s) => s.key)])];
	if (!keys.length) return null;
	if (!note || !sections.length || new Set(sections.map((s) => s.key)).size !== sections.length || keys.some((key) => !sections.some((s) => s.key === key))) return 'tracker completion unknown: saved note or required ticket section missing; restore the note and run wf post';
	if (!state?.delivery || state.step !== 'merged') return 'tracker completion pending: run wf deliver to reconcile the confirmed delivery first';
	const delivery = state.delivery;
	const unfinished = new Set(pendingCompletion(state, note).map((s) => s.key));
	const pending = sections.filter((s) => !s.posted || !sectionHasDelivery(s, delivery.url) || unfinished.has(s.key));
	return pending.length ? `tracker completion pending for ${pending.map((s) => s.key).join(', ')}; run wf post` : null;
}

