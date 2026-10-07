// post.selfcheck.ts — node post.selfcheck.ts → exit 0 when green.
// Pure arms of wf post: the note's sections, the fill check, the pictures and the comment.
import { trackerNote } from './index.ts';
import { commentBody, markPosted, picturesOf, prNumberOf, sectionsOf, unfilled } from './post.ts';

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

if (failed) process.exit(1);
console.log('\nall arms green');
