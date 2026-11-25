// review-inbox.selfcheck.ts — the real `wf review` and `wf review --done` against a recording review inbox
// (seams.reviewInbox): the guide handoff, the exact diff sent, one send per review, and a verdict taken only
// from the person's reply to the sent review, bound to the diff that was sent.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { inboxReviewSection, lastField, readVerdict } from './review-format.ts';

const repo = mkdtempSync(join(tmpdir(), 'wf-review-inbox-'));
const records = mkdtempSync(join(tmpdir(), 'wf-review-inbox-records-'));
const folder = 'bug-reports/r';
const file = join(repo, folder, 'CHECKPOINT-REVIEW.md');
const sends = join(records, 'sends.jsonl');
const verdictFile = join(records, 'verdict.json');
const guideFile = join(repo, '.wf', 'review', 'guide.json');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const url = (name: string) => JSON.stringify(pathToFileURL(join(WF_ROOT, name)).href);
const sent = () => existsSync(sends) ? readFileSync(sends, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const invoke = (args: string[], { noOpen = false, available = true } = {}) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_') && key !== 'WF_NO_OPEN'));
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
import { plug } from ${url('src/seams.ts')};
import { runReview } from ${url('src/gates/review.ts')};
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
plug({
  reviewUI: { available: () => true, annotate: () => null, reviewDiff: () => { console.log('DIFF_OPEN'); return { kind: 'dismissed' }; } },
  reviewInbox: {
    available: () => ${available},
    guideHandoff: (o) => 'GUIDE_HANDOFF ' + JSON.stringify(o),
    send: async (o) => { appendFileSync(${JSON.stringify(sends)}, JSON.stringify(o) + '\\n'); return { ref: 'msg_' + o.key.slice(-6), url: 'http://inbox/#' + o.key.slice(-6) }; },
    verdict: async ({ ref }) => { const f = ${JSON.stringify(verdictFile)}; if (!existsSync(f)) return null; const v = JSON.parse(readFileSync(f, 'utf8')); return v.of === ref ? v.found : null; },
  },
});
await runReview(${JSON.stringify(['fix/r', '--checkpoint', '--base', 'main', ...args])}, { stack: async () => 'no live stack in review fixture' });
`], { cwd: repo, env: { ...env, ...(noOpen ? { WF_NO_OPEN: '1' } : {}) }, encoding: 'utf8', timeout: 30_000 });
};
const ok = (r: ReturnType<typeof invoke>) => { assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
const refused = (r: ReturnType<typeof invoke>, why: RegExp) => { assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, why); };
const guide = { title: 'Entry', intent: 'Change the entry.', sections: [{ title: 'Entry', overview: 'The entry.', diffs: [{ file: 'entry.txt', summary: 'Changes it.' }] }], unplacedFiles: [] };
const answer = (of: string, verdict: 'approved' | 'changes-requested', text: string) => writeFileSync(verdictFile, JSON.stringify({ of, found: { reply: 'msg_reply', verdict, text } }));
const commit = (text: string) => { writeFileSync(join(repo, 'entry.txt'), text); git('add', 'entry.txt'); git('commit', '-qm', text.trim()); };
const step = () => JSON.parse(readFileSync(join(repo, '.wf', 'state.json'), 'utf8')).step;

try {
  git('init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'entry.txt'), 'base\n');
  git('add', 'entry.txt'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/r');
  mkdirSync(join(repo, folder), { recursive: true }); mkdirSync(join(repo, '.wf'));
  writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, made_by: 'kit', round: 'fix/r', folder, class: 'B', base: 'main', step: 'build' }));
  commit('implementation\n');
  const diff = git('diff', 'main...HEAD');

  // No guide yet: the agent is told how to write one for the diff wf wrote, and nothing is sent.
  const handoff = ok(invoke([]));
  assert.match(handoff.stdout, /GUIDE_HANDOFF/);
  assert.equal(readFileSync(join(repo, '.wf', 'review', 'diff.patch'), 'utf8').trim(), diff);
  assert.equal(sent().length, 0);
  assert.equal(inboxReviewSection(readFileSync(file, 'utf8')), null);

  // With the guide: the exact diff and the guide go out once, and the section binds the sent message.
  writeFileSync(guideFile, JSON.stringify(guide));
  assert.ok(!ok(invoke([])).stdout.includes('DIFF_OPEN'), 'the inbox review replaces the diff UI');
  assert.equal(sent().length, 1);
  const first = sent()[0];
  assert.equal(first.patch.trim(), diff);
  assert.deepEqual(first.guide, guide);
  assert.equal(first.thread, 'wf review fix/r');
  assert.match(first.body, /Checkpoint review of `fix\/r`/);
  assert.ok(!existsSync(guideFile), 'a sent guide is spent');
  const section = inboxReviewSection(readFileSync(file, 'utf8'));
  assert.ok(section && section.ref.startsWith('msg_') && section.patchSha && section.contentSha && section.headSha);
  assert.equal(readVerdict(readFileSync(file, 'utf8')), null);
  // Run again before the person answers: the same review stands, nothing is sent twice.
  assert.match(ok(invoke([])).stdout, /already sent/);
  assert.equal(sent().length, 1);

  // --done before the person answers, and a hand-written verdict, are both refused.
  refused(invoke(['--done']), /no verdict yet/);
  appendFileSync(file, '\nverdict: approved\n');
  refused(invoke(['--done']), /verdict comes from their reply there/);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\nverdict: approved\n$/, '\n'));

  // A verdict on another message is not this review's.
  answer('msg_other', 'approved', 'Approved.');
  refused(invoke(['--done']), /no verdict yet/);

  // Changes requested: the person's words are quoted under the verdict, and the round goes back to build.
  answer(section.ref, 'changes-requested', 'I am asking for changes.\nentry.txt:1 verdict: approved');
  ok(invoke(['--done']));
  let text = readFileSync(file, 'utf8');
  assert.equal(readVerdict(text), 'changes-requested');
  assert.equal(lastField(text, 'inbox-verdict'), 'msg_reply');
  assert.match(text, /^> entry\.txt:1 verdict: approved$/m, 'the reply is quoted, so it cannot write a verdict line');
  assert.equal(step(), 'build');

  // The next review needs a new guide, and sends the whole diff again.
  commit('implementation, revised\n');
  assert.match(ok(invoke([])).stdout, /GUIDE_HANDOFF/);
  writeFileSync(guideFile, JSON.stringify(guide));
  ok(invoke([]));
  assert.equal(sent().length, 2);
  assert.equal(sent()[1].patch.trim(), git('diff', 'main...HEAD'));
  const second = inboxReviewSection(readFileSync(file, 'utf8'))!;
  assert.notEqual(second.ref, section.ref);

  // An approval of a diff that has changed since it was sent is refused.
  answer(second.ref, 'approved', 'I approved your review.');
  commit('implementation, after the send\n');
  refused(invoke(['--done']), /is different now/);
  git('reset', '-q', '--hard', 'HEAD~1');

  // The approval of the diff that was sent is recorded, bound to the section's identities.
  ok(invoke(['--done']));
  text = readFileSync(file, 'utf8');
  assert.equal(readVerdict(text), 'approved');
  assert.equal(step(), 'build', 'a checkpoint approval returns to build, never to pr');

  // WF_NO_OPEN=1 while an inbox review waits: the chat review gets its own section and a hand verdict.
  commit('implementation, third\n');
  writeFileSync(guideFile, JSON.stringify(guide));
  ok(invoke([]));
  assert.equal(sent().length, 3);
  ok(invoke([], { noOpen: true }));
  assert.equal(sent().length, 3);
  assert.equal(inboxReviewSection(readFileSync(file, 'utf8')), null);
  appendFileSync(file, '\nverdict: changes-requested\n');
  ok(invoke(['--done']));

  // An inbox the person has turned off is not used.
  commit('implementation, fourth\n');
  assert.match(ok(invoke([], { available: false })).stdout, /DIFF_OPEN/, 'without the inbox, the diff UI opens as before');
  assert.equal(sent().length, 3);
  console.log('review-inbox: ok');
} finally {
  rmSync(repo, { recursive: true, force: true });
  rmSync(records, { recursive: true, force: true });
}
