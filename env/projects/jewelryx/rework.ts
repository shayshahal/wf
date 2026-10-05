// env/projects/jewelryx/rework.ts — node env/projects/jewelryx/rework.ts [--days 7,14,30] [--since 2026-07-01]
//   [--sweep 40]
// How much of what each change added to JewelryX's packages/ is changed again within N days, and by
// what: a fix, a revert, a sweep (a lint fix, or more than --sweep code files: formatting, a move) or other
// work. Asked 2026-10-05, after five papers found agent code is reworked more than human code
// (docs/research/show-me-maintainability-papers.html): does it happen to wf's rounds?
// A change is one step of origin/dev's first-parent history: a PR merge or, before September, a
// direct commit; its lines are its diff against the step before. A line's fate comes from
// `git blame --reverse --first-parent`: the last step it existed in, so the step after changed it.
// Groups: wf rounds (they bring a bug-reports/ or cr-reports/ folder with RESEARCH.md, VALIDATION.md
// or TICKET.md), other ticket work (a BJEW or TJEW id in the subject or branch: v1 rounds, whose
// folders were imported in one docs commit on 2026-09-09 and so cannot place them, and work by hand)
// and the rest; each as a PR or a direct commit, by Shay or the team. Compare a PR with PRs: a
// direct commit is one step its next commit often rewrites, while a PR keeps that churn inside it
// (first run: about 10% of direct commits' lines changed within 7 days, 1-2% of PRs').
// Reads origin/dev as it is: `git fetch` in the repo first for today's.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const REPO = join(homedir(), 'work', 'jeweleryx-team');
const OUT = join(homedir(), '.cache', 'wf-rework');
const DAY = 86_400_000;

export type Step = { sha: string; parents: string[]; date: number; author: string; subject: string };
export type Kind = 'wf' | 'ticket' | 'other';
export type Fate = 'kept' | 'fix' | 'revert' | 'sweep' | 'other';

// Pure: what a change is, from its first-parent diff's added paths and its subject (a merge's subject
// carries the branch).
export function kindOf(added: string[], subject: string): Kind {
	if (added.some((p) => /^(bug-reports|cr-reports)\/[^/]+\/(RESEARCH|VALIDATION|TICKET)\.md$/.test(p))) return 'wf';
	return /\b[bt]jew-?\d+/i.test(subject) ? 'ticket' : 'other';
}

// Pure: the code lines a change can be judged on: app code under packages/, not generated.
export const isCode = (path: string) =>
	path.startsWith('packages/') && /\.(py|ts|tsx|svelte|js|mjs|cjs)$/.test(path) && !/(\/generated\/|\.gen\.|\/paraglide\/)/.test(path);

// Pure: `git diff -U0` → the added line ranges per file, in the new version's numbering.
export function addedRanges(diff: string): Map<string, [number, number][]> {
	const out = new Map<string, [number, number][]>();
	let file: string | null = null;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ')) { file = line === '+++ /dev/null' ? null : line.slice(6); continue; }
		const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (!h || !file || !isCode(file)) continue;
		const start = Number(h[1]), count = h[2] === undefined ? 1 : Number(h[2]);
		if (count > 0) out.set(file, [...(out.get(file) ?? []), [start, start + count - 1]]);
	}
	return out;
}

// Pure: `git blame --porcelain` → the commit each blamed line points at (porcelain repeats a line's
// header for every line; the content line starts with a tab).
export const blamedShas = (porcelain: string) =>
	porcelain.split('\n').filter((l) => /^[0-9a-f]{40} \d+ \d+/.test(l)).map((l) => l.slice(0, 40));

// Pure: what a later step that changed a line was. A revert by its words; a sweep by its size, since
// lint-kit's adoption or a reformat rewrites lines nobody meant to rework (#277, chore/linting: 739
// files), counted in code files because a round's PR also carries its folder's captures; a fix by the
// repo's conventional commits (`fix:`, a fix/ branch) or by naming a bug board ticket (BJEW).
export function fateOf(step: { subject: string; files: number }, sweep: number): Exclude<Fate, 'kept'> {
	const branch = /^Merge pull request #\d+ from [^/]+\/(.+)$/.exec(step.subject)?.[1] ?? '';
	const text = `${step.subject} ${branch}`;
	if (/\brevert/i.test(text)) return 'revert';
	// A lint fix rewrites what a linter flagged, not a bug (#254, fix/lint-unknown-returns, on TJEW-700's lines).
	if (step.files > sweep || /\blint/i.test(branch || step.subject)) return 'sweep';
	const fix = branch ? /^(fix|hotfix|bugfix)[/-]/i.test(branch) : /^(fix|hotfix|bugfix)(\([^)]*\))?!?:/i.test(step.subject);
	return fix || /\bbjew-?\d+/i.test(text) ? 'fix' : 'other';
}

export const isShay = (author: string) => /shay/i.test(author) && !/einat/i.test(author);

export type Row = { sha: string; date: string; kind: Kind; pr: boolean; shay: boolean; subject: string; lines: number; fates: Record<string, Record<Fate, number>> };

// Pure: per group and window, the share of lines changed again, by fate.
export function report(rows: Row[], windows: number[]): string {
	const out: string[] = [];
	for (const w of windows) {
		const judged = rows.filter((r) => r.fates[w]);
		if (!judged.length) continue;
		out.push(`\nWithin ${w} days (changes at least ${w} days old)`);
		out.push('group                changes   lines   changed   by fix+revert   changes with a fix   by sweep');
		const groups = new Map<string, Row[]>();
		for (const r of judged) { const g = `${r.kind} ${r.pr ? 'PR' : 'direct'} ${r.shay ? 'Shay' : 'team'}`; groups.set(g, [...(groups.get(g) ?? []), r]); }
		for (const [g, rs] of [...groups].sort()) {
			const sum = (f: Fate) => rs.reduce((n, r) => n + r.fates[w][f], 0);
			const lines = rs.reduce((n, r) => n + r.lines, 0);
			const pct = (n: number) => `${lines ? ((100 * n) / lines).toFixed(1) : '0.0'}%`;
			const withFix = rs.filter((r) => r.fates[w].fix + r.fates[w].revert > 0).length;
			out.push([g.padEnd(19), String(rs.length).padStart(7), String(lines).padStart(7),
				pct(sum('fix') + sum('revert') + sum('other')).padStart(9), pct(sum('fix') + sum('revert')).padStart(15),
				`${withFix} (${((100 * withFix) / rs.length).toFixed(0)}%)`.padStart(20), pct(sum('sweep')).padStart(10)].join(' '));
		}
	}
	return out.join('\n');
}

const run = promisify(execFile);
const git = async (args: string[]) => (await run('git', args, { cwd: REPO, maxBuffer: 1 << 28, windowsHide: true })).stdout;

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
	return out;
}

async function main() {
	const arg = (name: string, dflt: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
	const windows = arg('days', '7,14,30').split(',').map(Number);
	const since = Date.parse(arg('since', '2026-07-01'));
	const sweep = Number(arg('sweep', '40'));

	const steps: Step[] = (await git(['log', 'origin/dev', '--first-parent', '--reverse', '--format=%H%x09%P%x09%cI%x09%an%x09%s']))
		.trim().split('\n').map((l) => { const [sha, parents, date, author, subject] = l.split('\t'); return { sha, parents: parents.split(' '), date: Date.parse(date), author, subject }; });
	const index = new Map(steps.map((s, i) => [s.sha, i]));
	const tip = steps[steps.length - 1];

	type Info = { files: number; kind: Kind; pr: boolean; shay: boolean };
	const infoCache = new Map<string, Promise<Info>>();
	const info = (s: Step) => {
		if (!infoCache.has(s.sha)) infoCache.set(s.sha, (async () => {
			const status = (await git(['diff', '--name-status', '--no-renames', s.parents[0], s.sha])).trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
			const added = status.filter(([st]) => st === 'A').map(([, p]) => p);
			const merge = s.parents.length > 1;
			const author = merge ? (await git(['log', '-1', '--format=%an', s.parents[1]])).trim() : s.author;
			return { files: status.filter(([, p]) => isCode(p)).length, kind: kindOf(added, s.subject), pr: merge, shay: isShay(author) };
		})());
		return infoCache.get(s.sha)!;
	};

	const subjects = steps.filter((s) => s.date >= since && s.parents[0] !== '');
	console.error(`origin/dev at ${tip.sha.slice(0, 9)} (${new Date(tip.date).toISOString().slice(0, 10)}); ${subjects.length} changes since ${arg('since', '2026-07-01')}`);
	let done = 0;
	const skipped = { sweep: 0, noCode: 0 };
	const rows = (await pool(subjects, 8, async (s): Promise<Row | null> => {
		const i = await info(s);
		if (i.files > sweep) { skipped.sweep++; return null; }
		const ranges = addedRanges(await git(['diff', '-U0', '--no-renames', s.parents[0], s.sha, '--', 'packages']));
		const lines = [...ranges.values()].reduce((n, rs) => n + rs.reduce((m, [a, b]) => m + b - a + 1, 0), 0);
		if (!lines) { skipped.noCode++; return null; }
		const fates: Row['fates'] = {};
		for (const w of windows) {
			const deadline = s.date + w * DAY;
			if (deadline > tip.date) continue;
			let t = index.get(s.sha)!;
			while (t + 1 < steps.length && steps[t + 1].date <= deadline) t++;
			const end = steps[t].sha;
			const tally: Record<Fate, number> = { kept: 0, fix: 0, revert: 0, sweep: 0, other: 0 };
			for (const [file, rs] of ranges) {
				if (end === s.sha) { tally.kept += rs.reduce((m, [a, b]) => m + b - a + 1, 0); continue; }
				for (let k = 0; k < rs.length; k += 150) {
					const shas = blamedShas(await git(['blame', '--reverse', '--first-parent', '--porcelain', ...rs.slice(k, k + 150).flatMap(([a, b]) => ['-L', `${a},${b}`]), `${s.sha}..${end}`, '--', file]));
					for (const sha of shas) {
						if (sha === end) { tally.kept++; continue; }
						const next = steps[(index.get(sha) ?? -2) + 1];
						if (!next) { tally.other++; continue; }
						tally[fateOf({ subject: next.subject, files: (await info(next)).files }, sweep)]++;
					}
				}
			}
			fates[w] = tally;
		}
		if (++done % 100 === 0) console.error(`  ${done}/${subjects.length}`);
		return { sha: s.sha.slice(0, 9), date: new Date(s.date).toISOString().slice(0, 10), kind: i.kind, pr: i.pr, shay: i.shay, subject: s.subject.slice(0, 100), lines, fates };
	})).filter((r): r is Row => r !== null);

	const text = report(rows, windows);
	mkdirSync(OUT, { recursive: true });
	const file = join(OUT, `${new Date().toISOString().slice(0, 10)}.json`);
	writeFileSync(file, JSON.stringify({ tip: tip.sha, windows, sweep, rows }, null, '\t'));
	console.error(`judged ${rows.length}; left out: ${skipped.sweep} sweeps (> ${sweep} code files), ${skipped.noCode} with no code lines`);
	console.log(`${text}\n\n'changed' counts fix, revert and other; a sweep (> ${sweep} code files) is apart. Per change: ${file}`);
}

if (process.argv[1]?.endsWith('rework.ts')) await main();
