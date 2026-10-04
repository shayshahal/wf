// run.ts — the dispatcher: run(argv, pieces). wf.mjs calls it with the kit's defaults, an env's
// entry with its own pieces plugged into the seams (seams.ts).
// Commands: next, brief, step, status, new, serve, check, standards, models, classify (delegated to ./gates/classify.ts when installed), design + review
// (human touchpoints), the project's own (project.ts commands: JewelryX's seed, show) and the env's.
import { plug, seams } from './seams.ts';
import type { Command, Seams } from './seams.ts';

// A wf command that exits non-zero inside a round goes to .wf/events.log, for the line reap prints
// (friction.ts): a refusal was only in the session's scrollback until 2026-09-28. Its message is the
// last console.error line; the exit handler has to write synchronously.
async function logRefusals(argv: string[]) {
	if (['handoff', 'hook', 'update'].includes(argv[0])) return;
	const { refusalLine } = await import('./round/friction.ts');
	const { appendFileSync, existsSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { toplevelOf } = await import('./round/state.ts');
	let message = '';
	const error = console.error;
	console.error = (...args: unknown[]) => {
		message = args.join(' ');
		error(...args);
	};
	process.on('exit', (code) => {
		const line = refusalLine({ ts: new Date().toISOString(), argv, code, message });
		if (!line) return;
		try {
			const dir = join(toplevelOf(), '.wf');
			if (existsSync(join(dir, 'state.json'))) appendFileSync(join(dir, 'events.log'), `${line}\n`);
		} catch { /* not in a git tree: no round to log for */ }
	});
}

export async function run(argv: string[], pieces: Partial<Seams> = {}) {
	plug(pieces);
	const [cmd, ...rest] = argv;
	// Windows .cmd shims (portless, pnpm) need shell: true, and Node then prints DEP0190 on every spawn
	// that passes args (reap printed it on every run). Every argv wf spawns is one it built itself.
	process.noDeprecation = true;
	await logRefusals(argv);
	// The hooks run whichever wf the plugin carries; the env's own commands are not a round's.
	if (!['handoff', 'hook', 'update'].includes(cmd)) {
		const { entryGap, readState, toplevelOf } = await import('./round/state.ts');
		let gap = null;
		try { gap = entryGap(readState(toplevelOf()), seams.madeBy); } catch { /* not in a git tree: no round to check the entry of */ }
		if (gap) {
			console.error(`wf: ${gap}`);
			process.exit(1);
		}
	}
	if (cmd === 'step') {
		const { runStep } = await import('./round/step.ts');
		await runStep(rest);
	} else if (cmd === 'new') {
		const { runNew } = await import('./worktrees/new.ts');
		await runNew(rest);
	} else if (cmd === 'serve') {
		const { runServe } = await import('./worktrees/serve.ts');
		await runServe(rest);
	} else if (cmd === 'status') {
		const { runStatus } = await import('./round/status.ts');
		await runStatus(rest);
	} else if (cmd === 'next') {
		const { runNext } = await import('./round/next.ts');
		await runNext();
	} else if (cmd === 'notes') {
		const { runNotes } = await import('./round/notes.ts');
		runNotes();
	} else if (cmd === 'handoff') {
		const { runHandoff } = await import('./round/handoff-hook.ts');
		await runHandoff(rest);
	} else if (cmd === 'brief') {
		const { runBrief } = await import('./round/brief.ts');
		await runBrief(rest);
	} else if (cmd === 'prompt') {
		const { runPrompt } = await import('./round/prompt.ts');
		runPrompt(rest);
	} else if (cmd === 'check') {
		const { runCheck, runRepro } = await import('./gates/check.ts');
		if (rest.includes('--repro')) await runRepro();
		else await runCheck();
	} else if (cmd === 'models') {
		const { runModels } = await import('./models.ts');
		runModels(seams.models, seams.resolveModel);
	} else if (cmd === 'standards') {
		const { runStandards } = await import('./gates/standards.ts');
		runStandards();
	} else if (cmd === 'deliver') {
		const { runDeliver } = await import('./gates/deliver.ts');
		await runDeliver();
	} else if (cmd === 'ask') {
		const { runAsk } = await import('./round/ask.ts');
		await runAsk(rest);
	} else if (cmd === 'decide') {
		const { runDecide } = await import('./round/ask.ts');
		await runDecide(rest);
	} else if (cmd === 'reap') {
		const { runReap } = await import('./worktrees/reap.ts');
		await runReap(rest);
	} else if (cmd === 'classify') {
		try {
			await import('./gates/classify.ts');
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw e;
			console.log('classify: not installed');
		}
	} else if (cmd === 'design') {
		const { runDesign } = await import('./gates/design.ts');
		await runDesign(rest);
	} else if (cmd === 'review') {
		const { runReview } = await import('./gates/review.ts');
		await runReview(rest);
	} else {
		const { commands } = await import('./project.ts');
		const all: Record<string, Command> = { ...commands, ...seams.commands };
		if (Object.hasOwn(all, cmd)) await all[cmd](rest);
		else {
			console.log(`usage: wf <new|serve|next|brief|notes|handoff|step|prompt|check|standards|models|deliver|ask|decide|status|reap|classify|design|review|${Object.keys(all).join('|')}> [...]`);
			process.exit(2);
		}
	}
}
