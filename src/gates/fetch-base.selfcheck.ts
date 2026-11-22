// fetch-base.selfcheck.ts — node fetch-base.selfcheck.ts → exit 0 when green.
// fetchBase against real git: a fetch that loses origin/dev to another fetch is retried; one whose ref
// stays locked gives up after its attempts; a missing remote is not retried. base-freshness and
// merged-base-check selfchecks drive the same race through deliver's two callers.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchBase, lostRefRace } from './fetch-base.ts';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-fetch-base-'));
process.env.GIT_CONFIG_GLOBAL = join(ROOT, 'gitconfig');
process.env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_GLOBAL;
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_') && !key.startsWith('GIT_CONFIG_')) delete process.env[key];
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '[user]\n\tname = wf\n\temail = wf@selfcheck\n[core]\n\tautocrlf = false\n');

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — ${detail}`}`);
	if (!ok) failures++;
};
const git = (cwd: string, ...args: string[]) => {
	const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${r.stderr}`);
	return r.stdout.trim();
};

const origin = join(ROOT, 'origin.git');
const work = join(ROOT, 'work');
mkdirSync(work);
git(ROOT, 'init', '-q', '--bare', origin);
git(work, 'init', '-q', '-b', 'dev');
writeFileSync(join(work, 'a.txt'), 'a\n');
git(work, 'add', '-A');
git(work, 'commit', '-qm', 'a');
git(work, 'remote', 'add', 'origin', pathToFileURL(origin).href);
git(work, 'push', '-q', 'origin', 'dev');
git(work, 'fetch', '-q', 'origin');
const first = git(work, 'rev-parse', 'HEAD');
writeFileSync(join(work, 'a.txt'), 'b\n');
git(work, 'commit', '-qam', 'b');
git(work, 'push', '-q', 'origin', 'dev');
const tip = git(work, 'rev-parse', 'HEAD');
const hook = join(work, '.git', 'hooks', 'reference-transaction');
const marker = join(work, '.git', 'raced');

try {
	check('git\'s two lost-race messages are recognised, other failures are not',
		lostRefRace("error: cannot lock ref 'refs/remotes/origin/dev': is at 8078a92d but expected 99c139f8")
		&& lostRefRace("error: Unable to create 'C:/r/.bare/refs/remotes/origin/dev.lock': File exists.")
		&& !lostRefRace("fatal: 'C:/missing.git' does not appear to be a git repository"));

	// Another fetch of the shared repository moves origin/dev between this fetch's read and its update,
	// once: the hook's `preparing` state runs after the old value is read and before the ref is locked.
	git(work, 'update-ref', 'refs/remotes/origin/dev', first);
	writeFileSync(hook, [
		'#!/bin/sh',
		'[ "$1" = preparing ] || exit 0',
		"grep -q ' refs/remotes/origin/dev$' || exit 0",
		'marker="$(git rev-parse --git-dir)/raced"',
		'[ -e "$marker" ] && exit 0',
		': > "$marker"',
		'git update-ref refs/remotes/origin/dev "$(git commit-tree "$(git rev-parse HEAD^{tree})" -m raced)"',
		'',
	].join('\n'), { mode: 0o755 });
	const once = spawnSync('git', ['-C', work, 'fetch', '-q', 'origin', '+refs/heads/dev:refs/remotes/origin/dev'], { encoding: 'utf8' });
	check('the staged race fails a plain fetch the way 2026-11-19 did', once.status !== 0 && /cannot lock ref 'refs\/remotes\/origin\/dev': is at [a-f0-9]{40} but expected [a-f0-9]{40}/.test(once.stderr), once.stderr);
	rmSync(marker);
	git(work, 'update-ref', 'refs/remotes/origin/dev', first);
	const retried = fetchBase(work, 'dev');
	check('fetchBase retries the lost race and lands the tip', retried.status === 0 && git(work, 'rev-parse', 'refs/remotes/origin/dev') === tip, retried.stderr);
	rmSync(hook);

	// A ref whose lock never goes away: bounded, and the last failure is returned.
	git(work, 'update-ref', 'refs/remotes/origin/dev', first);
	writeFileSync(join(work, '.git', 'refs', 'remotes', 'origin', 'dev.lock'), '');
	const started = Date.now();
	const stuck = fetchBase(work, 'dev', 2);
	check('a ref that stays locked fails after the attempts, not forever', stuck.status !== 0 && lostRefRace(stuck.stderr) && Date.now() - started < 30_000, stuck.stderr);
	rmSync(join(work, '.git', 'refs', 'remotes', 'origin', 'dev.lock'));

	git(work, 'remote', 'set-url', 'origin', pathToFileURL(join(ROOT, 'missing.git')).href);
	const offlineStart = Date.now();
	const offline = fetchBase(work, 'dev');
	check('a missing remote fails at once, without retries', offline.status !== 0 && !lostRefRace(offline.stderr) && Date.now() - offlineStart < 5_000, offline.stderr);
} finally {
	rmSync(ROOT, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
