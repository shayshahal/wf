// Probe confinement shared by the legacy scratch helper and tool-only workspace consumer.
import { lstatSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Pure: the destination a probe may be copied to inside `root`, or a refusal. A copied path is a
 * repo-relative path with no `..`; its resolved destination must stay under `root`; and no existing
 * parent may be a symlink/junction, so a write cannot escape into the live worktree or a shared
 * dependency folder (#133 review).
 */
export function scratchDestination(root: string, file: string): string {
	const f = file.replace(/\\/g, '/');
	const reserved = ['.git', '.wf/state.json', '.wf/serve.pid', '.wf/serve-owner.json', '.wf/workspace-dependency.json', '.wf/check-processes'];
	const normalized = f.split('/').filter((part) => part && part !== '.').join('/');
	const probe = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
	if (reserved.some((name) => probe === name || probe.startsWith(`${name}/`))) throw new Error(`workspace probe: ${file} would overwrite Git or execution ownership; copy it as a test fixture instead`);
	if (f.startsWith('/') || /^[A-Za-z]:/.test(f)) throw new Error(`the probe path ${file} is absolute; only repo-relative paths are copied into the scratch`);
	if (f.split('/').includes('..')) throw new Error(`the probe path ${file} has a .. segment; it is not copied into the scratch`);
	const dest = resolve(root, f);
	const rel = relative(root, dest);
	if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`the probe path ${file} resolves outside the scratch worktree; it is not copied`);
	// The leaf itself may already be a link (a committed symlink, a setup-made junction): copyFileSync
	// would write through it to its target outside the scratch. Refuse, exactly as for a parent link
	// (#133 review). lstat, with no throwIfNoEntry, also catches a DANGLING link, which existsSync misses
	// (it follows the link and reports false when the target does not exist yet): copyFileSync would then
	// create the external target (#133 review).
	if (lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`the probe path ${file} is a link at ${dest}; it is not copied into the scratch`);
	let dir = root;
	for (const segment of rel.split(/[\\/]/).slice(0, -1)) {
		dir = join(dir, segment);
		if (lstatSync(dir, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`the probe path ${file} goes through a link at ${dir}; it is not copied into the scratch`);
	}
	return dest;
}

