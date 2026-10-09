// content-identity.ts — the implementation a T2 approval or a `wf check` measured, as one identity
// (#106, 2026-10-09; strict HEAD binding 2026-10-09 review). approve → change a product file → `wf
// review --done` used to advance to delivery, and a green check outlived the implementation it
// checked, because nothing named the content.
//
// Two scopes share one exclusion encoding:
//   approval — the bytes a person judged: everything but wf's own metadata, REVIEW.md, the tracker
//     note and the repro's live login. PLAN.md, SPEC.md, the as-built call stack and a round folder's
//     repro/tests all bind, so a change to any invalidates.
//   row — the product and tests OUTSIDE the round folder that a `wf check` measured. The round
//     folder's paper is committed only at deliver, so a row commit carries product/tests; excluding
//     the folder makes a check's content equal its commit's, which is what binds a row's green. The
//     round folder's repro is NOT in this scope (it is untracked until deliver); the approval scope
//     above covers it, so a repro change blocks the merge even though it does not block `wf next`.
// The identity is a git tree hash, so modes and symlinks come through git's own encoding. It is
// computed on a throwaway index: the real index and the working files are never touched.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackerNote } from '../project.ts';

// wf's own files, by exact path (never the whole .wf folder: a stray executable there stays part of
// the identity). The names come from state.ts, check.ts, serve.ts, design.ts and review.ts. The lock,
// its acquisition guard and the state-trace log are state.ts's own (issue #107): a concurrent
// writeState leaves them while another command reads the implementation, so they are wf's, not it.
const WF_METADATA = [
	'.wf/state.json',
	'.wf/state.json.lock',
	'.wf/state.json.lock.acquiring',
	'.wf/checks.log',
	'.wf/events.log',
	'.wf/state-writes.log',
	'.wf/serve.pid',
	'.wf/logs',
	'.wf/before-after.html',
	'.wf/PLAN.html',
	'.wf/SPEC-T1.md',
	'.wf/SPEC-T1.html',
];

// wf's own atomic writes, and the token each writes after `<pid>`:
//   state.ts's writeStateFileAtomically / writeLockBody: `<stem>.<pid>.<seq>.tmp`, seq is digits.
//   deliver.ts's writeAtomic (the tracker note, #108): `<note>.<pid>.<base36 random>.tmp`.
// The pid is always digits. A state stem's token must be digits too, so a temp the #107 writer cannot
// produce (`.wf/state.json.1234.2evil.tmp`) is not treated as wf's; only the note's token may be
// alphanumeric. A hand-made `state.json.1evil.2evil.tmp` is not wf's either and stays in the identity.
// A git-glob `[0-9]*` matched such names (a digit then anything), which made the pure predicate and
// the tree hash disagree and hid unowned content; one owner rule, applied to both, instead
// (composition review, 2026-10-09).
type WriterKind = 'state' | 'note';
const writerTemp = (file: string, stem: string, kind: WriterKind): boolean => {
	const prefix = `${stem}.`;
	if (!file.startsWith(prefix) || !file.endsWith('.tmp')) return false;
	const middle = file.slice(prefix.length, -'.tmp'.length);
	const dot = middle.indexOf('.');
	if (dot <= 0 || dot >= middle.length - 1) return false;
	if (!/^\d+$/.test(middle.slice(0, dot))) return false;
	const token = middle.slice(dot + 1);
	return kind === 'state' ? /^\d+$/.test(token) : /^[a-z0-9]+$/.test(token);
};

// The stems wf's atomic writes create a temp beside, and which token each writes: the state file, the
// lock and its acquisition guard (publishLock writes the guard through writeLockBody too), and — when
// the round has one — the tracker note the #108 atomic write replaces. Literal strings, so a note
// path with glob characters is matched as a path, not a pattern.
const tempStems = (notePath: string | null): { stem: string; kind: WriterKind }[] => [
	{ stem: '.wf/state.json', kind: 'state' },
	{ stem: '.wf/state.json.lock', kind: 'state' },
	{ stem: '.wf/state.json.lock.acquiring', kind: 'state' },
	...(notePath ? [{ stem: notePath.replace(/\\/g, '/'), kind: 'note' as const }] : []),
];
const producerTemp = (file: string, notePath: string | null): boolean => tempStems(notePath).some(({ stem, kind }) => writerTemp(file, stem, kind));

// The identity of the content a scope covers, for a check line and for the review header.
export type ContentScope = 'approval' | 'row';
// The worktree bytes and the HEAD bytes. deliver pushes HEAD, so both must be the approved ones.
export type ContentIdentity = { worktree: string; head: string };

// The project's own tracker note under the round folder, from the project (never core naming it).
// The note is written after the merge; excluding it lets an interrupted delivery (#108) resume
// without its own note reading as an implementation change.
export function trackerNotePath(folder: string | null): string | null {
	if (!folder) return null;
	return `${folder.replace(/\\/g, '/')}/${trackerNote({ ids: [], url: '' }).file}`;
}

// The one exclusion encoding, per scope. `approval`: wf metadata + REVIEW.md + the tracker note + the
// repro's live login. `row`: wf metadata + the whole round folder (a row commit carries product/tests,
// not the paper committed at deliver).
export function approvalExclusions(folder: string | null, notePath: string | null, scope: ContentScope = 'approval'): string[] {
	const f = folder?.replace(/\\/g, '/') ?? null;
	const meta = [...WF_METADATA, ...(notePath ? [notePath.replace(/\\/g, '/')] : [])];
	if (scope === 'row') return [...meta, ...(f ? [f] : [])];
	return [...meta, ...(f ? [`${f}/REVIEW.md`, `${f}/repro/.auth`] : ['REVIEW.md'])];
}

const pathIn = (file: string, excluded: string[], notePath: string | null) => {
	const p = file.replace(/\\/g, '/');
	return excluded.some((e) => p === e || p.startsWith(`${e}/`)) || producerTemp(p, notePath);
};

// Pure: whether `file` is outside the approval scope (wf metadata, REVIEW.md, the note, live auth).
// The same owner predicate and exact list drive the identity's literal pathspecs, so the predicate
// and the tree hash cannot drift — an unowned file is never hidden.
export function approvalPaperworkExcluded(file: string, folder: string | null, notePath: string | null = null): boolean {
	return pathIn(file, approvalExclusions(folder, notePath, 'approval'), notePath);
}

// git runs with GIT_DIR set in a hook (absolute in a linked worktree), and a `-C toplevel` command
// then reads the wrong repository (src/selfcheck.ts, 2026-10-06): resolve the repo from the path.
const cleanEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
	const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
	delete env.GIT_DIR;
	delete env.GIT_WORK_TREE;
	return env;
};
const gitEnv = (index: string) => cleanEnv({ GIT_INDEX_FILE: index });

const realIndexPath = (toplevel: string) => execFileSync('git', ['-C', toplevel, 'rev-parse', '--path-format=absolute', '--git-path', 'index'], { encoding: 'utf8', env: cleanEnv() }).trim();

// One tree hash over a throwaway index `fill` builds. The temp index is always removed.
function tempTree(toplevel: string, fill: (env: NodeJS.ProcessEnv) => void): string {
	const dir = mkdtempSync(join(tmpdir(), 'wf-content-'));
	const index = join(dir, 'index');
	const env = gitEnv(index);
	try {
		fill(env);
		return `tree:${execFileSync('git', ['-C', toplevel, 'write-tree'], { env, encoding: 'utf8' }).trim()}`;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const pathspecs = (excluded: string[]) => excluded.map((p) => `:(exclude,literal)${p}`);
const dropExcluded = (toplevel: string, env: NodeJS.ProcessEnv, excluded: string[]) => {
	// An excluded path already in the seeded index survives `add -A`; drop it from the tree. `literal`
	// here too: a round folder named `r[1]` must not glob its sibling `r1` out of the identity.
	execFileSync('git', ['-C', toplevel, 'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...excluded.map((p) => `:(literal)${p}`)], { env });
};

// The writer temps wf's own atomic writes left in the throwaway index. Enumerated from the index and
// removed by literal path through the one owner predicate (producerTemp), so the working, HEAD and
// commit hashes exclude exactly what the predicate calls wf's — no glob to drift from. An unreadable
// index throws, so the identity fails closed rather than hashing without the exclusions.
const dropProducerTemps = (toplevel: string, env: NodeJS.ProcessEnv, notePath: string | null) => {
	const owned = execFileSync('git', ['-C', toplevel, 'ls-files', '-z'], { env, encoding: 'utf8' })
		.split('\0')
		.filter((file) => file && producerTemp(file, notePath))
		.map((file) => `:(literal)${file}`);
	if (owned.length) execFileSync('git', ['-C', toplevel, 'rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...owned], { env });
};

// The worktree's identity in a scope: tracked and untracked-not-ignored files, minus the exclusions.
export function worktreeContentSha(toplevel: string, folder: string | null, notePath: string | null, scope: ContentScope): string {
	const excluded = approvalExclusions(folder, notePath, scope);
	return tempTree(toplevel, (env) => {
		const index = env.GIT_INDEX_FILE!;
		try { copyFileSync(realIndexPath(toplevel), index); } catch { /* no index yet: `add -A` fills an empty one */ }
		execFileSync('git', ['-C', toplevel, 'add', '-A', '--', '.', ...pathspecs(excluded)], { env });
		dropExcluded(toplevel, env, excluded);
		dropProducerTemps(toplevel, env, notePath);
	});
}

// HEAD's identity in a scope: the committed bytes (what a push ships), minus the exclusions.
export function headContentSha(toplevel: string, folder: string | null, notePath: string | null, scope: ContentScope): string {
	const excluded = approvalExclusions(folder, notePath, scope);
	return tempTree(toplevel, (env) => {
		execFileSync('git', ['-C', toplevel, 'read-tree', 'HEAD'], { env });
		dropExcluded(toplevel, env, excluded);
		dropProducerTemps(toplevel, env, notePath);
	});
}

// A commit's identity in a scope: what a row commit carried, for binding a row's green to it.
export function commitContentSha(toplevel: string, sha: string, folder: string | null, notePath: string | null, scope: ContentScope): string {
	const excluded = approvalExclusions(folder, notePath, scope);
	return tempTree(toplevel, (env) => {
		execFileSync('git', ['-C', toplevel, 'read-tree', sha], { env });
		dropExcluded(toplevel, env, excluded);
		dropProducerTemps(toplevel, env, notePath);
	});
}

// The approved worktree bytes (what the person saw) and the approved HEAD bytes (what was committed
// when they saw it). Both are recorded in REVIEW.md and both are enforced at every boundary.
export function approvalIdentity(toplevel: string, folder: string | null, notePath: string | null): ContentIdentity {
	return { worktree: worktreeContentSha(toplevel, folder, notePath, 'approval'), head: headContentSha(toplevel, folder, notePath, 'approval') };
}
