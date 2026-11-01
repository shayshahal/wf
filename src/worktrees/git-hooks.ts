import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Run synchronous Git operations with an empty hook directory; preserve ambient config and never persist the override. */
export function withGitHooksDisabled(action: (env: NodeJS.ProcessEnv) => void): void {
	const hooks = mkdtempSync(join(tmpdir(), 'wf-no-git-hooks-'));
	try {
		// Git reads command-scope PARAMETERS after counted config. Append so an inherited -c
		// cannot restore hooks in Git subprocesses launched by a workspace manager (#194).
		const override = `'core.hooksPath=${hooks.replace(/'/g, "'\\''")}'`;
		const parameters = [process.env.GIT_CONFIG_PARAMETERS, override].filter(Boolean).join(' ');
		action({ ...process.env, GIT_CONFIG_PARAMETERS: parameters });
	} finally { rmSync(hooks, { recursive: true, force: true }); }
}
