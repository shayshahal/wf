// path-safety.ts — path containment and canonicalization for the reviewer's filesystem boundaries.
//
// `NodeExecutionEnv` resolves a relative path from its `cwd` but does not confine it, and a storage
// location must be checked against roots that may not exist yet. Both need the same comparison on
// canonical paths, so it lives here (2026-10-09 hardening, issue #116).
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** True when `candidate` is `root` itself or lives below it. */
export function isWithin(root: string, candidate: string): boolean {
	const rest = relative(root, candidate);
	return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest));
}

/**
 * Canonicalize a path that may not exist yet: resolve the longest existing prefix through symlinks,
 * then append the missing segments. A symlink in an existing segment is therefore followed, so the
 * result is comparable with a canonical root.
 */
export function canonicalPath(path: string): string {
	let current = resolve(path);
	const suffix: string[] = [];
	for (;;) {
		try {
			const real = realpathSync(current);
			return suffix.length === 0 ? real : join(real, ...suffix);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			const parent = dirname(current);
			if (parent === current) return resolve(path);
			suffix.unshift(basename(current));
			current = parent;
		}
	}
}

/**
 * Resolve a tool path against the reviewed checkout and refuse anything that leaves it. Node's
 * execution environment resolves relative paths from `cwd` but does not confine them (2026-10-09:
 * `..`, an absolute path and a symlink could read outside the reviewed checkout), so the read-only
 * promise is enforced here, at the tool that makes it. Returns the canonical target, so a caller's
 * size check and read see the real file rather than a symlink's own length (2026-10-09).
 */
export function containedPath(cwd: string, requested: string): string {
	const root = canonicalPath(cwd);
	const resolved = canonicalPath(resolve(cwd, requested));
	if (!isWithin(root, resolved)) throw new Error(`refusing path outside the reviewed checkout: ${JSON.stringify(requested)}`);
	return resolved;
}

/**
 * Refuse a storage directory inside any forbidden root (the reviewed checkout and the prototype
 * checkout), following symlinks in existing segments. Returns the canonical storage path so callers
 * use one consistent location. Called before the directory or database is created.
 */
export function assertOutsideRoots(path: string, roots: readonly string[], label: string): string {
	const canonical = canonicalPath(path);
	for (const root of roots) {
		if (isWithin(canonicalPath(root), canonical)) {
			throw new Error(`${label} ${path} is inside ${root}; choose a path outside the reviewed checkout and the prototype checkout`);
		}
	}
	return canonical;
}
