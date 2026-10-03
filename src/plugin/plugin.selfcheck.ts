// plugin.selfcheck.ts — node plugin.selfcheck.ts → exit 0 when green.
// Pure arms: the Claude Code copy of an agent (plugin.ts), the plugin's hooks (handoff-hook.ts),
// and that the committed plugin files are what plugin.ts writes and name files that exist.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { forkGap, lastBrief, stopGap } from '../round/handoff-hook.ts';
import { claudeAgent, pluginFiles } from './plugin.ts';
import type { Snapshot } from '../round/next.ts';
import type { Brief } from '../round/state.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const root = WF_ROOT;

// ── an agent's copy
const pi = '---\r\nname: codebase-locator\r\ndescription: Finds WHERE code lives.\r\nmodel: anthropic/claude-sonnet-5\r\ntools: read, bash\r\nauto-exit: true\r\n---\r\n\r\nRead `{{wf}}/process/A.md`.\r\n';
const cc = claudeAgent(pi, 'agents/codebase-locator.md');
check('pi\'s model and tools become Claude Code\'s, with its search tools', cc.includes('model: sonnet') && cc.includes('tools: Read, Bash, Grep, Glob'), cc);
check('pi\'s auto-exit is dropped, name and description kept', !cc.includes('auto-exit') && cc.includes('name: codebase-locator') && cc.includes('description: Finds WHERE code lives.'));
check('wf\'s paths become the plugin root', cc.includes('`${CLAUDE_PLUGIN_ROOT}/process/A.md`'), cc);
check('the copy says where it comes from', cc.includes('Written by plugin.ts from agents/codebase-locator.md'));
check('an agent with no model or tools inherits them', !/^(model|tools):/m.test(claudeAgent('---\nname: w\ndescription: d\n---\nx\n', 'w')));

// ── the committed plugin
for (const [path, text] of pluginFiles()) {
	const committed = existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n') : null;
	check(`${path} is what plugin.ts writes`, committed === text.replace(/\r\n/g, '\n'), committed === null ? 'missing: node src/plugin/plugin.ts' : 'stale: node src/plugin/plugin.ts');
}
const manifest: { name: string; agents: string[]; hooks: string } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
check('plugin.json names agent files that exist', manifest.agents.every((a) => existsSync(join(root, a))), manifest.agents.join());
check('its hooks file exists and calls this repo\'s wf.mjs', readFileSync(join(root, manifest.hooks), 'utf8').includes('${CLAUDE_PLUGIN_ROOT}/wf.mjs'));
// A matcher of letters and hyphens only is an exact match, and a plugin's agent type is
// <plugin>:<name>: `round-worker` never fired (measured 2026-09-27, Claude Code 2.1.280).
const stop = JSON.parse(readFileSync(join(root, manifest.hooks), 'utf8')).hooks.SubagentStop[0];
check('SubagentStop matches the plugin-scoped agent type, anchored', stop.matcher === `^${manifest.name}:round-worker$`, stop.matcher);
// In auto mode the report goes through SubagentHandback, before SubagentStop (BJEW-562, 2026-09-27).
const handback = JSON.parse(readFileSync(join(root, manifest.hooks), 'utf8')).hooks.PreToolUse.find((h: { matcher: string; hooks: { args: string[] }[] }) => h.matcher === 'SubagentHandback');
check('a hand-back is checked too, before it reaches the orchestrator', handback?.hooks[0].args.slice(1).join(' ') === 'handoff check');
const skills = ['round', 'design-session'].map((s) => readFileSync(join(root, 'skills', s, 'SKILL.md'), 'utf8'));
check('the skills name wf\'s files as ${CLAUDE_PLUGIN_ROOT}, no {{wf}} or {{project}} left', skills.every((t) => !t.includes('{{wf}}') && !t.includes('{{project}}')));

// ── the hooks
check('the last brief is the most recent one', lastBrief({ research: { at: '2026-09-27T10:00' } as Brief, 'implement 2': { at: '2026-09-27T11:00' } as Brief })?.key === 'implement 2' && lastBrief({ 'implement 2': { at: 'x' } as Brief })!.n === 2);
const snap = (patch: object) => ({ briefs: {}, files: {}, subjects: [], checks: [], ...patch }) as unknown as Snapshot;
check('a research agent ending with no RESEARCH.md is sent back', stopGap(snap({ briefs: { research: { token: 'aa11', at: '1' } } }))?.startsWith('no RESEARCH.md'));
check('ending with the handoff is allowed', stopGap(snap({ briefs: { research: { token: 'aa11', at: '1' } }, files: { research: '## Repro\ncommand: x\n<!-- brief: aa11 -->' } })) === null);
const plan = '## Commits\n| # | message | files | check |\n| 1 | fix(x): one | a.ts | repro |\n';
check('implement ending with no commit is sent back', stopGap(snap({ briefs: { 'implement 1': { at: '1' } }, files: { plan } }))?.startsWith('commit 1 is not made'));
check('implement ending with BLOCKED.md, or with its row done, is allowed', stopGap(snap({ briefs: { 'implement 1': { at: '1' } }, files: { plan, blocked: 'Question: x' } })) === null && stopGap(snap({ briefs: { 'implement 1': { at: '1' } }, files: { plan }, subjects: ['fix(x): one'], checks: [{ row: 1, result: 'green' }] })) === null);
check('a standards brief\'s key keeps its rule id whole', lastBrief({ 'standards api/errors': { at: '1' } as Brief })?.arg === 'api/errors' && lastBrief({ 'standards api/errors': { at: '1' } as Brief })?.n === null);
const rule = (text: string | null) => snap({ briefs: { 'standards perf': { token: 'dd44', at: '1' } }, standards: [{ id: 'perf', text, fixesAfter: 0 }] });
check('a standards agent ending without its report is sent back, naming the file', stopGap(rule(null))?.startsWith('no standards/perf.md') && stopGap(rule('Result: pass\n## Issues\nnone\n<!-- brief: dd44 -->')) === null);
check('a fork is refused, any other agent is not', forkGap({ tool_input: { subagent_type: 'fork' } })?.startsWith('no forks') && forkGap({ tool_input: { subagent_type: 'wf:round-worker' } }) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
