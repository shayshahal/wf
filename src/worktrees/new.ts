#!/usr/bin/env node
// new.ts — wf new <branch> [--base <ref>] [--class B|C] [--check] [--id <token>]...
// Create the worktree (worktree.ts createWorktree), then classify it. --class asserts the class at creation (sticky,
// see step.ts). --id <ticket id> refuses to cut the worktree when a
// round for that id already exists (a round folder or a commit naming it) —
// BJEW-585 was fixed under a sibling item and the round burned 26 min rediscovering
// it (pilot note 10). To proceed anyway, rerun without --id.
// It also refuses a third live round (SKILL.md: two at once, max — the box cannot run
// three stacks); --force overrides. --id records id + folder in the new worktree's state
// and creates <folder>, then the project adds what a round starts with (project.ts newRound) —
// that folder is what every `wf prompt` substitutes. --check makes the round a check: wf next stops
// after research, waiting on Shay (next.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseBranch, newRound, roundBranches, roundsDir, stackUrls } from '../project.ts';
import { basePortForBranch, createWorktree, excludeFromGit, listWorktrees, mainCheckout, slugForBranch, urlLines } from './worktree.ts';
import { seams } from '../seams.ts';
import { writeState } from '../round/state.ts';

type LaunchJson = { version?: string; configurations?: { name?: string; url?: string }[] };
import { liveRounds, realReadState, realWorktrees } from '../round/status.ts';

// Where round work lives: the base branch and the round branches. Not --all: the tooling branches
// (tools/*, wf2/*) write *about* rounds in their subjects without being one (BJEW-603, 2026-09-23).
const ROUND_REFS = [`origin/${baseBranch}`, ...roundBranches.flatMap((b) => [`--branches=${b}`, `--remotes=origin/${b}`])];

// The round folders are read from `base` in git, not from the folder wf runs in: that is Shay's bare
// repo's root (no rounds folder) or a teammate's clone on main, where no round is merged.
// Pure: whether text (a folder, a commit subject) names the id. Punctuation between the id's letters
// and numbers is optional: a round's folder is named from its branch, fix-tjew682-auction-pickers, and
// "tjew-682" never matched it (TJEW-682 reopen, 2026-09-27). A number never continues into another
// digit: TJEW-670.1 is not TJEW-670.10, BJEW-46 is not BJEW-461 (a subitem round's id, 2026-09-28).
export function namesId(text: string, id: string) {
	const parts = id.toLowerCase().match(/[a-z]+|[0-9]+/g) ?? [];
	return parts.length > 0 && new RegExp(`(?<![0-9])${parts.join('[^a-z0-9]*')}(?![0-9])`).test(text.toLowerCase());
}

export function findExistingRounds(ids: string[], base: string) {
	const hits = [];
	let folders: string[] = [];
	try { folders = execFileSync('git', ['ls-tree', '-d', '--name-only', `${base}:${roundsDir}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { /* no rounds folder on the base */ }
	for (const id of ids) {
		for (const f of folders) if (namesId(f, id)) hits.push(`${roundsDir}/${f}`);
		// Work on an id names it in the subject ("BJEW-461 - ...", "Merge ... fix/bjew461-..."). A body that
		// only mentions it ("found in the BJEW-603 round") is not work on it (BJEW-603, 2026-09-23).
		const log = execFileSync('git', ['log', ...ROUND_REFS, '--format=%h %s', '-i', `--grep=${id}`, `--grep=${id.replace(/-/g, '')}`], { encoding: 'utf8' }).trim();
		for (const line of log.split('\n').filter(Boolean)) if (namesId(line.slice(line.indexOf(' ') + 1), id)) hits.push(`commit ${line}`);
	}
	return hits;
}

// Pure: the lines of a PLAN.md's `## Decisions` (wf decide writes them), or none.
export function decisionsOf(planText: string | null) {
	const section = /^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec((planText ?? '').replace(/\r\n/g, '\n'))?.[1] ?? '';
	return section.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
}

// Pure: EARLIER.md for a reopened ticket: the earlier work, and the rulings its rounds recorded. The
// plan's Asks take a ruling as their default: the 2026-09-27 replay of TJEW-682 re-asked both
// questions Shay had ruled on four days before, whose round folder the plan agent never read.
export function earlierText({ ids, dupes, rulings }: { ids: string[]; dupes: string[]; rulings: { folder: string; lines: string[] }[] }) {
	const ruled = rulings.filter((r) => r.lines.length);
	return [
		`# Earlier work on ${ids.join(', ')}`, '', 'This ticket came back. Every earlier fix below shipped and did not hold.', '',
		...dupes.map((d) => `- ${d.trim()}`),
		...(ruled.length ? ['', '## Earlier rulings', '', 'What the people asked decided in those rounds (their PLAN.md `## Decisions`), verbatim.', '', ...ruled.flatMap((r) => [`${r.folder}:`, ...r.lines, ''])] : ['']),
	].join('\n').replace(/\n+$/, '\n');
}

// Pure: the worktree's .claude/launch.json for Claude Code Desktop's Browser pane: one entry per app
// in attach mode (a url, no command), so the pane shows the stack wf started and never starts its own
// (kit and env plan, step 3). Desktop takes a localhost url as a bare origin only.
export function launchConfig(urls: Record<string, string>) {
	return `${JSON.stringify({ version: '0.0.1', configurations: Object.entries(urls).map(([name, url]) => ({ name, url: new URL(url).origin })) }, null, 2)}\n`;
}

// Pure: the person's clone's .claude/launch.json with this round's apps in it, as "<slug> <app>" (urls
// null: the round's entries taken out, for reap), or null when the file is not JSON wf can edit.
// Claude Code Desktop reads launch.json from the folder the session opened, the clone, never from the
// worktree EnterWorktree moved it to: TJEW-670's T2 (2026-09-28) could not start the pane by name,
// and by URL it keeps no login.
export function cloneLaunch(text: string, slug: string, urls: Record<string, string> | null) {
	let json: LaunchJson = { version: '0.0.1', configurations: [] };
	if (text?.trim()) {
		try { json = JSON.parse(text); } catch { /* a launch.json wf cannot parse is someone's: left as it is */ return null; }
	}
	const others = (json.configurations ?? []).filter((c) => !String(c.name ?? '').startsWith(`${slug} `));
	const ours = urls ? Object.entries(urls).map(([app, url]) => ({ name: `${slug} ${app}`, url: new URL(url).origin })) : [];
	return `${JSON.stringify({ ...json, configurations: [...others, ...ours] }, null, 2)}\n`;
}

// Writes cloneLaunch's result into the main checkout, when there is one (not a bare layout).
export function writeCloneLaunch(slug: string, urls: Record<string, string> | null) {
	const main = mainCheckout(listWorktrees());
	if (!main) return;
	const file = join(main, '.claude', 'launch.json');
	if (!urls && !existsSync(file)) return;
	const next = cloneLaunch(existsSync(file) ? readFileSync(file, 'utf8') : '', slug, urls);
	if (!next) return console.error(`wf: ${file} is not JSON, left as it is`);
	mkdirSync(join(main, '.claude'), { recursive: true });
	writeFileSync(file, next);
	excludeFromGit(main, '/.claude/launch.json');
}

// Pure: the `git fetch` that brings `base` up to date first, or null when it is not a remote branch
// (a local ref or a sha is what the person asked for).
export function fetchFor(base: string) {
	const m = /^origin\/(.+)$/.exec(base);
	return m ? ['fetch', '--quiet', 'origin', m[1]] : null;
}

export async function runNew(argv: string[]) {
	const branch = argv[0];
	// A flag first is not a branch: `wf new --help` went to git as one and printed git branch's usage (TJEW-670).
	if (!branch || branch.startsWith('-')) { console.error('usage: wf new <branch> [--base <ref>] [--class B|C] [--check] [--id <token>]...'); process.exit(2); }
	// wt defaults --base to the repo's default branch; rounds branch off the project's base branch.
	const bi = argv.indexOf('--base');
	const base = bi === -1 ? `origin/${baseBranch}` : argv[bi + 1];
	if (!base) { console.error('wf new: --base needs a ref'); process.exit(2); }
	const ci = argv.indexOf('--class');
	const klass = ci === -1 ? null : argv[ci + 1];
	if (ci !== -1 && !['B', 'C'].includes(klass!)) { console.error('wf new: --class is B or C (A is the measured default)'); process.exit(2); }
	const ids = argv.flatMap((a, i) => (a === '--id' && argv[i + 1] ? [argv[i + 1]] : []));
	const live = liveRounds({ paths: realWorktrees(), readState: realReadState });
	if (live.length >= 2 && !argv.includes('--force')) {
		console.error(`wf new: two rounds are already live — finish or hold one first:\n  ${live.map((r) => `${r.state!.id ?? r.state!.round} · ${r.state!.step} · ${r.path}`).join('\n  ')}\n(--force to cut a third anyway)`);
		process.exit(1);
	}
	// Neither wt nor git fetches: a clone days behind branched its round off a stale base (the kit
	// plan's step 3 review, 2026-09-27). Offline, the round starts from the base this clone has.
	const fetch = fetchFor(base);
	if (fetch) {
		const r = spawnSync('git', fetch, { encoding: 'utf8' });
		if (r.status !== 0) console.error(`wf new: could not fetch ${base} (${(r.stderr ?? '').trim().split('\n').at(-1)}); branching off this clone's copy`);
	}
	const dupes = findExistingRounds(ids, base);
	// --reopen: the ticket came back (Failed QA). Earlier work is the research input, not a stop.
	const reopen = argv.includes('--reopen');
	if (dupes.length && !reopen) {
		console.error(`wf new: work for ${ids.join(', ')} already exists — read it before cutting a round:\n  ${dupes.join('\n  ')}\n(--reopen if the ticket came back; rerun without --id to cut the worktree anyway)`);
		process.exit(1);
	}
	const log = join(tmpdir(), `wf-new-${branch.replace(/[^A-Za-z0-9.-]/g, '-')}.log`);
	let path;
	try {
		({ path } = await createWorktree({ branch, base, log }));
	} catch (e) {
		console.error(`wf new: ${(e as Error).message}`);
		process.exit(1);
	}
	console.log(`wf new: worktree ready (hook log: ${log})`);
	// The wf that was invoked (seams.entry: the env's or the kit's), not the round's copy: a round is
	// cut from dev, which may not carry wf at all (BJEW-603, 2026-09-23: MODULE_NOT_FOUND after every
	// hook had passed).
	execFileSync('node', [seams.entry, 'step', 'classify', '--base', base, ...(klass ? ['--class', klass] : [])], { stdio: 'inherit', cwd: path });
	const folder = `${roundsDir}/${slugForBranch(branch)}`;
	mkdirSync(join(path, folder), { recursive: true });
	const notes = newRound({ worktree: path, folder, port: basePortForBranch(branch) });
	writeState(path, { id: ids[0] ?? branch, ...(ids.length > 1 ? { ids } : {}), folder, made_by: seams.madeBy, entry: seams.entry.replace(/\\/g, '/'), ...(argv.includes('--check') ? { check: true } : {}) });
	if (reopen && dupes.length) {
		const plan = (f: string) => { try { return execFileSync('git', ['show', `${base}:${f}/PLAN.md`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* that round left no PLAN.md: it has no rulings */ return null; } };
		const rulings = dupes.filter((d) => d.startsWith(`${roundsDir}/`)).map((f) => ({ folder: f, lines: decisionsOf(plan(f)) }));
		writeFileSync(join(path, folder, 'EARLIER.md'), earlierText({ ids, dupes, rulings }));
	}
	const urls = stackUrls({ slug: slugForBranch(branch), port: basePortForBranch(branch) });
	mkdirSync(join(path, '.claude'), { recursive: true });
	writeFileSync(join(path, '.claude', 'launch.json'), launchConfig(urls));
	writeCloneLaunch(slugForBranch(branch), urls);
	console.log(`Round folder: ${folder}`);
	console.log(urlLines(urls));
	for (const line of notes) console.log(line);
	console.log(`Worktree: ${path}`);
}

// Direct use (node new.ts <branch>) and wf.mjs (which imports runNew) share this module.
if (process.argv[1]?.endsWith('new.ts')) runNew(process.argv.slice(2));
