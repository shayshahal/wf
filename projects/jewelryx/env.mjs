// projects/jewelryx/env.mjs — a new worktree's .env files: copied from this machine's secrets, then
// packages/backend/.env gets production credentials out and its own database in. The secrets point
// at the production S3 bucket and carry live SES keys; a worktree that inherits them writes test
// uploads to production (bug-reports/_OPEN-QUESTIONS.md, 2026-09-03).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// The machine's copy of the files the project's .worktreeinclude names, at the same paths. Until
// 2026-09-24 new worktrees copied them from the dev worktree (`wt step copy-ignored --from dev`),
// which made dev the secrets store as well as the dev stack's folder, so nobody dared pull it.
export const SECRETS = join(homedir(), '.config', 'wf', 'jewelryx');

// Pure: the repo-relative paths in a .worktreeinclude. Plain paths only: a glob would need a walk
// of the secrets folder, and the project lists four files.
export function includedFiles(text) {
	return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
		if (/[*?[\]!]/.test(l)) throw new Error(`.worktreeinclude: "${l}" is a pattern; list plain paths`);
		return l.replace(/^\//, '');
	});
}

// Copies every listed file into the worktree. Throws naming the missing ones before copying any,
// so a worktree never starts half-configured.
export function copySecrets(worktree, from = SECRETS) {
	const files = includedFiles(readFileSync(join(worktree, '.worktreeinclude'), 'utf8'));
	const missing = files.filter((f) => !existsSync(join(from, f)));
	if (missing.length) throw new Error(`missing in ${from}: ${missing.join(', ')} — put this machine's copies there (wf README, Install step 7)`);
	for (const f of files) {
		mkdirSync(dirname(join(worktree, f)), { recursive: true });
		copyFileSync(join(from, f), join(worktree, f));
	}
	console.log(`Copied ${files.length} secret file(s) from ${from}`);
}

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
