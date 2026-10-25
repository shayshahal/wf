// in-process-wf.ts — run `wf <args>` for a selfcheck without starting a node process.
// A selfcheck that drives the CLI started `node wf.mjs` per call: 0.1 s at best on this Windows machine,
// ~1 s typical, 14 times in one check. Here each call is a worker thread running the same run() the entry
// runs: a fresh module graph (nothing leaks between calls), its own env, process.exit ends only the
// thread, and the caller blocks until it is done, like execFileSync. Same cwd semantics: the caller's cwd
// is switched for the call and restored (a selfcheck is its own process, so nothing else sees it).
// Not for checks of the entry files themselves (wf.mjs, env/wf.mjs, an exported skill's scripts/wf.mjs,
// the plugin hooks): those must be started as the real process they are.
import { Worker } from 'node:worker_threads';
import { WF_ROOT } from './paths.ts';

export type WfRun = { status: number; stdout: string; stderr: string };
type Options = { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number };

const OUTPUT_BYTES = 16 << 20;
const HEADER_INTS = 4; // [0] done, [1] exit code, [2] stdout bytes, [3] stderr bytes

const start = (argv: string[], env: NodeJS.ProcessEnv | undefined) => {
	const shared = new SharedArrayBuffer(HEADER_INTS * 4 + OUTPUT_BYTES);
	const worker = new Worker(new URL('./in-process-wf.worker.ts', import.meta.url), {
		workerData: { shared, argv, entry: `${WF_ROOT.replaceAll('\\', '/')}/wf.mjs` },
		env: { ...(env ?? process.env) } as Record<string, string>,
		stdout: true, stderr: true, // keep the worker's own streams off ours; the worker hands its text back through `shared`
	});
	return { worker, shared };
};
const result = (shared: SharedArrayBuffer): WfRun => {
	const ctl = new Int32Array(shared, 0, HEADER_INTS);
	const bytes = new Uint8Array(shared, HEADER_INTS * 4);
	const half = OUTPUT_BYTES >> 1;
	const text = new TextDecoder();
	return { status: ctl[1], stdout: text.decode(bytes.subarray(0, ctl[2])), stderr: text.decode(bytes.subarray(half, half + ctl[3])) };
};

/** Run the kit's `wf <argv>` and return what the process would have: exit status, stdout, stderr.
 *  Blocks this thread until it is done: a check that serves HTTP from this process for wf to probe uses wfAsync. */
export function wfSync(argv: string[], { cwd, env, timeoutMs = 300_000 }: Options = {}): WfRun {
	const previous = process.cwd();
	if (cwd) process.chdir(cwd);
	try {
		const { worker, shared } = start(argv, env);
		const waited = Atomics.wait(new Int32Array(shared, 0, HEADER_INTS), 0, 0, timeoutMs);
		void worker.terminate();
		if (waited === 'timed-out') throw new Error(`wf ${argv.join(' ')}: no result after ${timeoutMs} ms`);
		return result(shared);
	} finally {
		process.chdir(previous);
	}
}

let inFlight = false;
/** The same without blocking this thread, so its event loop (an HTTP server the CLI probes) keeps answering.
 *  The cwd is process-wide: one call at a time. */
export async function wfAsync(argv: string[], { cwd, env, timeoutMs = 300_000 }: Options = {}): Promise<WfRun> {
	if (inFlight) throw new Error('wfAsync: one call at a time (the cwd is switched for the call)');
	inFlight = true;
	const previous = process.cwd();
	if (cwd) process.chdir(cwd);
	try {
		const { worker, shared } = start(argv, env);
		const timer = setTimeout(() => { void worker.terminate(); }, timeoutMs);
		await new Promise<void>((done) => { worker.once('exit', () => done()); });
		clearTimeout(timer);
		if (Atomics.load(new Int32Array(shared, 0, HEADER_INTS), 0) !== 1) throw new Error(`wf ${argv.join(' ')}: no result after ${timeoutMs} ms`);
		return result(shared);
	} finally {
		process.chdir(previous);
		inFlight = false;
	}
}

/** Like execFileSync: the stdout, or a thrown Error carrying status, stdout and stderr. */
export function wfOut(argv: string[], options: Options = {}): string {
	const run = wfSync(argv, options);
	if (run.status === 0) return run.stdout;
	throw Object.assign(new Error(`wf ${argv.join(' ')} exited ${run.status}: ${run.stderr.trim() || run.stdout.trim()}`), run);
}
