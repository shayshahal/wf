// env/projects/jewelryx/plan-eval.ts — node env/projects/jewelryx/plan-eval.ts --arms main,<rev>[,…]
//   [--runs N] [--cases TJEW-665,…] [--model <pi model>] [--jobs N] [--dry: grade the rounds' own plans only]
//   node env/projects/jewelryx/plan-eval.ts --regrade <a run's folder>: its saved plans, graded again
// Measures the plan phase (prompts/plan.md and what it reads) on delivered JewelryX rounds. Each
// (case, arm, run) gets a fresh worktree of the project at the round's base with the round's own
// TICKET.md and RESEARCH.md, a wf at the arm's revision that composes the brief (`wf brief plan`),
// and a headless pi. The PLAN.md it writes is graded by code against what the round shipped.
// The method of pi's packages/evals (paired arms, fresh workspaces, code grading, the difference
// between arms), without its runner: that one is private to the pi repo and compares pi's own docs
// (2026-10-03).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { handoffGap, tokenOf } from '../../../src/round/handoff.ts';
import { planCommitRows, rowFiles } from '../../../src/round/prompt.ts';
import { WF_ROOT } from '../../../src/paths.ts';

const REPO = join(homedir(), 'work', 'jeweleryx-team');
const OUT = join(homedir(), '.cache', 'wf-evals');
// pnpm's pi shim names the bundle it runs; spawning node on it needs no shell (and opens no window).
const PI_SHIM = join(homedir(), 'AppData', 'Local', 'pnpm', 'bin', 'pi');

// Delivered rounds, by the commit that added their round folder to dev. Left out: BJEW-548 and
// TJEW-670.11 (a SPEC.md: their plans came after a design session the eval does not give the agent) and BJEW-603 (its TICKET.md is from
// before `## Intent`, which wf brief now requires).
export const CASES = [
	{ id: 'TJEW-665', docs: 'aa51c35d1' },
	{ id: 'BJEW-602', docs: 'b2e0311b3' },
	{ id: 'BJEW-562', docs: '13c61ffae' },
	{ id: 'TJEW-670.1', docs: 'b873959ea' },
	{ id: 'TJEW-670.2', docs: '86f7bb2c4' },
];

// Pure: a test file, which the plan may choose differently from the round and still be right.
export const isTest = (f: string) => /(^|\/)tests?\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]*$/.test(f);

export type Grade = { handoff: string | null; rows: number; lastRepro: boolean; missing: string[]; scoped: string[]; recall: number; pass: boolean };

// Pure: how a plan's prose names a file: its name, or for a SvelteKit route file (+page.svelte, which
// every route has) its last three segments, the way plans write them (`listing/[id]/+page.svelte`).
export const stemOf = (f: string) => f.split('/').at(-1)!.toLowerCase().replace(/[-_]/g, '');
export const nameOf = (f: string) => { const parts = f.split('/'); return parts.at(-1)!.startsWith('+') ? parts.slice(-3).join('/') : parts.at(-1)!; };
function section(text: string, title: string): string {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const start = lines.findIndex((l) => l.trim() === `## ${title}`);
	if (start < 0) return '';
	const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
	return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}
// Pure: a plan passes when wf next would take it (handoff), its last row's check is the repro
// (prompts/plan.md), and its rows name every product file the shipped fix touched. Recall counts
// tests too, as information. A missing file the plan names under Not doing or Asks is `scoped`: a
// call it left to the person, which the round's own plan made with their answer (BJEW-602, the
// listing page: an Ask, default no; the round built it). It still fails, but is not a file the plan
// never saw.
// A file the round created counts as named when a row creates one of the same name, whatever its
// folder, case or - and _, or a new file of the same kind in the same folder: a new file's name is the
// plan's to choose (TJEW-670.1: BackButton.svelte in layout/; the plans made back-button.svelte,
// admin/BackButton.svelte and layout/BackLink.svelte). `before`: the files of those folders at the base.
// A null brief skips the token: the rounds' own plans from before handoff tokens (BJEW-603).
export function grade({ plan, brief, fix, created = [], before = [] }: { plan: string | null; brief: { token: string } | null; fix: string[]; created?: string[]; before?: string[] }): Grade {
	const rows = plan ? planCommitRows(plan) : [];
	const listed = new Set(rows.flatMap((r) => rowFiles(r)));
	const stems = new Set([...listed].map(stemOf));
	const dirOf = (f: string) => f.slice(0, f.lastIndexOf('/'));
	const extOf = (f: string) => f.slice(f.lastIndexOf('.'));
	const madeBeside = (f: string) => [...listed].some((l) => !before.includes(l) && dirOf(l) === dirOf(f) && extOf(l) === extOf(f));
	const named = (f: string) => listed.has(f) || (created.includes(f) && (stems.has(stemOf(f)) || madeBeside(f)));
	const missing = fix.filter((f) => !isTest(f) && !named(f));
	const aside = plan ? section(plan, 'Not doing') + section(plan, 'Asks') : '';
	const scoped = missing.filter((f) => aside.includes(nameOf(f)));
	const handoff = handoffGap('plan', plan, brief);
	const lastRepro = rows.at(-1)?.check.replace(/`/g, '').trim() === 'repro';
	const recall = fix.length ? fix.filter(named).length / fix.length : 1;
	return { handoff, rows: rows.length, lastRepro, missing, scoped, recall, pass: !handoff && lastRepro && !missing.length };
}

export type Result = { arm: string; case: string; run: number; grade: Grade; cost: number | null; seconds: number; error?: string };
// Pure: the report: per arm its pass rate, mean recall, cost and time; per case each arm's runs;
// and every arm's pass rate against the first arm's.
export function report(results: Result[], arms: string[]): string {
	const pct = (x: number) => `${Math.round(x * 100)}%`;
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
	const of = (arm: string) => results.filter((r) => r.arm === arm);
	const rate = (arm: string) => mean(of(arm).map((r) => (r.grade.pass ? 1 : 0)));
	// `nothing missed`: no shipped product file absent from the plan altogether (scoped ones aside).
	const missed = (g: Grade) => g.missing.filter((f) => !g.scoped.includes(f));
	const lines = ['arm | pass | nothing missed | recall | cost | time', '---|---|---|---|---|---'];
	for (const arm of arms) {
		const rs = of(arm);
		const costs = rs.map((r) => r.cost).filter((c): c is number => c != null);
		lines.push(`${arm} | ${rs.filter((r) => r.grade.pass).length}/${rs.length} | ${rs.filter((r) => !r.error && !missed(r.grade).length).length}/${rs.length} | ${pct(mean(rs.map((r) => r.grade.recall)))} | ${costs.length ? `$${mean(costs).toFixed(2)}` : '—'} | ${Math.round(mean(rs.map((r) => r.seconds)))}s`);
	}
	lines.push('');
	for (const id of [...new Set(results.map((r) => r.case))]) {
		const cells = arms.map((arm) => `${arm}: ${of(arm).filter((r) => r.case === id).map((r) => (r.grade.pass ? 'pass' : `fail (${r.error ?? r.grade.handoff ?? (r.grade.missing.length ? [missed(r.grade).length ? `missed ${missed(r.grade).join(' ')}` : '', r.grade.scoped.length ? `scoped out ${r.grade.scoped.join(' ')}` : ''].filter(Boolean).join('; ') : 'last check not repro')})`)).join(', ')}`);
		lines.push(`${id} — ${cells.join(' · ')}`);
	}
	if (arms.length > 1) lines.push('', ...arms.slice(1).map((arm) => `${arm} vs ${arms[0]}: ${rate(arm) >= rate(arms[0]) ? '+' : ''}${Math.round((rate(arm) - rate(arms[0])) * 100)} points of pass rate`));
	return lines.join('\n');
}

// ── the shell around them ────────────────────────────────────────────────────

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true }).trim();

// What a case is, from the project's history: its round folder, the PR's base, and the files the
// plan's own commits touched. Not the PR's whole diff: a fix(review) commit is what T2 asked for, which
// no plan can know (BJEW-602: the auction page came from T2 #2).
function caseOf({ id, docs }: { id: string; docs: string }) {
	const folder = git(REPO, 'show', '--name-only', '--format=', docs).split('\n').find((f) => f.startsWith('bug-reports/'))!.split('/').slice(0, 2).join('/');
	const merge = git(REPO, 'log', '--merges', '--ancestry-path', '--format=%H', `${docs}..origin/dev`).split('\n').at(-1)!;
	const base = git(REPO, 'merge-base', `${merge}^1`, `${merge}^2`);
	const commits = git(REPO, 'log', '--format=%H %s', `${base}..${merge}^2`).split('\n').filter((l) => l && !/^\S+ (fix\(review\)|docs\()/.test(l)).map((l) => l.split(' ')[0]);
	const touched = commits.flatMap((h) => git(REPO, 'show', '--name-only', '--format=', h).split('\n'));
	const fix = [...new Set(touched)].filter((f) => f && !f.startsWith('bug-reports/')).sort();
	const added = new Set(git(REPO, 'diff', '--name-only', '--diff-filter=A', base, `${merge}^2`).split('\n'));
	const created = fix.filter((f) => added.has(f));
	const dirs = [...new Set(created.map((f) => f.slice(0, f.lastIndexOf('/') + 1)))];
	const before = dirs.length ? git(REPO, 'ls-tree', '--name-only', base, ...dirs).split('\n').filter(Boolean) : [];
	return { id, docs, folder, base, fix, created, before };
}

function piCommand(): string[] {
	const target = /cmd-shim-target=(.*)/.exec(readFileSync(PI_SHIM, 'utf8'))?.[1]?.trim();
	if (!target) throw new Error(`plan-eval: no pi bundle named in ${PI_SHIM}`);
	return [process.execPath, target];
}

function run(cmd: string[], cwd: string): Promise<{ code: number; out: string }> {
	return new Promise((resolve) => {
		const child = spawn(cmd[0], cmd.slice(1), { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
		let out = '';
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (out += d));
		child.on('close', (code) => resolve({ code: code ?? 1, out }));
	});
}

function sessionCost(dir: string): number | null {
	if (!existsSync(dir)) return null;
	let total = 0;
	let seen = false;
	const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.jsonl'));
	for (const f of files) for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
		try {
			const e = JSON.parse(line);
			const c = e.message?.usage?.cost?.total ?? (e.type === 'usage' ? e.usage?.cost?.total : undefined);
			if (typeof c === 'number') { total += c; seen = true; }
		} catch { /* a partial line */ }
	}
	return seen ? total : null;
}

// A run's saved plans graded by today's grader and today's cases (read from git again; a case since
// dropped is left out), without an agent. The handoff (the brief's token) was judged when it ran and
// is kept.
function regrade(dir: string): string {
	const saved = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')) as { arms: string[]; results: Result[] };
	const cases = CASES.map(caseOf);
	const results = saved.results.filter((r) => cases.some((c) => c.id === r.case)).map((r) => {
		const file = join(dir, 'plans', `${r.case}-${r.arm.replace(/[^\w.-]/g, '_')}-${r.run}.md`);
		const plan = existsSync(file) ? readFileSync(file, 'utf8') : null;
		const c = cases.find((x) => x.id === r.case)!;
		const g = grade({ plan, brief: null, fix: c.fix, created: c.created, before: c.before });
		return { ...r, grade: { ...g, handoff: r.grade.handoff, pass: g.pass && !r.grade.handoff } };
	});
	return report(results, saved.arms);
}

async function main() {
	const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
	const again = arg('regrade');
	if (again) return console.log(regrade(again));
	const arms = (arg('arms') ?? 'main').split(',');
	const runs = Number(arg('runs') ?? 1);
	const jobs = Number(arg('jobs') ?? 3);
	const model = arg('model');
	const wanted = arg('cases')?.split(',');
	const cases = CASES.filter((c) => !wanted || wanted.includes(c.id)).map(caseOf);
	// The round's own plan, graded the same way: what the grader asks of a plan a person approved.
	for (const c of cases) {
		const own = git(REPO, 'show', `${c.docs}:${c.folder}/PLAN.md`);
		const g = grade({ plan: own, brief: tokenOf(own) ? { token: tokenOf(own)! } : null, fix: c.fix, created: c.created, before: c.before });
		console.log(`${c.id}: ${c.fix.length} files shipped; the round's own plan ${g.pass ? 'passes' : `fails (${g.handoff ?? (g.missing.length ? `missing ${g.missing.join(' ')}` : 'last check not repro')})`}, recall ${Math.round(g.recall * 100)}%`);
	}
	if (process.argv.includes('--dry')) return;
	const out = join(OUT, new Date().toISOString().replace(/[:.]/g, '-'));
	mkdirSync(out, { recursive: true });
	const pi = piCommand();

	// One wf per arm, at its revision: the arm is what composes the brief and what {{wf}} points at.
	const armRoot = (arm: string) => join(out, 'arms', arm.replace(/[^\w.-]/g, '_'));
	for (const arm of arms) git(WF_ROOT, 'worktree', 'add', '-q', '--detach', armRoot(arm), arm);

	// git worktree add locks the repo: one setup at a time, the agents in parallel.
	let lock: Promise<unknown> = Promise.resolve();
	const serial = <T>(f: () => T) => { const p = lock.then(f); lock = p.catch(() => {}); return p; };

	const tasks = cases.flatMap((c) => arms.flatMap((arm) => Array.from({ length: runs }, (_, i) => ({ c, arm, run: i + 1 }))));
	const results: Result[] = [];
	const one = async ({ c, arm, run: n }: (typeof tasks)[number]) => {
		const name = `${c.id}-${arm.replace(/[^\w.-]/g, '_')}-${n}`;
		const ws = join(out, 'ws', name);
		const started = Date.now();
		try {
			await attempt(name, ws, c, arm, n, started);
		} catch (e) {
			// A brief wf refuses, or a git step: the task fails with why, and the others go on (2026-10-03:
			// BJEW-603's TICKET.md, from before `## Intent`, threw and left five worktrees behind).
			const why = String((e as { stderr?: string }).stderr || (e as Error).message).trim().split('\n')[0];
			results.push({ arm, case: c.id, run: n, grade: grade({ plan: null, brief: null, fix: c.fix }), cost: null, seconds: (Date.now() - started) / 1000, error: why });
			console.log(`${name}: error (${why})`);
		} finally {
			if (existsSync(ws)) await serial(() => git(REPO, 'worktree', 'remove', '--force', ws));
		}
	};
	const attempt = async (name: string, ws: string, c: (typeof tasks)[number]['c'], arm: string, n: number, started: number) => {
		const brief = await serial(() => {
			git(REPO, 'worktree', 'add', '-q', '--detach', ws, c.base);
			const inputs = ['TICKET.md', 'RESEARCH.md', 'EARLIER.md', 'repro'].map((f) => `${c.folder}/${f}`).filter((p) => git(REPO, 'ls-tree', '--name-only', c.docs, p));
			git(ws, 'checkout', '-q', c.docs, '--', ...inputs);
			git(ws, 'reset', '-q');
			const token = tokenOf(readFileSync(join(ws, c.folder, 'RESEARCH.md'), 'utf8'));
			mkdirSync(join(ws, '.wf'), { recursive: true });
			writeFileSync(join(ws, '.wf', 'state.json'), JSON.stringify({ round: c.id, id: c.id, folder: c.folder, step: 'plan', base: c.base, briefs: { research: { token, count: 1 } } }, null, 2));
			return execFileSync(process.execPath, [join(armRoot(arm), 'wf.mjs'), 'brief', 'plan'], { cwd: ws, encoding: 'utf8', windowsHide: true });
		});
		const sessions = join(out, 'sessions', name);
		const flags = ['-p', '-ne', '-ns', '-na', '--tools', 'read,bash,edit,write', '--session-dir', sessions, ...(model ? ['--model', model] : [])];
		const r = await run([...pi, ...flags, brief], ws);
		const planFile = join(ws, c.folder, 'PLAN.md');
		const plan = existsSync(planFile) ? readFileSync(planFile, 'utf8') : null;
		const state = JSON.parse(readFileSync(join(ws, '.wf', 'state.json'), 'utf8'));
		const result: Result = { arm, case: c.id, run: n, grade: grade({ plan, brief: state.briefs.plan, fix: c.fix, created: c.created, before: c.before }), cost: sessionCost(sessions), seconds: (Date.now() - started) / 1000, ...(r.code ? { error: `pi exit ${r.code}` } : {}) };
		results.push(result);
		mkdirSync(join(out, 'plans'), { recursive: true });
		if (plan) writeFileSync(join(out, 'plans', `${name}.md`), plan);
		writeFileSync(join(out, 'plans', `${name}.reply.txt`), r.out);
		console.log(`${name}: ${result.grade.pass ? 'pass' : 'fail'} (recall ${Math.round(result.grade.recall * 100)}%, ${Math.round(result.seconds)}s)`);
	};
	const queue = [...tasks];
	await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await one(queue.shift()!); }));

	for (const arm of arms) git(WF_ROOT, 'worktree', 'remove', '--force', armRoot(arm));
	const text = report(results, arms);
	writeFileSync(join(out, 'results.json'), JSON.stringify({ arms, runs, model: model ?? null, cases, results }, null, 2));
	writeFileSync(join(out, 'report.txt'), text + '\n');
	console.log(`\n${text}\n\n${out}`);
}

if (process.argv[1]?.endsWith('plan-eval.ts')) await main();
