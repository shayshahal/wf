#!/usr/bin/env node
// Project-owned example: API-only dependency admission and schema readback, not product certification.
import { resolve } from 'node:path';
import { baselineRunnerEnv, createJewelryxWorkspaceProject } from './index.ts';
import { runBaselineDiagnostic } from '../../src/gates/baseline-diagnostic.ts';
import { recoverDisposableWorkspace } from '../../src/worktrees/disposable-workspace.ts';

const args = process.argv.slice(2);
const ambient = { ...process.env };
const project = createJewelryxWorkspaceProject({ requirements: { kind: 'stack', profile: 'api', temporary: true }, ambient });
if (args[0] === '--recover' && args.length === 3) {
	const result = await recoverDisposableWorkspace({ repository: resolve(args[1]), branch: args[2], project });
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = result.kind === 'complete' ? 0 : 1;
} else if (args.length === 4) {
	const [repository, ref, branch, log] = args;
	const result = await runBaselineDiagnostic({ repository: resolve(repository), ref, branch, log: resolve(log), project, probeFiles: [],
		command: { executable: process.execPath, env: baselineRunnerEnv({ ambient, branch }), args: ['--input-type=module', '-e',
			"const response = await fetch(new URL('/openapi.json', process.env.API_URL), {signal: AbortSignal.timeout(10000)}); if (!response.ok) throw new Error('API schema HTTP '+response.status); const schema = await response.json(); if (!schema.openapi || !schema.paths) throw new Error('API schema shape missing'); console.log('API schema readback: HTTP '+response.status+'; '+Object.keys(schema.paths).length+' paths; dependency observation only');"] },
	});
	console.log(JSON.stringify(result, null, 2));
	process.exitCode = result.kind === 'observed' && result.execution.status === 0 && result.cleanup.kind === 'complete' ? 0 : 1;
} else {
	console.error('usage: node projects/jewelryx/baseline-example.mjs <repository> <ref> <new-baseline-branch> <surviving-log>\nrecovery: node projects/jewelryx/baseline-example.mjs --recover <repository> <baseline-branch>');
	process.exitCode = 2;
}
