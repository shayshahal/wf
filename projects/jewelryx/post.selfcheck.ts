// post.selfcheck.ts — node post.selfcheck.ts → exit 0 when green.
// Pure arms of wf post: the note's sections, the fill check, the pictures and the comment.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackerNote } from './index.ts';
import { commentBody, markPosted, pictureNotes, picturesOf, prNumberOf, sectionsOf, unfilled } from './post.ts';

let failed = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : ` — ${detail}`}`); if (!cond) failed++; };

const scaffold = trackerNote({ ids: ['JX-1112', 'JX-1113'], url: 'https://github.com/x/y/pull/7' }).text;
const sections = sectionsOf(scaffold);
check('one section per heading, the HTML comment left out', sections.map((s) => s.key).join() === 'JX-1112,JX-1113' && !sections[0].text.includes('<!--'), JSON.stringify(sections));
check('the scaffold as deliver wrote it is not posted: its <...> lines are unfilled', unfilled(sections[0])?.startsWith('JX-1112: not filled: מה היה:') === true, String(unfilled(sections[0])));
const filled = scaffold.replace(/<[^>]*>/g, 'כתוב');
check('filled, it may be posted', sectionsOf(filled).every((s) => unfilled(s) === null));
check('the PR number comes from the url line', prNumberOf(sectionsOf(filled)[0].text) === '7');

const marked = markPosted(filled, 'JX-1112');
check('marking one heading marks only it', sectionsOf(marked).map((s) => s.posted).join() === 'true,false', marked);
check('marking twice does not mark twice', markPosted(marked, 'JX-1112') === marked);
check('JX-11 does not mark JX-1112', markPosted(filled, 'JX-11') === filled);

// JX-268 (2026-10-07): the pictures go up with the comment, named under the PR so a re-run knows them.
const pics = picturesOf('7', ['after-1.png', 'before-1.png', 'after-2.png', 'trace.zip']);
check('pictures pair by number, named under the PR', JSON.stringify(pics) === JSON.stringify([{ before: { file: 'before-1.png', as: '7-before-1.png' }, after: { file: 'after-1.png', as: '7-after-1.png' } }, { after: { file: 'after-2.png', as: '7-after-2.png' } }]), JSON.stringify(pics));
const body = commentBody('תוקן ✅\nPR: u', pics);
check('the comment shows each picture in it, before then after', body === 'תוקן ✅\nPR: u\n\nלפני:\n!7-before-1.png|thumbnail!\nאחרי:\n!7-after-1.png|thumbnail!\nאחרי:\n!7-after-2.png|thumbnail!', body);
check('no pictures: the text alone', commentBody('תוקן ✅', []) === 'תוקן ✅');

// JX-1239: a round shot named after-only screenshots; the post attached zero, silently.
const incident = ['after-he-1280-assess.png', 'after-he-1024-assess.png', 'after-start-now-checked.png', 'listing.png', 'trace.zip'];
const named = picturesOf('7', incident);
check('named after-only screenshots are all attached, under the PR, with no before invented', named.length === 3 && named.every((p) => p.before === undefined && p.after?.as === `7-${p.after?.file}`), JSON.stringify(named));
const notes = pictureNotes(named, incident);
check('the post says exactly what it attached and what it refused', notes === 'attached 3: after-he-1024-assess.png, after-he-1280-assess.png, after-start-now-checked.png; NOT attached (rename to before-<name>.png or after-<name>.png): listing.png', notes);
check('no proof pictures at all is said too', pictureNotes([], []) === 'attached 0: proof/ has no before-/after- picture');

// The real boundary: node post.ts against a git checkout holding the note and proof/, with a Jira that is a
// preloaded fetch stub (it records the attachments and the comment, answers like Jira does).
const work = mkdtempSync(join(tmpdir(), 'wf-post-'));
const stub = join(work, 'jira-stub.mjs');
writeFileSync(stub, String.raw`import { appendFileSync } from 'node:fs';
const log = (o) => appendFileSync(process.env.STUB_LOG, JSON.stringify(o) + '\n');
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), method = init.method ?? 'GET';
  if (u.includes('/changelog')) return json({ values: JSON.parse(process.env.STUB_HISTORIES ?? '[]'), isLast: true });
  if (u.includes('/attachments')) { const f = init.body.get('file'); log({ attach: f.name, type: f.type }); return json([]); }
  if (u.endsWith('/comment')) { log({ comment: JSON.parse(init.body).body }); return json({}); }
  if (u.includes('/transitions')) return method === 'POST' ? new Response(null, { status: 204 }) : json({ transitions: [{ id: '31', to: { name: 'Fixed in Local' } }] });
  return json({ fields: { attachment: [], comment: { comments: [...(process.env.STUB_ALREADY ? [{ body: 'תוקן ✅\nPR: https://github.com/x/y/pull/7', created: '2026-10-12T14:00:00.000+0300', updated: '2026-10-12T14:00:00.000+0300' }] : []), ...JSON.parse(process.env.STUB_COMMENTS ?? '[]')] } } });
};`);
// The round began at 12:00:03 +0300 (its first step); `changed` is what the ticket got since.
type Changed = { histories?: object[]; comments?: object[]; ticketWrittenAt?: string; ticketRead?: string; args?: string[] };
function runPostIn(names: string[], already = false, changed: Changed = {}) {
  const repo = mkdtempSync(join(work, 'repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  mkdirSync(join(repo, '.wf'));
  mkdirSync(join(repo, 'bug-reports/x/proof'), { recursive: true });
  writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ note: 'bug-reports/x/JIRA.md', folder: 'bug-reports/x', id: 'JX-1239', history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }], ...(changed.ticketRead ? { ticket_read: changed.ticketRead } : {}) }));
  writeFileSync(join(repo, 'bug-reports/x/TICKET.md'), '## Intent\n');
  if (changed.ticketWrittenAt) utimesSync(join(repo, 'bug-reports/x/TICKET.md'), new Date(changed.ticketWrittenAt), new Date(changed.ticketWrittenAt));
  writeFileSync(join(repo, 'bug-reports/x/JIRA.md'), '## JX-1239\nתוקן ✅\nPR: https://github.com/x/y/pull/7\n');
  for (const n of names) writeFileSync(join(repo, 'bug-reports/x/proof', n), 'img');
  const log = join(repo, 'stub.log');
  writeFileSync(log, '');
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, fileURLToPath(new URL('./post.ts', import.meta.url)), ...(changed.args ?? [])], { cwd: repo, encoding: 'utf8', env: { ...process.env, JIRA_EMAIL: 'a@b', JIRA_TOKEN: 't', STUB_LOG: log, STUB_HISTORIES: JSON.stringify(changed.histories ?? []), STUB_COMMENTS: JSON.stringify(changed.comments ?? []), ...(already ? { STUB_ALREADY: '1' } : {}) } });
  const calls: { attach?: string; type?: string; comment?: string }[] = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { run, calls, repo, state: JSON.parse(readFileSync(join(repo, '.wf/state.json'), 'utf8')), note: readFileSync(join(repo, 'bug-reports/x/JIRA.md'), 'utf8') };
}
const cli = runPostIn(incident);
check('wf post: the named screenshots are attached to the issue, by their type', cli.calls.filter((c) => c.attach).map((c) => `${c.attach}:${c.type}`).sort().join() === '7-after-he-1024-assess.png:image/png,7-after-he-1280-assess.png:image/png,7-after-start-now-checked.png:image/png', JSON.stringify(cli.calls) + cli.run.stderr);
check('wf post: the comment shows them, and no before', cli.calls.some((c) => c.comment?.includes('!7-after-he-1280-assess.png|thumbnail!') && !c.comment.includes('לפני:')), JSON.stringify(cli.calls));
check('wf post: its last line names what was attached and what was refused', /posted with 3 picture\(s\).*attached 3: .*NOT attached .*: listing\.png/.test(cli.run.stdout) && cli.note.includes('## JX-1239 (posted)'), cli.run.stdout + cli.run.stderr);
const jpg = runPostIn(['before-a.jpg', 'after-a.webp']);
check('wf post: jpg and webp go up with their own type', jpg.calls.filter((c) => c.attach).map((c) => c.type).sort().join() === 'image/jpeg,image/webp', JSON.stringify(jpg.calls));
const again = runPostIn(incident, true);
check('wf post: a comment with the PR already there is not posted again, nor its pictures re-attached', again.calls.length === 0 && /already posted/.test(again.run.stdout), JSON.stringify(again.calls) + again.run.stdout);

// JX-810 (2026-10-12): the requirement was corrected in a comment and the description rewritten while the round ran;
// wf post said "תוקן ✅" and set Fixed in Local against the old text. It refuses now, and says what changed.
const edited = [{ created: '2026-10-12T13:43:02.638+0300', author: { displayName: 'Einat Shahal' }, items: [{ field: 'description' }] }];
const commented = [{ body: 'תיקון דרישה', created: '2026-10-12T13:18:34.637+0300', updated: '2026-10-12T13:18:34.637+0300', author: { displayName: 'Einat Shahal' } }];
const stale = runPostIn(incident, false, { histories: edited, comments: commented });
check('wf post: a ticket edited and commented since the round began is refused, nothing posted, the note not marked', stale.run.status === 1 && stale.calls.length === 0 && !stale.note.includes('(posted)'), JSON.stringify(stale.calls) + stale.run.stdout + stale.run.stderr);
check('wf post: the refusal names who, when, which, and the way past', /JX-1239 changed since the round began/.test(stale.run.stderr) && stale.run.stderr.includes('Einat Shahal, 2026-10-12T13:18:34.637+0300: comment added') && stale.run.stderr.includes('Einat Shahal, 2026-10-12T13:43:02.638+0300: description edited') && stale.run.stderr.includes('wf post --ticket-reread'), stale.run.stderr);
const quiet = runPostIn(incident, false, { histories: [{ created: '2026-10-12T11:00:00.000+0300', author: { displayName: 'Einat Shahal' }, items: [{ field: 'description' }] }] });
check('wf post: a description edited before the round began does not stop it', quiet.run.status === 0 && quiet.calls.some((c) => c.comment), quiet.run.stderr);
const reread = runPostIn(incident, false, { histories: edited, comments: commented, ticketRead: '2026-10-12T11:00:00.000Z' });
check('wf post: a recorded re-read after the changes lets it through (here the changes are 10:18Z and 10:43Z, the re-read 11:00Z)', reread.run.status === 0 && reread.calls.some((c) => c.comment), reread.run.stderr);
const lateChange = runPostIn(incident, false, { histories: edited, ticketRead: '2026-10-12T10:00:00.000Z' });
check('wf post: a change after the recorded re-read is refused again', lateChange.run.status === 1 && lateChange.calls.length === 0, lateChange.run.stderr);

const oldTicket = runPostIn(incident, false, { histories: edited, comments: commented, args: ['--ticket-reread'], ticketWrittenAt: '2026-10-12T10:00:00.000Z' });
check('wf post --ticket-reread: refused while TICKET.md is older than the last change, nothing recorded', oldTicket.run.status === 1 && /re-fetch the ticket into it first/.test(oldTicket.run.stderr) && oldTicket.state.ticket_read === undefined, oldTicket.run.stderr);
const reread2 = runPostIn(incident, false, { histories: edited, comments: commented, args: ['--ticket-reread'], ticketWrittenAt: '2026-10-12T11:30:00.000Z' });
check('wf post --ticket-reread: with TICKET.md written after the changes it records the time and lists what was read', reread2.run.status === 0 && typeof reread2.state.ticket_read === 'string' && reread2.run.stdout.includes('description edited') && reread2.calls.length === 0, reread2.run.stdout + reread2.run.stderr);
const nothing = runPostIn(incident, false, { args: ['--ticket-reread'] });
check('wf post --ticket-reread: with nothing changed it records nothing', nothing.run.status === 0 && nothing.state.ticket_read === undefined && /nothing to record/.test(nothing.run.stdout), nothing.run.stdout + nothing.run.stderr);
// wf review asks the same question through the project's export (ticketChanges), before T2 opens.
function askTicketChanges(state: object, env: Record<string, string>) {
  const code = `import { ticketChanges } from ${JSON.stringify(new URL('./index.ts', import.meta.url).href)}; try { console.log(JSON.stringify(await ticketChanges(${JSON.stringify(state)}))); } catch (e) { console.log('THROWS ' + e.message); }`;
  return spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, '--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, STUB_LOG: join(work, 'ask.log'), ...env } }).stdout.trim();
}
const roundState = { id: 'JX-1239', ids: ['JX-1239'], history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }] };
const asked = askTicketChanges(roundState, { JIRA_EMAIL: 'a@b', JIRA_TOKEN: 't', STUB_HISTORIES: JSON.stringify(edited), STUB_COMMENTS: JSON.stringify(commented) });
check('wf review: ticketChanges names what changed, and says to run wf review again', asked.includes('Einat Shahal, 2026-10-12T13:43:02.638+0300: description edited') && asked.includes('run wf review again'), asked);
check('wf review: a ticket that did not change gives null', askTicketChanges(roundState, { JIRA_EMAIL: 'a@b', JIRA_TOKEN: 't' }) === 'null');
check('wf review: no credentials throws, for the caller to say so', askTicketChanges(roundState, { JIRA_EMAIL: '', JIRA_TOKEN: '' }).startsWith('THROWS this session has no JIRA_EMAIL'));
rmSync(work, { recursive: true, force: true });

if (failed) process.exit(1);
console.log('\nall arms green');
