// notes.mjs — wf notes: the project's notes for the orchestrator (projects/<name>/ROUND.md: its
// tracker, statuses, people, branches and T2), with wf's paths filled as in a prompt. The round skill
// reads them through this command, so the skill names no project folder, and one skill text works in
// the Claude Code plugin and in Shay's installed copy (kit and env plan, step 5).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anchorToolPaths } from './anchor.mjs';
import { name } from './project.mjs';

export function runNotes() {
	const home = fileURLToPath(new URL('./', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
	process.stdout.write(anchorToolPaths(readFileSync(`${home}/projects/${name}/ROUND.md`, 'utf8'), home, name));
}
