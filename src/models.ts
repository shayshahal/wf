// models.ts — wf models: what each phase needs, as an effort level, and the model this machine runs
// it on. A phase names how hard its work is, never a model: the model is the machine's (seams.ts
// `models`), so a new model is one line there, and the kit's agent files and prompts never change
// (Amp's dial, 2026-10-03: "the meaning of each position stays the same" while the routing changes).
// Model ids had been in the agent files in pi's form, which Claude Code does not read
// (portability audit, 2026-09-27), and in the round skill's dispatch table for each harness.
//   low     a well-defined job against a written rubric: the read-only judges and research's searchers;
//           and the harness-fixer, whose task comes with its evidence and a red-then-green proof (Shay,
//           2026-10-06: sonnet for it)
//   medium  work where the agent fills in steps: research, plan, a commit, a fix
// Which models a machine has is the harness's to know: each level names an alias or a pattern
// the harness resolves to the newest model of that family it can use (`wf models` shows it).

export const EFFORTS = ['low', 'medium'] as const;
export type Effort = (typeof EFFORTS)[number];
export type Models = Record<Effort, string>;

// The kit's: Claude Code, where the team runs it (the plugin runs wf.mjs). Claude Code takes an
// alias and resolves it to the newest model of that family the account can use.
export const CLAUDE_CODE_MODELS: Models = { low: 'sonnet', medium: 'opus' };

// What each phase `wf next` dispatches needs.
export const PHASE_EFFORT: Record<string, Effort> = {
	// The smaller route (#111): agree writes the working agreement (consequential work needs T1's
	// informed decision), build implements it, assess is one independent read-only judgement (#113).
	agree: 'medium',
	build: 'medium',
	assess: 'medium',
};

export const isEffort = (e: string): e is Effort => (EFFORTS as readonly string[]).includes(e);

// Pure: the model a phase runs on, from a machine's levels.
export const modelFor = (phase: string, models: Models) => models[PHASE_EFFORT[phase] ?? 'medium'];

// Pure: an agent file (agents/) with its `effort:` line made the machine's `model:` line. An agent
// with no effort line inherits its caller's model, as before.
export function withModel(text: string, models: Models): string {
	return text.replace(/^effort:[ \t]*(\S+)[ \t]*(\r?)$/m, (line, effort: string, cr: string) => {
		if (!isEffort(effort)) throw new Error(`effort: ${effort} is not one of ${EFFORTS.join(', ')}`);
		return `model: ${models[effort]}${cr}`;
	});
}

// wf models: each level, its model on this machine (seams.models) and what the harness makes of it
// (seams.resolveModel, when the machine can ask), then each phase's level. Exits 1 when a level
// matches no model the harness has.
export function runModels(models: Models, resolve: ((model: string) => string | null) | null) {
	let missing = false;
	for (const e of EFFORTS) {
		const resolved = resolve ? resolve(models[e]) : null;
		if (resolve && !resolved) missing = true;
		const said = !resolve ? 'the harness resolves it to the newest of that family the account can use' : resolved ?? 'NOTHING: no model the harness has matches it';
		console.log(`${e.padEnd(7)} ${models[e].padEnd(24)} → ${said}`);
	}
	console.log(`\n${Object.entries(PHASE_EFFORT).map(([p, e]) => `${p} ${e}`).join(' · ')}`);
	if (missing) process.exit(1);
}
