// Internal executable: the parent records this process before sending its runner over IPC.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { snapshotProcesses, ownedProcessTree, killOwnedProcesses } from '../process-tree.ts';

const record = process.argv[2];
if (!record || !process.send) throw new Error('wf check: supervisor requires an ownership record and IPC parent');
let started = false;
process.on('message', (message: unknown) => {
	if (started || typeof message !== 'object' || message === null || !('cmd' in message) || typeof message.cmd !== 'string'
		|| !('args' in message) || !Array.isArray(message.args) || !message.args.every((arg): arg is string => typeof arg === 'string')
		|| !('shell' in message) || typeof message.shell !== 'boolean') return;
	started = true;
	const child = spawn(message.cmd, message.args, { shell: message.shell, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
	child.on('error', () => process.send?.({ status: null }));
	child.on('exit', (status) => process.send?.({ status, pid: child.pid }));
});

process.on('disconnect', () => {
	// Parent loss is not proof of release. Publish uncertainty before probing or signalling.
	writeFileSync(record, JSON.stringify({ state: 'unverified-disconnect' }));
	const snapshot = snapshotProcesses();
	if (snapshot.kind === 'known') {
		const root = snapshot.processes.find((p) => p.pid === process.pid);
		if (root) {
			const owners = ownedProcessTree([root], snapshot.processes);
			writeFileSync(record, JSON.stringify({ state: 'releasing', processes: owners }));
			killOwnedProcesses(owners.filter((p) => p.pid !== process.pid));
		}
	}
	process.exit(1);
});
