// Post completion authority is rehydrated through the real state boundary, never inferred from absence.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CorruptStateError, legacyStateGap, readState, stateFile, writeState, WF_STATE_VERSION } from './state.ts';

const dir = mkdtempSync(join(tmpdir(), 'wf-post-completion-'));
const delivery = { url: 'https://github.com/o/r/pull/191', head: 'a'.repeat(40), contentSha: 'tree:' + 'b'.repeat(40) };
const section = { key: 'X-1', sha: 'c'.repeat(64) };
try {
	writeState(dir, () => ({ wf_version: 5, step: 'merged', delivery }));
	assert.equal(readState(dir)?.post_completion, undefined, 'legacy missing completion remains absent, not corrupt or success');
	assert.equal(legacyStateGap(readState(dir)), null, 'version 5 remains readable');
	writeState(dir, () => ({ post_completion: { delivery, sections: [section] } }));
	assert.equal(readState(dir)?.wf_version, WF_STATE_VERSION, 'authority write fences runtimes that would ignore completion');
	assert.deepEqual(readState(dir)?.post_completion, { delivery, sections: [section] });
	const invalid: unknown[] = [null, [], {}, {delivery}, {delivery,sections:[]}, {delivery,sections:[null]}, {delivery,sections:[section,section]}, {delivery,sections:[{...section,sha:'short'}]}, {delivery,sections:[{...section,key:''}]}, {delivery:{...delivery,head:'short'},sections:[section]}, {delivery:{...delivery,url:'https://example.com/pull/1'},sections:[section]}];
	for (const value of invalid) {
		const bytes = JSON.stringify({ wf_version: 6, delivery, post_completion: value });
		writeFileSync(stateFile(dir), bytes);
		assert.throws(() => readState(dir), CorruptStateError);
		assert.throws(() => writeState(dir, () => ({ round: 'replacement' })), CorruptStateError);
		assert.equal(readFileSync(stateFile(dir), 'utf8'), bytes, 'invalid recovery authority stays intact');
	}
	// Generated subsets exercise preservation/rehydration of independently acknowledged tickets.
	for (let mask = 1; mask < 16; mask++) {
		const sections = [0, 1, 2, 3].filter((n) => mask & (1 << n)).map((n) => ({key:`X-${n}`,sha:String(n).repeat(64)}));
		writeFileSync(stateFile(dir), JSON.stringify({wf_version:5}));
		writeState(dir, () => ({delivery,post_completion:{delivery,sections}}));
		assert.deepEqual(readState(dir)?.post_completion?.sections, sections);
	}
	console.log('post completion state parsing, corruption preservation and subset roundtrips green');
} finally { rmSync(dir, {recursive:true,force:true}); }
