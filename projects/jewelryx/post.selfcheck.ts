// post.selfcheck.ts — node post.selfcheck.ts → exit 0 when green.
// Pure arms of wf post: the note's sections, the fill check, the pictures and the comment.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  if (u.includes('/attachments')) { const f = init.body.get('file'); log({ attach: f.name, type: f.type }); return json([]); }
  if (u.endsWith('/comment')) { log({ comment: JSON.parse(init.body).body }); return json({}); }
  if (u.includes('/transitions')) return method === 'POST' ? new Response(null, { status: 204 }) : json({ transitions: [{ id: '31', to: { name: 'Fixed in Local' } }] });
  return json({ fields: { attachment: [], comment: { comments: process.env.STUB_ALREADY ? [{ body: 'PR: https://github.com/x/y/pull/7' }] : [] } } });
};`);
function runPostIn(names: string[], already = false) {
  const repo = mkdtempSync(join(work, 'repo-'));
  spawnSync('git', ['init', '-q'], { cwd: repo });
  mkdirSync(join(repo, '.wf'));
  mkdirSync(join(repo, 'bug-reports/x/proof'), { recursive: true });
  writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ note: 'bug-reports/x/JIRA.md', folder: 'bug-reports/x' }));
  writeFileSync(join(repo, 'bug-reports/x/JIRA.md'), '## JX-1239\nתוקן ✅\nPR: https://github.com/x/y/pull/7\n');
  for (const n of names) writeFileSync(join(repo, 'bug-reports/x/proof', n), 'img');
  const log = join(repo, 'stub.log');
  writeFileSync(log, '');
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, fileURLToPath(new URL('./post.ts', import.meta.url))], { cwd: repo, encoding: 'utf8', env: { ...process.env, JIRA_EMAIL: 'a@b', JIRA_TOKEN: 't', STUB_LOG: log, ...(already ? { STUB_ALREADY: '1' } : {}) } });
  const calls: { attach?: string; type?: string; comment?: string }[] = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { run, calls, note: readFileSync(join(repo, 'bug-reports/x/JIRA.md'), 'utf8') };
}
const cli = runPostIn(incident);
check('wf post: the named screenshots are attached to the issue, by their type', cli.calls.filter((c) => c.attach).map((c) => `${c.attach}:${c.type}`).sort().join() === '7-after-he-1024-assess.png:image/png,7-after-he-1280-assess.png:image/png,7-after-start-now-checked.png:image/png', JSON.stringify(cli.calls) + cli.run.stderr);
check('wf post: the comment shows them, and no before', cli.calls.some((c) => c.comment?.includes('!7-after-he-1280-assess.png|thumbnail!') && !c.comment.includes('לפני:')), JSON.stringify(cli.calls));
check('wf post: its last line names what was attached and what was refused', /posted with 3 picture\(s\).*attached 3: .*NOT attached .*: listing\.png/.test(cli.run.stdout) && cli.note.includes('## JX-1239 (posted)'), cli.run.stdout + cli.run.stderr);
const jpg = runPostIn(['before-a.jpg', 'after-a.webp']);
check('wf post: jpg and webp go up with their own type', jpg.calls.filter((c) => c.attach).map((c) => c.type).sort().join() === 'image/jpeg,image/webp', JSON.stringify(jpg.calls));
const again = runPostIn(incident, true);
check('wf post: a comment with the PR already there is not posted again, nor its pictures re-attached', again.calls.length === 0 && /already posted/.test(again.run.stdout), JSON.stringify(again.calls) + again.run.stdout);
rmSync(work, { recursive: true, force: true });

if (failed) process.exit(1);
console.log('\nall arms green');
