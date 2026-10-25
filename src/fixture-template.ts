// fixture-template.ts — selfcheck fixtures without a git launch per repo. A check that starts from "a repo
// with these files, one commit on main" builds it once per process (init, config, add, commit: four
// launches) and every fixture after that is a directory copy plus a branch made by writing the ref file.
// Only for plain repos: a copy shares the template's commit sha, and carries no remotes or worktrees.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const templates = new Map<string, string>();

/** A temp repo on `branch` holding `files` in one commit made on main — same state as init, add, commit, `checkout -b branch`. */
export function fixtureRepo(prefix: string, files: Record<string, string>, branch: string = 'main'): string {
	const key = JSON.stringify(files);
	let template = templates.get(key);
	if (!template) {
		template = mkdtempSync(join(tmpdir(), 'wf-template-'));
		const git = (...args: string[]) => execFileSync('git', ['-C', template as string, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
		git('init', '-q', '-b', 'main');
		git('config', 'core.autocrlf', 'false');
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(template, path)), { recursive: true });
			writeFileSync(join(template, path), text);
		}
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		templates.set(key, template);
	}
	const dir = mkdtempSync(join(tmpdir(), prefix));
	cpSync(template, dir, { recursive: true });
	if (branch !== 'main') startBranch(dir, branch);
	return dir;
}

/** `git checkout -b branch` in a checkout, by writing the ref file and HEAD (no git launch). */
export function startBranch(dir: string, branch: string): void {
	const head = readFileSync(join(dir, '.git/HEAD'), 'utf8').trim();
	const current = /^ref: (refs\/heads\/.+)$/.exec(head);
	if (!current) throw new Error(`startBranch: ${dir} is not on a branch`);
	const sha = readFileSync(join(dir, '.git', current[1]), 'utf8').trim();
	mkdirSync(dirname(join(dir, '.git/refs/heads', branch)), { recursive: true });
	writeFileSync(join(dir, '.git/refs/heads', branch), `${sha}\n`);
	writeFileSync(join(dir, '.git/HEAD'), `ref: refs/heads/${branch}\n`);
}
