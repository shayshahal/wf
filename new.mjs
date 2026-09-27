#!/usr/bin/env node
// new.mjs — wf new <branch> [--base <ref>] [--class B|C] [--id <token>]...
// Create the worktree (worktree.mjs createWorktree), then classify it. --class asserts the class at creation (sticky,
// see step.mjs). --id <ticket id> refuses to cut the worktree when a
// round for that id already exists (a round folder or a commit naming it) —
// BJEW-585 was fixed under a sibling item and the round burned 26 min rediscovering
// it (pilot note 10). To proceed anyway, rerun without --id.
// It also refuses a third live round (SKILL.md: two at once, max — the box cannot run
// three stacks); --force overrides. --id records id + folder in the new worktree's state
// and creates <folder>, then the project adds what a round starts with (project.mjs newRound) —
// that folder is what every `wf prompt` substitutes.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { baseBranch, newRound, roundBranches, roundsDir, stackUrls } from './project.mjs';
import { basePortForBranch, createWorktree, slugForBranch, urlLines } from './worktree.mjs';
import { seams } from './seams.mjs';
import { writeState } from './state.mjs';
import { liveRounds, realReadState, realWorktrees } from './status.mjs';

// Where round work lives: the base branch and the round branches. Not --all: the tooling branches
// (tools/*, wf2/*) write *about* rounds in their subjects without being one (BJEW-603, 2026-09-23).
const ROUND_REFS = [`origin/${baseBranch}`, ...roundBranches.flatMap((b) => [`--branches=${b}`, `--remotes=origin/${b}`])];

// The round folders are read from `base` in git, not from the folder wf runs in: that is Shay's bare
// repo's root (no rounds folder) or a teammate's clone on main, where no round is merged.
export function findExistingRounds(ids, base) {
	const hits = [];
	let folders = [];
	try { folders = execFileSync('git', ['ls-tree', '-d', '--name-only', `${base}:${roundsDir}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { /* no rounds folder on the base */ }
	for (const id of ids) {
		// Ids are compared without their punctuation: a round's folder is named from its branch,
		// fix-tjew682-auction-pickers, and "tjew-682" never matched it (TJEW-682 reopen, 2026-09-27).
		const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
		for (const f of folders) if (flat(f).includes(flat(id))) hits.push(`${roundsDir}/${f}`);
		// Work on an id names it in the subject ("BJEW-461 - ...", "Merge ... fix/bjew461-..."). A body that
		// only mentions it ("found in the BJEW-603 round") is not work on it (BJEW-603, 2026-09-23).
		const log = execFileSync('git', ['log', ...ROUND_REFS, '--format=%h %s', '-i', `--grep=${id}`, `--grep=${id.replace(/-/g, '')}`], { encoding: 'utf8' }).trim();
		for (const line of log.split('\n').filter(Boolean)) if (flat(line.slice(line.indexOf(' ') + 1)).includes(flat(id))) hits.push(`commit ${line}`);
	}
	return hits;
}

// Pure: the lines of a PLAN.md's `## Decisions` (wf decide writes them), or none.
export function decisionsOf(planText) {
	const section = /^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec((planText ?? '').replace(/\r\n/g, '\n'))?.[1] ?? '';
	return section.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
}

// Pure: EARLIER.md for a reopened ticket: the earlier work, and the rulings its rounds recorded. The
// plan's Asks take a ruling as their default: the 2026-09-27 replay of TJEW-682 re-asked both
// questions Shay had ruled on four days before, whose round folder the plan agent never read.
export function earlierText({ ids, dupes, rulings }) {
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
export function launchConfig(urls) {
	return `${JSON.stringify({ version: '0.0.1', configurations: Object.entries(urls).map(([name, url]) => ({ name, url: new URL(url).origin })) }, null, 2)}\n`;
}

// Pure: the `git fetch` that brings `base` up to date first, or null when it is not a remote branch
// (a local ref or a sha is what the person asked for).
export function fetchFor(base) {
	const m = /^origin\/(.+)$/.exec(base);
	return m ? ['fetch', '--quiet', 'origin', m[1]] : null;
}

export async function runNew(argv) {
	const branch = argv[0];
	if (!branch) { console.error('usage: wf new <branch> [--base <ref>] [--class B|C] [--id <token>]...'); process.exit(2); }
	// wt defaults --base to the repo's default branch; rounds branch off the project's base branch.
	const bi = argv.indexOf('--base');
	const base = bi === -1 ? `origin/${baseBranch}` : argv[bi + 1];
	if (!base) { console.error('wf new: --base needs a ref'); process.exit(2); }
	const ci = argv.indexOf('--class');
	const klass = ci === -1 ? null : argv[ci + 1];
	if (ci !== -1 && !['B', 'C'].includes(klass)) { console.error('wf new: --class is B or C (A is the measured default)'); process.exit(2); }
	const ids = argv.flatMap((a, i) => (a === '--id' && argv[i + 1] ? [argv[i + 1]] : []));
	const live = liveRounds({ paths: realWorktrees(), readState: realReadState });
	if (live.length >= 2 && !argv.includes('--force')) {
		console.error(`wf new: two rounds are already live — finish or hold one first:\n  ${live.map((r) => `${r.state.id ?? r.state.round} · ${r.state.step} · ${r.path}`).join('\n  ')}\n(--force to cut a third anyway)`);
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
		console.error(`wf new: ${e.message}`);
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
	writeState(path, { id: ids[0] ?? branch, folder, made_by: seams.madeBy, entry: seams.entry.replace(/\\/g, '/') });
	if (reopen && dupes.length) {
		const plan = (f) => { try { return execFileSync('git', ['show', `${base}:${f}/PLAN.md`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
		const rulings = dupes.filter((d) => d.startsWith(`${roundsDir}/`)).map((f) => ({ folder: f, lines: decisionsOf(plan(f)) }));
		writeFileSync(join(path, folder, 'EARLIER.md'), earlierText({ ids, dupes, rulings }));
	}
	const urls = stackUrls({ slug: slugForBranch(branch), port: basePortForBranch(branch) });
	mkdirSync(join(path, '.claude'), { recursive: true });
	writeFileSync(join(path, '.claude', 'launch.json'), launchConfig(urls));
	console.log(`Round folder: ${folder}`);
	console.log(urlLines(urls));
	for (const line of notes) console.log(line);
	console.log(`Worktree: ${path}`);
}

// Direct use (node new.mjs <branch>) and wf.mjs (which imports runNew) share this module.
if (process.argv[1]?.endsWith('new.mjs')) runNew(process.argv.slice(2));
