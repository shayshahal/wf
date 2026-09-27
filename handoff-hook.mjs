// handoff-hook.mjs — wf handoff <check | no-fork>: the Claude Code plugin's hooks (claude/hooks.json),
// fed the hook's JSON on stdin (kit and env plan, step 5).
//   check    a wf:round-worker handing back (PreToolUse on SubagentHandback) or stopping
//            (SubagentStop): sends it back, once per brief, while the handoff its last brief asked
//            for is missing (handoff.mjs). In auto mode the report goes through SubagentHandback,
//            which reaches the orchestrator before SubagentStop fires: BJEW-562 (2026-09-27), the
//            stop hook sent validate back and it fixed VALIDATION.md, but the orchestrator had
//            already run wf next on the report and asked Shay. pi has no such hook; wf next catches
//            it there one step later.
//   no-fork  PreToolUse on Agent: in a round, a fork is refused. A fork carries the orchestrator's
//            whole conversation, which is what a fresh phase agent exists not to have; a plugin
//            cannot ship the Agent(fork) permission rule (its settings take only agent and
//            subagentStatusLine), but it can ship this hook.
// Outside a round both allow everything.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { handoffGap, rowDone } from './handoff.mjs';
import { snapshotOf } from './next.mjs';
import { planCommitRows } from './prompt.mjs';
import { readState, writeState } from './state.mjs';

// Pure: the most recent brief, as { key, phase, n }, or null.
export function lastBrief(briefs = {}) {
	const [key] = Object.entries(briefs).sort(([, a], [, b]) => String(b.at).localeCompare(String(a.at)))[0] ?? [];
	if (!key) return null;
	const [phase, n] = key.split(' ');
	return { key, phase, n: n ? Number(n) : null };
}

// Pure: null when the round-worker may end, else what it still owes. Its phase is the last brief's.
export function stopGap(s) {
	const last = lastBrief(s.briefs);
	if (!last) return null;
	if (last.phase === 'implement') {
		const row = planCommitRows(s.files.plan ?? '').find((r) => r.n === last.n);
		if (!row || s.files.blocked || rowDone(row, s)) return null;
		return `commit ${last.n} is not made: its row's message, after \`wf check\` is green, or BLOCKED.md if you cannot`;
	}
	const file = { research: 'research', plan: 'plan', 'as-built': 'asBuilt', validate: 'validation' }[last.phase];
	if (!file) return null; // fix-review: its commit is counted by wf next
	const gap = handoffGap(last.phase, s.files[file], s.briefs[last.key]);
	return gap ? `${gap}. Your brief's Handoff section says what to write before you end.` : null;
}

// Pure: why an Agent call is refused, or null.
export function forkGap(input) {
	return input?.tool_input?.subagent_type === 'fork' ? 'no forks in a round: a fork carries this whole conversation. Dispatch a fresh wf:round-worker with the line `wf next` printed (round skill, Dispatch in this harness).' : null;
}

async function stdinJson() {
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	try { return JSON.parse(text); } catch { return {}; }
}

function roundAt(cwd) {
	try {
		const toplevel = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return existsSync(join(toplevel, '.wf', 'state.json')) && readState(toplevel)?.folder ? toplevel : null;
	} catch {
		return null;
	}
}

export async function runHandoff(argv) {
	const input = await stdinJson();
	const toplevel = roundAt(input.cwd ?? process.cwd());
	if (!toplevel) return;
	if (argv[0] === 'check') {
		// Once per brief: a second hand-back or stop goes through, and wf next redispatches (a hook
		// loop would burn the agent). The brief records it, so the two events share the one.
		if (input.stop_hook_active || !/round-worker/.test(input.agent_type ?? '')) return;
		const s = snapshotOf(toplevel);
		const last = lastBrief(s.briefs);
		if (!last || s.briefs[last.key].sent_back) return;
		const gap = stopGap(s);
		if (!gap) return;
		const state = readState(toplevel);
		writeState(toplevel, { briefs: { ...state.briefs, [last.key]: { ...state.briefs[last.key], sent_back: true } } });
		const out = input.hook_event_name === 'PreToolUse'
			? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `not yet: ${gap}` } }
			: { decision: 'block', reason: gap };
		process.stdout.write(JSON.stringify(out));
	} else if (argv[0] === 'no-fork') {
		const gap = forkGap(input);
		if (gap) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: gap } }));
	}
}
