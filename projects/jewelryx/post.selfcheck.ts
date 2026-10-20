// post.selfcheck.ts — node post.selfcheck.ts → exit 0 when green.
// Pure arms of wf post: the note's sections, the fill check, the pictures and the comment.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { trackerNote } from './index.ts';
import { commentBody, commentText, markPosted, pictureNotes, picturesOf, previewOf, prNumberOf, sectionsOf, selectedPictures, unfilled } from './post.ts';

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
const body = commentBody('השינוי מוכן ב-PR וממתין למיזוג.\nPR: u', pics);
check('the comment shows each picture in it, before then after', body === 'השינוי מוכן ב-PR וממתין למיזוג.\nPR: u\n\nלפני:\n!7-before-1.png|thumbnail!\nאחרי:\n!7-after-1.png|thumbnail!\nאחרי:\n!7-after-2.png|thumbnail!', body);
check('no pictures: the text alone', commentBody('השינוי מוכן ב-PR וממתין למיזוג.', []) === 'השינוי מוכן ב-PR וממתין למיזוג.');

// JX-1239: a round shot named after-only screenshots; the post attached zero, silently.
const incident = ['after-he-1280-assess.png', 'after-he-1024-assess.png', 'after-start-now-checked.png', 'listing.png', 'trace.zip'];
const named = picturesOf('7', incident);
check('named after-only screenshots are all attached, under the PR, with no before invented', named.length === 3 && named.every((p) => p.before === undefined && p.after?.as === `7-${p.after?.file}`), JSON.stringify(named));
const notes = pictureNotes(named);
check('the post says exactly what it attached', notes === 'attached 3: after-he-1024-assess.png, after-he-1280-assess.png, after-start-now-checked.png', notes);
check('nothing attached is said too', pictureNotes([]) === 'attached 0: none selected');

// JX-1392 (2026-10-14, #148): proof/ held 15 labeled captures, superseded states among them; the note meant
// after-1.png and after-2.png, and the post took all 15. Only the section's pictures: line goes up.
const superseded = ['before-1.png', 'after-1.png', 'after-2.png', 'after-3.png', 'after-empty-list.png', 'after-old-labels.png', 'after-he-1280-assess.png', 'listing.png', 'trace.zip'];
const sec = (pictures: string | null) => ({ key: 'JX-1392', posted: false, text: ['השינוי מוכן ב-PR וממתין למיזוג.', ...(pictures === null ? [] : [pictures]), 'PR: https://github.com/x/y/pull/7'].join('\n') });
const files = (pictures: string | null, names = superseded) => { const r = selectedPictures(sec(pictures), names); return 'files' in r ? r.files.join() : `GAP ${r.gap}`; };
check('selection: only the named pictures, never the rest of proof/', files('pictures: after-1.png after-2.png') === 'after-1.png,after-2.png', files('pictures: after-1.png after-2.png'));
check('selection: a picture named twice (with or without proof/, comma or space) is taken once', files('pictures: after-2.png, proof/after-2.png after-2.png') === 'after-2.png');
check('selection: numbered and descriptive labels both, in the order the comment shows them', files('pictures: after-he-1280-assess.png after-2.png before-1.png after-1.png') === 'before-1.png,after-1.png,after-2.png,after-he-1280-assess.png', files('pictures: after-he-1280-assess.png after-2.png before-1.png after-1.png'));
check('selection: twins #138 keeps apart (after-1.png and after-1.jpg) can both be named', files('pictures: after-1.png after-1.jpg', ['after-1.png', 'after-1.jpg']) === 'after-1.png,after-1.jpg', files('pictures: after-1.png after-1.jpg', ['after-1.png', 'after-1.jpg']));
check('selection: none is an empty selection', files('pictures: none') === '' && files('Pictures: NONE') === '');
check('selection: no pictures: line is refused, never read as all of proof/', files(null).startsWith('GAP JX-1392: no pictures: line'), files(null));
check('selection: two pictures: lines are refused', files('pictures: after-1.png\npictures: after-2.png').startsWith('GAP JX-1392: more than one'));
check('selection: an empty line, or none with files, is refused', files('pictures:').startsWith('GAP') && files('pictures: none after-1.png').startsWith('GAP'));
check('selection: a file not in proof/ is refused, by name', files('pictures: after-9.png') === 'GAP JX-1392: pictures: after-9.png not in proof/', files('pictures: after-9.png'));
check('selection: internal evidence not named before-/after- cannot be selected', files('pictures: listing.png').includes('listing.png not named before-<label> or after-<label>'), files('pictures: listing.png'));
check('the comment text leaves out the pictures: line', commentText(sec('pictures: after-1.png')) === 'השינוי מוכן ב-PR וממתין למיזוג.\nPR: https://github.com/x/y/pull/7');
const preview = previewOf(sec('pictures: after-1.png after-2.png'), ['after-1.png', 'after-2.png'], superseded);
check('the preview shows the comment, the exact files, and what stays in the round', preview === 'JX-1392: comment:\n  השינוי מוכן ב-PR וממתין למיזוג.\n  PR: https://github.com/x/y/pull/7\nJX-1392: pictures (2): after-1.png, after-2.png\nJX-1392: not posted, kept as round evidence (6): before-1.png, after-3.png, after-empty-list.png, after-old-labels.png, after-he-1280-assess.png, listing.png', preview);
check('the preview says when no picture is selected', previewOf(sec('pictures: none'), [], []).includes('JX-1392: pictures: none selected, the comment goes up with no picture'));

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
  if (u.includes('/transitions')) log({ transition: method });
  if (u.includes('/transitions')) return method === 'POST' ? new Response(null, { status: 204 }) : json({ transitions: [{ id: '31', to: { name: 'Fixed in Local' } }] });
  return json({ fields: { attachment: JSON.parse(process.env.STUB_ATTACHED ?? '[]').map((filename) => ({ filename })), comment: { comments: [...(process.env.STUB_ALREADY ? [{ body: 'השינוי מוכן ב-PR וממתין למיזוג.\nPR: https://github.com/x/y/pull/7', created: '2026-10-12T14:00:00.000+0300', updated: '2026-10-12T14:00:00.000+0300' }] : []), ...JSON.parse(process.env.STUB_COMMENTS ?? '[]')] } } });
};`);
// The round began at 12:00:03 +0300 (its first step); `changed` is what the ticket got since.
type Changed = { merged?: boolean; histories?: object[]; comments?: object[]; ticketWrittenAt?: string; ticketRead?: string; args?: string[]; pictures?: string | null; attached?: string[] };
function runPostIn(names: string[], already = false, changed: Changed = {}) {
  const repo = mkdtempSync(join(work, 'repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  mkdirSync(join(repo, '.wf'));
  mkdirSync(join(repo, 'bug-reports/x/proof'), { recursive: true });
  writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...(changed.merged ? { step: 'merged', delivery: { url: 'https://github.com/x/y/pull/7', head: 'a'.repeat(40), contentSha: 'tree:' + 'b'.repeat(40) } } : {}), note: 'bug-reports/x/JIRA.md', folder: 'bug-reports/x', id: 'JX-1239', history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }], ...(changed.ticketRead ? { ticket_read: changed.ticketRead } : {}) }));
  writeFileSync(join(repo, 'bug-reports/x/TICKET.md'), '## Intent\n');
  if (changed.ticketWrittenAt) utimesSync(join(repo, 'bug-reports/x/TICKET.md'), new Date(changed.ticketWrittenAt), new Date(changed.ticketWrittenAt));
  const pictures = changed.pictures === undefined ? 'pictures: none' : changed.pictures;
  writeFileSync(join(repo, 'bug-reports/x/JIRA.md'), `## JX-1239\nהשינוי מוכן ב-PR וממתין למיזוג.\n${pictures === null ? '' : `${pictures}\n`}PR: https://github.com/x/y/pull/7\n`);
  for (const n of names) writeFileSync(join(repo, 'bug-reports/x/proof', n), 'img');
  const log = join(repo, 'stub.log');
  writeFileSync(log, '');
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, fileURLToPath(new URL('./post.ts', import.meta.url)), ...(changed.args ?? [])], { cwd: repo, encoding: 'utf8', env: { ...process.env, JIRA_EMAIL: 'a@b', JIRA_TOKEN: 't', STUB_LOG: log, STUB_HISTORIES: JSON.stringify(changed.histories ?? []), STUB_COMMENTS: JSON.stringify(changed.comments ?? []), STUB_ATTACHED: JSON.stringify(changed.attached ?? []), ...(already ? { STUB_ALREADY: '1' } : {}) } });
  const calls: { attach?: string; type?: string; comment?: string; transition?: string }[] = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { run, calls, repo, state: JSON.parse(readFileSync(join(repo, '.wf/state.json'), 'utf8')), note: readFileSync(join(repo, 'bug-reports/x/JIRA.md'), 'utf8') };
}
const namedPictures = { pictures: 'pictures: after-he-1280-assess.png after-he-1024-assess.png after-start-now-checked.png' };
const cli = runPostIn(incident, false, namedPictures);
check('wf post: the named screenshots are attached to the issue, by their type', cli.calls.filter((c) => c.attach).map((c) => `${c.attach}:${c.type}`).sort().join() === '7-after-he-1024-assess.png:image/png,7-after-he-1280-assess.png:image/png,7-after-start-now-checked.png:image/png', JSON.stringify(cli.calls) + cli.run.stderr);
check('wf post: the comment shows them, and no before', cli.calls.some((c) => c.comment?.includes('!7-after-he-1280-assess.png|thumbnail!') && !c.comment.includes('לפני:')), JSON.stringify(cli.calls));
check('wf post: its last line names what was attached', /posted with 3 picture\(s\).*attached 3: /.test(cli.run.stdout) && cli.note.includes('## JX-1239 (posted)'), cli.run.stdout + cli.run.stderr);
check('wf post: the comment carries no pictures: line', cli.calls.some((c) => c.comment && !c.comment.includes('pictures:')), JSON.stringify(cli.calls));
check('open PR post states awaiting merge and never changes Jira status', cli.calls.some((c) => c.comment?.includes('ממתין למיזוג')) && !cli.calls.some((c) => c.transition), JSON.stringify(cli.calls));
const mergedPost = runPostIn([], false, { merged: true });
check('confirmed merged delivery can still mark the issue Fixed in Local', mergedPost.run.status === 0 && mergedPost.calls.some((c) => c.transition === 'POST'), mergedPost.run.stderr);
const jpg = runPostIn(['before-a.jpg', 'after-a.webp'], false, { pictures: 'pictures: before-a.jpg after-a.webp' });
check('wf post: jpg and webp go up with their own type', jpg.calls.filter((c) => c.attach).map((c) => c.type).sort().join() === 'image/jpeg,image/webp', JSON.stringify(jpg.calls));
const again = runPostIn(incident, true, namedPictures);
check('wf post: a comment with the PR already there is not posted again, nor its pictures re-attached', again.calls.length === 0 && /already posted/.test(again.run.stdout), JSON.stringify(again.calls) + again.run.stdout);

// JX-1392 at the boundary: of the superseded proof/, only the two named go up, after the preview names them.
const attachedOf = (r: ReturnType<typeof runPostIn>) => r.calls.filter((c) => c.attach).map((c) => c.attach).sort().join();
const chosen = runPostIn(superseded, false, { pictures: 'pictures: after-1.png after-2.png' });
check('wf post: exactly the named pictures are attached, none of the superseded ones', attachedOf(chosen) === '7-after-1.png,7-after-2.png', JSON.stringify(chosen.calls) + chosen.run.stderr);
check('wf post: the comment shows exactly them', ((c) => !!c && c.includes('!7-after-1.png|thumbnail!') && c.includes('!7-after-2.png|thumbnail!') && (c.match(/\|thumbnail!/g) ?? []).length === 2)(chosen.calls.find((c) => c.comment)?.comment), JSON.stringify(chosen.calls));
check('wf post: the preview, with the exact files, is printed before the post line', /JX-1239: pictures \(2\): after-1\.png, after-2\.png[\s\S]*not posted, kept as round evidence[\s\S]*JX-1239: posted with 2 picture/.test(chosen.run.stdout), chosen.run.stdout);
const previewOnly = runPostIn(superseded, false, { pictures: 'pictures: after-1.png after-2.png', args: ['--preview'] });
check('wf post --preview: prints the comment and files, calls Jira for nothing, marks nothing', previewOnly.run.status === 0 && previewOnly.calls.length === 0 && previewOnly.run.stdout.includes('JX-1239: pictures (2): after-1.png, after-2.png') && !previewOnly.note.includes('(posted)'), previewOnly.run.stdout + previewOnly.run.stderr);
const zero = runPostIn(superseded, false, { pictures: 'pictures: none' });
check('wf post: pictures: none posts the comment with no picture, and says so', attachedOf(zero) === '' && zero.calls.some((c) => c.comment && !c.comment.includes('thumbnail')) && zero.run.stdout.includes('none selected'), zero.run.stdout + zero.run.stderr);
const unnamed = runPostIn(superseded, false, { pictures: null });
check('wf post: a section with no pictures: line is refused before any call, never posting all of proof/', unnamed.run.status === 1 && unnamed.calls.length === 0 && /no pictures: line/.test(unnamed.run.stderr) && !unnamed.note.includes('(posted)'), unnamed.run.stderr);
const unknown = runPostIn(superseded, false, { pictures: 'pictures: after-1.png after-9.png' });
check('wf post: a named file missing from proof/ refuses the whole post', unknown.run.status === 1 && unknown.calls.length === 0 && unknown.run.stderr.includes('after-9.png not in proof/'), unknown.run.stderr);
// A session died after uploading one of the two: the retry uploads only the missing one, and one comment.
const resumed = runPostIn(superseded, false, { pictures: 'pictures: after-1.png after-2.png', attached: ['7-after-1.png'] });
check('wf post: a retry after a partial upload attaches only the missing selected picture, comments once', attachedOf(resumed) === '7-after-2.png' && resumed.calls.filter((c) => c.comment).length === 1 && resumed.calls.find((c) => c.comment)!.comment!.includes('!7-after-1.png|thumbnail!'), JSON.stringify(resumed.calls));

// JX-810 (2026-10-12): the requirement was corrected in a comment and the description rewritten while the round ran;
// wf post said "השינוי מוכן ב-PR וממתין למיזוג." and set Fixed in Local against the old text. It refuses now, and says what changed.
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
