import assert from 'node:assert/strict';
import { pendingCompletion, sectionSha, sectionsOf, trackerCompletionGap } from './post-completion.ts';
import type { State } from '../../src/round/state.ts';

const delivery = {url:'https://github.com/o/r/pull/191',head:'a'.repeat(40),contentSha:'tree:'+'b'.repeat(40)};
const note = (keys: string[]) => keys.map((key) => `## ${key} (posted)\nnotification\npictures: none\nPR: ${delivery.url}\n`).join('\n');
const text = note(['X-1', 'X-2']);
const sections = sectionsOf(text);
const completed: State = {step:'merged',ids:['X-1','X-2'],delivery,post_completion:{delivery,sections:sections.map((s)=>({key:s.key,sha:sectionSha(s)}))}};
assert.equal(trackerCompletionGap(completed,text),null);
assert.match(trackerCompletionGap({...completed,post_completion:undefined},text) ?? '',/pending/);
assert.match(trackerCompletionGap({...completed,delivery:undefined},text) ?? '',/receipt missing/);
assert.match(trackerCompletionGap(completed,null) ?? '',/unknown/);
assert.match(trackerCompletionGap(completed,note(['X-1'])) ?? '',/missing/);
assert.match(trackerCompletionGap(completed,note(['X-1','X-1'])) ?? '',/unknown/);
assert.match(trackerCompletionGap(completed,text.replaceAll('/pull/191','/pull/1910')) ?? '',/pending/);
assert.match(trackerCompletionGap(completed,text.replace('## X-1 (posted)','## X-1')) ?? '',/pending/);
assert.match(trackerCompletionGap({...completed,delivery:{...delivery,head:'d'.repeat(40)}},text) ?? '',/pending/);
assert.match(trackerCompletionGap({...completed,delivery:{...delivery,contentSha:'tree:'+'e'.repeat(40)}},text) ?? '',/pending/);
assert.equal(trackerCompletionGap({...completed,step:'pr',delivery:undefined},text),null,'OPEN never requires delivered status');
assert.equal(trackerCompletionGap(completed,text.replace(/\n/g,'\r\n')),null,'legacy CRLF retains exact section meaning');
// Every subset of acknowledgements leaves exactly the other tickets pending; section order is irrelevant.
for(let mask=0;mask<16;mask++) {
	const keys=['X-1','X-2','X-3','X-4'];
	const text=note(keys);
	const acknowledged=sectionsOf(text).filter((_,n)=>mask & (1<<n)).map((s)=>({key:s.key,sha:sectionSha(s)}));
	const state: State={step:'merged',ids:keys,delivery,...(acknowledged.length?{post_completion:{delivery,sections:acknowledged}}:{})};
	assert.deepEqual(pendingCompletion(state,text).map((s)=>s.key),keys.filter((_,n)=>!(mask & (1<<n))));
	assert.equal(trackerCompletionGap(state,text)===null,mask===15);
	assert.equal(trackerCompletionGap(state,note([...keys].reverse()))===null,mask===15);
}
console.log('tracker completion routing, identity and acknowledgement subset checks green');
