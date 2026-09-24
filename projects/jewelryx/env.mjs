// projects/jewelryx/env.mjs — a new worktree's packages/backend/.env, after `wt step copy-ignored` copied dev's:
// production credentials out, its own database in. The shared dev tree points at the production S3
// bucket and carries live SES keys; a worktree that inherits them writes test uploads to production
// (bug-reports/_OPEN-QUESTIONS.md, 2026-09-03).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// MEDIA_STORAGE_BACKEND defaults to "s3" in app/core/config.py, so a missing key is as unsafe as a
// wrong one: it must be present and set to "local".
const FORCED = { MEDIA_STORAGE_BACKEND: 'local' };
const BLANKED = ['AWS_S3_ACCESS_KEY_ID', 'AWS_S3_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'AWS_SES_ACCESS_KEY_ID', 'AWS_SES_SECRET_ACCESS_KEY'];

// Pure. `db` ({ url, name }) points the backend at the worktree's own mongo; without it the
// database keys are left alone.
export function sanitizeEnv(contents, db) {
	const rewritten = db ? { MONGODB_URL: db.url, DATABASE_NAME: db.name } : {};
	const eol = contents.includes('\r\n') ? '\r\n' : '\n';
	const seen = new Set();
	const lines = contents.split(/\r?\n/).map((line) => {
		const key = /^([A-Z_][A-Z0-9_]*)=/.exec(line)?.[1];
		if (key === undefined) return line;
		seen.add(key);
		if (key in rewritten) return `${key}=${rewritten[key]}`;
		if (key in FORCED) return `${key}=${FORCED[key]}`;
		if (BLANKED.includes(key)) return `${key}=`;
		return line;
	});
	const missing = [...Object.keys(FORCED), ...Object.keys(rewritten)].filter((key) => !seen.has(key));
	if (missing.length > 0) {
		if (lines.at(-1) !== '') lines.push('');
		lines.splice(lines.length - 1, 0, ...missing.map((key) => `${key}=${{ ...FORCED, ...rewritten }[key]}`));
	}
	return lines.join(eol);
}

export function sanitizeWorktreeEnv(worktree, db) {
	const envPath = join(worktree, 'packages', 'backend', '.env');
	if (!existsSync(envPath)) return console.log('No packages/backend/.env to sanitize');
	writeFileSync(envPath, sanitizeEnv(readFileSync(envPath, 'utf8'), db));
	console.log(`Sanitized packages/backend/.env: media storage local, AWS keys blanked, database ${db.name}`);
}
