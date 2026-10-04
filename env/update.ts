// env/update.ts — the installed wf: every session runs a copy of shayshahal/wf's main in LIVE, never
// the editing clone (SOURCE), where another session's uncommitted edit would go live at once
// (2026-09-23: a reap change whose self-check crashed). `wf update` fetches and installs;
// env/wf.mjs calls autoUpdate() first on every run, so a push from SOURCE is live on the next
// wf command, with one stderr line saying so. wf left the JewelryX repo the same day (Shay).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorToolPaths } from '../src/plugin/anchor.ts';
import { withModel } from '../src/models.ts';
import { PI_MODELS } from './models.ts';

export const LIVE = join(homedir(), '.local', 'share', 'wf');
// The editing clone: a push from it moves origin/main here at once, so the check needs no network.
const SOURCE = join(homedir(), 'work', 'wf', '.git');
const REF = 'refs/remotes/origin/main';

const git = (gitDir: string, args: string[]) => execFileSync('git', [`--git-dir=${gitDir}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const installedRevision = () => { try { return readFileSync(join(LIVE, 'REVISION'), 'utf8').trim(); } catch { /* no REVISION: a copy made by hand, which never updates itself */ return null; } };

const markdownUnder = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
	e.isDirectory() ? markdownUnder(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []);

// Pure: update only a running installed copy, only when the pushed branch moved.
export function shouldUpdate({ runningFromLive, installed, published }: { runningFromLive: boolean; installed: string | null; published: string | null }) {
	return Boolean(runningFromLive && installed && published && installed !== published);
}

// One installer at a time: a second wf run while one installs keeps the current copy.
function withLock<T>(fn: () => T): T | null {
	const lock = `${LIVE}.lock`;
	try { if (Date.now() - statSync(lock).mtimeMs > 120_000) rmSync(lock, { recursive: true, force: true }); } catch { /* no lock */ }
	try { mkdirSync(lock); } catch { /* another wf holds the lock and is updating: this one skips */ return null; }
	try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

export function install(gitDir: string, rev: string) {
	return withLock(() => {
		const fresh = `${LIVE}.new`;
		rmSync(fresh, { recursive: true, force: true });
		mkdirSync(fresh, { recursive: true });
		// The tar sits inside the target and is named relatively: Git Bash's tar reads "C:" as a host.
		git(gitDir, ['archive', '--format=tar', '-o', join(fresh, '_wf.tar'), rev]);
		execFileSync('tar', ['-xf', '_wf.tar'], { cwd: fresh });
		rmSync(join(fresh, '_wf.tar'));
		// The project's folder name, from the copy being installed. Read, not imported: the updater never
		// loads project code, so a broken project cannot stop the update that fixes it.
		// Any of the places wf has had it: project.mjs, .mts and .ts (2026-10-01), src/project.ts (the next
		// move). An updater that does not know where the copy it installs keeps it fails every update and
		// stays on the old copy.
		const projectFile = ['src/project.ts', 'project.ts', 'project.mts', 'project.mjs'].map((f) => join(fresh, f)).find((f) => existsSync(f));
		const project = projectFile && /projects\/([\w-]+)\/index\.m?[jt]s/.exec(readFileSync(projectFile, 'utf8'))?.[1];
		if (!project) throw new Error('project.ts names no projects/<name>/index.ts');
		for (const f of markdownUnder(fresh)) writeFileSync(f, anchorToolPaths(readFileSync(f, 'utf8'), LIVE, project));
		writeFileSync(join(fresh, 'REVISION'), `${rev}\n`);
		// Swap whole, so a half-written copy is never live; links point at LIVE's path and follow.
		const old = `${LIVE}.old`;
		rmSync(old, { recursive: true, force: true });
		if (existsSync(LIVE)) renameSync(LIVE, old);
		renameSync(fresh, LIVE);
		rmSync(old, { recursive: true, force: true });
		// Every wf agent into pi. Claude Code gets none: the plugin carries them, and a user-level
		// agent outranks a plugin's of the same name (kit and env plan, step 6). An agent's effort
		// level becomes pi's model for it (src/models.ts, env/models.ts).
		const agents = join(LIVE, 'agents');
		const pi = join(homedir(), '.pi', 'agent', 'agents');
		if (existsSync(pi)) for (const f of readdirSync(agents)) writeFileSync(join(pi, f), withModel(readFileSync(join(agents, f), 'utf8'), PI_MODELS));
		return rev;
	});
}

// Called by env/wf.mjs before any command, with its own path: the entry sits in env/, one below the
// copy's root. Returns true when it re-ran the command from the new copy, through the same entry.
export function autoUpdate(wfPath: string, argv: string[]) {
	const root = dirname(dirname(wfPath));
	const runningFromLive = root === LIVE;
	const gitDir = runningFromLive && existsSync(SOURCE) ? SOURCE : null;
	if (!gitDir) return false;
	let published: string | null = null;
	try { published = git(gitDir, ['rev-parse', '--verify', '-q', REF]); } catch { return false; }
	const installed = installedRevision();
	if (!shouldUpdate({ runningFromLive, installed, published })) return false;
	// Forward only: a copy installed from a commit not yet pushed is newer than origin/main, and
	// "different" installed origin/main over it (2026-09-23, the flatten: back to the old layout).
	// Exit 1 = installed is not an ancestor; an unknown installed commit (128) still updates.
	if (spawnSync('git', [`--git-dir=${gitDir}`, 'merge-base', '--is-ancestor', installed!, published]).status === 1) return false;
	try {
		if (!install(gitDir, published)) return false;
	} catch (e) {
		console.error(`wf: update to ${published.slice(0, 9)} failed, running ${installed!.slice(0, 9)}: ${(e as Error).message.split('\n')[0]}`);
		return false;
	}
	const log = git(gitDir, ['log', '--format=%h %s', `${installed}..${published}`]).split('\n').filter(Boolean);
	console.error(`wf: updated ${installed!.slice(0, 9)} → ${published.slice(0, 9)} (${log.length} commit${log.length === 1 ? '' : 's'} on shayshahal/wf)`);
	for (const line of log.slice(0, 5)) console.error(`  ${line.slice(0, 110)}`);
	try {
		execFileSync('node', [join(LIVE, relative(root, wfPath)), ...argv], { stdio: 'inherit' });
		process.exit(0);
	} catch (e) {
		process.exit((e as { status?: number | null }).status ?? 1);
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
