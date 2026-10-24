// Corrections are instructions, not review verdicts. #150 (JX-1392, 2026-10-14): editing an
// approved verdict to deliver a new instruction lost both its provenance and approval history.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approvalIdentity, trackerNotePath, worktreeContentSha } from '../gates/content-identity.ts';
import { approvalContentGap, readVerdict, reviewScopeBinding } from '../gates/review-format.ts';
import { parseArgs } from './ask.ts';
import { followupRoundLine } from './delivered-round.ts';
import { stepHistory } from './friction.ts';
import { harnessSession } from './session.ts';
import { readState, toplevelOf, writeState } from './state.ts';
import type { State } from './state.ts';

/** The receiving agent attributes a source; this is provenance, not source authentication. */
export type CorrectionInput = {
	readonly kind: 'human' | 'system'; readonly author: string; readonly source: string;
	readonly relay: string | null; readonly text: string; readonly scope: string; readonly reason: string;
};
/** A round correction ID is derived from its stable source and checked again on state admission. */
export type RoundCorrectionId = string & { readonly __roundCorrectionId: unique symbol };
/** A correction is unresolved until explicitly addressed or replaced, never merely dispatched. */
export type CorrectionOutcome =
	| { readonly kind: 'pending'; readonly resumed?: { readonly note: string; readonly at: string } }
	| { readonly kind: 'addressed'; readonly note: string; readonly at: string; readonly contentSha: string }
	| { readonly kind: 'blocked'; readonly note: string; readonly owner: string; readonly at: string }
	| { readonly kind: 'superseded'; readonly by: RoundCorrectionId; readonly at: string };
/** Immutable source words and attribution with a separately recorded disposition. */
export type RoundCorrection = CorrectionInput & { readonly id: RoundCorrectionId; readonly at: string; readonly outcome: CorrectionOutcome; readonly history?: readonly CorrectionOutcome[] };
/** Expected admission/disposition failures leave the original state intact. */
export type CorrectionResult =
	| { readonly kind: 'recorded' | 'duplicate'; readonly correction: RoundCorrection }
	| { readonly kind: 'refused'; readonly reason: string };

const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const treeSha = (v: unknown): v is string => typeof v === 'string' && /^tree:[a-f0-9]{40}$/.test(v);
// The constructor owns the only assertion: these bytes are derived here, not trusted caller IDs.
const correctionId = (source: string): RoundCorrectionId => `c-${createHash('sha256').update(source).digest('hex').slice(0, 20)}` as RoundCorrectionId;

function correctionOutcomeGap(o: unknown): string | null {
	if (!isRecord(o)) return 'invalid correction outcome';
	switch (o.kind) {
		case 'pending': return o.resumed !== undefined && (!isRecord(o.resumed) || !nonempty(o.resumed.note) || !timestamp(o.resumed.at)) ? 'invalid correction resumption' : null;
		case 'addressed': return !nonempty(o.note) || !timestamp(o.at) || !treeSha(o.contentSha) ? 'invalid addressed correction' : null;
		case 'blocked': return !nonempty(o.note) || !nonempty(o.owner) || !timestamp(o.at) ? 'invalid blocked correction' : null;
		case 'superseded': return !nonempty(o.by) || !timestamp(o.at) ? 'invalid superseded correction' : null;
		default: return 'unknown correction outcome';
	}
}

/** Check stored correction authority before a corrupt or hybrid record can drop an obligation. */
export function correctionStateGap(value: unknown): string | null {
	if (!Array.isArray(value)) return 'corrections is not an array';
	const sources = new Set<string>();
	const ids = new Set<string>();
	const replacements = new Map<string, string>();
	for (const item of value) {
		if (!isRecord(item) || (item.kind !== 'human' && item.kind !== 'system') || !nonempty(item.author) || !nonempty(item.source) || !nonempty(item.text) || !nonempty(item.scope) || !nonempty(item.reason) || !(item.relay === null || nonempty(item.relay)) || !timestamp(item.at) || !nonempty(item.id) || item.id !== correctionId(item.source)) return 'invalid correction source or identity';
		if (sources.has(item.source) || ids.has(item.id)) return 'duplicate correction identity';
		sources.add(item.source); ids.add(item.id);
		const o = item.outcome;
		const outcomeGap = correctionOutcomeGap(o);
		if (outcomeGap) return outcomeGap;
		if (isRecord(o) && o.kind === 'superseded' && nonempty(o.by)) {
			if (o.by === item.id) return 'invalid superseded correction';
			replacements.set(item.id, o.by);
		}
		if (item.history !== undefined && (!Array.isArray(item.history) || item.history.some((previous: unknown) => correctionOutcomeGap(previous) !== null))) return 'invalid correction history';
	}
	for (const replacement of replacements.values()) if (!ids.has(replacement)) return 'superseded correction has no replacement';
	// Validate all references before walking any chain: a hybrid A → B → missing must fail as
	// corrupt authority, not throw midway and be mistaken for an unavailable round.
	for (const id of ids) {
		const visited = new Set<string>();
		let current: string | undefined = id;
		while (current !== undefined) {
			if (visited.has(current)) return 'cyclic correction supersession';
			visited.add(current);
			current = replacements.get(current);
		}
	}
	return null;
}

/** Pending and blocked instructions both forbid delivery; history alone does not. */
export function outstandingCorrections(state: Pick<State, 'corrections'> | null): RoundCorrection[] {
	return (state?.corrections ?? []).filter((c) => c.outcome.kind === 'pending' || c.outcome.kind === 'blocked');
}
/** Fingerprint the consumed instructions so an old handoff cannot overwrite a newer admission. */
export function correctionStateSha(state: Pick<State, 'corrections'> | null): string {
	return createHash('sha256').update(JSON.stringify(state?.corrections ?? [])).digest('hex');
}
/** An unconfirmed published candidate: repair needs an observed OPEN result, never guessed absence. */
export function publishedRepairGap(state: Pick<State, 'pr_handoff' | 'pr_repair' | 'delivery'> | null): string | null {
	if (!state?.pr_handoff || state.delivery) return null;
	const observed = state.pr_repair;
	return observed?.url === state.pr_handoff.url && observed.head === state.pr_handoff.head
		? null : 'published PR outcome needs reconciliation before correction repair; instruction retained — run wf deliver, then wf next';
}

/** The same fence, for a round that carries an outstanding instruction (repair or disposition). */
export function publishedCorrectionGate(state: Pick<State, 'pr_handoff' | 'pr_repair' | 'corrections' | 'delivery'> | null): string | null {
	return outstandingCorrections(state).length ? publishedRepairGap(state) : null;
}

/** State-only instructions remain delivery blockers even when reviewed file bytes are unchanged. */
export function correctionGate(state: Pick<State, 'corrections'> | null): string | null {
	const pending = outstandingCorrections(state);
	return pending.length ? `unresolved corrections: ${pending.map((c) => `${c.id} (${c.outcome.kind}): ${c.text}`).join(' | ')} — run wf next; transport or dispatch is not resolution` : null;
}
/** Render a correction's actual disposition, never an inferred engineering or approval verdict. */
export function formatCorrectionOutcome(outcome: CorrectionOutcome): string {
	switch (outcome.kind) {
		case 'pending': return `pending — not yet addressed${outcome.resumed ? `; blocker cleared at ${outcome.resumed.at}: ${outcome.resumed.note}` : ''}`;
		case 'addressed': return `addressed at ${outcome.at} on ${outcome.contentSha}: ${outcome.note}`;
		case 'blocked': return `blocked at ${outcome.at} — owner: ${outcome.owner}; ${outcome.note}`;
		case 'superseded': return `superseded at ${outcome.at} by ${outcome.by}`;
	}
}

/** One verbatim projection for builder, assessor and inspection; explicit replacements are history. */
export function correctionContext(state: Pick<State, 'corrections'> | null): string {
	const current = (state?.corrections ?? []).filter((c) => c.outcome.kind !== 'superseded');
	if (!current.length) return '';
	return `## Recorded corrections\n\n${current.map((c) => {
		const o = c.outcome;
		const disposition = formatCorrectionOutcome(o);
		const history = c.history?.length ? `\n\nPrevious dispositions:\n${c.history.map((previous) => `- ${formatCorrectionOutcome(previous)}`).join('\n')}` : '';
		return `### ${c.id} — ${c.kind}; ${o.kind}\n\nAuthor: ${c.author}\nSource: ${c.source}${c.relay ? `\nRelayed by: ${c.relay}` : ''}\nScope: ${c.scope}\nReason: ${c.reason}\n\nInstruction, verbatim:\n${c.text}\n\nDisposition: ${disposition}${history}`;
	}).join('\n\n')}`;
}

// writeState's callback has no abort result. Keep its private expected refusal inside this owner;
// public correction operations return values, and refused writes never replace the state file.
class CorrectionRefused extends Error {}

/** Capture once under the state lock, retaining holds and uncertain/confirmed merge identity. */
export function captureCorrection(toplevel: string, input: CorrectionInput, supersedes: readonly string[] = []): CorrectionResult {
	if (!['human', 'system'].includes(input.kind) || ![input.author, input.source, input.text, input.scope, input.reason].every(nonempty) || !(input.relay === null || nonempty(input.relay))) return { kind: 'refused', reason: 'wf correct: kind, author, source, instruction, scope and reason are required' };
	const id = correctionId(input.source);
	const at = new Date().toISOString();
	const correction: RoundCorrection = { ...input, id, at, outcome: { kind: 'pending' } };
	let recorded: RoundCorrection = correction;
	let duplicate = false;
	try {
		writeState(toplevel, (current) => {
			if (!current.id || !current.folder) throw new CorrectionRefused('wf correct: no identified round here');
			const previous = current.corrections ?? [];
			const found = previous.find((c) => c.source === input.source || c.id === id);
			if (found) {
				const same = (['kind', 'author', 'source', 'text', 'scope', 'reason'] as const).every((key) => found[key] === input[key]);
				const sameReplacements = previous.filter((c) => c.outcome.kind === 'superseded' && c.outcome.by === id).map((c) => c.id).sort().join(',') === [...supersedes].sort().join(',');
				if (!same || !sameReplacements) throw new CorrectionRefused(`wf correct: source identity ${input.source} was already used for different content; retain its history and provide the new event/revision identity`);
				recorded = found; duplicate = true;
				// An exact redelivery cannot reopen already-addressed work or route a second coordinator.
				throw new CorrectionRefused('duplicate');
			}
			for (const replaced of supersedes) {
				const old = previous.find((c) => c.id === replaced);
				if (!old || old.outcome.kind === 'superseded') throw new CorrectionRefused(`wf correct: ${replaced} is not a current correction to supersede`);
			}
			const corrections = [...previous.map((c): RoundCorrection => supersedes.includes(c.id) ? { ...c, history: [...(c.history ?? []), c.outcome], outcome: { kind: 'superseded', by: id, at } } : c), correction];
			// `current` does not hold the instruction being captured, so the candidate identity alone decides
			// routing here; the captured instruction then needs reconciliation like any other (#190).
			const canRoute = !current.delivery && !current.merge_attempt && !publishedRepairGap(current) && ['build', 'assess', 'review', 'pr'].includes(current.step ?? '');
			return {
				corrections,
				...(canRoute ? { step: 'build', since: at, waiting_on: current.questions?.[0]?.to ?? null,
					history: stepHistory(current.history, 'build', at), build_reason: { kind: 'work', text: `address recorded correction ${id}: ${input.text}` },
					correction_return_to: current.correction_return_to ?? (current.step === 'pr' ? 'pr' : null),
				} : {}),
			};
		});
	} catch (error) {
		if (duplicate && error instanceof CorrectionRefused) return { kind: 'duplicate', correction: recorded };
		if (error instanceof CorrectionRefused) return { kind: 'refused', reason: error.message };
		return { kind: 'refused', reason: `wf correct: could not persist correction: ${error instanceof Error ? error.message : String(error)}` };
	}
	return { kind: 'recorded', correction: recorded };
}

/** Address with evidence or name a durable blocker; neither disposition manufactures approval. */
export function disposeCorrection(toplevel: string, id: string, outcome: { kind: 'addressed'; note: string } | { kind: 'blocked'; note: string; owner: string } | { kind: 'pending'; note: string }): CorrectionResult {
	if (!nonempty(outcome.note) || (outcome.kind === 'blocked' && !nonempty(outcome.owner))) return { kind: 'refused', reason: 'wf correct: an explanation/evidence reference and a blocker owner when blocked are required' };
	let recorded: RoundCorrection | null = null;
	let duplicate = false;
	try {
		writeState(toplevel, (current) => {
			const found = current.corrections?.find((c) => c.id === id);
			if (!found || found.outcome.kind === 'superseded') throw new CorrectionRefused(`wf correct: ${id} is not a current correction`);
			if (current.merge_attempt) throw new CorrectionRefused('wf correct: merge outcome is uncertain; reconcile delivery before disposing of the instruction');
			const published = publishedCorrectionGate(current);
			if (published) throw new CorrectionRefused(`wf correct: ${published}`);
			const at = new Date().toISOString();
			const nextOutcome: CorrectionOutcome = outcome.kind === 'addressed' ? { ...outcome, at, contentSha: worktreeContentSha(toplevel, current.folder ?? null, trackerNotePath(current.folder ?? null), 'row') } : outcome.kind === 'pending' ? { kind: 'pending', resumed: { note: outcome.note, at } } : { ...outcome, at };
			const same = nextOutcome.kind === 'addressed' && found.outcome.kind === 'addressed' ? nextOutcome.note === found.outcome.note && found.outcome.contentSha === nextOutcome.contentSha : nextOutcome.kind === 'blocked' && found.outcome.kind === 'blocked' ? nextOutcome.note === found.outcome.note && nextOutcome.owner === found.outcome.owner : nextOutcome.kind === 'pending' && found.outcome.kind === 'pending' && found.outcome.resumed?.note === nextOutcome.resumed?.note;
			if (same) { recorded = found; duplicate = true; throw new CorrectionRefused('duplicate'); }
			if (outcome.kind === 'pending' && found.outcome.kind !== 'blocked') throw new CorrectionRefused('wf correct: only a blocked correction can be unblocked; source redelivery never reopens addressed work');
			recorded = { ...found, history: [...(found.history ?? []), found.outcome], outcome: nextOutcome };
			const corrections = (current.corrections ?? []).map((c) => c.id === id ? recorded ?? c : c);
			const ready = !outstandingCorrections({ corrections }).length;
			// A transient interruption need not discard unchanged approval. Comparing the full reviewed
			// subject, including evidence/paperwork, still refuses changed subjects under the old verdict.
			let resume = false;
			if (ready && current.step === 'build' && current.correction_return_to === 'pr' && !(current.questions ?? []).length && !current.delivery) {
				let review = '';
				try { review = readFileSync(join(toplevel, current.folder ?? '', 'REVIEW.md'), 'utf8'); } catch (error) {
					if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
					// A missing historical review cannot resume approval, but does not erase an action taken.
				}
				resume = readVerdict(review) === 'approved' && !reviewScopeBinding(review).scope && !approvalContentGap(review, approvalIdentity(toplevel, current.folder ?? null, trackerNotePath(current.folder ?? null)));
			}
			return { corrections, ...(ready ? { correction_return_to: null } : {}), ...(resume ? { step: 'pr', since: at, build_reason: null, history: stepHistory(current.history, 'pr', at) } : {}) };
		});
	} catch (error) {
		if (duplicate && recorded && error instanceof CorrectionRefused) return { kind: 'duplicate', correction: recorded };
		return { kind: 'refused', reason: error instanceof CorrectionRefused ? error.message : `wf correct: could not record disposition: ${error instanceof Error ? error.message : String(error)}` };
	}
	if (!recorded) return { kind: 'refused', reason: 'wf correct: no disposition recorded' };
	return { kind: 'recorded', correction: recorded };
}

/** Agent-facing CLI: the person supplies the instruction normally, not a second correction form. */
export function runCorrect(argv: string[]): void {
	try {
		const args = parseArgs(argv, ['source', 'author', 'scope', 'reason', 'kind', 'relay', 'supersedes', 'address', 'block', 'unblock', 'note', 'owner']);
		const top = toplevelOf();
		const state = readState(top);
		if (!state?.id || !state.folder) { console.error('wf correct: no identified round here'); process.exitCode = 2; return; }
		let result: CorrectionResult;
		if (args.address || args.block || args.unblock) {
			if ([args.address, args.block, args.unblock].filter(Boolean).length !== 1 || args.positionals.length || args.source || args.author || args.scope || args.reason || args.kind || args.relay || args.supersedes || !args.note || (!args.block && args.owner)) throw new Error('use --address <id> --note <what/evidence>, --block <id> --owner <who> --note <why>, or --unblock <id> --note <what cleared it>');
			result = args.address ? disposeCorrection(top, args.address, { kind: 'addressed', note: args.note }) : args.unblock ? disposeCorrection(top, args.unblock, { kind: 'pending', note: args.note }) : disposeCorrection(top, args.block ?? '', { kind: 'blocked', note: args.note, owner: args.owner ?? '' });
		} else {
			if (args.note || args.owner || !args.source || !args.author || !args.scope || !args.reason || !args.positionals.length || (args.kind && args.kind !== 'human' && args.kind !== 'system')) throw new Error('use --source <message/event reference> --author <original author> --scope <intended scope> --reason <why applicable> "<instruction>"');
			const session = harnessSession();
			result = captureCorrection(top, { kind: args.kind === 'system' ? 'system' : 'human', author: args.author, source: args.source, relay: args.relay ?? (session ? `${session.harness}:${session.id}` : null), text: args.positionals.join(' '), scope: args.scope, reason: args.reason }, args.supersedes ? args.supersedes.split(',') : []);
		}
		if (result.kind === 'refused') { console.error(result.reason); process.exitCode = 2; return; }
		console.log(`wf correct: ${result.kind} ${result.correction.id} (${result.correction.outcome.kind}) — source ${result.correction.source}`);
		const current = readState(top);
		if (publishedCorrectionGate(current)) console.log('wf correct: instruction retained; published PR outcome needs reconciliation before repair. Run wf deliver.');
		else if (current?.merge_attempt) console.log('wf correct: instruction retained; merge outcome needs reconciliation before repair or follow-up. Run wf deliver.');
		else if (current?.delivery || current?.step === 'merged') console.log(`wf correct: delivered work is immutable; retain this instruction for a fresh follow-up. ${followupRoundLine(current)}`);
		else console.log('wf next carries the current instruction; a recorded correction is not approval.');
	} catch (error) {
		console.error(`wf correct: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 2;
	}
}
