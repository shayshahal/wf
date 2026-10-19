// notes.ts — wf notes: the project's notes for the orchestrator (projects/<name>/ROUND.md: its
// tracker, statuses, people, branches and T2), with wf's paths filled as in a prompt. The round skill
// reads them through this command, so the skill names no project folder, and one skill text works in
// the Claude Code plugin and in Shay's installed copy (kit and env plan, step 5).
import { readFileSync } from 'node:fs';
import { anchorToolPaths } from '../plugin/anchor.ts';
import { WF_HOME } from '../paths.ts';
import { name } from '../project.ts';

/** Print authoritative workflow references and the configured project's round guidance. */
export function runNotes() {
	process.stdout.write(`Workflow references (read the applicable branch):
- Before classifying a task: ${WF_HOME}/process/CLASSES.md
- Consequential agreement / agreed checkpoints: ${WF_HOME}/process/AGREEMENT-TEMPLATE.md
- When a view helps a decision: ${WF_HOME}/process/SHOW-ME.md
- Writing or recording a review: ${WF_HOME}/process/REVIEW-FORMAT.md

${anchorToolPaths(readFileSync(`${WF_HOME}/projects/${name}/ROUND.md`, 'utf8'), WF_HOME, name)}`);
}
