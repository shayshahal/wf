import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, openSync } from 'node:fs';
import type { WorkspaceProject } from '../../src/worktrees/workspace-project.ts';

/** Lint-kit needs frozen pnpm dependencies, not an application stack or round facts. */
export const lintKitWorkspaceProject: WorkspaceProject = {
	name: 'lint-kit',
	async setup({ worktree, log }) {
		appendFileSync(log, 'lint-kit setup: pnpm frozen install; package lifecycle scripts disabled; no stack\n');
		const fd = openSync(log, 'a');
		try {
			// pnpm is a command shim on Windows; spawn without a shell fails there with EINVAL.
			const result = spawnSync('pnpm install --frozen-lockfile --ignore-scripts', { cwd: worktree, shell: true, stdio: ['ignore', fd, fd], windowsHide: true });
			if (result.status !== 0) throw new Error(`lint-kit workspace setup: frozen install failed (${result.status ?? result.error?.message}); see ${log}`);
		} finally { closeSync(fd); }
	},
	async acquire() { return { kind: 'ready', disposition: 'none', release: async () => null }; },
	teardown() { return []; },
};
