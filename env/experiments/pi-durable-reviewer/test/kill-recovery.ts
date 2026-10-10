// kill-recovery.ts — real process-kill evidence for the pi-durable reviewer (issue #116).
//
// It spawns the actual runner, SIGKILLs it mid-tool, reopens the actual SQLite storage in a fresh
// process, and checks: unfinished work resumes, the same submission is re-found (no duplicate
// review), a replay-safe read recovers, a non-replay-safe tool's interruption is visible, a queued
// steer survives the kill, and the transcript can be inspected after reconnecting.
//
// Run from this folder: node test/kill-recovery.ts
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = join(here, 'src', 'runner.ts');
const CLI = join(here, 'src', 'cli.ts');
const STEER = 'Focus on responsibility ownership and coupling.';

let failures = 0;
function check(name: string, condition: boolean, detail = ''): void {
	console.log(condition ? `  ok   ${name}` : `  FAIL ${name}${detail === '' ? '' : ` — ${detail}`}`);
	if (!condition) failures++;
}

const directory = mkdtempSync(join(tmpdir(), 'wf-pi-durable-reviewer-'));
const storage = join(directory, 'storage');
const worktree = join(directory, 'worktree');
const agreement = join(directory, 'AGREEMENT.md');

function git(args: string[], cwd: string): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function setUp(): void {
	mkdirSync(join(worktree, 'src'), { recursive: true });
	git(['init', '-q'], worktree);
	git(['config', 'user.email', 'experiment@example.invalid'], worktree);
	git(['config', 'user.name', 'experiment'], worktree);
	writeFileSync(join(worktree, 'src', 'target.ts'), 'export const name = (user) => user.name;\n');
	git(['add', '-A'], worktree);
	git(['commit', '-qm', 'base'], worktree);
	// The change under review: the fixed diff is the working tree against HEAD.
	writeFileSync(join(worktree, 'src', 'target.ts'), 'export const name = (user) => user.name.toUpperCase();\n');
	writeFileSync(agreement, '# Agreement\n`name` must handle a missing user without throwing.\n');
}

type Running = {
	child: ChildProcess;
	lines: string[];
	stderr: string;
	waitForLine(re: RegExp, timeoutMs?: number): Promise<string>;
	kill(): Promise<void>;
	exited(): Promise<{ code: number | null; signal: string | null }>;
};

function startRunner(extraEnv: NodeJS.ProcessEnv): Running {
	const child = spawn(
		process.execPath,
		[RUNNER, '--storage', storage, '--worktree', worktree, '--agreement', agreement, '--provider', 'faux', '--probes'],
		{ env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] },
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
	return {
		child,
		lines,
		get stderr() {
			return stderr;
		},
		async waitForLine(re, timeoutMs = 30_000) {
			const deadline = Date.now() + timeoutMs;
			let index = 0;
			for (;;) {
				while (index < lines.length) {
					const line = lines[index++]!;
					if (re.test(line)) return line;
				}
				if (exit !== undefined) throw new Error(`runner exited (${exit.signal ?? exit.code}) before ${re}\n${lines.join('\n')}\n${stderr}`);
				if (Date.now() > deadline) throw new Error(`timeout waiting for ${re}\n${lines.join('\n')}\n${stderr}`);
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		},
		async kill() {
			if (exit !== undefined) return;
			child.kill('SIGKILL');
			await new Promise<void>((resolve) => child.once('exit', () => resolve()));
		},
		async exited() {
			if (exit !== undefined) return exit;
			return await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
		},
	};
}

function cli(command: string, ...rest: string[]): Record<string, unknown> {
	const out = execFileSync(process.execPath, [CLI, '--storage', storage, command, ...rest], { encoding: 'utf8' });
	return JSON.parse(out) as Record<string, unknown>;
}

function cliTranscript(limit = 80): string[] {
	const out = execFileSync(process.execPath, [CLI, '--storage', storage, 'transcript', String(limit)], { encoding: 'utf8' });
	return out.split('\n').filter((line) => line !== '');
}

setUp();

const runners: Running[] = [];
function track(runner: Running): Running {
	runners.push(runner);
	return runner;
}

try {
	// ── Process 1: start the review; the read tool holds, so the kill lands mid-tool. ──
	const first = track(startRunner({ PI_DURABLE_REVIEWER_TEST_HOLD_MS: '15000' }));
	await first.waitForLine(/^event tool_execution_start read$/);
	check('process 1 reaches the read tool', true);

	// A second process must refuse to own the same storage while the first is alive.
	const second = spawn(process.execPath, [RUNNER, '--storage', storage, '--worktree', worktree, '--agreement', agreement, '--provider', 'faux'], {
		env: process.env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let secondErr = '';
	second.stderr!.setEncoding('utf8');
	second.stderr!.on('data', (chunk: string) => {
		secondErr += chunk;
	});
	const secondExit = await new Promise<number | null>((resolve) => second.once('exit', (code) => resolve(code)));
	check('a second owner is refused while the first is alive', secondExit === 1 && /another owner/.test(secondErr), secondErr.trim());

	const submissionLine1 = first.lines.find((line) => line.startsWith('submission '));
	check('process 1 submitted the review', submissionLine1 !== undefined, first.lines.join('\n'));
	await first.kill();
	check('process 1 was killed abruptly (SIGKILL)', (await first.exited()).signal === 'SIGKILL');
	check('the owner lock survives the abrupt kill', readFileSync(join(storage, 'owner.lock'), 'utf8').includes('pid'));

	// ── Process 2: reopen the same storage; the replay-safe read reruns; a steer queues; kill again. ──
	const replay = track(startRunner({}));
	// The resumed tool task does not re-emit its start (it is already in the watch snapshot); its end
	// is the evidence that the replay-safe read ran again to completion.
	const readEnd = await replay.waitForLine(/^event tool_execution_end read/);
	check('the interrupted replay-safe read reruns and completes', !/interrupted/.test(readEnd), readEnd);
	check('the review was not submitted a second time', replay.lines.includes(submissionLine1!), replay.lines.join('\n'));

	await replay.waitForLine(/^event tool_execution_start probe_unsafe$/);
	const steer = cli('steer', STEER);
	check('steering the busy owner is accepted', steer.ok === true, JSON.stringify(steer));
	const steerAgain = cli('steer', STEER);
	check(
		'a second identical steer is a distinct submission, not a silent duplicate',
		steerAgain.ok === true && steerAgain.submissionId !== steer.submissionId,
		JSON.stringify({ first: steer, second: steerAgain }),
	);
	const status = cli('status');
	check('the owner reports both steers queued', Number(status.queued) >= 2, JSON.stringify(status));
	await replay.kill();
	check('process 2 was killed abruptly (SIGKILL)', (await replay.exited()).signal === 'SIGKILL');

	// ── Process 3: reopen; the unsafe tool reports interruption; the queued steer is placed; finish. ──
	const finish = track(startRunner({}));
	const settled = await finish.waitForLine(/^settled /);
	check('the recovered run settles', /^settled done$/.test(settled), settled);
	check('the review was not submitted a third time', finish.lines.includes(submissionLine1!), finish.lines.join('\n'));

	const result = cli('result');
	check('the result names the fixed review identity', typeof (result.identity as { requestId?: string })?.requestId === 'string');
	check('the result is not stale while the worktree is unchanged', result.stale === false, JSON.stringify(result));
	check('the result carries the review answer', typeof result.answer === 'string' && String(result.answer).includes('No further findings'), JSON.stringify(result.answer));

	const transcript = cliTranscript();
	const joined = transcript.join('\n');
	check('the transcript is inspectable after reconnecting', transcript.length > 0);
	check('the queued steer survived the restart and was placed', joined.includes(STEER), joined);
	check('the non-replay-safe interruption is visible', /interrupted/.test(joined), joined);
	check(
		'the review request was submitted exactly once',
		transcript.filter((line) => line.startsWith('> Review request')).length === 1,
		joined,
	);

	// ── Staleness: change the worktree after the review; the result must be labelled stale. ──
	writeFileSync(join(worktree, 'src', 'target.ts'), 'export const name = (user) => (user ? user.name : "");\n');
	const after = cli('result');
	check('a changed worktree makes the result stale', after.stale === true, JSON.stringify(after));

	const idleSteer = spawnSync(process.execPath, [CLI, '--storage', storage, 'steer', STEER], { encoding: 'utf8' });
	check(
		'steering an idle owner is refused instead of starting a run',
		idleSteer.status === 1 && /idle/.test(idleSteer.stderr),
		`status ${idleSteer.status}: ${idleSteer.stderr.trim()}`,
	);

	const stopped = cli('stop');
	check('the owner stops on request', stopped.ok === true, JSON.stringify(stopped));
	await finish.exited();
} catch (error) {
	failures++;
	console.error(`\nUNCAUGHT: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
} finally {
	for (const runner of runners) await runner.kill();
	try {
		if (failures === 0) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		else console.log(`\nkept test storage for inspection: ${directory}`);
	} catch (cleanupError) {
		// A cleanup failure must not hide the test result; report the error object and keep the storage path.
		console.error(`cleanup failed, storage kept at ${directory}:`, cleanupError);
	}
}

console.log(failures === 0 ? '\nall process-kill checks green' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
