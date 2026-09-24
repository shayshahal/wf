// projects/jewelryx/dev.mjs — a worktree's three dev servers on its ports, each behind its portless name.
//   node projects/jewelryx/dev.mjs <base-port> --slug <slug>    (cwd = the worktree; `wf hook serve` and `wf stacks`)
// Ports: B2B on P, API on P+10000, admin on P+20000 (index.mjs). Every line also lands in
// .wf/logs/dev.log, prefixed by server name, so an agent can read why a tethered server died;
// WF_DEV_LOG moves it (the permanent dev stack must not leave .wf/ in the dev checkout).
import { createWriteStream, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { stackNames } from './index.mjs';

// `portless --name <app> --app-port <port> -- <cmd>`: the exact dotted name, so no worktree prefix
// is added (portless's own prefix is the branch's last segment, not our slug). PORTLESS=0 runs <cmd>
// directly with no route: the port-only fallback when the proxy is down.
const portlessAppFor = (origin) => origin.replace(/^https?:\/\//, '').replace(/\.localhost\/?$/, '');
const wrapPortless = (origins, role, port, cmd) => (origins ? `portless --name ${portlessAppFor(origins[role])} --app-port ${port} -- ${cmd}` : cmd);

// Pure: the three commands and their environments.
export function devCommands(basePort, { slug, portless = true } = {}) {
	if (!/^1\d{4}$/.test(String(basePort))) throw new Error('Worktree base port must be from 10000 to 19999');
	const b2bPort = Number(basePort);
	const backendPort = b2bPort + 10_000;
	const adminPort = b2bPort + 20_000;
	const backendUrl = `http://localhost:${backendPort}`;
	// Server-side calls use 127.0.0.1: Node resolves `localhost` to ::1 first and uvicorn listens on
	// IPv4 only, so `localhost` made every SSR route 500 (BJEW-600 pilot, 2026-09-19).
	const internalBackendUrl = `http://127.0.0.1:${backendPort}`;
	const origins = slug && portless ? stackNames(slug) : null;
	const b2bOrigin = origins?.b2b ?? `http://localhost:${b2bPort}`;
	const adminOrigin = origins?.admin ?? `http://localhost:${adminPort}`;
	// PORTLESS_HTTPS=0 pins an auto-started proxy to plain HTTP (--no-tls); a no-op when the
	// service proxy is already up.
	const proxyEnv = origins ? { PORTLESS_HTTPS: '0' } : {};
	return [
		{
			name: 'backend',
			command: wrapPortless(origins, 'api', backendPort, 'pnpm dev:backend'),
			env: { DEV_BACKEND_PORT: String(backendPort), CORS_ORIGINS: `${b2bOrigin},${adminOrigin}`, B2B_PUBLIC_URL: `${b2bOrigin}/b2b`, ...proxyEnv },
		},
		{
			name: 'b2b',
			// No `--` before the flags: pnpm forwards it verbatim to vite, which treats it as
			// end-of-options and ignores --port, silently falling back to 5173/3002. (The `--` after
			// --app-port belongs to portless, not vite.)
			command: wrapPortless(origins, 'b2b', b2bPort, `pnpm dev:frontend --port ${b2bPort} --strictPort`),
			env: { INTERNAL_API_URL: internalBackendUrl, PUBLIC_API_URL: '/api', ORIGIN: b2bOrigin, ...proxyEnv },
		},
		{
			name: 'admin',
			command: wrapPortless(origins, 'admin', adminPort, `pnpm dev:admin --port ${adminPort} --strictPort`),
			env: { INTERNAL_API_URL: internalBackendUrl, PUBLIC_API_URL: `${origins?.api ?? backendUrl}/api/v1`, PUBLIC_B2B_ORIGIN: b2bOrigin, ORIGIN: adminOrigin, ...proxyEnv },
		},
	];
}

// concurrently comes from the worktree's own node_modules (the project's devDependency): wf has none.
export async function runDev({ worktree, basePort, slug }) {
	const concurrently = createRequire(join(worktree, 'package.json'))('concurrently');
	const logPath = process.env.WF_DEV_LOG ?? join(worktree, '.wf', 'logs', 'dev.log');
	mkdirSync(dirname(logPath), { recursive: true });
	const outputStream = new PassThrough();
	outputStream.pipe(process.stdout);
	outputStream.pipe(createWriteStream(logPath, { flags: 'a' }));
	const { result } = concurrently(devCommands(basePort, { slug, portless: process.env.PORTLESS !== '0' }), {
		prefix: 'name',
		prefixColors: ['yellow', 'blue', 'cyan'],
		killOthersOn: ['failure'],
		outputStream,
		cwd: worktree,
	});
	await result.catch(() => { process.exitCode = 1; });
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('jewelryx/dev.mjs')) {
	const i = process.argv.indexOf('--slug');
	await runDev({ worktree: process.cwd(), basePort: process.argv[2], slug: i >= 0 ? process.argv[i + 1] : undefined });
}
