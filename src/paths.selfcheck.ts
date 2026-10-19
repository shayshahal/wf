// paths.selfcheck.ts — printable entry commands retain paths with spaces without a harness.
import { strict as assert } from 'node:assert';
import { wfCommand } from './paths.ts';

assert.equal(wfCommand('C:\\a folder\\wf.mjs'), 'node "C:/a folder/wf.mjs"');
assert.equal(wfCommand('/a folder/wf.mjs'), 'node "/a folder/wf.mjs"');
console.log('quoted entry commands green');
