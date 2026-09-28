// run.mjs — the dispatcher: run(argv, pieces). wf.mjs calls it with the kit's defaults, an env's
// entry with its own pieces plugged into the seams (seams.mjs).
// Commands: next, brief, step, status, new, serve, classify (delegated to ./classify.mjs when installed), design + review
// (human touchpoints), the project's own (project.mjs commands: JewelryX's seed, show) and the env's.
import { plug, seams } from './seams.mjs';

// A wf command that exits non-zero inside a round goes to .wf/events.log, for the line reap prints
// (friction.mjs): a refusal was only in the session's scrollback until 2026-09-28. Its message is the
// last console.error line; the exit handler has to write synchronously.
async function logRefusals(argv) {
	if (['handoff', 'hook', 'update'].includes(argv[0])) return;
	const { refusalLine } = await import('./friction.mjs');
	const { appendFileSync, existsSync } = await import('node:fs');
	const { join } = await import('node:path');
	const { toplevelOf } = await import('./state.mjs');
	let message = '';
	const error = console.error;
	console.error = (...args) => {
		message = args.join(' ');
		error(...args);
	};
	process.on('exit', (code) => {
		const line = refusalLine({ ts: new Date().toISOString(), argv, code, message });
		if (!line) return;
		try {
			const dir = join(toplevelOf(), '.wf');
			if (existsSync(join(dir, 'state.json'))) appendFileSync(join(dir, 'events.log'), `${line}\n`);
		} catch {} // not in a git tree
	});
}

export async function run(argv, pieces = {}) {
	plug(pieces);
	const [cmd, ...rest] = argv;
	// Windows .cmd shims (portless, pnpm) need shell: true, and Node then prints DEP0190 on every spawn
	// that passes args (reap printed it on every run). Every argv wf spawns is one it built itself.
	process.noDeprecation = true;
	await logRefusals(argv);
	// The hooks run whichever wf the plugin carries; the env's own commands are not a round's.
	if (!['handoff', 'hook', 'update'].includes(cmd)) {
		const { entryGap, readState, toplevelOf } = await import('./state.mjs');
		let gap = null;
		try { gap = entryGap(readState(toplevelOf()), seams.madeBy); } catch {} // not in a git tree
		if (gap) {
			console.error(`wf: ${gap}`);
			process.exit(1);
		}
	}
	if (cmd === 'step') {
		const { runStep } = await import('./step.mjs');
		await runStep(rest);
	} else if (cmd === 'new') {
		const { runNew } = await import('./new.mjs');
		await runNew(rest);
	} else if (cmd === 'serve') {
		const { runServe } = await import('./serve.mjs');
		await runServe(rest);
	} else if (cmd === 'status') {
		const { runStatus } = await import('./status.mjs');
		await runStatus(rest);
	} else if (cmd === 'next') {
		const { runNext } = await import('./next.mjs');
		await runNext();
	} else if (cmd === 'notes') {
		const { runNotes } = await import('./notes.mjs');
		runNotes();
	} else if (cmd === 'handoff') {
		const { runHandoff } = await import('./handoff-hook.mjs');
		await runHandoff(rest);
	} else if (cmd === 'brief') {
		const { runBrief } = await import('./brief.mjs');
		runBrief(rest);
	} else if (cmd === 'prompt') {
		const { runPrompt } = await import('./prompt.mjs');
		runPrompt(rest);
	} else if (cmd === 'check') {
		const { runCheck } = await import('./check.mjs');
		runCheck();
	} else if (cmd === 'deliver') {
		const { runDeliver } = await import('./deliver.mjs');
		await runDeliver();
	} else if (cmd === 'ask') {
		const { runAsk } = await import('./ask.mjs');
		await runAsk(rest);
	} else if (cmd === 'decide') {
		const { runDecide } = await import('./ask.mjs');
		await runDecide(rest);
	} else if (cmd === 'reap') {
		const { runReap } = await import('./reap.mjs');
		await runReap(rest);
	} else if (cmd === 'classify') {
		try {
			await import('./classify.mjs');
		} catch (e) {
			if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
			console.log('classify: not installed');
		}
	} else if (cmd === 'design') {
		const { runDesign } = await import('./design.mjs');
		await runDesign(rest);
	} else if (cmd === 'review') {
		const { runReview } = await import('./review.mjs');
		await runReview(rest);
	} else {
		const { commands } = await import('./project.mjs');
		const all = { ...commands, ...seams.commands };
		if (Object.hasOwn(all, cmd)) await all[cmd](rest);
		else {
			console.log(`usage: wf <new|serve|next|brief|notes|handoff|step|prompt|check|deliver|ask|decide|status|reap|classify|design|review|${Object.keys(all).join('|')}> [...]`);
			process.exit(2);
		}
	}
}
