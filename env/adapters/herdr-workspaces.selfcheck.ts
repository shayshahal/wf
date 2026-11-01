// Real machine entry + real Git, with a filesystem-backed external Herdr CLI peer. No live panes.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { herdrWorkspaceHandoff } from './herdr-workspaces.ts';
import { herdrOpener } from './herdr.ts';

const root = mkdtempSync(join(tmpdir(), 'wf herdr peer '));
const repo = join(root, 'repo');
const checkout = join(root, "existing $ ' checkout");
const bin = join(root, 'bin');
const peer = join(root, 'peer.mjs');
const stateFile = join(root, 'peer.json');
const entry = fileURLToPath(new URL('../wf.mjs', import.meta.url));
const kit = fileURLToPath(new URL('../../wf.mjs', import.meta.url));
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`  ok ${name}`); }
try {
	mkdirSync(repo); mkdirSync(bin);
	git('init', '-q', '-b', 'main');
	git('-c', 'user.name=wf', '-c', 'user.email=wf@test', 'commit', '--allow-empty', '-qm', 'fixture');
	git('worktree', 'add', '-b', 'fixture-existing', checkout);
	const authority = git('worktree', 'list', '--porcelain');
	const head = git('rev-parse', 'HEAD');
	const approval = join(checkout, 'REVIEW.md');
	writeFileSync(approval, 'Fixture only: approval/resource obligations must remain untouched.\n');
	const rows = [{ path: repo, branch: 'main', is_bare: false }, { path: checkout, branch: 'fixture-existing', is_bare: false }];
	const fresh = (mode = 'good') => ({ mode, rows, opens: 0, lists: 0 });
	const save = (value: unknown) => writeFileSync(stateFile, JSON.stringify(value));
	const state = () => JSON.parse(readFileSync(stateFile, 'utf8'));
	// A renamed real Node executable speaks the native CLI protocol through a preload. Unlike a
	// .cmd shim it exercises shell:false argv on Windows, including spaces/quotes/metacharacters.
	const executable = join(bin, process.platform === 'win32' ? 'herdr.exe' : 'herdr');
	copyFileSync(process.execPath, executable); chmodSync(executable, 0o755);
	writeFileSync(peer, `import {basename} from 'node:path'; import {readFileSync,writeFileSync} from 'node:fs';
if (basename(process.execPath).toLowerCase().startsWith('herdr')) {
 const file=${JSON.stringify(stateFile)}; const s=JSON.parse(readFileSync(file,'utf8')); const op=process.argv[2];
 const fail=()=>{writeFileSync(file,JSON.stringify(s));console.error('private-provider-detail-must-not-leak');process.exit(1);};
 const reply=(result)=>{writeFileSync(file,JSON.stringify(s));console.log(JSON.stringify({result}));process.exit(0);};
 if(op==='list') {s.lists++; if(s.mode==='unavailable'||(s.mode==='post-failure'&&s.opens))fail(); if(s.mode==='bad-json'){console.log('{bad');process.exit(0);} reply({type:'worktree_list',worktrees:s.rows});}
 if(op==='open') {s.opens++;s.openArgv=process.argv.slice(1); if(s.mode==='trust')fail(); s.rows[1].open_workspace_id='wTest'; if(s.mode==='lost')fail(); if(s.mode==='bad-ack')reply({type:'wrong'}); reply({type:'worktree_opened',workspace:{workspace_id:'wTest'},worktree:s.rows[1]});}
 fail();
}
`);
	const env = { ...process.env, HERDR_ENV: '1', PATH: `${bin}${delimiter}${process.env.PATH}`, NODE_OPTIONS: `--import=${pathToFileURL(peer).href}` };
	const invoke = (argv: string[], extra: NodeJS.ProcessEnv = {}, target = entry) => spawnSync(process.execPath, [target, ...argv], { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 });
	const output = (result: ReturnType<typeof invoke>) => `${result.stdout}\n${result.stderr}`;
	check('machine command discoverable; kit has no Herdr dependency', () => {
		assert.match(invoke(['--help']).stdout, /\|herdr/);
		assert.doesNotMatch(invoke(['--help'], {}, kit).stdout, /\|herdr/);
	});
	check('outside Herdr never calls the native peer', () => {
		save(fresh()); const r = invoke(['herdr', 'list'], { HERDR_ENV: '' }); assert.equal(r.status, 1); assert.match(output(r), /not inside Herdr/); assert.equal(state().lists, 0);
	});
	check('list exposes registered paths/branches and absent mappings', () => {
		save(fresh()); const r = invoke(['herdr', 'list']); assert.equal(r.status, 0, output(r)); const d = JSON.parse(r.stdout); assert.equal(d.kind, 'listed'); assert.equal(d.worktrees.length, 2); assert.equal(d.worktrees[1].workspace, null); assert.equal(state().opens, 0);
	});
	check('open is no-focus and repeated open reuses exactly one mapping', () => {
		save(fresh()); const first = invoke(['herdr', 'open', checkout]); assert.equal(first.status, 0, output(first)); assert.equal(JSON.parse(first.stdout).disposition, 'opened');
		const again = invoke(['herdr', 'open', checkout]); assert.equal(again.status, 0, output(again)); assert.equal(JSON.parse(again.stdout).disposition, 'reused'); assert.equal(state().opens, 1); assert.ok(state().openArgv.includes('--no-focus')); assert.ok(state().openArgv.includes(checkout.replace(/\\/g, '/')) || state().openArgv.includes(checkout)); assert.ok(!state().openArgv.includes('--trust-repository'));
	});
	check('relative and canonical path aliases cannot duplicate a workspace', () => {
		save(fresh()); assert.equal(invoke(['herdr', 'open', join('..', "existing $ ' checkout")]).status, 0);
		const alias = process.platform === 'win32' ? checkout.toUpperCase() : checkout;
		assert.equal(invoke(['herdr', 'open', alias]).status, 0); assert.equal(state().opens, 1);
	});
	check('missing/foreign paths and unsupported actions never allocate or open', () => {
		for (const argv of [['herdr', 'open', join(root, 'missing')], ['herdr', 'open', root], ['herdr', 'create'], ['herdr', 'remove'], ['herdr', 'open', checkout, '--focus']]) {
			save(fresh()); const r = invoke(argv); assert.equal(r.status, 1, output(r)); assert.equal(state().opens, 0); assert.ok(!existsSync(join(root, 'missing')));
		}
	});
	check('malformed, incomplete, duplicated and foreign discovery cannot supply authority', () => {
		const variants = [fresh('bad-json'), { ...fresh(), rows: [] }, { ...fresh(), rows: [...rows, rows[1]] }, { ...fresh(), rows: [rows[0], { ...rows[1], branch: 'wrong' }] }, { ...fresh(), rows: [rows[0], { ...rows[1], path: root }] }, { ...fresh(), rows: [rows[0], { ...rows[1], open_workspace_id: 'invalid id' }] }];
		for (const fixture of variants) { save(fixture); const r = invoke(['herdr', 'open', checkout]); assert.equal(r.status, 1, output(r)); assert.equal(state().opens, 0); }
	});
	check('unavailable peer and trust refusal retain authority and do not leak provider details', () => {
		for (const mode of ['unavailable', 'trust']) { save(fresh(mode)); const r = invoke(['herdr', 'open', checkout]); assert.equal(r.status, 1); assert.doesNotMatch(output(r), /private-provider-detail/); assert.ok(state().opens <= 1); assert.equal(state().rows[1].open_workspace_id, undefined); }
	});
	check('lost/malformed mutation replies are uncertain, discovered and reused on retry', () => {
		for (const mode of ['lost', 'bad-ack', 'post-failure']) {
			save(fresh(mode)); const r = invoke(['herdr', 'open', checkout]); assert.equal(r.status, 1, output(r)); assert.match(output(r), /uncertain/); assert.equal(state().opens, 1);
			save({ ...state(), mode: 'good' }); const retry = invoke(['herdr', 'open', checkout]); assert.equal(retry.status, 0, output(retry)); assert.equal(JSON.parse(retry.stdout).disposition, 'reused'); assert.equal(state().opens, 1);
		}
	});
	check('opening does not change Git identity, approval facts or cleanup authority', () => {
		assert.equal(git('worktree', 'list', '--porcelain'), authority); assert.equal(git('rev-parse', 'HEAD'), head); assert.equal(readFileSync(approval, 'utf8'), 'Fixture only: approval/resource obligations must remain untouched.\n');
	});
	check('handoff is inert, explicit, argv-safe and retains authenticated native binding', () => {
		assert.equal(herdrWorkspaceHandoff({}), null);
		const handoff = herdrWorkspaceHandoff({ HERDR_ENV: '1' }); assert.ok(handoff); const text = handoff(checkout); assert.match(text, /not opened by wf/); assert.match(text, /not bind or replace/); assert.match(text, /not wf reap/); assert.ok(text.includes(JSON.stringify(['wfk', 'herdr', 'open', checkout.replace(/\\/g, '/')])));
		const native = herdrWorkspaceHandoff({ HERDR_ENV: '1', T3_MCP_URL: 'http://unused', T3_MCP_BEARER_TOKEN: 'fixture-secret' }); assert.ok(native); assert.match(native(checkout), /T3 Code/); assert.doesNotMatch(native(checkout), /fixture-secret/);
		assert.deepEqual(herdrOpener(), { ...(process.env.HERDR_PANE_ID ? { pane: process.env.HERDR_PANE_ID } : {}), ...(process.env.PI_SESSION_ID ? { session: process.env.PI_SESSION_ID } : {}) });
	});
	console.log(`${passed} existing-checkout Herdr checks green; controlled CLI peer, not a live UI/focus claim`);
} finally { rmSync(root, { recursive: true, force: true }); }
