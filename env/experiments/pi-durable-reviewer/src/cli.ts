// cli.ts — the local terminal client for the owning process (issue #116). It never opens the
// database; it connects to the running owner's control socket. Commands:
//   node src/cli.ts --storage <dir> status
//   node src/cli.ts --storage <dir> transcript [limit]
//   node src/cli.ts --storage <dir> steer <text...>
//   node src/cli.ts --storage <dir> result
//   node src/cli.ts --storage <dir> stop
import { resolve } from 'node:path';
import { callControl, socketPathFor, type ControlRequest } from './control.ts';

const argv = process.argv.slice(2);
let storage = '';
const positional: string[] = [];
for (let index = 0; index < argv.length; index++) {
	const token = argv[index]!;
	if (token === '--storage') {
		storage = argv[++index] ?? '';
		continue;
	}
	if (token.startsWith('--storage=')) {
		storage = token.slice('--storage='.length);
		continue;
	}
	positional.push(token);
}
if (storage === '') {
	console.error('usage: node src/cli.ts --storage <dir> <status|transcript|steer|result|stop> [args]');
	process.exit(2);
}
const [cmd = 'status', ...rest] = positional;
const request: ControlRequest =
	cmd === 'steer'
		? { cmd, text: rest.join(' ') }
		: cmd === 'transcript'
			? { cmd, limit: Number(rest[0] ?? 40) }
			: { cmd };
const response = await callControl(socketPathFor(resolve(storage)), request);
if (!response.ok) {
	console.error(`error: ${String(response.error)}`);
	process.exit(1);
}
if (cmd === 'transcript') {
	for (const line of (response.entries as string[] | undefined) ?? []) console.log(line);
} else {
	console.log(JSON.stringify(response, null, 2));
}
