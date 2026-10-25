// in-process-wf.worker.ts — the thread side of in-process-wf.ts: capture the output, run wf's entry, and
// hand status and text back through shared memory, also when run() calls process.exit (its 'exit' listener).
import { resolve } from 'node:path';
import { workerData } from 'node:worker_threads';

const { shared, argv, entry } = workerData as { shared: SharedArrayBuffer; argv: string[]; entry: string };
const HEADER_INTS = 4;
const ctl = new Int32Array(shared, 0, HEADER_INTS);
const bytes = new Uint8Array(shared, HEADER_INTS * 4);
const half = bytes.length >> 1;
let stdout = '';
let stderr = '';
const capture = (into: 'out' | 'err') => (chunk: unknown, encodingOrDone?: unknown, done?: unknown) => {
	const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString();
	if (into === 'out') stdout += text; else stderr += text;
	const callback = typeof encodingOrDone === 'function' ? encodingOrDone : done;
	if (typeof callback === 'function') callback();
	return true;
};
process.stdout.write = capture('out') as typeof process.stdout.write;
process.stderr.write = capture('err') as typeof process.stderr.write;

// A thread cannot change the process's directory (wf agree, review and reap do, into the worktree they were
// started in). Into the directory the call already runs in it is a no-op, which is all those commands do
// when run from their worktree; anywhere else it refuses, so a different directory is never silently ignored.
const here = () => resolve(process.cwd()).toLowerCase();
process.chdir = ((to: string) => {
	if (resolve(String(to)).toLowerCase() !== here()) throw new Error(`in-process wf cannot chdir to ${String(to)} from ${process.cwd()}: pass that folder as cwd, or start a real process`);
}) as typeof process.chdir;

let reported = false;
const report = (status: number) => {
	if (reported) return;
	reported = true;
	const encoder = new TextEncoder();
	const out = encoder.encode(stdout).subarray(0, half);
	const err = encoder.encode(stderr).subarray(0, half);
	bytes.set(out, 0);
	bytes.set(err, half);
	Atomics.store(ctl, 1, status);
	Atomics.store(ctl, 2, out.length);
	Atomics.store(ctl, 3, err.length);
	Atomics.store(ctl, 0, 1);
	Atomics.notify(ctl, 0);
};
// Node's process.exit runs every 'exit' listener, then ends the thread. Listeners that run() adds later
// (the refusal log) must run before the result is handed back, so the report comes after them.
const endThread = process.exit.bind(process);
process.exit = ((code?: number) => {
	if (code !== undefined) process.exitCode = code;
	const internal = process as unknown as { _exiting?: boolean };
	if (!internal._exiting) {
		internal._exiting = true;
		process.emit('exit', process.exitCode ?? 0);
	}
	report(Number(process.exitCode ?? 0));
	return endThread(process.exitCode);
}) as typeof process.exit;

// wf.mjs's own work: the Node-version guard is the entry's, and the caller already runs on this Node.
const { run } = await import('./run.ts');
try {
	await run(argv, { entry });
} catch (error) {
	stderr += error instanceof Error ? `${error.stack ?? error.message}\n` : `${String(error)}\n`;
	process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
