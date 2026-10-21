// show.selfcheck.ts — node show.selfcheck.ts → exit 0 when green.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opensWindows } from '../../src/worktrees/editor.ts';
import { agreementSha } from '../../src/round/agreement.ts';
import type { Origins } from './index.ts';
import { noneLineOf, openLineOf, paneText, parseOpen, setupArgs, setupLinesOf, showArgs, unMsys } from './show.ts';

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
for (const marker of ['T2 walk:', 'T2 walk.', 'T2 walk', '**T2 walk:**', '**T2 walk**:']) {
	const plain = agreement.replace('**T2 walk.**', marker);
	assert.equal(openLineOf(plain), 'b2b /catalog as buyer mobile', marker);
	assert.deepEqual(setupLinesOf(plain.replace('mobile`', 'mobile`\n  setup: api fixThing {} as seller')), ['api fixThing {} as seller'], marker);
}
assert.equal(openLineOf(agreement.replace(/\n/g, '\r\n')), 'b2b /catalog as buyer mobile');
// A wrapped continuation belongs to the explicit walk bullet, not just any Agreed bullet.
assert.equal(openLineOf('## Agreed\n\n- **T2 walk.**\n  open: b2b /x as buyer\n'), 'b2b /x as buyer');
assert.equal(openLineOf('## Agreed\n\n- **Behavior.** a wrapped fact\n  open: a drawer stays open\n- **T2 walk.** open: b2b /x as buyer\n'), 'b2b /x as buyer');
assert.equal(openLineOf('## Agreed\n\n  open: a fact without a walk marker\n'), null);
// The old `## T2 walk` heading alone is not a walk; a fact that mentions "opens:" is not an `open:` line.
assert.equal(openLineOf('## T2 walk\nZoom.\n\n## Asks\nnone\n'), null);
assert.equal(openLineOf('## Agreed\n\nthe page opens: a fact\n'), null);
assert.equal(openLineOf(null), null);
// #139, JX-1068: an explicit `none — <why>` is the round's own answer when nothing is visible; wf show
// prints it instead of the generic "pass it" fallback. Both the em dash and the ASCII forms read.
assert.equal(noneLineOf(agreement.replace('- **T2 walk.** open: `b2b /catalog as buyer mobile`', '- **T2 walk.** none — the API test is the proof')), 'none — the API test is the proof');
assert.equal(noneLineOf('# TICKET\n\n## Intent\n- x\n\n- **T2 walk.** none: nothing visible this round\n'), 'none — nothing visible this round');
assert.equal(noneLineOf('# TICKET\n\n## Intent\n- x\n\n- **T2 walk.** none - nothing visible\n'), 'none — nothing visible');
assert.equal(noneLineOf(agreement), null);
assert.equal(noneLineOf('# TICKET\n\n## Intent\n- x\n'), null);
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
	const plain = bounded.replace('**T2 walk.**', 'T2 walk:');
	assert.equal(openLineOf(plain), 'b2b /catalog as buyer');
	assert.deepEqual(setupLinesOf(plain), ['api fixThing {} as seller']);
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
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: 'B', step: 'build', folder }));
		const run = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'wf.mjs');
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement);
		const out = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.match(out, /\/b2b\/catalog/);
		assert.match(out, /preview_start/);
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('**T2 walk.**', 'T2 walk:'));
		const plain = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.match(plain, /\/b2b\/catalog/);
		assert.match(plain, /preview_start/);
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
			writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: klass, step: 'build', folder }));
			writeFileSync(join(repo, folder, klass === 'A' ? 'TICKET.md' : 'AGREEMENT.md'), `${klass === 'A' ? '## Intent' : '## Agreed'}\n\n${facts}`);
			const shown = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
			assert.match(shown, /\/b2b\/catalog/);
			assert.doesNotMatch(shown, /stale count|ordinary fact/);
		}
		// #139: the round's own explicit none is printed, and nothing opens; with no walk at all the
		// refusal names the round's file rather than "the agreement" on a class A ticket.
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: 'A', step: 'assess', folder }));
		writeFileSync(join(repo, folder, 'TICKET.md'), '# t\n## Intent\n- x\n\n- **T2 walk.** none — nothing visible to walk\n');
		const noneOut = execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.match(noneOut, /none — nothing visible to walk/);
		assert.doesNotMatch(noneOut, /preview_start/);
		writeFileSync(join(repo, folder, 'TICKET.md'), '# t\n## Intent\n- x\n');
		const missing = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(missing.status, 2, `${missing.stdout}\n${missing.stderr}`);
		assert.match(missing.stderr, /TICKET\.md's T2 walk bullet/);
		assert.doesNotMatch(missing.stderr, /b2b \/catalog as buyer mobile/);
		// #139: real wf show -> a recording control CLI. A build's reset leaves no scenario;
		// T2 replays the ticket's setup before opening the page, once per completed recipe.
		const control = join(repo, 'docs/agents/verify-jewelryx');
		mkdirSync(control, { recursive: true });
		writeFileSync(join(control, 'control-jewelryx.mjs'), `import fs from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'api' && args[1] === 'checkScenario') process.exit(fs.existsSync('scenario.json') && JSON.parse(fs.readFileSync('scenario.json')).label === JSON.parse(args[2]).body.label ? 0 : 1);
if (args[0] !== 'api' || args[1] !== 'makeScenario') process.exit(1);
const calls = fs.existsSync('control-calls.json') ? JSON.parse(fs.readFileSync('control-calls.json', 'utf8')) : [];
fs.writeFileSync('control-calls.json', JSON.stringify([...calls, args]));
fs.writeFileSync('scenario.json', JSON.stringify(JSON.parse(args[2]).body));
console.log('HTTP 200');
`);
		const ticketWalk = (label: string) => `# t\n## Intent\n- x\n\n## Notes\n- **T2 walk.** open: b2b /catalog/necklaces as buyer\n  ready: api checkScenario {"body":{"label":"${label}"}} as seller\n  setup: api makeScenario {"body":{"label":"${label}"}} as seller\n`;
		writeFileSync(join(repo, 'scenario.json'), '{"label":"build scenario"}');
		rmSync(join(repo, 'scenario.json')); // The build reset its scenario before T2.
		writeFileSync(join(repo, folder, 'TICKET.md'), ticketWalk('variants'));
		const intentSha = agreementSha(repo, 'A', folder);
		const show = () => execFileSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		const replay = show();
		assert.match(replay, /setup: .*HTTP 200/);
		assert.match(replay, /\/b2b\/catalog\/necklaces/);
		assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'variants');
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'control-calls.json'), 'utf8')).length, 1);
		// Intent did not change, but its setup recipe did: the old Intent sha cannot cache it.
		writeFileSync(join(repo, folder, 'TICKET.md'), ticketWalk('corrected scenario'));
		assert.equal(agreementSha(repo, 'A', folder), intentSha);
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'corrected scenario');
		const calls = JSON.parse(readFileSync(join(repo, 'control-calls.json'), 'utf8'));
		assert.equal(calls.length, 2);
		rmSync(join(repo, 'scenario.json'));
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'corrected scenario');
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'control-calls.json'), 'utf8')).length, 3);
		assert.deepEqual(calls[0], ['api', 'makeScenario', '{"body":{"label":"variants"}}', '--as', 'seller']);
		// A project-owned script supplies the same prepare/reset/readback for assessment and T2.
		writeFileSync(join(repo, 'scenario.mjs'), `import fs from 'node:fs';
const mode = process.argv[2];
if (mode === 'ready') process.exit(fs.existsSync('scenario.json') && JSON.parse(fs.readFileSync('scenario.json')).label === 'script scenario' ? 0 : 1);
if (mode === 'reset') { fs.rmSync('scenario.json', { force: true }); process.exit(0); }
const calls = fs.existsSync('script-calls.json') ? JSON.parse(fs.readFileSync('script-calls.json')) : [];
fs.writeFileSync('script-calls.json', JSON.stringify([...calls, mode]));
fs.writeFileSync('scenario.json', JSON.stringify({label:'script scenario'}));
`);
		const scriptWalk = '# t\n## Intent\n- x\n## Notes\n- **T2 walk.** open: b2b /orders as buyer\n  ready: script ["node","scenario.mjs","ready"]\n  reset: script ["node","scenario.mjs","reset"]\n  setup: script ["node","scenario.mjs","prepare"]\n';
		writeFileSync(join(repo, folder, 'TICKET.md'), scriptWalk);
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'script scenario');
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'script-calls.json'), 'utf8')).length, 1);
		execFileSync(process.execPath, ['scenario.mjs', 'reset'], { cwd: repo });
		show();
		assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'script scenario');
		assert.equal(JSON.parse(readFileSync(join(repo, 'script-calls.json'), 'utf8')).length, 2);
		// A continuing limitation is allowed; later live work replaces it without cached none.
		writeFileSync(join(repo, folder, 'TICKET.md'), '# t\n## Intent\n- x\n- **T2 walk.** none — external payment credentials unavailable; local captures do not reproduce settlement\n');
		assert.match(show(), /none — external payment credentials unavailable/);
		writeFileSync(join(repo, folder, 'TICKET.md'), scriptWalk);
		assert.match(show(), /b2b\/orders/);
		// B/C use the same live readback/reset owner, preserving their agreement and approval path.
		for (const klass of ['B', 'C']) {
			writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: klass, step: 'build', folder }));
			writeFileSync(join(repo, folder, 'AGREEMENT.md'), scriptWalk.replace('## Notes', '## Agreed'));
			execFileSync(process.execPath, ['scenario.mjs', 'reset'], { cwd: repo });
			assert.match(show(), /b2b\/orders/);
			assert.equal(JSON.parse(readFileSync(join(repo, 'scenario.json'), 'utf8')).label, 'script scenario');
		}
		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: 'A', step: 'build', folder }));
		// Old completion tokens cannot authorize opening a scenario without readback.
		writeFileSync(join(repo, folder, 'TICKET.md'), scriptWalk.replace(/  ready:.*\n/, ''));
		const missingReady = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(missingReady.status, 1);
		assert.match(missingReady.stderr, /requires ready readback/);
		// Successful setup alone cannot certify readiness.
		writeFileSync(join(repo, folder, 'TICKET.md'), scriptWalk.replace('"ready"]', '"missing"]'));
		writeFileSync(join(repo, 'scenario.mjs'), "process.exit(process.argv[2] === 'missing' ? 1 : 0);");
		const unreadable = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(unreadable.status, 1);
		assert.match(unreadable.stderr, /scenario readback failed/);
		assert.doesNotMatch(unreadable.stdout, /Browser pane/);
		writeFileSync(join(repo, 'scenario.mjs'), "process.exit(process.argv[2] === 'missing' ? 2 : 0);");
		const unavailable = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(unavailable.status, 1);
		assert.match(unavailable.stderr, /no reset attempted/);
		assert.doesNotMatch(unavailable.stdout, /setup:/);
		writeFileSync(join(repo, 'scenario.mjs'), "process.exit(process.argv[2] === 'missing' ? 1 : 3);");
		const failedSetup = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(failedSetup.status, 1);
		assert.match(failedSetup.stderr, /setup .*failed/);
		assert.doesNotMatch(failedSetup.stdout, /Browser pane/);
		writeFileSync(join(repo, folder, 'TICKET.md'), scriptWalk.replace('["node","scenario.mjs","prepare"]', '["node",42]'));
		const malformed = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(malformed.status, 1);
		assert.match(malformed.stderr, /setup is not/);
		assert.doesNotMatch(malformed.stdout, /setup:/);

		writeFileSync(join(repo, '.wf', 'state.json'), JSON.stringify({ wf_version: 3, round: 't-1', class: 'B', step: 'build', folder }));
		// A genuine malformed `setup:` inside the walk still fails, with the actionable message: the
		// scoping must not swallow real walk setups (only facts outside `## Agreed`).
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('- **T2 walk.** open: `b2b /catalog as buyer mobile`\n', '- **T2 walk.** open: `b2b /catalog as buyer mobile`\n  setup: curl -X POST http://x\n'));
		const bad = spawnSync(process.execPath, [run, 'show'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' } });
		assert.equal(bad.status, 1, `${bad.stdout}\n${bad.stderr}`);
		assert.match(bad.stderr, /is not `api <fn> <json> as <buyer\|seller\|admin>`/);
		assert.match(bad.stderr, /Fix it in the agreement's T2 walk bullet/);
		assert.doesNotMatch(bad.stderr, /## T2 walk/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
}
console.log('all arms green');
