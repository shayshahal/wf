// handoff.mjs — what a phase hands the next one, and whether it is the current one (kit and env
// plan, step 4). A phase agent is dispatched with one line that runs `wf brief <phase>`; the brief
// records a token in .wf/state.json `briefs`, and the file the phase writes ends with it:
//   <!-- brief: 3f9a1c -->
// So a file is the answer to the last brief, not an earlier attempt's or one written by hand, and
// the agent read wf's own text: a brief once went out as the literal `$(cat /tmp/r1.txt)`
// (2026-09-27). Implement and fix-review hand off a commit (its row's message, a green `wf check`).
import { randomBytes } from 'node:crypto';
import { reproCommand } from './check.mjs';
import { planCommitRows } from './prompt.mjs';

export const newToken = () => randomBytes(3).toString('hex');

// The key a brief is recorded under: the phase, and the row for implement.
export const briefKey = (phase, n) => (phase === 'implement' ? `implement ${n}` : phase);

// The file each phase writes, in the round folder.
export const HANDOFF_FILES = { research: 'RESEARCH.md', plan: 'PLAN.md', 'as-built': 'proof/CALL-STACK-AS-BUILT.md', validate: 'VALIDATION.md' };

export const tokenLine = (token) => `<!-- brief: ${token} -->`;

// Pure: the last brief token in a file, or null.
export function tokenOf(text) {
	return [...(text ?? '').matchAll(/<!--\s*brief:\s*([0-9a-f]+)\s*-->/g)].at(-1)?.[1] ?? null;
}

// Pure: `matches plan` | `deviates` | null, from VALIDATION.md's Verdict line.
export function validationVerdict(text) {
	return /^Verdict:[ \t]*(matches plan|deviates)\b/m.exec((text ?? '').replace(/\r\n/g, '\n'))?.[1] ?? null;
}

// Pure: null when `text` is the phase's current handoff, else why not. `brief` is the recorded
// brief ({ token }) or undefined: a round begun before briefs (or a file a person wrote on
// purpose, with no brief) is judged on its sections alone.
export function handoffGap(phase, text, brief) {
	const file = HANDOFF_FILES[phase];
	if (text == null) return `no ${file}`;
	const token = tokenOf(text);
	if (brief && token !== brief.token) return `${file} is not the answer to the last brief (it carries ${token ?? 'no token'}, the brief was ${brief.token})`;
	if (phase === 'research' && !reproCommand(text)) return 'RESEARCH.md ## Repro has no `command:` line';
	if (phase === 'plan' && !planCommitRows(text).length) return 'PLAN.md ## Commits has no rows';
	if (phase === 'validate' && !validationVerdict(text)) return 'VALIDATION.md has no `Verdict: matches plan | deviates` line';
	return null;
}

// Pure: PLAN.md's Class line, or null.
export function planClass(text) {
	return /^Class:[ \t]*([ABC])\b/m.exec((text ?? '').replace(/\r\n/g, '\n'))?.[1] ?? null;
}

// Pure: PLAN.md's Asks, one `- <question> — default: <default>` line each (prompts/plan.md). A line
// saying none, or no section, is no Asks.
export function planAsks(text) {
	const section = /^## Asks[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec((text ?? '').replace(/\r\n/g, '\n'))?.[1] ?? '';
	return section.split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''))
		.filter((l) => !/^(none|\(none\)|—|-)\.?$/i.test(l))
		.map((l) => {
			const m = /^(.*?)\s*[—–-]+\s*default:\s*(.+)$/i.exec(l);
			return m ? { text: m[1].trim(), dflt: m[2].trim() } : { text: l, dflt: null };
		});
}

// Pure: the row's message as a commit subject: backticks and surrounding space dropped.
export const rowSubject = (row) => row.message.replace(/^`|`$/g, '').trim();

// Pure: row n is done when a commit since the base has its message and `wf check` was green on it
// (.wf/checks.log lines, parsed). The check is the record the validate agent reads too.
export function rowDone(row, { subjects, checks }) {
	return subjects.includes(rowSubject(row)) && checks.some((c) => c.row === row.n && c.result === 'green');
}
