// ports.selfcheck.mjs — node ports.selfcheck.mjs → exit 0 when green.
// ports.selfcheck.json is `wt step eval '{{ b | hash_port }}|{{ b | sanitize }}'` (worktrunk
// 0.76.0) for 307 names: the 97 branches of the JewelryX repo on 2026-09-27 and 210 generated ones
// (Hebrew, CJK, emoji, spaces, backslashes, lengths around SipHash's 8-byte blocks). A port that
// drifts from wt's moves a live worktree's stack and every URL wf prints for it.
import { readFileSync } from 'node:fs';
import { hashPort, sanitizeBranch } from './ports.mjs';

const table = JSON.parse(readFileSync(new URL('./ports.selfcheck.json', import.meta.url), 'utf8'));
const wrong = table.filter(([b, port, slug]) => hashPort(b) !== port || sanitizeBranch(b) !== slug);
for (const [b, port, slug] of wrong.slice(0, 10)) console.log(`  FAIL ${JSON.stringify(b)}: wt ${port} ${slug}, ours ${hashPort(b)} ${sanitizeBranch(b)}`);
console.log(wrong.length ? `\n${wrong.length} of ${table.length} FAILED` : `  ok   ${table.length} names: the same port and slug as wt\n\nall arms green`);
process.exit(wrong.length ? 1 : 0);
