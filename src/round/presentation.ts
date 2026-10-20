// SHOW-ME.md owns the rules; JX-1433 (2026-10-19) received only its path and presented prose.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { section } from './agreement.ts';

/** Inline the canonical decision-sheet rules before ticket context, without copying their wording. */
export function decisionSheetGuidance(): string {
	const rules = section(readFileSync(join(WF_ROOT, 'process', 'SHOW-ME.md'), 'utf8'), 'Read less')?.trim();
	if (!rules) throw new Error('wf presentation: SHOW-ME.md is missing its Read less section');
	return `## Show the person\n\n${rules}\n`;
}
