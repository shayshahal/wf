// plugin.selfcheck.ts — node plugin.selfcheck.ts → exit 0 when green.
// Pure arms: the Claude Code copy of an agent (plugin.ts), the plugin's hooks (handoff-hook.ts),
// and that the committed plugin files are what plugin.ts writes and name files that exist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { forkGap, stopGap } from '../round/handoff-hook.ts';
import { claudeAgent, pluginFiles } from './plugin.ts';
import type { State } from '../round/state.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);
const root = WF_ROOT;

// ── an agent's copy
const pi = '---\r\nname: codebase-locator\r\ndescription: Finds WHERE code lives.\r\neffort: low\r\ntools: read, bash\r\nauto-exit: true\r\n---\r\n\r\nRead `{{wf}}/process/A.md`.\r\n';
const cc = claudeAgent(pi, 'agents/codebase-locator.md');
check('the effort level becomes the kit\'s model, pi\'s tools Claude Code\'s with its search tools', cc.includes('model: sonnet') && cc.includes('tools: Read, Bash, Grep, Glob'), cc);
check('pi\'s auto-exit is dropped, name and description kept', !cc.includes('auto-exit') && cc.includes('name: codebase-locator') && cc.includes('description: Finds WHERE code lives.'));
check('wf\'s paths become the plugin root', cc.includes('`${CLAUDE_PLUGIN_ROOT}/process/A.md`'), cc);
check('the copy says where it comes from', cc.includes('Written by plugin.ts from agents/codebase-locator.md'));
check('an unknown effort level is refused, not dropped', (() => { try { claudeAgent('---\nname: w\neffort: max\n---\nx\n', 'w'); return false; } catch (e) { return (e as Error).message.includes('effort: max'); } })());
check('an agent with no model or tools inherits them', !/^(model|tools):/m.test(claudeAgent('---\nname: w\ndescription: d\n---\nx\n', 'w')));

// ── the committed plugin
for (const [path, text] of pluginFiles()) {
	const committed = existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n') : null;
	check(`${path} is what plugin.ts writes`, committed === text.replace(/\r\n/g, '\n'), committed === null ? 'missing: node src/plugin/plugin.ts' : 'stale: node src/plugin/plugin.ts');
}
const manifest: { name: string; agents: string[]; hooks: string } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
check('plugin.json names agent files that exist', manifest.agents.every((a) => existsSync(join(root, a))), manifest.agents.join());
check('plugin.json names every agent', pluginFiles().every(([path]) => manifest.agents.includes(`./${path.replace(/\\/g, '/')}`)), manifest.agents.join());
check('its hooks file exists and calls this repo\'s wf.mjs', readFileSync(join(root, manifest.hooks), 'utf8').includes('${CLAUDE_PLUGIN_ROOT}/wf.mjs'));
// A matcher of letters and hyphens only is an exact match, and a plugin's agent type is
// <plugin>:<name>: `round-worker` never fired (measured 2026-09-27, Claude Code 2.1.280).
const stop = JSON.parse(readFileSync(join(root, manifest.hooks), 'utf8')).hooks.SubagentStop[0];
check('SubagentStop matches the plugin-scoped agent type, anchored', stop.matcher === `^${manifest.name}:round-worker$`, stop.matcher);
// In auto mode the report goes through SubagentHandback, before SubagentStop (BJEW-562, 2026-09-27).
const handback = JSON.parse(readFileSync(join(root, manifest.hooks), 'utf8')).hooks.PreToolUse.find((h: { matcher: string; hooks: { args: string[] }[] }) => h.matcher === 'SubagentHandback');
check('a hand-back is checked too, before it reaches the orchestrator', handback?.hooks[0].args.slice(1).join(' ') === 'handoff check');
const skills = ['round', 'agreement-session'].map((s) => readFileSync(join(root, 'skills', s, 'SKILL.md'), 'utf8'));
check('the skills name wf\'s files as ${CLAUDE_PLUGIN_ROOT}, no {{wf}} or {{project}} left', skills.every((t) => !t.includes('{{wf}}') && !t.includes('{{project}}')));
// BJEW-461 (2026-10-06): the round skill sent harness trouble to a `scout`, a pi agent of Shay's on another model.
// Every text an agent of wf's reads: the skills, the prompts, the process docs, the agents themselves.
const texts = ['skills', 'prompts', 'process', 'agents', 'projects'].flatMap((d) => readdirSync(join(root, d), { recursive: true, encoding: 'utf8' })
	.filter((f) => f.endsWith('.md')).map((f) => ({ file: `${d}/${f.replace(/\\/g, '/')}`, text: readFileSync(join(root, d, f), 'utf8') })));
const dispatched = texts.flatMap(({ text }) => [...text.matchAll(/agent: "([\w-]+)"|subagent_type: "wf:([\w-]+)"/g)].map((m) => m[1] ?? m[2]));
check('wf\'s texts dispatch only wf\'s own agents', dispatched.length > 0 && dispatched.every((a) => existsSync(join(root, 'agents', `${a}.md`))), dispatched.join());
// pi's general agents (scout, planner, worker, reviewer): a text that names one sends an agent to it.
const general = texts.filter(({ text }) => /\bscout\b|`(planner|worker|reviewer)`/i.test(text)).map(({ file }) => file);
check('wf\'s texts name none of pi\'s general agents', general.length === 0, general.join());

// ── the hooks: the round-worker is sent back once per step while its phase owes a handoff
const st = (patch: Partial<State>): State => ({ step: 'agree', class: 'A', folder: 'bug-reports/r', ...patch });
const noFiles = { agreement: null, assessment: null, blocked: false, commits: false };
check('an agree worker ending with no TICKET.md is sent back', (stopGap(st({}), noFiles) ?? '').includes('TICKET.md'));
check('agree with ## Intent is allowed', stopGap(st({}), { ...noFiles, agreement: '# t\n## Intent\n- x\n' }) === null);
check('a B/C agree with a complete agreement is allowed', stopGap(st({ class: 'B' }), { ...noFiles, agreement: '## Observed\n- x\n\n## Agreed\n- y\n\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | a | a.ts | a.ts::a@1 |\n' }) === null);
check('a B/C agree missing ## Agreed is sent back', (stopGap(st({ class: 'B' }), { ...noFiles, agreement: '## Observed\n- x\n' }) ?? '').includes('## Agreed'));
check('a build worker ending with no commit is sent back to finish', (stopGap(st({ step: 'build' }), noFiles) ?? '').includes('wf step assess'));
check('a build worker with a commit, or BLOCKED.md, is allowed', stopGap(st({ step: 'build' }), { ...noFiles, commits: true }) === null && stopGap(st({ step: 'build' }), { ...noFiles, blocked: true }) === null);
check('an assess worker with no ASSESSMENT.md is sent back', (stopGap(st({ step: 'assess' }), { ...noFiles, commits: true }) ?? '').includes('ASSESSMENT.md'));
check('an assess worker with no verdict is sent back', (stopGap(st({ step: 'assess' }), { ...noFiles, assessment: '## Intent\n- x\n', commits: true }) ?? '').includes('Verdict'));
check('an assess worker with a valid assessment is allowed', stopGap(st({ step: 'assess' }), { ...noFiles, assessment: 'Verdict: clean\nhead: h\n## Intent\n- "x": met: a.ts:1 · before: r · after: g\n', commits: true }) === null);
check('one hand-back per step: the marker stops a loop', stopGap(st({ step: 'agree', handoff_sent_back: 'agree' }), noFiles) === null);
check('a fork is refused, any other agent is not', forkGap({ tool_input: { subagent_type: 'fork' } })?.startsWith('no forks') && forkGap({ tool_input: { subagent_type: 'wf:round-worker' } }) === null);
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
