// baseline-proof.ts — the identity of a red-base ("before") measurement, and the conservative rule
// that lets a fresh `wf check` reuse a validated one instead of re-running it (#133).
//
// Observed failure (JX-1069, #133): a later assessment omitted the existing before-the-fix
// measurement and asked for another run. Re-running it took the row's change back out of the live
// worktree and left Vite serving stale code after restoration, consuming repair cycles unrelated to
// the fix. The measurement was already valid; only a fresh report had made the round re-do it.
//
// What a red-base proof is: the row's selected test run with the row's change taken back to `base`
// (the round's merge-base, or a unit's start). It may be reused only when every input it depended on
// is unchanged:
//   base      the commit the fix was taken back to — the same baseline bytes
//   command   the task's cmd, argv and cwd — the same proof obligation
//   target    the cell's file/id/line and `refactor:` flag — the same assertion the row names
//   probe     the case's own test and the copied test inputs (helpers/fixtures/config and round-folder
//             files) it needs to load. The row-scope `current` hash excludes the round folder, so
//             without this a changed test or fixture would not invalidate
//   environment  a digest of the EXACT env object the runner is handed (check.ts computes it once and
//             passes that same object to spawn): the project's curated runner profile plus the task's
//             env, and for an isolated run the baseline branch's stack env. Host bookkeeping (PWD,
//             `PI_*`, session ids) is not in it, so a fresh assessment session reuses; a changed
//             tool path or flag is.
//   isolated  whether the run happened in the project's own scratch environment or in place
//   current   the row-scope content identity of the implementation WITH the change: the proof is the
//             pair (red on baseline, green here), so a changed implementation invalidates it
// The assessment/proof paperwork lives in the round folder and is not among these, so merely
// rewriting an assessment does not invalidate a proof (acceptance: "unchanged assessment file alone
// must not").
//
// A prior proof is reused only when all of the above match AND the recorded runner verdict is exactly
// the one the row needs. A status code alone never qualifies: a run whose framework report core could
// not tie to the named assertion carries verdict `unavailable` (check.ts `RunEvidence`), and is never
// reused.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunEvidence } from './check.ts';

/** The assertion one red-base row names: its test path, named test id, intended line and `refactor:`. */
export type BaselineTarget = { file: string; id: string | null; line: number | null; refactor: boolean };

/** What a red-base run measured and on what, recorded beside the run in `.wf/checks.log`. */
export type BaselineIdentity = {
	base: string;
	key: string;
	current: string;
	command: string;
	argv: string[];
	target: BaselineTarget;
	probe: string;
	environment: string;
	isolated: boolean;
	reused?: boolean;
};

const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * Pure: the identity that binds one red-base measurement to everything it depended on. Any change to
 * the baseline commit, the command, the named assertion, the probe inputs, the effective run env or
 * how the run was isolated yields a different key, so a prior proof under another key is never reused.
 * `environment` is the digest of the exact env object the runner is handed (check.ts), so a proof is
 * valid only for the environment it was taken in — a changed `CI`/`TZ`/tool path can change a test's
 * outcome while the code stands.
 */
export function baselineProofKey({ base, task, target, probe, environment, isolated }: {
	base: string;
	task: { cmd: string; args: readonly string[]; cwd: string };
	target: BaselineTarget;
	probe: string;
	environment: string;
	isolated: boolean;
}): string {
	return hash(JSON.stringify({ base, cmd: task.cmd, args: task.args, cwd: task.cwd, target, probe, environment, isolated }));
}

/** The identity of the environment a task is handed, so a proof cannot outlive it: `wf check` passes
 * the exact object it hashes (`environmentDigest`). Canonical: sorted [name, value] pairs as JSON, so a
 * value containing a newline (or `=`) cannot collide with two entries — a `name=value` text join did
 * (#133 review: `{CI:'true\nNODE_ENV=test'}` hashed the same as `{CI:'true',NODE_ENV:'test'}`). */
export function environmentDigest(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
	const entries = Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return hash(JSON.stringify(entries));
}

/**
 * The files a red-base proof depends on beyond the row-scope `current` hash: the row's own test and
 * the case files it declares inside the round folder (a copied repro spec, a fixture), which the
 * row-scope identity excludes. The test is included whatever its folder, so a case whose test lives
 * in the round folder still binds it. `exclude` are the paths the red-base run takes back to the
 * baseline (check.ts `redBaseFiles`): an implementation file must not be copied into the scratch, or
 * the scratch would carry the fix where the baseline has none.
 */
export function probeInputs({ testPath, files, runtime = [], folder, testInput = () => false, exclude = [] }: { testPath: string | null; files: readonly string[]; runtime?: readonly string[]; folder: string | null; testInput?: (file: string) => boolean; exclude?: readonly string[] }): string[] {
	const dir = (folder ?? '').replace(/\\/g, '/').replace(/\/?$/, '/');
	const inRoundFolder = (f: string) => Boolean(dir) && f.replace(/\\/g, '/').startsWith(dir);
	const reverted = new Set(exclude.map((f) => f.replace(/\\/g, '/')));
	// `runtime` is the set the project resolved as the runner's own config (a per-round fallback config
	// and its global setup that never reached the base, the shared skill config's helpers). It is copied
	// and hashed whether or not the case declared it, because the before side cannot run without it; the
	// `testInput` filter is for the case's declared helpers, which a project convention decides.
	const inputs = [...runtime, testPath, ...files.filter((f) => (inRoundFolder(f) || testInput(f)) && !reverted.has(f.replace(/\\/g, '/')))].filter((f): f is string => Boolean(f));
	return [...new Set(inputs)].sort();
}

/** The content identity of the probe inputs' current bytes; a file that is not there binds as absent,
 * so deleting one invalidates too. */
export function probeContentSha(toplevel: string, files: readonly string[]): string {
	const h = createHash('sha256');
	for (const file of [...files].sort()) {
		h.update(file);
		h.update('\0');
		try {
			h.update(readFileSync(join(toplevel, file)));
		} catch {
			// The file a proof depended on is gone; record it as absent so the identity changes.
			h.update('<absent>');
		}
		h.update('\0');
	}
	return `sha256:${h.digest('hex')}`;
}

/** One prior red-base task as it was recorded: its identity and the runner verdict core derived. */
export type BaselineCandidate = { baseline?: BaselineIdentity; evidence?: RunEvidence; exit?: number | null };

/** The red-base tasks of parsed checks.log lines, in append order. */
export function baselineCandidates(entries: readonly { tasks?: readonly BaselineCandidate[] }[]): BaselineCandidate[] {
	return entries.flatMap((entry) => entry.tasks ?? []);
}

/**
 * Pure: the last recorded red-base proof that still proves exactly this obligation, or null. `want` is
 * the verdict the row needs (`behavioral-failure` for a defect row, `passed` for `refactor:`); a
 * recorded `exit` alone never qualifies, only the framework-bound verdict does.
 */
export function reusableBaseline(candidates: readonly BaselineCandidate[], { key, current, want }: { key: string; current: string; want: RunEvidence['verdict'] }): { identity: BaselineIdentity; evidence: RunEvidence; exit: number | null } | null {
	for (let i = candidates.length - 1; i >= 0; i--) {
		const candidate = candidates[i];
		const identity = candidate.baseline;
		if (!identity || identity.current !== current || identity.key !== key) continue;
		if (candidate.evidence?.verdict === want) return { identity, evidence: candidate.evidence, exit: candidate.exit ?? null };
	}
	return null;
}
