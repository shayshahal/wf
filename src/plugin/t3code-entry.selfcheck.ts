// JX-1433 (2026-10-19): the real round skill bootstrap entered the kit, bypassing env's T3 wiring.
// Exercise that bootstrap and a relocated export, never a manually plugged presentation adapter.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';

const root = mkdtempSync(join(tmpdir(), 'wf T3 skill entry '));
const repo = join(root, 'round');
const other = join(root, 'other');
const folder = 'task-record';
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
let binding = repo;
let authorized = true;
const calls: string[] = [];
const server = createServer(async (request, response) => {
	let text = '';
	for await (const chunk of request) text += chunk;
	const message = JSON.parse(text);
	calls.push(message.method);
	assert.equal(request.method, 'POST'); // Never end the live host's session with DELETE.
	assert.equal(request.headers.authorization, 'Bearer fixture-secret');
	if (!authorized) { response.writeHead(401); response.end(); return; }
	if (message.method === 'notifications/initialized') { response.writeHead(202); response.end(); return; }
	let result;
	if (message.method === 'initialize') {
		response.setHeader('mcp-session-id', 'fixture-session');
		result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
	} else {
		assert.equal(message.method, 'tools/call');
		assert.equal(message.params.name, 't3_worktree_status');
		result = { structuredContent: { attached: true, worktreePath: binding, branch: null, projectWorkspaceRoot: repo } };
	}
	response.writeHead(200, { 'content-type': 'application/json' });
	response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
});

try {
	mkdirSync(repo); mkdirSync(other);
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', '-c', 'core.autocrlf=false', ...args], { env, encoding: 'utf8' });
	git('init', '-q', '-b', 'main');
	git('commit', '-qm', 'base', '--allow-empty');
	git('checkout', '-qb', 'fix/r');
	mkdirSync(join(repo, '.wf'));
	mkdirSync(join(repo, folder));
	const state = JSON.stringify({ wf_version: 3, made_by: 'kit', round: 'fix/r', id: 'R', folder, class: 'B', base: 'main', step: 'agree' });
	writeFileSync(join(repo, '.wf/state.json'), state);
	writeFileSync(join(repo, folder, 'TICKET.md'), '# R\n## Intent\n- Preserve optional form values — the requester\n');
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	const endpoint = `http://127.0.0.1:${address.port}/mcp`;
	const run = async (entry: string, args: string[], credentials: NodeJS.ProcessEnv = {}) => {
		const child = spawn(process.execPath, [entry, ...args], { cwd: repo, env: { ...env, ...credentials }, timeout: 20_000 });
		let stdout = ''; let stderr = '';
		child.stdout.on('data', (data) => { stdout += data; });
		child.stderr.on('data', (data) => { stderr += data; });
		const [code] = await once(child, 'close');
		return { code, stdout, stderr };
	};
	const source = join(WF_ROOT, 'skills/round/scripts/wf.mjs');
	const exported = join(root, 'export');
	const exportedRun = await run(source, ['skill', 'export', exported]);
	assert.equal(exportedRun.code, 0, exportedRun.stderr);
	const moved = join(root, 'relocated export');
	renameSync(exported, moved);
	const second = join(root, 're-export');
	const reExported = await run(join(moved, 'scripts/wf.mjs'), ['skill', 'export', second]);
	assert.equal(reExported.code, 0, reExported.stderr);

	// Install a complete committed fixture through the real installer, isolated from the live copy.
	const installSource = join(root, 'install source');
	cpSync(join(moved, 'scripts/runtime'), installSource, { recursive: true });
	for (const directory of ['skills', 'env', 'agents']) cpSync(join(WF_ROOT, directory), join(installSource, directory), { recursive: true });
	const installGit = (...args: string[]) => execFileSync('git', ['-C', installSource, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', '-c', 'core.autocrlf=false', ...args], { env, encoding: 'utf8' }).trim();
	installGit('init', '-q'); installGit('add', '-A'); installGit('commit', '-qm', 'install fixture');
	const home = join(root, 'isolated home');
	mkdirSync(join(home, '.local/share'), { recursive: true });
	const installer = `import { homedir } from 'node:os';
if (homedir() !== ${JSON.stringify(home)}) throw new Error('home isolation failed');
const { install } = await import(${JSON.stringify(pathToFileURL(join(installSource, 'env/update.ts')).href)});
if (!install(${JSON.stringify(join(installSource, '.git'))}, ${JSON.stringify(installGit('rev-parse', 'HEAD'))})) throw new Error('fixture installation failed');`;
	execFileSync(process.execPath, ['--input-type=module', '-e', installer], { env: { ...env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
	rmSync(installSource, { recursive: true, force: true });
	const installed = join(home, '.local/share/wf');
	const entries = [
		{ entry: source, madeBy: 'kit' },
		{ entry: join(installed, 'skills/round/scripts/wf.mjs'), madeBy: 'kit' },
		{ entry: join(moved, 'scripts/wf.mjs'), madeBy: 'kit' },
		{ entry: join(second, 'scripts/wf.mjs'), madeBy: 'kit' },
		{ entry: join(installed, 'env/wf.mjs'), madeBy: 'env' },
	];
	for (const { entry, madeBy } of entries) {
		writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...JSON.parse(state), made_by: madeBy, entry }));
		for (const credentials of [
			{ T3_MCP_URL: endpoint, T3_MCP_BEARER_TOKEN: 'fixture-secret' },
			{ T3_ACP_MCP_ENDPOINT: endpoint, T3_ACP_MCP_AUTHORIZATION: 'Bearer fixture-secret' },
		]) {
			binding = repo;
			const brief = await run(entry, ['brief', 'agree'], credentials);
			assert.equal(brief.code, 0, brief.stderr);
			assert.match(brief.stdout, /Native presentation — T3 Code/, 'the actual skill entry must wire the native host');
			assert.match(brief.stdout, /html_preview.*html_render/s);
			assert.match(brief.stdout, /Decision first/);
			assert.match(brief.stdout, /Show, don.t narrate/i);
			assert.match(brief.stdout, /ASD-STE100/);
			assert.ok(brief.stdout.indexOf('Decision first') < brief.stdout.indexOf("The requester's words"), 'presentation rules precede long ticket context');
			assert.ok(!brief.stdout.includes('fixture-secret'));
			assert.equal(JSON.parse(readFileSync(join(repo, '.wf/state.json'), 'utf8')).made_by, madeBy);
			assert.equal(JSON.parse(readFileSync(join(repo, '.wf/state.json'), 'utf8')).entry, entry);

			const before = readFileSync(join(repo, '.wf/state.json'), 'utf8');
			binding = other;
			const wrong = await run(entry, ['brief', 'agree'], credentials);
			assert.equal(wrong.code, 1, wrong.stdout + wrong.stderr);
			assert.match(wrong.stderr, /native session workspace does not match/);
			assert.equal(readFileSync(join(repo, '.wf/state.json'), 'utf8'), before);
		}
		const count = calls.length;
		const terminal = await run(entry, ['brief', 'agree']);
		assert.equal(terminal.code, 0, terminal.stderr);
		assert.ok(!terminal.stdout.includes('Native presentation — T3 Code'));
		assert.match(terminal.stdout, /Decision first/);
		assert.equal(calls.length, count, 'ordinary terminals make no native host requests');
		for (const phase of ['build', 'assess']) {
			const prompt = await run(entry, ['prompt', phase]);
			assert.equal(prompt.code, 0, prompt.stderr);
			assert.match(prompt.stdout, /Decision first/);
			assert.match(prompt.stdout, /ASD-STE100/);
		}
		const saved = readFileSync(join(repo, '.wf/state.json'), 'utf8');
		writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ ...JSON.parse(saved), made_by: madeBy === 'kit' ? 'env' : 'kit' }));
		const wrongEntry = await run(entry, ['prompt', 'agree']);
		assert.equal(wrongEntry.code, 1, wrongEntry.stdout + wrongEntry.stderr);
		assert.match(wrongEntry.stderr, /this round was made by/);
		writeFileSync(join(repo, '.wf/state.json'), saved);
	}

	// Authenticated but unavailable is never permission to fall back to an unbound terminal.
	writeFileSync(join(repo, '.wf/state.json'), state);
	authorized = false;
	const unavailable = await run(source, ['brief', 'agree'], { T3_MCP_URL: endpoint, T3_MCP_BEARER_TOKEN: 'fixture-secret' });
	assert.equal(unavailable.code, 1, unavailable.stdout + unavailable.stderr);
	assert.match(unavailable.stderr, /native session workspace unavailable/);
	assert.ok(!unavailable.stderr.includes('fixture-secret'));
	authorized = true;

	// A real human gate through the source bootstrap must also carry the native presentation handoff.
	binding = repo;
	writeFileSync(join(repo, folder, 'AGREEMENT.md'), '# R\n## Observed\n- Form drops optional values — source\n## Agreed\n- Behavior: preserve optional values\n- Excluding: unrelated forms\n- Choice: existing save path, not a new endpoint\n- Verification: save and reopen\n- **Not asked for.** none — only the reported fields\n- T2 walk: none — executable contract check\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | preserve values | a.txt | manual: inspect values |\n');
	const gate = await run(source, ['agree', 'fix/r'], { T3_MCP_URL: endpoint, T3_MCP_BEARER_TOKEN: 'fixture-secret' });
	assert.equal(gate.code, 0, gate.stderr);
	assert.match(gate.stdout, /native review handoff: T3 Code — agreement \(not opened by wf\)/);
	const record = readFileSync(join(repo, folder, 'AGREEMENT-REVIEW.md'), 'utf8');
	assert.ok(!/^verdict: approved$/m.test(record), 'presentation handoff cannot invent approval');
	assert.ok(existsSync(join(repo, '.wf/AGREEMENT-T1.html')));
	console.log('source/installed skill, relocated/re-exported kit and env entry: Pi/ACP native guidance, concise phase prompts, workspace/authorization refusals, unchanged entry ownership, terminal fallback and pending T1');
} finally {
	server.closeAllConnections();
	if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	rmSync(root, { recursive: true, force: true });
}
