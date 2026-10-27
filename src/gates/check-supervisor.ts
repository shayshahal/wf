// Internal executable: the parent records this process before sending its runner over IPC.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { snapshotProcesses, ownedProcessTree, killOwnedProcesses, parseProcessIdentities } from '../process-tree.ts';
import type { ProcessIdentity } from '../process-tree.ts';

const record = process.argv[2];
if (!record || !process.send) throw new Error('wf check: supervisor requires an ownership record and IPC parent');
let started = false;
process.on('message', (message: unknown) => {
	if (started || typeof message !== 'object' || message === null || !('cmd' in message) || typeof message.cmd !== 'string'
		|| !('args' in message) || !Array.isArray(message.args) || !message.args.every((arg): arg is string => typeof arg === 'string')
		|| !('shell' in message) || typeof message.shell !== 'boolean') return;
	started = true;
	const child = spawn(message.cmd, message.args, { shell: message.shell, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
	child.on('error', (error) => process.send?.({ status: null, errorCode: 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN' }));
	child.on('exit', (status, signal) => process.send?.({ status, pid: child.pid, signal }));
});

process.on('disconnect', () => {
	// Parent loss is not proof of release. Keep the last observed identities even when
	// the next probe fails (#154, 2026-10-16); a status-only overwrite loses recovery authority.
	let previous: ProcessIdentity[] = [];
	try {
		const saved: unknown = JSON.parse(readFileSync(record, 'utf8'));
		if (typeof saved === 'object' && saved !== null && 'processes' in saved) {
			const owners = parseProcessIdentities(saved.processes);
			if (owners?.some((owner) => owner.pid === process.pid)) {
				previous = owners;
				writeFileSync(record, JSON.stringify({ ...saved, state: 'unverified-disconnect' }));
			}
		}
	} catch { console.error('wf check: disconnect ownership unreadable; original record retained for recovery'); process.exit(1); }
	if (!previous.length) { console.error('wf check: disconnect owner not established; original record retained for inspection'); process.exit(1); }
	const snapshot = snapshotProcesses();
	if (snapshot.kind === 'known') {
		const root = snapshot.processes.find((p) => p.pid === process.pid);
		if (root) {
			const owners = ownedProcessTree([root, ...previous.filter((owner) => owner.pid !== root.pid)], snapshot.processes);
			writeFileSync(record, JSON.stringify({ state: 'releasing', processes: owners }));
			killOwnedProcesses(owners.filter((p) => p.pid !== process.pid));
		}
	}
	process.exit(1);
});
