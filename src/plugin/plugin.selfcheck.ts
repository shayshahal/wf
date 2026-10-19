// plugin.selfcheck.ts — node plugin.selfcheck.ts → exit 0 when green.
// Pure arms: optional Claude Code agent copies and the portable skill installation,
// and that the committed plugin files are what plugin.ts writes and name files that exist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { claudeAgent, pluginFiles } from './plugin.ts';

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
const manifest: { name: string; agents: string[]; hooks?: string } = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
check('plugin.json names agent files that exist', manifest.agents.every((a) => existsSync(join(root, a))), manifest.agents.join());
check('plugin.json names every agent', pluginFiles().every(([path]) => manifest.agents.includes(`./${path.replace(/\\/g, '/')}`)), manifest.agents.join());
check('the plugin adds no mandatory dispatch or handback hooks', manifest.hooks === undefined);
const skills = ['round', 'design-session', 'show-me'].map((s) => readFileSync(join(root, 'skills', s, 'SKILL.md'), 'utf8'));
check('skill entry points need no harness-specific path expansion', skills.every((t) => !t.includes('{{wf}}') && !t.includes('{{project}}') && !t.includes('${CLAUDE_PLUGIN_ROOT}')));
// The public skills are installed at `~/.local/share/wf/skills/<dir>`, and PI's `settings.json`
// registers each installed path (`README.md` step 4). A rename that moves the folder without moving
// the registered path dangles it, and the skill stops loading (2026-10-10, #114: a `design-session`
// registered path met no folder after the folder became `agreement-session`, so T1 never loaded the
// skill). Keep the folder and the frontmatter name together.
for (const e of readdirSync(join(root, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
	const text = readFileSync(join(root, 'skills', e.name, 'SKILL.md'), 'utf8');
	check(`skills/${e.name} declares name: ${e.name}`, new RegExp(`^name: ${e.name}$`, 'm').test(text));
}
// BJEW-461 (2026-10-06): the round skill sent harness trouble to a `scout`, a pi agent of Shay's on another model.
// Every text an agent of wf's reads: the skills, the prompts, the process docs, the agents themselves.
const texts = ['skills', 'prompts', 'process', 'agents', 'projects'].flatMap((d) => readdirSync(join(root, d), { recursive: true, encoding: 'utf8' })
	.filter((f) => /\.md(?:\.in)?$/.test(f)).map((f) => ({ file: `${d}/${f.replace(/\\/g, '/')}`, text: readFileSync(join(root, d, f), 'utf8') })));
const dispatched = texts.flatMap(({ text }) => [...text.matchAll(/agent: "([\w-]+)"|subagent_type: "wf:([\w-]+)"/g)].map((m) => m[1] ?? m[2]));
check('the workflow prescribes no harness-specific agent dispatch', dispatched.length === 0, dispatched.join());
// pi's general agents (scout, planner, worker, reviewer): a text that names one sends an agent to it.
const general = texts.filter(({ text }) => /\bscout\b|`(planner|worker|reviewer)`/i.test(text)).map(({ file }) => file);
check('wf\'s texts name none of pi\'s general agents', general.length === 0, general.join());

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
