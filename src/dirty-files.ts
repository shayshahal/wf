// dirty-files.ts — the files a worktree has changed but not committed: unstaged, staged and untracked,
// repo-relative, from ONE `git status` (it was `diff HEAD`, `diff --cached` and `ls-files --others`: three
// process starts, each 50-600 ms on Windows, repeated by every command that asks). `status` reports a path
// when either side of the index differs, so a staged edit hidden by a restored working file is still listed
// (the case `diff --cached` existed for). `--no-renames` lists a rename as the old path deleted and the new
// one added: the old path is listed too, which `diff --name-only` left out; a fence that checks paths only
// sees more, never less. `-uall` lists each untracked file, as `ls-files --others` did, not its folder.
import { execFileSync } from 'node:child_process';

export function dirtyFiles(toplevel: string): string[] {
	const out = execFileSync('git', ['-C', toplevel, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], { encoding: 'utf8' });
	// "XY path" per NUL-terminated entry; with --no-renames there is no second path field.
	return [...new Set(out.split('\0').filter((entry) => entry.length > 3).map((entry) => entry.slice(3)))];
}
