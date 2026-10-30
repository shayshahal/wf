import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceDependencyResult, WorkspaceProject, WorkspaceProjectContext } from '../../src/worktrees/workspace-project.ts';
import { baselineRunnerEnv, setupWorkspaceResources, workspaceResourceTeardown } from './index.ts';
import type { VerificationRequirements } from './readiness.ts';

type DependencyReceipt = { disposition: 'none' | 'borrowed' } | { disposition: 'owned'; ownershipToken: string };
const receiptFile = (worktree: string) => join(worktree, '.wf', 'workspace-dependency.json');

function readDependencyReceipt(worktree: string): DependencyReceipt | null {
	if (!existsSync(receiptFile(worktree))) return null;
	const raw: unknown = JSON.parse(readFileSync(receiptFile(worktree), 'utf8'));
	if (typeof raw === 'object' && raw !== null && 'disposition' in raw) {
		if (raw.disposition === 'none' || raw.disposition === 'borrowed') return { disposition: raw.disposition };
		if (raw.disposition === 'owned' && 'ownershipToken' in raw && typeof raw.ownershipToken === 'string' && raw.ownershipToken.length > 0) return { disposition: 'owned', ownershipToken: raw.ownershipToken };
	}
	throw new Error('JewelryX workspace cleanup: invalid dependency receipt; retain resources for inspection');
}

function retainServerLogs({ worktree, log }: WorkspaceProjectContext): void {
	for (const name of ['serve.log', 'dev.log']) {
		const file = join(worktree, '.wf', 'logs', name);
		if (existsSync(file)) appendFileSync(log, `\nJewelryX ${name}:\n${readFileSync(file, 'utf8')}\n`);
	}
}

/** Bind requirements and subprocess environment explicitly; neutral workspaces refuse persistent server leases. */
export function createJewelryxWorkspaceProject({ requirements, ambient, taskEnv }: {
	requirements: VerificationRequirements;
	ambient: NodeJS.ProcessEnv;
	taskEnv?: Record<string, string>;
}): WorkspaceProject {
	const leases = new Map<string, Extract<WorkspaceDependencyResult, { kind: 'ready' }>>();
	return {
		name: 'jewelryx',
		setup: setupWorkspaceResources,
		async acquire(context) {
			if (requirements.kind === 'stack' && !requirements.temporary) return { kind: 'refused', why: 'JewelryX workspace dependencies: persistent server requirements have no disposable release authority; use temporary requirements or none' };
			if (leases.has(context.worktree) || existsSync(receiptFile(context.worktree))) return { kind: 'refused', why: 'JewelryX workspace dependencies: already acquired; retain and release the original lease' };
			// Only this explicit project adapter loads the existing round server implementation.
			const { acquireVerificationServers } = await import('../../src/worktrees/serve.ts');
			const env = baselineRunnerEnv({ ambient, taskEnv, branch: context.branch });
			const result = await acquireVerificationServers(context.worktree, env, requirements, { launchEnv: env });
			if (result.kind === 'refused') { retainServerLogs(context); return result; }
			try {
				mkdirSync(join(context.worktree, '.wf'), { recursive: true });
				const receipt: DependencyReceipt = result.disposition === 'owned' ? { disposition: 'owned', ownershipToken: result.ownershipToken } : { disposition: result.disposition };
				// The launch returned this exact token; reading the current owner could adopt a replacement.
				writeFileSync(receiptFile(context.worktree), JSON.stringify(receipt), { flag: 'wx' });
			} catch (error) {
				const why = await result.release();
				retainServerLogs(context);
				return { kind: 'refused', why: `JewelryX workspace dependencies: could not retain lease receipt: ${error instanceof Error ? error.message : String(error)}${why ? `; ${why}` : ''}` };
			}
			const lease = {
				kind: 'ready' as const,
				disposition: result.disposition,
				signal: result.signal,
				async release() {
					try { return await result.release(); }
					finally { retainServerLogs(context); }
				},
			};
			leases.set(context.worktree, lease);
			return lease;
		},
		teardown(context) {
			return [
				{ label: 'confirm workspace server release', run: async () => {
					const receipt = readDependencyReceipt(context.worktree);
					const lease = leases.get(context.worktree);
					if (lease) {
						const why = await lease.release();
						if (why) throw new Error(`JewelryX workspace cleanup: ${why}`);
					} else if (receipt?.disposition === 'owned') {
						const { stopWorktreeServers } = await import('../../src/worktrees/serve.ts');
						const stopped = await stopWorktreeServers(context.worktree, receipt.ownershipToken);
						if (stopped.kind === 'refused') throw new Error(`JewelryX workspace cleanup: ${stopped.why}`);
					}
					// No receipt means a possible interrupted acquisition, not permission to adopt a PID.
					if (receipt?.disposition !== 'borrowed' && (existsSync(join(context.worktree, '.wf', 'serve-owner.json')) || existsSync(join(context.worktree, '.wf', 'serve.pid')))) throw new Error('JewelryX workspace cleanup: unresolved server ownership; recover the recorded lease before dropping its database');
					retainServerLogs(context);
				} },
				...workspaceResourceTeardown(context),
			];
		},
	};
}
