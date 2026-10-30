#!/usr/bin/env node
// A supported non-round diagnostic: explicit repo/ref/probes/command, with shared ownership and recovery.
import { resolve } from 'node:path';
import { lintKitWorkspaceProject } from './index.ts';
import { runBaselineDiagnostic } from '../../src/gates/baseline-diagnostic.ts';
import { recoverDisposableWorkspace } from '../../src/worktrees/disposable-workspace.ts';

const args = process.argv.slice(2);
if (args[0] === '--recover' && args.length === 3) {
	const result = await recoverDisposableWorkspace({ repository: resolve(args[1]), branch: args[2], project: lintKitWorkspaceProject });
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = result.kind === 'complete' ? 0 : 1;
} else if (args.length === 4) {
	const [repository, ref, branch, log] = args;
	const result = await runBaselineDiagnostic({
		repository: resolve(repository), ref, branch, log: resolve(log), project: lintKitWorkspaceProject,
		probeFiles: ['test/error-handling.test.js'],
		command: { executable: process.execPath, args: ['--test', 'test/error-handling.test.js'], env: { ...process.env } },
	});
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = result.kind === 'observed' && result.execution.status === 0 && result.cleanup.kind === 'complete' ? 0 : 1;
} else {
	console.error('usage: node projects/lint-kit/baseline-example.mjs <repository> <ref> <new-baseline-branch> <surviving-log>\nrecovery: node projects/lint-kit/baseline-example.mjs --recover <repository> <baseline-branch>');
	process.exitCode = 2;
}
