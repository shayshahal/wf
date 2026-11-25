// plannotator-review-inbox.selfcheck.ts — the review half of the Inbox adapter against a fake `plannotator
// inbox mcp`: what submit_guide is sent, and which reply of a full read_thread is the person's verdict.
// Record shapes read from backnotprop/plannotator main (2026-11-25): a verdict reply carries
// `review_verdict: { of, verdict: "approved" | "changes_requested", comments }`. The real binary is never run.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReviewInbox, verdictOn } from './plannotator-inbox.ts';

const dir = mkdtempSync(join(tmpdir(), 'wf-review-inbox-adapter-'));
const server = join(dir, 'server.cjs');
const calls = join(dir, 'calls.jsonl');
const answer = join(dir, 'answer.json');
writeFileSync(server, String.raw`
const fs = require('fs');
const readline = require('readline');
const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') return out({ id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'fake', version: '0' } } });
  if (m.method !== 'tools/call') return;
  fs.appendFileSync(process.env.FAKE_CALLS, JSON.stringify(m.params) + '\n');
  out({ id: m.id, result: { content: [{ type: 'text', text: 'ok' }], structuredContent: JSON.parse(fs.readFileSync(process.env.FAKE_ANSWER, 'utf8')) } });
});
`);
const inbox = createReviewInbox({ command: () => ({ file: process.execPath, args: [server] }), timeoutMs: 15_000, exitGraceMs: 1000, available: () => true, env: { ...process.env, FAKE_CALLS: calls, FAKE_ANSWER: answer } });
const person = (id: string, of: string, verdict: string, body = 'words') => ({ id, author: { kind: 'person' }, reply_to: of, body, review_verdict: { of, verdict, comments: 0 } });
const review = { id: 'msg_review', author: { kind: 'agent' }, reply_to: null, body: 'T2 review' };

try {
  // submit_guide carries the review flag, the exact patch and guide, and the retry key.
  writeFileSync(answer, JSON.stringify({ message_id: 'msg_review', thread_id: 'msg_review', url: 'http://inbox/#t' }));
  const sent = await inbox.send({ worktree: dir, thread: 'wf review fix/r', subject: 'T2 review: fix/r', body: 'T2 review', guide: { title: 'g' }, patch: 'diff --git a/x b/x\n', key: 'wf-review-1' });
  assert.deepEqual(sent, { ref: 'msg_review', url: 'http://inbox/#t' });
  const call = JSON.parse(readFileSync(calls, 'utf8').trim().split('\n')[0]!);
  assert.equal(call.name, 'submit_guide');
  assert.deepEqual(call.arguments, { guide: { title: 'g' }, patch: 'diff --git a/x b/x\n', body: 'T2 review', review: true, subject: 'T2 review: fix/r', thread: 'wf review fix/r', idempotency_key: 'wf-review-1', project_path: dir });

  // The verdict is read from a full read of the review's thread.
  writeFileSync(answer, JSON.stringify({ thread: { messages: [review, person('msg_a', 'msg_review', 'changes_requested', 'I am asking for changes.')] } }));
  assert.deepEqual(await inbox.verdict({ worktree: dir, ref: 'msg_review' }), { reply: 'msg_a', verdict: 'changes-requested', text: 'I am asking for changes.' });
  const read = JSON.parse(readFileSync(calls, 'utf8').trim().split('\n')[1]!);
  assert.equal(read.name, 'read_thread');
  assert.deepEqual(read.arguments, { message_id: 'msg_review', format: 'full', project_path: dir });

  // Pure: no verdict yet; the latest of several; another review's verdict; an agent's look-alike.
  assert.equal(verdictOn({ thread: { messages: [review] } }, 'msg_review'), null);
  assert.equal(verdictOn({ thread: { messages: [review, person('msg_a', 'msg_review', 'changes_requested'), person('msg_b', 'msg_review', 'approved', 'I approved your review.')] } }, 'msg_review')?.reply, 'msg_b');
  assert.equal(verdictOn({ thread: { messages: [review, person('msg_a', 'msg_older', 'approved')] } }, 'msg_review'), null);
  assert.equal(verdictOn({ thread: { messages: [review, { ...person('msg_a', 'msg_review', 'approved'), author: { kind: 'agent' } }] } }, 'msg_review'), null);
  assert.throws(() => verdictOn({ thread: { messages: [review, person('msg_a', 'msg_review', 'lgtm')] } }, 'msg_review'), /unknown review verdict/);
  assert.throws(() => verdictOn({ thread: { messages: [] } }, 'msg_review'), /does not contain review/);
  console.log('plannotator review inbox: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
