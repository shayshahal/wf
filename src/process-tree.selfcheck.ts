import assert from 'node:assert/strict';
import { ownedProcessTree, parseProcessIdentities } from './process-tree.ts';

const parent = { pid: 41, parent: 1, born: '2026-10-15T10:00:00Z' };
const child = { pid: 42, parent: 41, born: '2026-10-15T10:00:01Z' };
const grandchild = { pid: 43, parent: 42, born: '2026-10-15T10:00:02Z' };
for (const processes of [[parent, child, grandchild], [grandchild, child, parent]]) {
	assert.deepEqual(new Set(ownedProcessTree([parent], processes).map((p) => p.pid)), new Set([41, 42, 43]));
}
assert.equal(ownedProcessTree([parent], [{ ...parent, born: '2026-10-15T11:00:00Z' }, child]).length, 1);
assert.equal(ownedProcessTree([parent], [parent, { ...child, born: '2026-10-15T09:00:00Z' }]).length, 1);
for (const raw of [null, {}, [null], [{ ...parent, pid: -1 }], [{ ...parent, born: 'unknown' }]]) assert.equal(parseProcessIdentities(raw), null);
assert.deepEqual(parseProcessIdentities([parent]), [parent]);
console.log('all process identity, reused parent and descendant ordering arms green');
