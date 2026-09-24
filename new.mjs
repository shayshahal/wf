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
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseBranch, newRound, roundBranches, roundsDir, stackNames } from './project.mjs';
import { basePortForBranch, createWorktree, slugForBranch, urlLines } from './worktree.mjs';
import { writeState } from './state.mjs';
import { liveRounds, realReadState, realWorktrees } from './status.mjs';

// Where round work lives: the base branch and the round branches. Not --all: the tooling branches
// (tools/*, wf2/*) write *about* rounds in their subjects without being one (BJEW-603, 2026-09-23).
const ROUND_REFS = [`origin/${baseBranch}`, ...roundBranches.flatMap((b) => [`--branches=${b}`, `--remotes=origin/${b}`])];

export function findExistingRounds(ids) {
	const hits = [];
	let folders = [];
	try { folders = readdirSync(roundsDir); } catch { /* no rounds folder here */ }
	for (const id of ids) {
		const needle = id.toLowerCase();
		for (const f of folders) if (f.toLowerCase().includes(needle)) hits.push(`${roundsDir}/${f}`);
		// Work on an id names it in the subject ("BJEW-461 - ...", "Merge ... fix/bjew461-..."). A body that
		// only mentions it ("found in the BJEW-603 round") is not work on it (BJEW-603, 2026-09-23).
		const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
		const log = execFileSync('git', ['log', ...ROUND_REFS, '--format=%h %s', '-i', `--grep=${id}`, `--grep=${id.replace(/-/g, '')}`], { encoding: 'utf8' }).trim();
		for (const line of log.split('\n').filter(Boolean)) if (flat(line.slice(line.indexOf(' ') + 1)).includes(flat(id))) hits.push(`commit ${line}`);
	}
	return hits;
}

export function runNew(argv) {
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
	const dupes = findExistingRounds(ids);
	// --reopen: the ticket came back (Failed QA). Earlier work is the research input, not a stop.
	const reopen = argv.includes('--reopen');
	if (dupes.length && !reopen) {
		console.error(`wf new: work for ${ids.join(', ')} already exists — read it before cutting a round:\n  ${dupes.join('\n  ')}\n(--reopen if the ticket came back; rerun without --id to cut the worktree anyway)`);
		process.exit(1);
	}
	const log = join(tmpdir(), `wf-new-${branch.replace(/[^A-Za-z0-9.-]/g, '-')}.log`);
	let path;
	try {
		({ path } = createWorktree({ branch, base, log }));
	} catch (e) {
		console.error(`wf new: ${e.message}`);
		process.exit(1);
	}
	console.log(`wf new: worktree ready (hook log: ${log})`);
	// The wf that was invoked, not the round's copy: a round is cut from dev, which may not carry
	// wf at all (BJEW-603, 2026-09-23: MODULE_NOT_FOUND after every hook had passed).
	execFileSync('node', [fileURLToPath(new URL('./wf.mjs', import.meta.url)), 'step', 'classify', '--base', base, ...(klass ? ['--class', klass] : [])], { stdio: 'inherit', cwd: path });
	const folder = `${roundsDir}/${slugForBranch(branch)}`;
	mkdirSync(join(path, folder), { recursive: true });
	const notes = newRound({ worktree: path, folder, port: basePortForBranch(branch) });
	writeState(path, { id: ids[0] ?? branch, folder });
	if (reopen && dupes.length) writeFileSync(join(path, folder, 'EARLIER.md'), `# Earlier work on ${ids.join(', ')}\n\nThis ticket came back. Every earlier fix below shipped and did not hold.\n\n${dupes.map((d) => `- ${d.trim()}`).join('\n')}\n`);
	console.log(`Round folder: ${folder}`);
	console.log(urlLines(stackNames(slugForBranch(branch))));
	for (const line of notes) console.log(line);
	console.log(`Worktree: ${path}`);
}

// Direct use (node new.mjs <branch>) and wf.mjs (which imports runNew) share this module.
if (process.argv[1]?.endsWith('new.mjs')) runNew(process.argv.slice(2));
