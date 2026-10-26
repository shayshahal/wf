import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseRefusal, runCheckProcess } from './check-process.ts';
import { seams } from '../seams.ts';

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
	// #173: a refused release names the predicate that failed, by identity, and keeps it in the ownership record.
	assert.match(releaseRefusal({ rootPresent: false, orphanedRunner: true, nativeKillOk: false, inventoryAfter: 'unknown', survivors: ['1@t'], survivorCount: 12 }), /root identity NOT seen; orphaned runner YES; native kill FAILED; inventory after kill unknown; surviving 12: 1@t, …/);
	const refused = mkdtempSync(join(tmpdir(), 'wf-check-refused-'));
	const realKill = seams.processes.kill;
	seams.processes.kill = (owners) => { realKill(owners); return false; };
	try {
		const run = await runCheckProcess(process.execPath, ['-e', 'console.log("x")'], { ...options, cwd: refused, worktree: refused });
		assert.equal(run.status, null);
		assert.match(run.stderr, /descendant shutdown not confirmed; ownership retained \(root identity seen; orphaned runner no; native kill FAILED; inventory after kill known; surviving 0\)/);
		const folder = join(refused, '.wf', 'check-processes');
		const kept = JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]), 'utf8'));
		assert.equal(kept.diagnosis.nativeKillOk, false); assert.equal(kept.diagnosis.rootPresent, true); assert.ok(Array.isArray(kept.processes));
		assert.doesNotMatch(JSON.stringify(kept), /commandLine|command/i, 'identities only, no command lines');
	} finally { seams.processes.kill = realKill; rmSync(refused, { recursive: true, force: true }); }
	console.log('all real check output, cancellation and timeout descendant witnesses green');
} finally { rmSync(root, { recursive: true, force: true }); }
