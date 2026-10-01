// projects/jewelryx/dev.mts — a worktree's three dev servers on its ports (index.mts serve).
// Ports: B2B on P, API on P+10000, admin on P+20000 (index.mts). Every line also lands in
// .wf/logs/dev.log, prefixed by server name, so an agent can read why a server died;
// WF_DEV_LOG moves it (the permanent dev stack must not leave .wf/ in the dev checkout).
// The machine may put each server behind a name (index.mts `machine()`: `names` gives the browser
// origins, `wrapServer` the command that serves one; portless on Shay's, env/projects/jewelryx).
import { createWriteStream, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { Origins, Port, Wrap } from './index.mts';

const asIs: Wrap = ({ command }) => ({ command, env: {} });
export type DevCommand = { name: string; command: string; env: Record<string, string> };

// Pure: the three commands and their environments. `origins` ({ b2b, admin, api }) are the browser
// origins when the machine names them; `wrap({ role, port, command })` → { command, env }.
export function devCommands(basePort: Port, { origins = null, wrap = asIs }: { origins?: Origins | null; wrap?: Wrap } = {}): DevCommand[] {
	if (!/^1\d{4}$/.test(String(basePort))) throw new Error('Worktree base port must be from 10000 to 19999');
	const b2bPort = Number(basePort);
	const backendPort = b2bPort + 10_000;
	const adminPort = b2bPort + 20_000;
	const backendUrl = `http://localhost:${backendPort}`;
	// Server-side calls use 127.0.0.1: Node resolves `localhost` to ::1 first and uvicorn listens on
	// IPv4 only, so `localhost` made every SSR route 500 (BJEW-600 pilot, 2026-09-19).
	const internalBackendUrl = `http://127.0.0.1:${backendPort}`;
	const b2bOrigin = origins?.b2b ?? `http://localhost:${b2bPort}`;
	const adminOrigin = origins?.admin ?? `http://localhost:${adminPort}`;
	// Vite 8 forwards the browser's console errors and uncaught errors into its own output (so into
	// dev.log, where control-jewelryx reads them) only when it sees a coding agent's variable. The
	// agent that started the stack may set none: say so for it. AI_AGENT is the generic one.
	const vite = { AI_AGENT: 'wf' };
	const server = (name: string, role: keyof Origins, port: number, command: string, env: Record<string, string>): DevCommand => {
		const w = wrap({ role, port, command });
		return { name, command: w.command, env: { ...env, ...w.env } };
	};
	return [
		server('backend', 'api', backendPort, 'pnpm dev:backend', { DEV_BACKEND_PORT: String(backendPort), CORS_ORIGINS: `${b2bOrigin},${adminOrigin}`, B2B_PUBLIC_URL: `${b2bOrigin}/b2b` }),
		// No `--` before the flags: pnpm forwards it verbatim to vite, which treats it as
		// end-of-options and ignores --port, silently falling back to 5173/3002.
		server('b2b', 'b2b', b2bPort, `pnpm dev:frontend --port ${b2bPort} --strictPort`, { ...vite, INTERNAL_API_URL: internalBackendUrl, PUBLIC_API_URL: '/api', ORIGIN: b2bOrigin }),
		server('admin', 'admin', adminPort, `pnpm dev:admin --port ${adminPort} --strictPort`, { ...vite, INTERNAL_API_URL: internalBackendUrl, PUBLIC_API_URL: `${origins?.api ?? backendUrl}/api/v1`, PUBLIC_B2B_ORIGIN: b2bOrigin, ORIGIN: adminOrigin }),
	];
}

// concurrently comes from the worktree's own node_modules (the project's devDependency): wf has none.
export async function runDev({ worktree, basePort, origins, wrap }: { worktree: string; basePort: Port; origins?: Origins; wrap?: Wrap }): Promise<void> {
	const concurrently = createRequire(join(worktree, 'package.json'))('concurrently') as (commands: DevCommand[], options: object) => { result: Promise<unknown> };
	const logPath = process.env.WF_DEV_LOG ?? join(worktree, '.wf', 'logs', 'dev.log');
	mkdirSync(dirname(logPath), { recursive: true });
	const outputStream = new PassThrough();
	outputStream.pipe(process.stdout);
	outputStream.pipe(createWriteStream(logPath, { flags: 'a' }));
	const { result } = concurrently(devCommands(basePort, { origins, wrap }), {
		prefix: 'name',
		prefixColors: ['yellow', 'blue', 'cyan'],
		killOthersOn: ['failure'],
		outputStream,
		cwd: worktree,
	});
	await result.catch(() => { process.exitCode = 1; });
}
