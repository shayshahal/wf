// show.selfcheck.ts — node show.selfcheck.ts → exit 0 when green.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opensWindows } from '../../src/worktrees/editor.ts';
import type { Origins } from './index.ts';
import { openLineOf, paneText, parseOpen, setupArgs, setupLinesOf, showArgs, unMsys } from './show.ts';

assert.deepEqual(parseOpen('b2b /catalog as buyer mobile'), { app: 'b2b', path: '/catalog', as: 'buyer', mobile: true });
assert.deepEqual(parseOpen('admin /orders'), { app: 'admin', path: '/orders', as: 'admin', mobile: false });
assert.deepEqual(parseOpen('b2b /my-inventory as seller'), { app: 'b2b', path: '/my-inventory', as: 'seller', mobile: false });
assert.equal(parseOpen('the catalog, logged in'), null);
assert.deepEqual(parseOpen('admin products as admin'), { app: 'admin', path: '/products', as: 'admin', mobile: false });
assert.equal(parseOpen('admin C:/Program Files/Git/products'), null);
// #114: the T2 walk is a `- **T2 walk.**` bullet under `## Agreed` (AGREEMENT-TEMPLATE.md), not the
// old `## T2 walk` PLAN.md section — no shim for that heading.
const agreement = '# AGREEMENT — T-1\n\n## Observed\n- x\n\n## Agreed\n\n- **Behavior.** goes two-column.\n- **T2 walk.** open: `b2b /catalog as buyer mobile`\n\n## Verification\n\n| # | case | files | check |\n|---|---|---|---|\n| 1 | a | b | c |\n';
assert.equal(openLineOf(agreement), 'b2b /catalog as buyer mobile');
assert.equal(openLineOf(agreement.replace(/\n/g, '\r\n')), 'b2b /catalog as buyer mobile');
// A wrapped continuation belongs to the explicit walk bullet, not just any Agreed bullet.
assert.equal(openLineOf('## Agreed\n\n- **T2 walk.**\n  open: b2b /x as buyer\n'), 'b2b /x as buyer');
assert.equal(openLineOf('## Agreed\n\n- **Behavior.** a wrapped fact\n  open: a drawer stays open\n- **T2 walk.** open: b2b /x as buyer\n'), 'b2b /x as buyer');
assert.equal(openLineOf('## Agreed\n\n  open: a fact without a walk marker\n'), null);
// The old `## T2 walk` heading alone is not a walk; a fact that mentions "opens:" is not an `open:` line.
assert.equal(openLineOf('## T2 walk\nZoom.\n\n## Asks\nnone\n'), null);
assert.equal(openLineOf('## Agreed\n\nthe page opens: a fact\n'), null);
assert.equal(openLineOf(null), null);
const cli = 'docs/agents/verify-jewelryx/control-jewelryx.mjs';
assert.deepEqual(showArgs(parseOpen('b2b /catalog as seller mobile')!), [cli, 'open', 'b2b', '/catalog', 'as', 'seller', 'mobile', '--headed']);
assert.deepEqual(showArgs(parseOpen('admin /orders')!), [cli, 'open', 'admin', '/orders', 'as', 'admin', '--headed']);
const gitBash = { MSYSTEM: 'MINGW64', EXEPATH: 'C:\\Program Files\\Git\\bin' };
assert.equal(unMsys('C:/Program Files/Git/products', gitBash), '/products');
assert.equal(unMsys('C:/Program Files/Git/products', {}), 'C:/Program Files/Git/products');
assert.equal(unMsys('/b2b/orders?order=1', gitBash), '/b2b/orders?order=1');

// Under Claude Code: no window, the Browser pane's login and page (BJEW-562 T2, 2026-09-27).
assert.equal(opensWindows({ CLAUDECODE: '1' }), false);
assert.equal(opensWindows({}), true);
const pane = paneText(parseOpen('b2b /inventory as seller')!, { b2b: 'http://localhost:13111', admin: 'http://localhost:33111' } as Origins, 'fix-a');
assert.match(pane, /preview_start with name "fix-a b2b"/);
assert.match(pane, /the page: http:\/\/localhost:13111\/b2b\/inventory\n/);
assert.match(pane, /login: http:\/\/localhost:13111\/b2b\/login as seller@seed\.jewelryx \/ seed1234/);

// The T2 walk's setup lines: the data the page needs, made once per agreement through the CLI's api.
const walked = '- **T2 walk.** open: b2b /inventory/13bd/variants as seller\n  setup: api createVariant {"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}} as seller\n  setup: `api listInventory {} as seller`\nLook at the header.\n';
assert.deepEqual(setupLinesOf(walked), ['api createVariant {"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}} as seller', 'api listInventory {} as seller']);
assert.deepEqual(setupArgs(setupLinesOf(walked)[0])!.slice(1), ['api', 'createVariant', '{"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}}', '--as', 'seller']);
assert.equal(setupArgs('curl -X POST http://x'), null);
assert.deepEqual(setupLinesOf('- **T2 walk.** open: b2b / as buyer\n'), []);

// A stray `setup:`/`open:` fact outside the walk is not a walk line (#114 closure, F1/F1b): the walk
// is the `## Agreed` bullet, so a fact under `## Observed` neither hard-fails `wf show` nor shadows
// the real walk.
const stray = '# AGREEMENT — X\n\n## Observed\n- setup: the seed product has no variants\n- open: the drawer holds a stale count\n\n## Agreed\n\n- **Behavior.** changes\n- **T2 walk.** open: `b2b /catalog as buyer`\n  setup: api fixThing {} as seller\n';
assert.equal(openLineOf(stray), 'b2b /catalog as buyer');
assert.deepEqual(setupLinesOf(stray), ['api fixThing {} as seller']);
assert.equal(openLineOf('# AGREEMENT\n\n## Observed\n- open: a fact\n\n## Agreed\n- **Behavior.** x\n'), null);
// Only the walk's own continuations carry commands. Facts in Agreed, or in a Class A ticket's
// Intent, cannot execute setup or shadow the walk (936554a independent closure, F1 residual).
for (const prefix of ['## Agreed\n', '# TICKET\n\n## Intent\n']) {
	const bounded = `${prefix}\n- setup: an ordinary fact\n- **Behavior.** a wrapped fact\n  open: the drawer holds a stale count\n- **T2 walk.**\n  open: b2b /catalog as buyer\n  setup: api fixThing {} as seller\n- setup: a later ordinary fact\n  setup: another fact\n`;
	assert.equal(openLineOf(bounded), 'b2b /catalog as buyer');
	assert.deepEqual(setupLinesOf(bounded), ['api fixThing {} as seller']);
}
assert.deepEqual(setupLinesOf('- **T2 walk.** open: b2b / as buyer\n\n## Facts\n  setup: a fact after a heading\n'), []);

// Public CLI: `wf show` reads the new shape end to end. Under Claude Code it opens no window and
// prints the Browser pane's page, which is what proves the open line parsed (a parse failure exits
// before any of this).
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-show-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		const folder = 'bug-reports/T-1';
		mkdirSync(join(repo, '.wf'), { recursive: true });
		mkdirSync(join(repo, folder), { recursive: true });
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, round: 't-1', class: 'B', step: 'build', folder }));
		const run = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'wf.mjs');
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement);
		const out = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.match(out, /\/b2b\/catalog/);
		assert.match(out, /preview_start/);
		// The same end-to-end run with a stray `setup:` fact under `## Observed`: it is not run and does
		// not fail the command; the real walk (`## Agreed`) still opens.
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('## Observed\n- x\n', '## Observed\n- setup: the seed lacks the page, so it must be made by hand\n- open: the drawer holds a stale count\n'));
		const out2 = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.match(out2, /\/b2b\/catalog/);
		assert.doesNotMatch(out2, /stale count|made by hand/);
		// Public CLI regressions: normal Agreed facts and wrapped Behavior continuations, and the
		// same facts in Class A's TICKET.md, must all leave the actual walk usable.
		const facts = '- setup: an ordinary fact\n- **Behavior.** a wrapped fact\n  open: the drawer holds a stale count\n- **T2 walk.**\n  open: b2b /catalog as buyer\n- setup: a later ordinary fact\n';
		for (const klass of ['A', 'B']) {
			writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, round: 't-1', class: klass, step: 'build', folder }));
			writeFileSync(join(repo, folder, klass === 'A' ? 'TICKET.md' : 'AGREEMENT.md'), `${klass === 'A' ? '## Intent' : '## Agreed'}\n\n${facts}`);
			const shown = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
			assert.match(shown, /\/b2b\/catalog/);
			assert.doesNotMatch(shown, /stale count|ordinary fact/);
		}
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 2, round: 't-1', class: 'B', step: 'build', folder }));
		// A genuine malformed `setup:` inside the walk still fails, with the actionable message: the
		// scoping must not swallow real walk setups (only facts outside `## Agreed`).
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('- **T2 walk.** open: `b2b /catalog as buyer mobile`\n', '- **T2 walk.** open: `b2b /catalog as buyer mobile`\n  setup: curl -X POST http://x\n'));
		const bad = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(bad.status, 1, `${bad.stdout}\n${bad.stderr}`);
		assert.match(bad.stderr, /is not `api <fn> <json> as <buyer\|seller\|admin>`/);
		assert.match(bad.stderr, /Fix it in the agreement's \*\*T2 walk\.\*\* bullet/);
		assert.doesNotMatch(bad.stderr, /## T2 walk/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
}
console.log('all arms green');
