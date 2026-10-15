import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckProcess } from './check-process.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-check-lifetime-'));
const options = { cwd: root, worktree: root, env: process.env, shell: false, maxBuffer: 100_000 };
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const marker = join(root, 'descendant.json');
const descendant = `const fs=require('node:fs');const s=require('node:http').createServer((q,r)=>r.end('up'));s.listen(0,'127.0.0.1',()=>fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,port:s.address().port})));setInterval(()=>{},1000);`;
const runner = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000);`;
async function waitForDescendant() {
	const until = Date.now() + 15_000;
	while (!existsSync(marker) && Date.now() < until) await sleep(25);
	assert.ok(existsSync(marker), 'runner descendant started');
}
async function assertReleased() {
	const { port } = JSON.parse(readFileSync(marker, 'utf8'));
	await assert.rejects(fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) }));
	assert.equal(readdirSync(join(root, '.wf', 'check-processes')).length, 0);
	rmSync(marker);
}
try {
	const happy = await runCheckProcess(process.execPath, ['-e', 'console.log("measured output")'], options);
	assert.equal(happy.status, 0); assert.match(happy.stdout, /measured output/);
	const cancel = new AbortController();
	const cancelled = runCheckProcess(process.execPath, ['-e', runner], { ...options, signal: cancel.signal });
	await waitForDescendant(); cancel.abort();
	assert.equal((await cancelled).status, null); await assertReleased();
	const timeout = runCheckProcess(process.execPath, ['-e', runner], { ...options, timeoutMs: 4000 });
	await waitForDescendant();
	assert.match((await timeout).stderr, /timed out/); await assertReleased();
	console.log('all real check output, cancellation and timeout descendant witnesses green');
} finally { rmSync(root, { recursive: true, force: true }); }
