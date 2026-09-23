#!/usr/bin/env node
// Selfcheck for wf/decisions/parse.mjs: four valid fixtures pass, two bad fail.
import { strict as assert } from 'node:assert';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecord } from './parse.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

for (const f of ['valid-adr.md', 'valid-pdr.md', 'valid-ddr.md', 'valid-assumed.md']) {
  const r = parseRecord(join(FIX, f));
  assert.equal(r.errors.length, 0, `${f} should pass: ${r.errors.join('; ')}`);
  assert.match(r.frontmatter.hash, /^sha256:[0-9a-f]{64}$/);
  console.log(`pass: ${f}`);
}

const malformed = parseRecord(join(FIX, 'malformed.md'));
assert.ok(malformed.errors.some((e) => e.includes('who')), `malformed must complain about who: ${malformed.errors}`);
assert.ok(malformed.errors.some((e) => e.includes('status')), `malformed must complain about status: ${malformed.errors}`);
console.log('pass: malformed.md fails (who, status)');

const badHash = parseRecord(join(FIX, 'bad-hash.md'));
assert.ok(badHash.errors.some((e) => e.includes('hash mismatch')), `bad-hash must complain about hash: ${badHash.errors}`);
console.log('pass: bad-hash.md fails (hash mismatch)');

console.log('selfcheck: ok');
