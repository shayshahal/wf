// update.mjs — the installed wf: every session runs a copy of shayshahal/wf's main in LIVE, never
// the editing clone (SOURCE), where another session's uncommitted edit would go live at once
// (2026-09-23: a reap change whose self-check crashed). `wf update` fetches and installs;
// wf.mjs calls autoUpdate() first on every run, so a push from SOURCE is live on the next
// wf command, with one stderr line saying so. wf left the JewelryX repo the same day (Shay).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIVE = join(homedir(), '.local', 'share', 'jewelryx-wf');
// The editing clone: a push from it moves origin/main here at once, so the check needs no network.
const SOURCE = join(homedir(), 'work', 'wf', '.git');
const REF = 'refs/remotes/origin/main';

const git = (gitDir, args) => execFileSync('git', [`--git-dir=${gitDir}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const installedRevision = () => { try { return readFileSync(join(LIVE, 'REVISION'), 'utf8').trim(); } catch { return null; } };

// Pure: skills, agents and docs are read as they are, from whatever worktree the agent is in. A
// round's worktree does not hold wf, so the text names wf's own files as {{wf}}/… and the installed
// copy fills in its own path. `wf prompt` fills the same placeholder per prompt.
export function anchorToolPaths(text, live) {
	return text.split('{{wf}}').join(live.replace(/\\/g, '/'));
}
const markdownUnder = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? markdownUnder(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);

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
		git(gitDir, ['archive', '--format=tar', '-o', join(fresh, '_wf.tar'), rev]);
		execFileSync('tar', ['-xf', '_wf.tar'], { cwd: fresh });
		rmSync(join(fresh, '_wf.tar'));
		for (const f of markdownUnder(fresh)) writeFileSync(f, anchorToolPaths(readFileSync(f, 'utf8'), LIVE));
		writeFileSync(join(fresh, 'REVISION'), `${rev}\n`);
		// Swap whole, so a half-written copy is never live; links point at LIVE's path and follow.
		const old = `${LIVE}.old`;
		rmSync(old, { recursive: true, force: true });
		if (existsSync(LIVE)) renameSync(LIVE, old);
		renameSync(fresh, LIVE);
		rmSync(old, { recursive: true, force: true });
		// Every wf agent into pi. Claude Code gets round-worker only: the others are written in pi's
		// frontmatter (model: anthropic/…, tools: read, bash), and Claude Code uses Explore there.
		const agents = join(LIVE, 'agents');
		const pi = join(homedir(), '.pi', 'agent', 'agents');
		const claude = join(homedir(), '.claude', 'agents');
		if (existsSync(pi)) for (const f of readdirSync(agents)) copyFileSync(join(agents, f), join(pi, f));
		if (existsSync(claude)) copyFileSync(join(agents, 'round-worker.md'), join(claude, 'round-worker.md'));
		return rev;
	});
}

// Called by wf.mjs before any command. Returns true when it re-ran the command from the new copy.
export function autoUpdate(wfPath, argv) {
	const runningFromLive = dirname(wfPath) === LIVE;
	const gitDir = runningFromLive && existsSync(SOURCE) ? SOURCE : null;
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
	console.error(`wf: updated ${installed.slice(0, 9)} → ${published.slice(0, 9)} (${log.length} commit${log.length === 1 ? '' : 's'} on shayshahal/wf)`);
	for (const line of log.slice(0, 5)) console.error(`  ${line.slice(0, 110)}`);
	try {
		execFileSync('node', [join(LIVE, 'wf.mjs'), ...argv], { stdio: 'inherit' });
		process.exit(0);
	} catch (e) {
		process.exit(e.status ?? 1);
	}
}

// `wf update`: fetch first, then install whatever shayshahal/wf's main is.
export function runUpdate() {
	const gitDir = SOURCE;
	if (!existsSync(gitDir)) { console.error(`wf update: no editing clone at ${gitDir} — git clone https://github.com/shayshahal/wf there`); process.exit(1); }
	git(gitDir, ['fetch', '-q', 'origin', `+refs/heads/main:${REF}`]);
	const published = git(gitDir, ['rev-parse', REF]);
	const installed = installedRevision();
	if (installed === published) { console.log(`wf update: already at ${published.slice(0, 9)}`); return; }
	if (!install(gitDir, published)) { console.error('wf update: another update is running'); process.exit(1); }
	console.log(`wf update: ${installed?.slice(0, 9) ?? 'none'} → ${published.slice(0, 9)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runUpdate();
