// anchor.mts — skills, agents and docs are read as they are, from whatever worktree the agent is in.
// A round's worktree does not hold wf, so the text names wf's own files as {{wf}}/… (prompts, docs)
// or ${CLAUDE_PLUGIN_ROOT}/… (the skills, which Claude Code fills itself when it loads them from the
// plugin), and the project's notes as {{project}}/…. `wf prompt` fills them per prompt, and an env's
// installer fills them in the copy it installs.

// Pure: {{wf}} and ${CLAUDE_PLUGIN_ROOT} → `home`, {{project}} → `home`/projects/<project>, with
// forward slashes.
export function anchorToolPaths(text: string, home: string, project?: string) {
	const h = home.replace(/\\/g, '/');
	return text.split('{{project}}').join(`${h}/projects/${project}`).split('{{wf}}').join(h).split('${CLAUDE_PLUGIN_ROOT}').join(h);
}
