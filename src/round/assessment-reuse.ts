// assessment-reuse.ts — a committed walk-recipe correction does not change the reviewed work (#234).
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { AGREEMENT_FILE, withoutT2Walk } from './agreement.ts';

/** Assessment reuse requires immutable ancestor commits differing only inside this round's T2 walk.
 * Never use agreed-row identity here: proof, tests and other paperwork remain reviewable changes. */
export function assessmentRecipeOnlyCommits(toplevel: string, measured: string | null, head: string, folder: string | null | undefined): boolean {
	const commit = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
	if (!measured || !commit.test(measured) || !commit.test(head) || measured === head || !folder) return false;
	const path = posix.join(folder.replace(/\\/g, '/'), AGREEMENT_FILE);
	if (posix.isAbsolute(path) || path.startsWith('../')) return false;
	const git = (...args: string[]) => execFileSync('git', ['--no-replace-objects', '--literal-pathspecs', '-C', toplevel, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	try {
		if (git('rev-parse', '--verify', `${measured}^{commit}`).trim() !== measured || git('rev-parse', '--verify', `${head}^{commit}`).trim() !== head) return false;
		git('merge-base', '--is-ancestor', measured, head);
		// NUL paths avoid quoting/whitespace ambiguity; no rename inference can conceal another file.
		if (git('diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', measured, head, '--') !== `${path}\0`) return false;
		const entry = (ref: string) => git('ls-tree', '-z', ref, '--', path).split('\t')[0];
		const beforeEntry = entry(measured);
		const afterEntry = entry(head);
		const regular = /^(100644|100755) blob [0-9a-f]+$/;
		if (!regular.test(beforeEntry) || !regular.test(afterEntry) || beforeEntry.slice(0, 6) !== afterEntry.slice(0, 6)) return false;
		const before = git('show', `${measured}:${path}`);
		const after = git('show', `${head}:${path}`);
		// Invalid UTF-8 must not collapse distinct blob bytes into identical replacement characters.
		if (before.includes('\uFFFD') || after.includes('\uFFFD')) return false;
		return withoutT2Walk(before) === withoutT2Walk(after);
	} catch {
		// Missing objects, unrelated histories and unreadable repositories cannot authorize reuse.
		return false;
	}
}
