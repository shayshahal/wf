// release-base.ts — a ticket labelled with a release (v1.1) is built on that release's branch, not dev.
// wf never reads a ticket's label by itself, and `wf new` branched every round off dev unless the person
// remembered `--base origin/v1.1`: the round's PR then went to dev (JX-1534 follow-up, 2026-10-27).
import { spawnSync } from 'node:child_process';

const RELEASE_LABEL = /^v\d+(\.\d+)*$/;

// A label names a release branch only if origin has that branch. `v1` labels the dev line (no
// origin/v1 exists), so it must not demand a v1 base; v1.1 has a real branch. 2026-10-27.
function remoteBranchExists(name: string): boolean {
	const local = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${name}`]);
	if (local.status === 0) return true;
	return spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', name], { timeout: 15000 }).status === 0;
}

// Pure: why `base` is wrong for these tickets' labels, or null. `labels` is each ticket id with its labels.
export function releaseBaseGap(labels: Record<string, string[]>, base: string, isBranch: (name: string) => boolean = () => true): string | null {
	for (const [key, own] of Object.entries(labels)) {
		const release = own.find((l) => RELEASE_LABEL.test(l) && isBranch(l));
		if (release && base !== `origin/${release}` && base !== release) {
			return `${key} is labelled ${release}: its round is built on ${release}, not ${base}. Run wf new again with --base origin/${release}`;
		}
	}
	return null;
}

// What wf new asks before it cuts the worktree. `gap` refuses; `unchecked` only warns (no Jira
// credentials, or Jira down): wf new stays usable offline, as it already is for the base fetch.
export async function releaseBaseCheck(ids: string[], base: string): Promise<{ gap: string | null; unchecked: string | null }> {
	const keys = ids.filter((id) => /^[A-Z][A-Z0-9]*-\d+$/.test(id));
	if (!keys.length) return { gap: null, unchecked: null };
	const { JIRA_EMAIL: email, JIRA_TOKEN: token } = process.env;
	if (!email || !token) return { gap: null, unchecked: `no JIRA_EMAIL or JIRA_TOKEN, so ${keys.join(', ')} could not be checked for a release label (v1.1 tickets need --base origin/v1.1)` };
	// Imported here: post.ts reaches back into project.ts, and index.ts re-exports this file (a cycle at load).
	const { jira } = await import('./post.ts');
	const auth = Buffer.from(`${email}:${token}`).toString('base64');
	try {
		const labels: Record<string, string[]> = {};
		for (const key of keys) {
			const raw: unknown = await jira(auth, `3/issue/${key}?fields=labels`);
			const fields = typeof raw === 'object' && raw !== null && 'fields' in raw ? raw.fields : null;
			const list = typeof fields === 'object' && fields !== null && 'labels' in fields && Array.isArray(fields.labels) ? fields.labels : null;
			if (!list) return { gap: null, unchecked: `Jira did not answer ${key}'s labels, so it could not be checked for a release label` };
			labels[key] = list.filter((l): l is string => typeof l === 'string');
		}
		return { gap: releaseBaseGap(labels, base, remoteBranchExists), unchecked: null };
	} catch (error) {
		return { gap: null, unchecked: `could not ask Jira for ${keys.join(', ')}'s labels (${error instanceof Error ? error.message : String(error)}); v1.1 tickets need --base origin/v1.1` };
	}
}
