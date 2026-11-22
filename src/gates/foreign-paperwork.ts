// foreign-paperwork.ts — a round never sees, approves or delivers another round's approval record
// (2026-11-19). JX-1266's REVIEW.md, which held Shay's T2 approval, appeared in JX-705's worktree.
// wf did not move it. The two agents' own `git stash` did: every worktree of a repository shares one
// stash stack (refs/stash). At 17:14:12Z JX-1266 ran `git stash push -u -m review -- …/REVIEW.md`, then
// rebased and popped. At 17:14:14Z JX-705 ran `git stash` and popped after regenerating files. JX-1266's
// pop took JX-705's stash, which was on top; JX-705's pop took JX-1266's REVIEW.md. The briefs had said
// "no git stash" since #249 (2026-11-04). Git has no hook that can refuse a stash, so wf refuses what
// a stash leaves behind instead. `wf review` used to call that file product "changed but not committed"
// and said "commit it", which would have put another round's approval into JX-705's branch.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { dirtyFiles } from '../dirty-files.ts';
import { roundsDir } from '../project.ts';
import { AGREEMENT_REVIEW_FILE, CHECKPOINT_REVIEW_FILE, REVIEW_FILE } from '../round/agreement.ts';

// A person's verdict on a round: T1 (AGREEMENT-REVIEW.md), a checkpoint, T2 (REVIEW.md).
const APPROVAL_RECORDS = new Set([REVIEW_FILE, CHECKPOINT_REVIEW_FILE, AGREEMENT_REVIEW_FILE]);

// Pure: the approval records among `paths` (repo-relative) that sit under the project's rounds folder
// but outside this round's own folder. Old rounds' records committed on the base are not passed in:
// only what this worktree changed or this branch committed.
export function foreignApprovalRecords(paths: string[], folder: string | null, rounds: string = roundsDir): string[] {
	const own = folder?.replace(/\\/g, '/').replace(/\/$/, '') ?? null;
	return [...new Set(paths.map((p) => p.replace(/\\/g, '/')))].filter((p) =>
		p.startsWith(`${rounds}/`) && APPROVAL_RECORDS.has(p.slice(p.lastIndexOf('/') + 1)) && !(own && p.startsWith(`${own}/`)));
}

// Pure: the refusal, saying whose file it is, how it most likely got here, and what to do with it.
export function foreignApprovalRefusal(records: string[], folder: string | null): string {
	const one = records.length === 1;
	return `${records.join(', ')} ${one ? 'is another round\'s approval record' : 'are other rounds\' approval records'}, not this round's (${folder ?? 'no round folder'}); a round never commits, approves or delivers another round's approval. ${one ? 'It' : 'They'} most likely came through \`git stash\`: every worktree of the repository shares one stash stack, so a pop can take another round's entry. Move ${one ? 'it' : 'them'} back to the owning round's worktree (\`git worktree list\`) if that round no longer has ${one ? 'it' : 'them'}, otherwise delete ${one ? 'it' : 'them'}; if a commit on this branch carries ${one ? 'it' : 'them'}, remove ${one ? 'it' : 'them'} from the branch. Never commit ${one ? 'it' : 'them'} here, and do not use \`git stash\` in a round`;
}

/** The refusal when this worktree holds, or this branch commits since `base`, another round's approval record; null when it does not. */
export function foreignApprovalGap(toplevel: string, folder: string | null, base: string): string | null {
	let committed: string[];
	try {
		committed = execFileSync('git', ['-C', toplevel, 'diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').map((s) => s.trim()).filter(Boolean);
	} catch (error) {
		return `could not list the branch's files since ${base} to check for another round's approval record (${error instanceof Error ? error.message : String(error)})`;
	}
	// A deletion carries nothing: the branch's deletions are filtered out above, and a dirty path counts
	// only while the file exists.
	const present = dirtyFiles(toplevel).filter((p) => existsSync(join(toplevel, p)));
	const records = foreignApprovalRecords([...present, ...committed], folder);
	return records.length ? foreignApprovalRefusal(records, folder) : null;
}
