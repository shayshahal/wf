#!/usr/bin/env node
// plugin.ts — node src/plugin/plugin.ts: writes the Claude Code plugin's agents (claude/agents/) from wf's
// own (agents/), which carry pi's names: `model: anthropic/claude-sonnet-5`, `tools: read, bash`,
// pi's `auto-exit`. Claude Code reads `sonnet` and `Read, Bash`. The skills need no copy: they name
// wf's files as ${CLAUDE_PLUGIN_ROOT}, which Claude Code fills and Shay's installer fills too
// (anchor.ts), and a plugin's skills/ folder is always scanned, so a copy would load twice.
// plugin.selfcheck.ts fails while a committed copy differs from what this writes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { anchorToolPaths } from './anchor.ts';
import { name as projectName } from '../project.ts';

const MODELS: Record<string, string> = { 'anthropic/claude-sonnet-5': 'sonnet', 'anthropic/claude-opus-5-5': 'opus' };
const TOOLS: Record<string, string> = { read: 'Read', bash: 'Bash', write: 'Write', edit: 'Edit', subagent: 'Agent' };

// Pure: a pi agent file → its Claude Code copy, named `from` in the header line.
export function claudeAgent(text: string, from: string) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
	if (!m) throw new Error(`${from}: no frontmatter`);
	const fields = m[1].split(/\r?\n/).flatMap((line) => {
		const [, key, value] = /^([\w-]+):\s*(.*)$/.exec(line) ?? [];
		if (key === 'auto-exit') return [];
		if (key === 'model') return MODELS[value.replace(/:.*$/, '')] ? [`model: ${MODELS[value.replace(/:.*$/, '')]}`] : [];
		if (key === 'tools') {
			const tools = value.split(/[\s,]+/).filter(Boolean).map((t) => TOOLS[t] ?? t);
			// Claude Code searches with its own tools; pi's read-only agents grep through bash.
			if (tools.includes('Read')) tools.push('Grep', 'Glob');
			return [`tools: ${tools.join(', ')}`];
		}
		return [line];
	});
	const body = anchorToolPaths(m[2], '${CLAUDE_PLUGIN_ROOT}', projectName);
	return `---\n${fields.join('\n')}\n---\n\n<!-- Written by plugin.ts from ${from}: edit that file, then run node src/plugin/plugin.ts. -->\n\n${body.replace(/^\n+/, '')}`;
}

const root = WF_ROOT;

// Every agent's Claude Code copy: [path, text].
export function pluginFiles() {
	return readdirSync(join(root, 'agents')).filter((f) => f.endsWith('.md')).map((f) => [join('claude', 'agents', f), claudeAgent(readFileSync(join(root, 'agents', f), 'utf8'), `agents/${f}`)]);
}

if (process.argv[1]?.endsWith('plugin.ts')) {
	for (const [path, text] of pluginFiles()) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
		console.log(`wrote ${path}`);
	}
}
