// round-port.ts — the base port a round's stack uses: the one recorded in its state when it had to
// move (port-claim.ts), else the branch's hash. A leaf module (no state.ts, no project.ts): the
// readers of a port are imported by the project itself, and a heavier import here made a cycle.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { basePortForBranch } from './worktree-registry.ts';

export function roundPort(worktree: string, branch: string): number {
	let recorded: unknown;
	try {
		recorded = (JSON.parse(readFileSync(join(worktree, '.wf', 'state.json'), 'utf8')) as { port?: unknown }).port;
	} catch {
		// No state yet, or one other commands report as unreadable: the hashed port is the default here.
		recorded = undefined;
	}
	return typeof recorded === 'number' && Number.isInteger(recorded) ? recorded : basePortForBranch(branch);
}
