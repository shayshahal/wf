// real-review.ts — one real read-only review through the pinned experiment model (issue #116).
//
// It uses the supported credential mechanism (the provider reads OPENCODE_API_KEY from the
// environment) and never prints or copies the key. The model is the pinned DeepSeek 4.1 Flash on
// OpenCode Go; if the credential is absent it reports the gap instead of switching models.
//
// Run from this folder: node test/real-review.ts
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = join(here, 'src', 'runner.ts');
const CLI = join(here, 'src', 'cli.ts');
const PROVIDER = 'opencode-go';
const MODEL = 'deepseek-v4.1-flash';

if (process.env.OPENCODE_API_KEY === undefined || process.env.OPENCODE_API_KEY === '') {
	console.error(`gap: OPENCODE_API_KEY is not set, so the real ${PROVIDER}/${MODEL} review cannot run.`);
	process.exit(2);
}

const directory = mkdtempSync(join(tmpdir(), 'wf-pi-durable-real-'));
const storage = join(directory, 'storage');
const worktree = join(directory, 'worktree');
const agreement = join(directory, 'AGREEMENT.md');

mkdirSync(join(worktree, 'src'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: worktree });
execFileSync('git', ['config', 'user.email', 'experiment@example.invalid'], { cwd: worktree });
execFileSync('git', ['config', 'user.name', 'experiment'], { cwd: worktree });
writeFileSync(
	join(worktree, 'src', 'pricing.ts'),
	['export function applyDiscount(price: number, percent: number): number {', '  return price;', '}', ''].join('\n'),
);
execFileSync('git', ['add', '-A'], { cwd: worktree });
execFileSync('git', ['commit', '-qm', 'base'], { cwd: worktree });
writeFileSync(
	join(worktree, 'src', 'pricing.ts'),
	[
		'export function applyDiscount(price: number, percent: number): number {',
		'  return price - price * percent;',
		'}',
		'',
	].join('\n'),
);
writeFileSync(
	agreement,
	[
		'# Agreement',
		'`applyDiscount(price, percent)` returns the price after a discount.',
		'`percent` is a percentage in the range 0..100.',
		'The result is never negative and never above the original price.',
		'',
	].join('\n'),
);

const child = spawn(
	process.execPath,
	[RUNNER, '--storage', storage, '--worktree', worktree, '--agreement', agreement, '--provider', PROVIDER, '--model', MODEL],
	{ env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
);
const lines: string[] = [];
let buffer = '';
let stderr = '';
let exit: { code: number | null; signal: string | null } | undefined;
child.stdout!.setEncoding('utf8');
child.stdout!.on('data', (chunk: string) => {
	buffer += chunk;
	for (;;) {
		const index = buffer.indexOf('\n');
		if (index < 0) break;
		lines.push(buffer.slice(0, index));
		buffer = buffer.slice(index + 1);
	}
});
child.stderr!.setEncoding('utf8');
child.stderr!.on('data', (chunk: string) => {
	stderr += chunk;
});
child.on('exit', (code, signal) => {
	exit = { code, signal };
});

async function waitForLine(re: RegExp, timeoutMs: number): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	let index = 0;
	for (;;) {
		while (index < lines.length) {
			const line = lines[index++]!;
			if (re.test(line)) return line;
		}
		if (exit !== undefined) throw new Error(`runner exited (${exit.signal ?? exit.code})\n${lines.join('\n')}\n${stderr}`);
		if (Date.now() > deadline) throw new Error(`timeout after ${timeoutMs}ms\n${lines.join('\n')}\n${stderr}`);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

function cli(command: string): Record<string, unknown> {
	const out = execFileSync(process.execPath, [CLI, '--storage', storage, command], { encoding: 'utf8' });
	return JSON.parse(out) as Record<string, unknown>;
}

let failures = 0;
try {
	const settled = await waitForLine(/^settled /, 300_000);
	console.log(`observed: ${settled}`);
	const result = cli('result');
	console.log(`identity: ${JSON.stringify(result.identity)}`);
	console.log(`stale: ${String(result.stale)}`);
	const answer = String(result.answer ?? '');
	console.log(`\n--- review answer (${answer.length} chars) ---\n${answer}\n--- end ---`);
	failures += settled === 'settled done' ? 0 : 1;
	failures += typeof (result.identity as { requestId?: string })?.requestId === 'string' ? 0 : 1;
	failures += result.stale === false ? 0 : 1;
	failures += answer.trim() === '' ? 1 : 0;
	const transcript = execFileSync(process.execPath, [CLI, '--storage', storage, 'transcript', '80'], { encoding: 'utf8' });
	failures += /review_target/.test(transcript) ? 0 : 1;
	console.log(`\nreview_target was read by the model: ${/review_target/.test(transcript)}`);
} catch (error) {
	failures++;
	console.error(`\nUNCAUGHT: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
	try {
		cli('stop');
	} catch (error) {
		// The owner may already have exited; stopping is best-effort here.
		if (error instanceof Error) console.error(`stop: ${error.message}`);
	}
	await new Promise<void>((resolve) => child.once('exit', () => resolve()));
	if (failures === 0) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	else console.log(`kept test storage for inspection: ${directory}`);
}

console.log(failures === 0 ? '\nreal review green' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
