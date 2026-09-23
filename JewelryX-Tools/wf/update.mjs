// update.mjs — the installed wf: every session runs a copy of origin/tools/workflow-v2 in LIVE,
// never the workflow-v2 checkout, where another session's uncommitted edit would go live at once
// (2026-09-23: a reap change whose self-check crashed). `wf update` fetches and installs;
// wf.mjs calls autoUpdate() first on every run, so a push from this machine is live on the next
// wf command, with one stderr line saying so.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE = join(homedir(), '.local', 'share', 'jewelryx-wf');
const REF = 'refs/remotes/origin/tools/workflow-v2';
const PATHS = ['JewelryX-Tools', 'scripts/worktree-ports.mjs', 'docs/agents', '.gitattributes'];

const git = (gitDir, args) => execFileSync('git', [`--git-dir=${gitDir}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commonGitDir = () => {
	try { return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};
const installedRevision = () => { try { return readFileSync(join(LIVE, 'REVISION'), 'utf8').trim(); } catch { return null; } };

// Pure: update only a running installed copy, only when the pushed branch moved.
export function shouldUpdate({ runningFromLive, installed, published }) {
	return Boolean(runningFromLive && installed && published && installed !== published);
}

// One installer at a time: a second wf run while one installs keeps the current copy.
function withLock(fn) {
	const lock = `${LIVE}.lock`;
	try { if (Date.now() - statSync(lock).mtimeMs > 120_000) rmSync(lock, { recursive: true, force: true }); } catch { /* no lock */ }
	try { mkdirSync(lock); } catch { return null; }
	try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

export function install(gitDir, rev) {
	return withLock(() => {
		const fresh = `${LIVE}.new`;
		rmSync(fresh, { recursive: true, force: true });
		mkdirSync(fresh, { recursive: true });
		// The tar sits inside the target and is named relatively: Git Bash's tar reads "C:" as a host.
		git(gitDir, ['archive', '--format=tar', '-o', join(fresh, '_wf.tar'), rev, ...PATHS]);
		execFileSync('tar', ['-xf', '_wf.tar'], { cwd: fresh });
		rmSync(join(fresh, '_wf.tar'));
		writeFileSync(join(fresh, 'REVISION'), `${rev}\n`);
		// Swap whole, so a half-written copy is never live; links point at LIVE's path and follow.
		const old = `${LIVE}.old`;
		rmSync(old, { recursive: true, force: true });
		if (existsSync(LIVE)) renameSync(LIVE, old);
		renameSync(fresh, LIVE);
		rmSync(old, { recursive: true, force: true });
		for (const dir of [join(homedir(), '.pi', 'agent', 'agents'), join(homedir(), '.claude', 'agents')]) {
			if (existsSync(dir)) copyFileSync(join(LIVE, 'JewelryX-Tools', 'wf', 'agents', 'round-worker.md'), join(dir, 'round-worker.md'));
		}
		return rev;
	});
}

// Called by wf.mjs before any command. Returns true when it re-ran the command from the new copy.
export function autoUpdate(wfPath, argv) {
	const runningFromLive = dirname(dirname(dirname(wfPath))) === LIVE;
	const gitDir = runningFromLive ? commonGitDir() : null;
	if (!gitDir) return false;
	let published = null;
	try { published = git(gitDir, ['rev-parse', '--verify', '-q', REF]); } catch { return false; }
	const installed = installedRevision();
	if (!shouldUpdate({ runningFromLive, installed, published })) return false;
	try {
		if (!install(gitDir, published)) return false;
	} catch (e) {
		console.error(`wf: update to ${published.slice(0, 9)} failed, running ${installed.slice(0, 9)}: ${e.message.split('\n')[0]}`);
		return false;
	}
	const log = git(gitDir, ['log', '--format=%h %s', `${installed}..${published}`]).split('\n').filter(Boolean);
	console.error(`wf: updated ${installed.slice(0, 9)} → ${published.slice(0, 9)} (${log.length} commit${log.length === 1 ? '' : 's'} on tools/workflow-v2)`);
	for (const line of log.slice(0, 5)) console.error(`  ${line.slice(0, 110)}`);
	try {
		execFileSync('node', [join(LIVE, 'JewelryX-Tools', 'wf', 'wf.mjs'), ...argv], { stdio: 'inherit' });
		process.exit(0);
	} catch (e) {
		process.exit(e.status ?? 1);
	}
}

// `wf update`: fetch first, then install whatever tools/workflow-v2 is.
export function runUpdate() {
	const gitDir = commonGitDir();
	if (!gitDir) { console.error('wf update: run it from inside the jeweleryx repo'); process.exit(1); }
	git(gitDir, ['fetch', '-q', 'origin', `+refs/heads/tools/workflow-v2:${REF}`]);
	const published = git(gitDir, ['rev-parse', REF]);
	const installed = installedRevision();
	if (installed === published) { console.log(`wf update: already at ${published.slice(0, 9)}`); return; }
	if (!install(gitDir, published)) { console.error('wf update: another update is running'); process.exit(1); }
	console.log(`wf update: ${installed?.slice(0, 9) ?? 'none'} → ${published.slice(0, 9)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runUpdate();
