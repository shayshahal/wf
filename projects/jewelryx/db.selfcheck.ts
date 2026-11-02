// db.selfcheck.ts — node db.selfcheck.ts → exit 0 when green.
// `wf seed --reset` left notification_templates empty until the backend restarted (the backend fills
// them only at startup, app/main.py), so every notice was dropped; and it left the dropped data's
// uploads behind (2026-11-02). Each arm fails on the seed before the fix.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearUploads, seedDatabase } from './db.ts';

const steps = (reset: boolean) => {
	const ran: { label: string; args: string[]; env: NodeJS.ProcessEnv | undefined }[] = [];
	seedDatabase({ worktree: 'W', database: 'jewelryx_x', mongoUrl: 'mongodb://m', reset, exec: (label, _cmd, args, opts) => { ran.push({ label, args, env: opts?.env }); } });
	return ran;
};

// A reset drops, seeds the fixtures, then runs the backend's own startup step for the templates, in the target database.
const reset = steps(true);
assert.deepEqual(reset.map((s) => s.label), ['drop', 'seeder', 'notification templates']);
const templates = reset[2];
assert.match(templates.args.at(-1) ?? '', /from app\.db\.init import init_db, seed_notification_templates/);
assert.match(templates.args.at(-1) ?? '', /await seed_notification_templates\(\)/);
assert.equal(templates.env?.DATABASE_NAME, 'jewelryx_x');
assert.equal(templates.env?.MONGODB_URL, 'mongodb://m');
console.log('  ok   --reset reseeds the notification templates after the fixtures, into the same database');

// A plain seed keeps the data and the templates the backend already put there: nothing to refill.
assert.deepEqual(steps(false).map((s) => s.label), ['seeder']);
console.log('  ok   a plain seed does not run the templates step');

// The reset clears the worktree's uploads and keeps the folder; the fixtures need no media (inline data: URIs).
const worktree = mkdtempSync(join(tmpdir(), 'wf-uploads-'));
try {
	assert.equal(clearUploads(worktree), 0, 'no uploads folder: nothing to clear');
	const uploads = join(worktree, 'packages', 'backend', 'uploads');
	mkdirSync(join(uploads, 'products'), { recursive: true });
	writeFileSync(join(uploads, 'products', 'a.jpg'), 'x');
	writeFileSync(join(uploads, 'b.png'), 'x');
	assert.equal(clearUploads(worktree), 2);
	assert.deepEqual(readdirSync(uploads), []);
	assert(existsSync(uploads), 'the folder stays: the backend serves it');
	console.log('  ok   clearUploads empties packages/backend/uploads and keeps the folder');
} finally {
	rmSync(worktree, { recursive: true, force: true });
}
console.log('\nall arms green');
