// git-head.ts — the current branch and HEAD commit of a checkout, read from the .git files instead of
// `git rev-parse --abbrev-ref HEAD` / `git rev-parse HEAD`: one process start saved per ask (50-650 ms on
// Windows, and a command asks several times). Read on every call, so as fresh as git's answer; anything
// not plainly the usual layout (reftable, a ref outside refs/heads, a missing file, an unborn branch) is
// git's to answer.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

type GitDirs = { gitDir: string; commonDir: string };

const SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const GITDIR_LINE = /^gitdir:\s*(.+?)\s*$/m;
const BRANCH_HEAD = /^ref:\s*refs\/heads\/(.+)$/;

// `.git` is a folder in a main checkout and a `gitdir: <path>` file in a linked worktree, whose gitdir has
// a `commondir` file (usually `../..`) naming where refs and packed-refs live.
function gitDirs(toplevel: string): GitDirs | null {
	const dotGit = join(toplevel, '.git');
	if (!existsSync(dotGit)) return null;
	let gitDir = dotGit;
	if (statSync(dotGit).isFile()) {
		const match = GITDIR_LINE.exec(readFileSync(dotGit, 'utf8'));
		if (!match) return null;
		gitDir = isAbsolute(match[1]) ? match[1] : resolve(toplevel, match[1]);
	}
	const commonFile = join(gitDir, 'commondir');
	const commonDir = existsSync(commonFile) ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim()) : gitDir;
	return { gitDir, commonDir };
}

const git = (toplevel: string, args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trim();

// The commit a ref names, from its loose file or packed-refs; null when neither has it (an unborn branch).
function refSha(dirs: GitDirs, ref: string): string | null {
	const loose = join(dirs.commonDir, ref);
	if (existsSync(loose)) {
		const value = readFileSync(loose, 'utf8').trim();
		if (SHA.test(value)) return value;
	}
	const packed = join(dirs.commonDir, 'packed-refs');
	if (existsSync(packed)) {
		for (const line of readFileSync(packed, 'utf8').split(/\r?\n/)) {
			const [sha, name] = line.split(' ');
			if (name === ref && SHA.test(sha)) return sha;
		}
	}
	return null;
}

const headOf = (dirs: GitDirs | null): string | null => {
	const headFile = dirs ? join(dirs.gitDir, 'HEAD') : '';
	return dirs && existsSync(headFile) ? readFileSync(headFile, 'utf8').trim() : null;
};

/** `git rev-parse --abbrev-ref HEAD`: the branch name, or `HEAD` when detached. */
export function currentBranch(toplevel: string): string {
	const dirs = gitDirs(toplevel);
	const head = headOf(dirs);
	if (dirs && head !== null) {
		const branch = BRANCH_HEAD.exec(head);
		if (branch && refSha(dirs, `refs/heads/${branch[1]}`)) return branch[1];
		if (SHA.test(head)) return 'HEAD';
	}
	return git(toplevel, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

/** `git rev-parse HEAD`: the commit HEAD names. */
export function headSha(toplevel: string): string {
	const dirs = gitDirs(toplevel);
	const head = headOf(dirs);
	if (dirs && head !== null) {
		if (SHA.test(head)) return head;
		const branch = BRANCH_HEAD.exec(head);
		const sha = branch ? refSha(dirs, `refs/heads/${branch[1]}`) : null;
		if (sha) return sha;
	}
	return git(toplevel, ['rev-parse', 'HEAD']);
}
