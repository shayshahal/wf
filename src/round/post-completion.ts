import { deliveryReceiptGap } from './delivered-round.ts';
import type { DeliveryReceipt } from './delivered-round.ts';

/** Tracker completion is bound to a confirmed delivery and the exact notified section content. */
export type PostCompletion = {
	readonly delivery: DeliveryReceipt;
	readonly sections: readonly { readonly key: string; readonly sha: string }[];
};

/** Reject corrupt post completion authority; absence is handled separately by the state reader. */
export function postCompletionGap(value: unknown): string | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value) || !('delivery' in value) || !('sections' in value)) return 'invalid post completion receipt';
	const deliveryGap = deliveryReceiptGap(value.delivery);
	if (deliveryGap) return `invalid post completion ${deliveryGap}`;
	if (!Array.isArray(value.sections) || value.sections.length === 0) return 'invalid post completion sections';
	const keys = new Set<string>();
	for (const section of value.sections) {
		if (typeof section !== 'object' || section === null || !('key' in section) || typeof section.key !== 'string' || !section.key.trim() || !('sha' in section) || typeof section.sha !== 'string' || !/^[a-f0-9]{64}$/.test(section.sha) || keys.has(section.key)) return 'invalid post completion section';
		keys.add(section.key);
	}
	return null;
}
