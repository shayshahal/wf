// models.ts — optional helper-profile presets. The round workflow chooses no model: a harness
// owns its model/account routing, while installed helper profiles may translate an effort hint.

export const EFFORTS = ['low', 'medium'] as const;
export type Effort = (typeof EFFORTS)[number];
export type Models = Record<Effort, string>;

// The kit's: Claude Code, where the team runs it (the plugin runs wf.mjs). Claude Code takes an
// alias and resolves it to the newest model of that family the account can use.
export const CLAUDE_CODE_MODELS: Models = { low: 'sonnet', medium: 'opus' };

export const isEffort = (e: string): e is Effort => (EFFORTS as readonly string[]).includes(e);

/** Convert an agent's effort to a model; null removes the effort so the harness inherits its caller. */
export function withModel(text: string, models: Models | null): string {
	return text.replace(/^effort:[ \t]*(\S+)[ \t]*(\r?)$/m, (line, effort: string, cr: string) => {
		if (!isEffort(effort)) throw new Error(`effort: ${effort} is not one of ${EFFORTS.join(', ')}`);
		return models ? `model: ${models[effort]}${cr}` : cr;
	});
}

// wf models: each level, its model on this machine (seams.models) and what the harness makes of it
// (seams.resolveModel, when the machine can ask). These are optional profile hints, not phase
// assignments. Exits 1 when a level matches no model the harness has.
export function runModels(models: Models, resolve: ((model: string) => string | null) | null) {
	let missing = false;
	for (const e of EFFORTS) {
		const resolved = resolve ? resolve(models[e]) : null;
		if (resolve && !resolved) missing = true;
		const said = !resolve ? 'the harness resolves it to the newest of that family the account can use' : resolved ?? 'NOTHING: no model the harness has matches it';
		console.log(`${e.padEnd(7)} ${models[e].padEnd(24)} → ${said}`);
	}
	if (missing) process.exit(1);
}
