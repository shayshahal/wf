// ticket-changes.selfcheck.ts — node ticket-changes.selfcheck.ts → exit 0 when green.
// Pure arms of the ticket-changed gate, on the JX-810 thread of 2026-10-12 (times as Jira returns them).
import { baselineOf, changesOf, changesSince, isOwnPost, jiraTime, refusalText } from './ticket-changes.ts';
import type { History, IssueComment } from './ticket-changes.ts';

let failed = 0;
const check = (name: string, cond: unknown, detail = '') => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : ` — ${detail}`}`); if (!cond) failed++; };

const einat = { displayName: 'Einat Shahal' };
const shay = { displayName: 'shay shahal' };
const histories: History[] = [
	{ created: '2026-10-07T14:35:45.226+0300', author: einat, items: [{ field: 'description' }] },
	{ created: '2026-10-12T11:58:30.851+0300', author: shay, items: [{ field: 'status' }] },
	{ created: '2026-10-12T13:19:05.562+0300', author: einat, items: [{ field: 'summary' }] },
	{ created: '2026-10-12T13:42:38.549+0300', author: einat, items: [{ field: 'Component' }, { field: 'Component' }] },
	{ created: '2026-10-12T13:43:02.638+0300', author: einat, items: [{ field: 'description' }] },
	{ created: '2026-10-12T15:14:09.402+0300', author: shay, items: [{ field: 'status' }] },
];
const post = 'תוקן ✅\nמה היה: x\nPR: https://github.com/x/y/pull/333';
const comments: IssueComment[] = [
	{ body: 'old', created: '2026-09-30T10:00:00.000+0300', updated: '2026-09-30T10:00:00.000+0300', author: einat },
	{ body: 'תיקון דרישה', created: '2026-10-12T13:18:34.637+0300', updated: '2026-10-12T13:18:34.637+0300', author: einat },
	{ body: 'לפני שמתחילים — שאלה', created: '2026-10-12T13:26:59.256+0300', updated: '2026-10-12T13:26:59.256+0300', author: shay },
	{ body: post, created: '2026-10-12T15:14:08.821+0300', updated: '2026-10-12T15:14:08.821+0300', author: shay },
];
const since = '2026-10-12T09:00:03.000Z'; // 12:00:03 in Jira's +0300

check('Jira\'s offset without a colon parses', jiraTime('2026-10-12T13:43:02.638+0300') === Date.parse('2026-10-12T10:43:02.638Z'));

const own = (body: string) => isOwnPost(body, post, '333');
const changes = changesSince({ since, histories, comments, own });
check('JX-810: the comments and the description and title edits after the round began, oldest first, with who and when',
	changes.map((c) => `${c.at.slice(11, 16)} ${c.who}: ${c.what}`).join('; ') === '13:18 Einat Shahal: comment added; 13:19 Einat Shahal: title edited; 13:26 shay shahal: comment added; 13:43 Einat Shahal: description edited', JSON.stringify(changes));
check('status moves, component edits and the round\'s own post are not changes', !changes.some((c) => c.at.startsWith('2026-10-12T15:14') || c.at.startsWith('2026-10-12T13:42')));
check('without telling its own post apart, that post is a change too (the 15:14 comment)', changesSince({ since, histories, comments }).some((c) => c.at.startsWith('2026-10-12T15:14:08')));
check('before the round began nothing counts', changesSince({ since: '2026-10-13T00:00:00.000Z', histories, comments, own }).length === 0);
check('a comment edited after the round began counts, though written before', changesSince({ since, histories: [], comments: [{ body: 'x', created: '2026-09-30T10:00:00.000+0300', updated: '2026-10-12T14:00:00.000+0300', author: einat }] }).map((c) => c.what).join() === 'comment edited');

check('a post of this PR is the round\'s own', isOwnPost(`${post}\r\n\r\nלפני:\r\n!333-before-1.png|thumbnail!`, post, '333'));
check('a person quoting the PR url is not', !isOwnPost('נבדק? https://github.com/x/y/pull/333', post, '333'));
check('another PR\'s post is not', !isOwnPost(post, post, '334'));

check('a state with no step history has no baseline', baselineOf({ id: 'JX-1' }) === null);
check('the round\'s first step is the baseline', baselineOf({ history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }, { step: 'build', at: '2026-10-12T09:30:00.000Z' }] }) === '2026-10-12T09:00:03.000Z');
check('a recorded re-read moves the baseline up', baselineOf({ ticket_read: '2026-10-12T11:00:00.000Z', history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }] }) === '2026-10-12T11:00:00.000Z');
check('a re-read recorded before the first step does not move it back', baselineOf({ ticket_read: '2026-10-12T08:00:00.000Z', history: [{ step: 'classify', at: '2026-10-12T09:00:03.000Z' }] }) === '2026-10-12T09:00:03.000Z');

const text = refusalText(since, [{ key: 'JX-810', changes }, { key: 'JX-811', changes: [] }], 'run wf post again');
check('the refusal names the issue, who, when, which, and the way past', !!text && text.includes('JX-810 changed since the round began') && text.includes('Einat Shahal, 2026-10-12T13:43:02.638+0300: description edited') && text.includes('wf post --ticket-reread') && !text.includes('JX-811'), String(text));
check('nothing changed: no refusal', refusalText(since, [{ key: 'JX-810', changes: [] }], 'x') === null);

// changesOf reads every page of the changelog.
const paths: string[] = [];
const get = async (path: string) => {
	paths.push(path);
	if (path.includes('/changelog')) return path.includes('startAt=0') ? { values: histories.slice(0, 3), isLast: false } : { values: histories.slice(3), isLast: true };
	return { fields: { comment: { comments } } };
};
const fetched = await changesOf(get, 'JX-810', since, own);
check('changesOf pages the changelog to its end', fetched.length === 4 && paths.filter((p) => p.includes('/changelog')).length === 2, paths.join(' '));

if (failed) process.exit(1);
console.log('\nall arms green');
