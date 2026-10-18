// Finite declaration/profile products cover this closed domain more directly than random generation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { baselineProofKey, reusableBaseline } from '../../src/gates/baseline-proof.ts';
import { devCommands } from './dev.ts';
import { parseReproRequirements, parseVerificationProfile, verificationEndpoints, waitForVerificationReady } from './readiness.ts';
import type { VerificationProfile, VerificationRequirements } from './readiness.ts';

const shared: VerificationRequirements = { kind: 'stack', profile: 'shared-auth', temporary: false };
const apiOnly: VerificationRequirements = { kind: 'stack', profile: 'api', temporary: true };
const requirements = new Map<string | undefined, VerificationRequirements>([[undefined, shared], ['none', { kind: 'none' }], ['api', apiOnly], ['shared-auth', shared]]);
const description = (services?: string) => `# fixture\n## Repro\ncommand: node custom.mjs\n${services === undefined ? '' : `services: ${services}\n`}## Other\nservices: invalid-outside-repro\n`;
const known = [
	'pnpm --dir verification exec playwright test',
	'pnpm --dir=verification exec playwright test',
	'pnpm -C verification exec playwright test -c playwright.config.ts',
	'pnpm exec playwright test --config=verification/playwright.config.ts',
	'pnpm exec playwright test --config verification',
	'pnpm exec playwright test -cverification/',
	'pnpm exec playwright test -c verification/../verification',
	'pnpm --dir verification exec playwright test --config .',
	'pnpm -Cverification exec playwright test -c ./',
	'node verification/node_modules/@playwright/test/cli.js test -c verification',
	'verification/node_modules/.bin/playwright.cmd test --config verification',
	'pnpm exec playwright test -c ../bug-reports/X-1/repro/',
	'pnpm --dir verification/tests exec playwright test -c ../playwright.config.ts',
	'pnpm --dir verification/tests exec playwright test --config=../',
	'pnpm --dir bug-reports/X-1/repro/tests exec playwright test -c ../',
	'pnpm --dir docs/agents/verify-jewelryx/tests exec playwright test -c ../repro.config.ts',
	'pnpm -C C:\\repo\\verification\\tests exec playwright test -c ..\\playwright.config.ts',
	'pnpm --dir verification exec playwright test -c ../docs/agents/verify-jewelryx/repro.config.ts',
	'pnpm exec playwright test --config "docs/agents/verify-jewelryx/repro.config.ts"',
	'pnpm exec playwright test -c ../bug-reports/X-1/repro/playwright.config.ts',
	'pnpm exec playwright test -c "C:\\work\\docs\\agents\\verify-jewelryx\\repro.config.ts"',
	'control-jewelryx auth buyer',
	'node docs/agents/verify-jewelryx/control-jewelryx.mjs auth admin',
	'control-jewelryx api listOrders',
	'control-jewelryx login buyer',
	'control-jewelryx open b2b / as buyer',
	'control-jewelryx doctor',
	'control-jewelryx reset',
];
const custom = ['node custom.mjs', 'pnpm exec playwright test -c custom.config.ts', 'pnpm --dir verification exec playwright test -c api.config.ts', 'control-jewelryx api --find fixture', 'pnpm --dir verification exec playwright test -c ../custom.config.ts'];
for (const [declaration, expected] of requirements) {
	for (const command of [...custom, ...known]) {
		const result = parseReproRequirements(description(declaration), command);
		if (known.includes(command) && (declaration === 'none' || declaration === 'api')) {
			assert.equal(result.kind, 'invalid', `${command}: ${declaration}`);
			if (result.kind === 'invalid') assert.match(result.why, /conflicts.*shared-auth/);
		} else assert.deepEqual(result, { kind: 'parsed', requirements: expected }, command);
	}
	assert.deepEqual(parseReproRequirements(description(declaration).replace(/\n/g, '\r\n'), custom[0]), { kind: 'parsed', requirements: expected });
	for (const second of requirements.keys()) {
		if (second !== undefined && declaration !== undefined) {
			assert.equal(parseReproRequirements(description(declaration).replace('## Other', `services: ${second}\n## Other`), custom[0]).kind, 'invalid');
		}
	}
}
const proof = { base: 'baseline', task: { cmd: 'node', args: ['runner.mjs'], cwd: '.' }, target: { file: 'test.mjs', id: 'named assertion', line: 1, refactor: false }, probe: 'probe', environment: 'environment', isolated: true };
const requirementKeys = [...requirements.values()].map((requirement) => baselineProofKey({ ...proof, task: { ...proof.task, requirements: requirement } }));
assert.equal(new Set(requirementKeys).size, 3, 'closed dependency modes have distinct proof keys; shared default and explicit shared are equivalent');
const previousKey = requirementKeys[0];
const identity = { base: proof.base, command: proof.task.cmd, argv: proof.task.args, key: previousKey, current: 'current', target: proof.target, probe: proof.probe, environment: proof.environment, isolated: true };
assert.equal(reusableBaseline([{ baseline: identity, evidence: { verdict: 'passed', say: 'named assertion passed' }, exit: 0 }], { key: requirementKeys[1], current: 'current', want: 'passed' }), null, 'a changed dependency contract cannot reuse the prior before proof');
assert.equal(baselineProofKey(proof), baselineProofKey({ ...proof, task: { ...proof.task, requirements: undefined } }), 'legacy implicit keys remain stable');
for (const invalid of ['', 'API', 'none extra', 'api # comment', 'null', 'none|api', '`api`']) {
	assert.equal(parseReproRequirements(description(invalid), custom[0]).kind, 'invalid', invalid);
}
for (const malformed of [' services: api', 'Services: api', 'services = api', 'services api']) {
	assert.equal(parseReproRequirements(`## Repro\n${malformed}\n`, custom[0]).kind, 'invalid');
}
assert.deepEqual(parseReproRequirements('## Other\nservices: none\n', custom[0]), { kind: 'parsed', requirements: shared });
assert.equal(parseReproRequirements('## Repro\nservices: api\n## Other\ntext\n## Repro\nservices: none\n', custom[0]).kind, 'invalid');
for (const raw of [undefined, 'shared-auth', 'api', null, '', 'API', ' api', 0, false, {}, [], ['api']]) {
	const parsed = parseVerificationProfile(raw);
	if (raw === undefined || raw === 'shared-auth' || raw === 'api') {
		assert.deepEqual(parsed, { kind: 'parsed', profile: raw ?? 'shared-auth' });
	} else assert.equal(parsed.kind, 'invalid');
}
for (const profile of ['shared-auth', 'api'] satisfies VerificationProfile[]) {
	const wrapped: string[] = [];
	const commands = devCommands(12345, { profile, wrap: ({ role, command }) => { wrapped.push(role); return { command: `wrapped ${command}`, env: { WRAPPED: role } }; } });
	assert.deepEqual(commands.map((command) => command.name), profile === 'api' ? ['backend'] : ['backend', 'b2b', 'admin']);
	assert.deepEqual(wrapped, profile === 'api' ? ['api'] : ['api', 'b2b', 'admin']);
	assert.equal(commands[0].command, 'wrapped pnpm dev:backend');
	assert.equal(commands[0].env.DEV_BACKEND_PORT, '22345');
}
assert.deepEqual(devCommands(12345), devCommands(12345, { profile: 'shared-auth' }));
assert.deepEqual(devCommands(12345, { profile: 'api' }), [devCommands(12345)[0]]);

let status = 200;
let frontendStatus = 200;
let hang = false;
let received: (() => void) | undefined;
const requests: string[] = [];
const server = createServer((req, res) => {
	requests.push(req.url ?? '');
	if (!hang) res.writeHead(req.url === '/openapi.json' ? status : frontendStatus).end('{}');
	received?.();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert(address && typeof address !== 'string');
const env = { API_URL: `http://127.0.0.1:${address.port}/api/v1` };
const quick = { timeoutMs: 0, requestTimeoutMs: 1000 };
try {
	assert.deepEqual(verificationEndpoints(env, 'api'), [{ name: 'API', url: `http://127.0.0.1:${address.port}/openapi.json` }]);
	assert.throws(() => verificationEndpoints(env), /missing B2B_URL/);
	assert.throws(() => verificationEndpoints({}, 'api'), /missing API_URL/);
	for (const API_URL of ['file:///tmp/api', 'http://user:secret@localhost', 'not a url']) {
		assert.throws(() => verificationEndpoints({ API_URL }, 'api'), /invalid API_URL/);
	}
	await waitForVerificationReady('.', env, { ...quick, profile: 'api' });
	assert.deepEqual(requests, ['/openapi.json']);
	await assert.rejects(waitForVerificationReady('.', env, quick), /missing B2B_URL/);
	// Both frontends answer 503 while the API answers 200: API admits, shared auth refuses.
	const full = { ...env, B2B_URL: env.API_URL, ADMIN_URL: env.API_URL };
	frontendStatus = 503;
	await waitForVerificationReady('.', full, { ...quick, profile: 'api' });
	await assert.rejects(waitForVerificationReady('.', full, quick), /storefront .*HTTP 503.*admin .*HTTP 503/);
	frontendStatus = 200;
	await waitForVerificationReady('.', full, quick);
	assert(requests.includes('/'));

	// A held HTTP request cannot defer cancellation until its 30-second request timeout.
	hang = true;
	const requestAbort = new AbortController();
	received = () => requestAbort.abort('fixture cancellation');
	const requestStart = performance.now();
	await assert.rejects(waitForVerificationReady('.', env, { profile: 'api', signal: requestAbort.signal, requestTimeoutMs: 30_000 }), /verification readiness cancelled/);
	assert(performance.now() - requestStart < 5000, 'abort must interrupt an in-flight request');
	hang = false;
	status = 503;
	await assert.rejects(waitForVerificationReady('.', { ...env, STACK_LOG: '/fixture/dev.log' }, { ...quick, profile: 'api' }), /API .*HTTP 503.*Dependent runner not started.*\/fixture\/dev.log/);
	const retryAbort = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Abort after the failed response has entered the long retry wait.
	received = () => { timer = setTimeout(() => retryAbort.abort(), 50); };
	try {
		const retryStart = performance.now();
		await assert.rejects(waitForVerificationReady('.', env, { profile: 'api', signal: retryAbort.signal, intervalMs: 30_000 }), /verification readiness cancelled/);
		assert(performance.now() - retryStart < 5000, 'abort must interrupt the retry wait');
	} finally { clearTimeout(timer); }
	received = undefined;
	const before = requests.length;
	await assert.rejects(waitForVerificationReady('.', {}, { signal: AbortSignal.abort() }), /verification readiness cancelled/);
	assert.equal(requests.length, before, 'pre-abort sends no request and wins over missing configuration');
	console.log('  ok   finite requirements/profile cases, API-only HTTP admission, shared default, request/retry cancellation and backend-only startup commands');
} finally {
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
