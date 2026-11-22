// worktree-processes.selfcheck.ts — node worktree-processes.selfcheck.ts → exit 0 when green.
// Reap (2026-11-22, fix/jx-1085-search-icon-placement): the round's agent had started a Playwright daemon
// (playwright-cli) from the worktree's own node_modules, `node <worktree>\verification\node_modules\
// .pnpm\playwright-core@…\lib\entry\cliDaemon.js default`, with a chrome.exe under it. Neither wf serve
// nor cjx started it, so reap's "stop owned servers" step left it, and it held the folder: the delete
// failed. After that step the daemon and its child must be gone and the folder must delete, while a
// process merely parked in the worktree (an agent's shell) and one outside it keep running.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removalPlan } from './git-worktree.ts';
import { commandScript, processInventory, staleServeLeftovers, worktreeProcessTrees } from './worktree-processes.ts';
import type { ProcessDetail } from './worktree-processes.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; /* ESRCH: gone */ } };
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Pure: the script a command line runs.
assert.equal(commandScript('"C:\\Program Files\\nodejs\\node.exe" C:\\wt\\a\\x.js default', null, 'win32'), 'C:\\wt\\a\\x.js', 'the first argument after a quoted executable');
assert.equal(commandScript('node --inspect "C:\\wt\\my dir\\x.js"', null, 'win32'), 'C:\\wt\\my dir\\x.js', 'flags skipped, a quoted path kept whole');
assert.equal(commandScript('C:\\Windows\\system32\\cmd.exe /d /s /c "pnpm dev:backend"', 'C:\\wt', 'win32'), resolve('C:\\wt', 'pnpm dev:backend'), 'cmd\'s switches are skipped; its command is no file, so the isFile check rejects it');
assert.equal(commandScript('bash', '/wt', 'linux'), null, 'a shell with no arguments runs no script');
assert.equal(commandScript('node scripts/dev.mjs', null, 'linux'), null, 'a relative script with no known cwd is not guessed');

// Pure: reap's selection and a gone serve root's, on a made-up process table. Files are real: a script
// counts only when it is a file inside the worktree.
{
	const wt = mkdtempSync(join(tmpdir(), 'wf-wp-pure-'));
	mkdirSync(join(wt, 'node_modules', 'x'), { recursive: true });
	const js = join(wt, 'node_modules', 'x', 'x.js');
	writeFileSync(js, '');
	const node = 'C:\\node\\node.exe';
	const at = (minute: number) => `2026-11-22T11:${String(minute).padStart(2, '0')}:00.0000000Z`;
	const p = (pid: number, parent: number, minute: number, rest: Partial<ProcessDetail> = {}): ProcessDetail => ({ pid, parent, born: at(minute), exe: node, command: null, cwd: null, ...rest });
	const me = p(process.pid, 1, 0);
	const table = [
		me,
		p(10, 1, 5, { command: `node ${js} default` }), // a daemon run from the worktree
		p(11, 10, 6, { exe: 'C:\\chrome\\chrome.exe' }), // its browser
		p(20, 1, 7, { cwd: wt }), // a shell parked in the worktree, parent alive
		p(30, 99, 31, { cwd: wt }), // an orphan in the worktree, born after the root
		p(31, 99, 20, { cwd: wt }), // an orphan in the worktree, born before the root
		p(40, 77, 32), // the gone root's child, outside the worktree
		p(50, 1, 33, { command: 'node C:\\elsewhere\\x.js', cwd: 'C:\\elsewhere' }), // a stranger
	];
	const pids = (list: ProcessDetail[]) => list.map((q) => q.pid).sort((a, b) => a - b).join(',');
	assert.equal(pids(worktreeProcessTrees(wt, table)), '10,11', 'reap: the daemon and its browser, not the parked shell, the orphans by cwd alone or the stranger');
	assert.equal(pids(staleServeLeftovers(wt, { pid: 77, parent: 1, born: at(30) }, table)), '30,40', 'a gone root: its child and the orphan in the worktree born after it; not the older daemon, the parked shell or the stranger');
	assert.equal(pids(worktreeProcessTrees(wt, [{ ...me, command: `node ${js}` }, p(60, process.pid, 40, { command: `node ${js}` })])), '60', 'this process is never chosen, even run from the worktree');
	rmSync(wt, { recursive: true, force: true });
}

// The inventory reads a command line outside the console's code page: another agent's `RPT-040 → RPT-042`
// came through the pipe as a raw 0x1A byte, and the whole list was unknown (2026-11-22).
{
	const arrow = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'RPT-040 → RPT-042'], { stdio: 'ignore', windowsHide: true });
	try {
		await sleep(300);
		const seen = processInventory();
		assert(seen.kind === 'known', 'the process list reads with a non-ASCII command line on the machine');
		assert(seen.processes.find((q) => q.pid === arrow.pid)?.command?.endsWith('RPT-040 → RPT-042"') || process.platform !== 'win32', 'the command line reads back as written');
	} finally { arrow.kill(); }
}

const tree = mkdtempSync(join(tmpdir(), 'wf-reap-daemon-'));
const outside = mkdtempSync(join(tmpdir(), 'wf-reap-outside-'));
const entry = join(tree, 'verification', 'node_modules', '.pnpm', 'playwright-core@1.64.0', 'node_modules', 'playwright-core', 'lib', 'entry');
const childPid = join(outside, 'child.pid');
mkdirSync(entry, { recursive: true });
// The daemon starts its browser (a stand-in for chrome.exe: its executable and script are outside the
// worktree, so only the process tree ties it to the daemon) and runs until stopped.
writeFileSync(join(entry, 'cliDaemon.js'), `const { spawn } = require('node:child_process');
const browser = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
require('node:fs').writeFileSync(${JSON.stringify(childPid)}, String(browser.pid));
setInterval(() => {}, 1000);
`);
writeFileSync(join(outside, 'other.js'), 'setInterval(() => {}, 1000);\n');
const daemon = spawn(process.execPath, [join(entry, 'cliDaemon.js'), 'default'], { cwd: tree, detached: true, stdio: 'ignore', windowsHide: true });
daemon.unref();
const parked = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: tree, stdio: 'ignore', windowsHide: true });
const stranger = spawn(process.execPath, [join(outside, 'other.js')], { cwd: outside, stdio: 'ignore', windowsHide: true });
let browser = 0;
try {
	for (let i = 0; i < 100 && !existsSync(childPid); i++) await sleep(100);
	browser = Number(readFileSync(childPid, 'utf8'));
	assert(daemon.pid && parked.pid && stranger.pid && alive(browser), 'the daemon and its browser run');
	const [stop] = removalPlan({ path: tree, slug: 'fix-reap-daemon', pid: process.pid });
	assert.equal(stop.label, 'stop owned servers', 'the step name reap\'s recovery journal binds is unchanged');
	await stop.run!();
	await sleep(200);
	assert(!alive(daemon.pid), 'reap: the daemon whose script is in the worktree is stopped');
	assert(!alive(browser), 'reap: the browser under it is stopped, by process tree');
	assert(alive(parked.pid), 'reap: a process parked in the worktree (an agent\'s shell) is not touched');
	assert(alive(stranger.pid), 'reap: a process outside the worktree is not touched');
	parked.kill();
	await new Promise((done) => parked.once('exit', done));
	let removed: string | null = null;
	try { rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { removed = (e as Error).message; }
	assert.equal(removed, null, `reap: the worktree deletes once the daemon is stopped: ${removed}`);
	console.log('worktree-processes: ok');
} finally {
	for (const pid of [daemon.pid, parked.pid, stranger.pid, browser]) if (pid && alive(pid)) process.kill(pid);
	await sleep(300);
	rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	rmSync(outside, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
