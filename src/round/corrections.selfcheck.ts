// #150: real CLI processes over disposable repositories prove correction authority survives a
// fresh worker without rewriting the person's approval. No external transport is claimed here.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { WF_ROOT } from '../paths.ts';
import { approvalIdentity } from '../gates/content-identity.ts';
import { agreementSha } from './agreement.ts';
import { correctionContext, correctionGate, correctionStateGap, outstandingCorrections, publishedCorrectionGate, publishedRepairGap } from './corrections.ts';
import type { RoundCorrectionId } from './corrections.ts';
import { readState, WF_STATE_VERSION, writeState } from './state.ts';
import type { State } from './state.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') => {
 console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
 if (!cond) failures++;
};
// #190: the published-candidate fences, as pure decisions. Repair needs an OPEN observation for the
// exact candidate; an observation for any other head or URL is not one.
const published = { url: 'https://github.com/o/r/pull/7', head: 'a'.repeat(40), contentSha: `tree:${'b'.repeat(40)}` } as const;
// SAFETY: the writer brands the id from the source (correctionId); these pure fences read only
// outcome.kind, so the literal stands in for a record the constructor would have produced.
const pending = [{ kind: 'human', author: 'Shay', source: 'chat:1', relay: null, text: 'keep it', scope: 'round', reason: 'explicit', id: 'c-1' as RoundCorrectionId, at: '2026-10-24T00:00:00Z', outcome: { kind: 'pending' } }] as const;
const observed = (head: string = published.head, url: string = published.url) => ({ url, head });
check('#190 no published handoff needs no reconciliation', publishedRepairGap({ pr_handoff: undefined, pr_repair: null, delivery: undefined }) === null && publishedCorrectionGate({ pr_handoff: undefined, pr_repair: null, corrections: [...pending], delivery: undefined }) === null);
check('#190 a delivered round needs no published reconciliation', publishedRepairGap({ pr_handoff: published, pr_repair: null, delivery: { url: published.url, head: published.head, contentSha: published.contentSha } }) === null);
check('#190 a published candidate without an observation is fenced', /reconciliation/.test(publishedRepairGap({ pr_handoff: published, pr_repair: null, delivery: undefined }) ?? '') && /run wf deliver/.test(publishedRepairGap({ pr_handoff: published, pr_repair: null, delivery: undefined }) ?? ''));
check('#190 an observation of this exact candidate clears the fence', publishedRepairGap({ pr_handoff: published, pr_repair: observed(), delivery: undefined }) === null);
check('#190 an observation of another head or another URL is not this candidate', publishedRepairGap({ pr_handoff: published, pr_repair: observed('c'.repeat(40)), delivery: undefined }) !== null && publishedRepairGap({ pr_handoff: published, pr_repair: observed(published.head, 'https://github.com/o/r/pull/9'), delivery: undefined }) !== null);
check('#190 the correction gate does not fence a round with no outstanding instruction', publishedCorrectionGate({ pr_handoff: published, pr_repair: null, corrections: [], delivery: undefined }) === null && publishedCorrectionGate({ pr_handoff: published, pr_repair: null, corrections: [{ ...pending[0], outcome: { kind: 'addressed', note: 'done', at: '2026-10-24T01:00:00Z', contentSha: published.contentSha } }], delivery: undefined }) === null);
check('#190 the correction gate fences exactly the unconfirmed candidate', publishedCorrectionGate({ pr_handoff: published, pr_repair: null, corrections: [...pending], delivery: undefined }) !== null && publishedCorrectionGate({ pr_handoff: published, pr_repair: observed(), corrections: [...pending], delivery: undefined }) === null);

const folder = 'bug-reports/r';
const ticket = '# X-150\n\n## Intent\n- retain the scroll position\n\n## Notes\n- **T2 walk.** none — command behavior only\n';
const agreement = `# X-150 — agreement
Class: B
## Observed
- product.txt retains a position
## Agreed
- Behavior: retain the scroll position. Excluding: unrelated rendering.
- Choice: retain state (rejected: resetting it).
- Verification: command regression checks.
- **Not asked for.** none — the ticket names the behavior
- **T2 walk.** none — command behavior only
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | position retained | product.txt | command regression |
`;
const instruction = '  Keep the exact scroll offset.\nDo not reset it — גם בעברית.  ';
const source = 'chat:correction-session/message-7';
const admission = (text = instruction, event = source) => ['correct', '--source', event, '--author', 'Shay', '--relay', 'pi:receiving-agent', '--scope', 'scroll restoration', '--reason', 'within the approved behavior', text];
function fixture(klass: 'A' | 'B' = 'A') {
 const dir = mkdtempSync(join(tmpdir(), 'wf-corrections-'));
 const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
 git('init', '-q', '-b', 'main');
 git('config', 'core.autocrlf', 'false');
 writeFileSync(join(dir, 'product.txt'), 'position\n');
 git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/corrections');
 mkdirSync(join(dir, folder), { recursive: true });
 writeFileSync(join(dir, folder, 'TICKET.md'), ticket);
 if (klass === 'B') writeFileSync(join(dir, folder, 'AGREEMENT.md'), agreement);
 writeState(dir, () => ({ wf_version: WF_STATE_VERSION, round: 'fix/corrections', id: 'X-150', folder, base: 'main', step: 'pr', class: klass }));
 if (klass === 'B') writeFileSync(join(dir, folder, 'AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(dir, klass, folder)}\nverdict: approved\n`);
 const identity = approvalIdentity(dir, folder, null);
 const review = `## 2026-10-17\nobsolete-rejected-marker: reset everything\nverdict: changes-requested\n\n## 2026-10-18\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\nverdict: approved\n`;
 writeFileSync(join(dir, folder, 'REVIEW.md'), review);
 const statePath = join(dir, '.wf/state.json');
 const bytes = () => readFileSync(statePath, 'utf8');
 const cli = (...args: string[]) => {
  const result = wfSync(args, { cwd: dir, env: { ...process.env, WF_FORCE_REAP: '0' } });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
 };
 return { dir, git, cli, bytes, statePath, review, reviewBytes: () => readFileSync(join(dir, folder, 'REVIEW.md'), 'utf8') };
}

{
 const f = fixture();
 try {
  check('approved baseline dispatches delivery', f.cli('next').out.startsWith('deliver:'));
  const captured = f.cli(...admission());
  const first = readState(f.dir)?.corrections?.[0];
  check('human admission preserves verbatim words and source metadata', captured.code === 0 && first?.text === instruction && first.kind === 'human' && first.author === 'Shay' && first.source === source && first.relay === 'pi:receiving-agent' && first.scope === 'scroll restoration' && first.reason === 'within the approved behavior' && first.outcome.kind === 'pending', captured.out);
  check('admission never edits the approved human history', f.reviewBytes() === f.review);
  const next = f.cli('next');
  const brief = f.cli('brief', 'build');
  check('fresh next routes the actual instruction back to build', next.code === 0 && next.out.startsWith('work build') && next.out.includes(instruction), next.out);
  check('actual build brief carries instruction and provenance, not obsolete rejected feedback', brief.code === 0 && brief.out.includes(instruction) && brief.out.includes(source) && brief.out.includes('Shay') && brief.out.includes('pi:receiving-agent') && !brief.out.includes('obsolete-rejected-marker'), brief.out.slice(-2500));
  check('dispatch and reading a brief never resolve a correction', readState(f.dir)?.corrections?.[0]?.outcome.kind === 'pending');
  const inspection = f.cli('status', '--inspect');
  check('inspection exposes the instruction and provenance', inspection.code === 0 && inspection.out.includes(instruction) && inspection.out.includes(source), inspection.out);
  const beforeDuplicate = f.bytes();
  const duplicate = f.cli(...admission());
  check('another CLI process deduplicates without changing any state bytes', duplicate.code === 0 && duplicate.out.includes('duplicate') && f.bytes() === beforeDuplicate, duplicate.out);
  for (const conflicting of [admission('Different instruction'), admission().map((arg) => arg === 'Shay' ? 'Someone else' : arg)]) {
   const before = f.bytes();
   const refused = f.cli(...conflicting);
   check('conflicting source reuse refuses without overwriting authority', refused.code === 2 && refused.out.includes('identity') && f.bytes() === before, refused.out);
  }
  const oldId = first?.id ?? 'missing';
  const staleRedelivery = f.cli(...admission(instruction, source));
  check('an older redelivery keeps its original outcome and identity', staleRedelivery.code === 0 && staleRedelivery.out.includes('duplicate') && readState(f.dir)?.corrections?.length === 1, staleRedelivery.out);
  for (const flags of [['--supersedes', 'missing-id'], ['--supersedes', `${oldId},missing-id`]]) {
   const before = f.bytes();
   const refused = f.cli(...admission('Replacement must be atomic', 'chat:atomic/replacement'), ...flags);
   check('invalid supersession refuses atomically, retaining all original obligations', refused.code === 2 && f.bytes() === before, refused.out);
  }
  const blocked = f.cli('correct', '--block', oldId, '--owner', 'upstream maintainer', '--note', 'Waiting for the scroll API contract');
  const blockedState = readState(f.dir);
  check('a durable blocker retains owner and explanation and still gates delivery', blocked.code === 0 && blockedState?.corrections?.[0]?.outcome.kind === 'blocked' && correctionGate(blockedState)?.includes('blocked') === true && outstandingCorrections(blockedState).length === 1, blocked.out);
  const missingEvidence = f.cli('correct', '--address', oldId);
  check('addressing without evidence/explanation is refused', missingEvidence.code === 2 && readState(f.dir)?.corrections?.[0]?.outcome.kind === 'blocked', missingEvidence.out);
  const replacement = f.cli(...admission('Use the preserved offset after rendering.', 'review:page/message-9'), '--supersedes', oldId);
  const replacedState = readState(f.dir);
  const newer = replacedState?.corrections?.[1];
  const old = replacedState?.corrections?.[0];
  check('explicit supersession retains original history and points at the new identity', replacement.code === 0 && old?.text === instruction && old.outcome.kind === 'superseded' && old.outcome.by === newer?.id && outstandingCorrections(replacedState).length === 1, replacement.out);
  const replacementBrief = f.cli('brief', 'build');
  check('superseded text is history, not a current build assignment', replacementBrief.code === 0 && replacementBrief.out.includes('Use the preserved offset after rendering.') && !correctionContext(replacedState).includes(instruction), replacementBrief.out.slice(-1500));
  const addressed = f.cli('correct', '--address', newer?.id ?? 'missing', '--note', 'Verified unchanged subject against command regression');
  const addressedState = readState(f.dir);
  const outcome = addressedState?.corrections?.[1]?.outcome;
  check('explicit addressed disposition persists evidence and the measured content identity', addressed.code === 0 && outcome?.kind === 'addressed' && outcome.note === 'Verified unchanged subject against command regression' && outcome.contentSha.startsWith('tree:') && correctionGate(addressedState) === null, addressed.out);
  check('addressing and supersession leave the approved review byte-identical', f.reviewBytes() === f.review);
  check('unchanged transient interruption can retain the original approval', addressedState?.step === 'pr' && f.cli('next').out.startsWith('deliver:'), JSON.stringify(addressedState));
  const addressedBytes = f.bytes();
  const redelivery = f.cli(...admission('Use the preserved offset after rendering.', 'review:page/message-9'), '--supersedes', oldId);
  check('redelivery does not reopen addressed work or rewrite history', redelivery.code === 0 && redelivery.out.includes('duplicate') && f.bytes() === addressedBytes, redelivery.out);
  check('historical outcomes stay inspectable', f.cli('status', '--inspect').out.includes(oldId) && f.cli('status', '--inspect').out.includes(newer?.id ?? 'missing'));
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// System origin uses the same operation, without claiming a human verdict or changing REVIEW.md.
{
 const f = fixture();
 try {
  const systemText = 'Push hook refused: generated contract check failed.\nRepair only the contract output.';
  const captured = f.cli('correct', '--kind', 'system', '--source', 'delivery:attempt-1/hook', '--author', 'git push hook', '--scope', 'delivery recovery', '--reason', 'local hook refused the approved push', systemText);
  const system = readState(f.dir)?.corrections?.[0];
  const next = f.cli('next');
  const brief = f.cli('brief', 'build');
  check('system admission retains actual attribution and failure words', captured.code === 0 && system?.kind === 'system' && system.author === 'git push hook' && system.text === systemText, captured.out);
  check('system failure reaches next and the actual build brief without a verdict rewrite', next.out.includes(systemText) && brief.code === 0 && brief.out.includes(systemText) && brief.out.includes('git push hook') && f.reviewBytes() === f.review, `${next.out}\n${brief.out.slice(-1800)}`);
  const newer = f.cli(...admission('A separate newer instruction', 'chat:newer/message'));
  check('a newer unrelated event cannot erase older pending system work', newer.code === 0 && outstandingCorrections(readState(f.dir)).length === 2 && readState(f.dir)?.corrections?.[0]?.text === systemText, newer.out);
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// An addressed instruction is not fresh approval for changed reviewed bytes.
{
 const f = fixture();
 try {
  f.cli(...admission());
  const id = readState(f.dir)?.corrections?.[0]?.id ?? 'missing';
  writeFileSync(join(f.dir, 'product.txt'), 'changed implementation\n');
  f.git('add', 'product.txt'); f.git('commit', '-qm', 'implement correction');
  const addressed = f.cli('correct', '--address', id, '--note', 'Implemented and checked the retained offset');
  check('changed reviewed bytes cannot reuse the old approval after addressing', addressed.code === 0 && readState(f.dir)?.step === 'build' && !f.cli('next').out.startsWith('deliver:') && f.reviewBytes() === f.review, addressed.out);
  const handoff = f.cli('step', 'assess');
  const measured = f.git('rev-parse', 'HEAD');
  writeFileSync(join(f.dir, folder, 'ASSESSMENT.md'), `head: ${measured}\nVerdict: clean\nFixture reviewer confirms the corrected implementation and retained source.\n`);
  const ready = f.cli('next');
  check('corrected implementation reaches a fresh assessment and T2 through the command path', handoff.code === 0 && ready.out.startsWith('review: T2'), `${handoff.out}\n${ready.out}`);
  const staleApproval = f.cli('review', 'fix/corrections', '--done');
  check('old T2 is refused even after a clean current assessment', staleApproval.code === 2 && readState(f.dir)?.step !== 'pr', staleApproval.out);
  const identity = approvalIdentity(f.dir, folder, null);
  writeFileSync(join(f.dir, folder, 'REVIEW.md'), `${f.review}\n## Fixture fresh human review\ncontent-sha: ${identity.worktree}\nhead-sha: ${identity.head}\nverdict: approved\n`);
  const freshApproval = f.cli('review', 'fix/corrections', '--done');
  check('fresh bound T2 permits corrected work while preserving the earlier approval prefix', freshApproval.code === 0 && readState(f.dir)?.step === 'pr' && f.cli('next').out.startsWith('deliver:') && f.reviewBytes().startsWith(f.review), freshApproval.out);
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// A build handoff clears transient dispatch reasons, not durable correction obligations.
{
 const f = fixture();
 try {
  f.cli(...admission());
  const beforeHandoff = f.bytes();
  const handoff = f.cli('step', 'assess');
  const current = readState(f.dir);
  check('handoff cannot automatically address or bypass the instruction', handoff.code === 2 && f.bytes() === beforeHandoff && current?.corrections?.[0]?.outcome.kind === 'pending', handoff.out);
  // Simulate the persisted transient field having been cleared by an earlier phase: durable
  // corrections, not build_reason, must remain the source of the resumed assignment.
  writeState(f.dir, () => ({ build_reason: null }));
  const assessment = f.cli('prompt', 'assess');
  check('assessment context retains the instruction and original source after reason clearing', assessment.code === 0 && assessment.out.includes(instruction) && assessment.out.includes(source), assessment.out.slice(-1800));
  const next = f.cli('next');
  check('cleared dispatch reason cannot hide outstanding correction work', next.out.includes(instruction) && !next.out.startsWith('deliver:'), next.out);
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// Admission must not bypass holds, unanswered questions, or a consequential round's T1.
for (const protection of ['held', 'question', 'T1'] as const) {
 const f = fixture(protection === 'T1' ? 'B' : 'A');
 try {
  if (protection === 'held') writeState(f.dir, () => ({ step: 'held' }));
  if (protection === 'question') f.cli('ask', 'Which offset is authoritative?');
  if (protection === 'T1') writeFileSync(join(f.dir, folder, 'AGREEMENT-REVIEW.md'), 'verdict: pending\n');
  const captured = f.cli(...admission());
  const next = f.cli('next');
  const brief = f.cli('brief', 'build');
  check(`${protection} protection remains effective after admission`, captured.code === 0 && next.out.startsWith('wait user:') && next.out.includes(protection === 'held' ? 'held' : protection === 'question' ? 'Which offset' : 'T1') && brief.code === 2 && readState(f.dir)?.corrections?.[0]?.outcome.kind === 'pending', `${captured.out}\n${next.out}\n${brief.out}`);
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}
{
 const f = fixture('B');
 try {
  const t1 = readFileSync(join(f.dir, folder, 'AGREEMENT-REVIEW.md'), 'utf8');
  f.cli(...admission());
  const next = f.cli('next');
  check('within-agreement correction does not renew a valid T1', next.out.startsWith('work build') && readFileSync(join(f.dir, folder, 'AGREEMENT-REVIEW.md'), 'utf8') === t1, next.out);
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

{
 const f = fixture();
 try {
  const bare = f.cli('step', 'build');
  check('reasonless direct build warns without inventing an assignment', bare.code === 0 && bare.out.includes('no new assignment') && !(readState(f.dir)?.corrections ?? []).length, bare.out);
  for (const missing of ['--source', '--author', '--scope', '--reason']) {
   const args = admission();
   const index = args.indexOf(missing);
   args.splice(index, 2);
   const before = f.bytes();
   const refused = f.cli(...args);
   check(`admission without ${missing} refuses without mutating state`, refused.code === 2 && f.bytes() === before, refused.out);
  }
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}

// Corrupt current authority must fail closed; it cannot fall through to a legacy empty array.
{
 const f = fixture();
 try {
  f.cli(...admission());
  const state = readState(f.dir);
  const correction = state?.corrections?.[0];
  if (!state || !correction) {
   check('malformed-fixture prerequisite: admission produced a correction', false);
  } else {
   const malformed: unknown[] = [null, {}, 'pending', [{ ...correction, source: '' }], [{ ...correction, id: 'invented-id' }], [{ ...correction, relay: 17 }], [{ ...correction, text: '' }], [{ ...correction, kind: 'person' }], [{ ...correction, at: 'yesterday' }], [correction, correction], [{ ...correction, outcome: { kind: 'unknown' } }], [{ ...correction, outcome: { kind: 'blocked', note: 'why', at: correction.at } }], [{ ...correction, outcome: { kind: 'addressed', note: 'done', at: correction.at } }], [{ ...correction, outcome: { kind: 'addressed', note: 'done', at: correction.at, contentSha: 'tree:bad' } }], [{ ...correction, outcome: { kind: 'superseded', by: 'missing-id', at: correction.at } }], [{ ...correction, outcome: { kind: 'superseded', by: correction.id, at: correction.at } }]];
   for (const [index, corrections] of malformed.entries()) {
    check(`malformed correction ${index}: owner rejects invalid authority`, correctionStateGap(corrections) !== null);
    const bytes = `${JSON.stringify({ ...state, corrections })}\n`;
    writeFileSync(f.statePath, bytes);
    const next = f.cli('next');
    const admissionResult = f.cli(...admission('A later message', 'chat:later/message'));
    check(`malformed correction ${index}: fresh CLI refuses without dropping persisted authority`, next.code !== 0 && admissionResult.code !== 0 && f.bytes() === bytes, `${next.out}\n${admissionResult.out}`);
   }
   writeFileSync(f.statePath, JSON.stringify(state));
   f.cli(...admission('Second correction for cycle fixture', 'chat:cycle/second'));
   const second = readState(f.dir)?.corrections?.[1];
   if (second) {
    const corrections = [
     { ...correction, outcome: { kind: 'superseded', by: second.id, at: correction.at } },
     { ...second, outcome: { kind: 'superseded', by: correction.id, at: second.at } },
    ];
    const cyclicBytes = JSON.stringify({ ...state, corrections });
    writeFileSync(f.statePath, cyclicBytes);
    const refused = f.cli('next');
    check('cyclic supersession cannot make all obligations disappear', correctionStateGap(corrections) !== null && refused.code !== 0 && f.bytes() === cyclicBytes, refused.out);
   } else check('cycle-fixture prerequisite: second admission persisted', false);
   // Valid legacy state has no correction field; the new owner must not require a migration.
   const { corrections: _corrections, ...legacy } = state;
   writeFileSync(f.statePath, JSON.stringify({ ...legacy, step: 'pr' } satisfies State));
   check('legacy state without corrections remains readable', f.cli('next').out.startsWith('deliver:'));
  }
 } finally { rmSync(f.dir, { recursive: true, force: true }); }
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
