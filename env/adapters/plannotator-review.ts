// Code review uses the shared data dir: config and managed analysis engines belong to the person.
// #242: an archive time window cannot identify the submitting session or its displayed snapshot.
import { spawnSync } from 'node:child_process';
import type { DiffReviewResult, ReviewUI } from '../../src/seams.ts';
import { plannotatorBin } from './plannotator.ts';

/** Native sessions open the exact repository-backed comparison and retain wf's pending identity. */
export const plannotatorReviewGuidance = [
  'Plannotator T2: use the session plannotator review tool with the exact worktree, record base and gate: true. wf has not opened it.',
  'The required diff type is merge-base (committed base...HEAD), not the default since-base view. Discover the tool schema; pass diff-type if supported. If the tool cannot select it, use the CLI for this unsupported flag: plannotator review <worktree> --git --base <record-base> --diff-type merge-base --gate --json. Do not open both.',
  'Use Semantic changes for changed entities, Call flow Paths/Raw for inferred call paths, and the text diff plus assessment/proof for correctness. Settings → Analysis owns both toggles. Call flow is opt-in consent to install its managed runtime/language packs; do not enable or install it silently.',
  'Call flow is syntax-based, not a runtime trace, type resolution or verification. Keep authored error landings and NOT MEASURED evidence. Disabled/unavailable analysis does not prevent ordinary review.',
  'The CLI decision has no submitted comparison/snapshot identity. Its shared archive is not session-correlated. wf retains this feedback but leaves the verdict pending. Verify the displayed comparison and evidence with the person and obtain their ruling on the prepared content/head identities; otherwise leave it pending. An Inbox guide is not approval.',
  'End the turn after opening a native review and wait for its feedback. Retain the prepared identities; a tool result alone does not establish which implementation the person approved.',
].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const errorResult = (message: string): DiffReviewResult => ({ kind: 'error', message: `Plannotator review: ${message}` });

/** Create the CLI adapter; feedback is not approval evidence without a bound submitted snapshot. */
export function createPlannotatorReview(command: () => { readonly file: string; readonly args: readonly string[] } | null): NonNullable<ReviewUI['reviewDiff']> {
  return ({ worktree, base }) => {
    const bin = command();
    if (!bin) return errorResult('binary unavailable; no verdict recorded');
    const result = spawnSync(bin.file, [...bin.args, 'review', worktree, '--git', '--base', base, '--diff-type', 'merge-base', '--gate', '--json'], {
      cwd: worktree, env: { ...process.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) return errorResult(`CLI failed (${result.error?.message ?? result.signal ?? result.status}); no verdict recorded`);
    let output: unknown;
    try { output = JSON.parse(result.stdout); } catch { return errorResult('invalid JSON decision; no verdict recorded'); }
    if (!isRecord(output) || typeof output.message !== 'string') return errorResult('invalid decision record; no verdict recorded');
    if (output.decision === 'dismissed') return { kind: 'dismissed' };
    if (output.decision !== 'approved' && output.decision !== 'annotated') return errorResult('unknown decision; no verdict recorded');
    // 0.28.45's CLI stdout is the only session-owned response. It contains the comments, but neither
    // the submitted base/mode nor immutable snapshot. Do not borrow those from another archive line.
    return { kind: 'feedback', decision: output.decision, message: output.message };
  };
}

/** Run code review without overriding the person's analysis settings or installing runtimes. */
export const reviewDiff: NonNullable<ReviewUI['reviewDiff']> = createPlannotatorReview(() => {
  const file = plannotatorBin();
  return file ? { file, args: [] } : null;
});
