#!/usr/bin/env node
// skill-export.ts — `wf skill export <new-directory>`: write the self-contained skill folder another
// agent harness can load with no wf checkout beside it (Node alone; wf has no runtime packages).
//
// The folder *is* the skill, and the runtime keeps wf's own WF_ROOT-relative layout under scripts/, so
// every module, prompt and process doc is copied as it is and nothing is reimplemented for the export.
// WF_ROOT inside the copy is <folder>/scripts/runtime, so every path a brief or `wf notes` prints
// stays inside the copy (portability audit, 2026-10-19).
//
//   <folder>/SKILL.md          the round skill (canonical skills/round/SKILL.md)
//   <folder>/references/       the material the skill bundles
//   <folder>/scripts/wf.mjs    the entry the harness runs; it finds scripts/runtime/wf.mjs beside it
//   <folder>/scripts/runtime/  wf.mjs, module-only package.json, src/, projects/, prompts/, process/
//
// Left behind: development-only files (every *.selfcheck.* included, src/selfcheck.ts, tsconfig.json,
// eslint.config.js), env/, docs/, the generated Claude plugin copies and hooks, and VCS/installed
// dependency trees. Re-export works from a copy: the canonical round skill is
// <wf root>/skills/round in the checkout and the folder two levels above WF_ROOT (the skill folder
// itself) in an export.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { refuseCaller } from '../refusal.ts';

// The runtime files and folders copied to <destination>/scripts/runtime/, in copy order. These are
// what every current command reads (src/run.ts's dispatch plus WF_ROOT-relative prompts, process docs
// and the project's folder); missing any of them would make the export refuse rather than ship a
// folder whose commands cannot run.
const SKILL_EXPORT_REQUIRED_ENTRIES: readonly string[] = ['wf.mjs', 'prompts', 'process', 'projects', 'src', 'bin'];
// Names never copied out of a runtime folder, whatever a checkout happens to hold.
/** Standard local state and installed dependencies are never portable runtime assets. */
export const SKILL_EXPORT_OMITTED_NAMES: readonly string[] = ['.git', '.delta', '.wf', '.cache', '.claude', '.pi', 'node_modules'];
// The skill files copied from the canonical round skill, relative to its folder. scripts/wf.mjs is the
// wrapper beside the runtime; SKILL.md is the skill the harness loads.
const SKILL_EXPORT_SKILL_ENTRIES: readonly string[] = ['SKILL.md', 'scripts/wf.mjs'];
// Bundled material that may not exist yet: copied whole when the canonical skill carries it.
const SKILL_EXPORT_SKILL_OPTIONAL_ENTRIES: readonly string[] = ['references'];

/** True for the development self-check artifacts the export leaves behind: `src/selfcheck.ts`, `x.selfcheck.ts` and its fixtures. */
export function isSelfcheckArtifact(name: string): boolean {
	return name === 'selfcheck.ts' || name.includes('.selfcheck.');
}

/** True when `child` is `parent` or lives inside it, comparing whole path segments (case-insensitively on Windows). */
export function pathIsInside(parent: string, child: string): boolean {
	const normalize = (p: string) => {
		const abs = resolve(p).replace(/[\\/]+$/, '');
		return process.platform === 'win32' ? abs.toLowerCase() : abs;
	};
	const base = normalize(parent);
	const target = normalize(child);
	return target === base || target.startsWith(base + sep);
}

/** Where the canonical round skill lives for this runtime: `<wf root>/skills/round` in the checkout, else the skill folder two levels above WF_ROOT (the export root). Null when neither holds a SKILL.md. */
export function canonicalSkillSource(wfRoot: string): string | null {
	const candidates = [join(wfRoot, 'skills', 'round'), resolve(wfRoot, '..', '..')];
	return candidates.find((candidate) => existsSync(join(candidate, 'SKILL.md'))) ?? null;
}

/** An expected failure of `wf skill export`, as a value: the CLI prints its message and exits non-zero. */
export type SkillExportFailure =
	| { kind: 'usage'; message: string }
	| { kind: 'source-missing'; message: string }
	| { kind: 'destination-exists'; message: string }
	| { kind: 'destination-overlaps-source'; message: string }
	| { kind: 'write-failed'; message: string };

/** Export success identifies the runnable entry; failures preserve any pre-existing destination. */
export type SkillExportOutcome =
	| { ok: true; destination: string; entry: string; files: number }
	| { ok: false; failure: SkillExportFailure };

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const forwardSlashes = (p: string): string => p.replace(/\\/g, '/');

// Pure: the copy rule for everything under a runtime folder — development artifacts and VCS/dependency
// trees are not part of a runnable kit.
function keptRuntimePath(source: string): boolean {
	const name = basename(source);
	return !isSelfcheckArtifact(name) && !SKILL_EXPORT_OMITTED_NAMES.includes(name) && name !== '.env' && !name.startsWith('.env.');
}

function countFiles(dir: string): number {
	return readdirSync(dir, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1), 0);
}

/**
 * Copy the self-contained skill folder from `wfRoot` to `destination`. Never writes inside the source
 * and never touches an existing destination: expected failures come back as `SkillExportFailure`.
 */
export function exportSkillFolder(wfRoot: string, destination: string): SkillExportOutcome {
	const skillSource = canonicalSkillSource(wfRoot);
	if (!skillSource) {
		const tried = forwardSlashes(join(wfRoot, 'skills', 'round')) + ' and ' + forwardSlashes(resolve(wfRoot, '..', '..'));
		return { ok: false, failure: { kind: 'source-missing', message: `no round skill to export: neither ${tried} holds a SKILL.md — run this from the wf checkout or from an exported skill folder` } };
	}
	const dest = resolve(destination);
	for (const root of [wfRoot, skillSource]) {
		if (pathIsInside(root, dest) || pathIsInside(dest, root)) {
			return { ok: false, failure: { kind: 'destination-overlaps-source', message: `${forwardSlashes(dest)} overlaps the source (${forwardSlashes(resolve(root))}): name a directory outside it, so the copy cannot overwrite or contain what it reads` } };
		}
	}
	if (existsSync(dest)) {
		return { ok: false, failure: { kind: 'destination-exists', message: `${forwardSlashes(dest)} already exists; the export never writes into an existing directory — name a new path` } };
	}
	for (const entry of SKILL_EXPORT_SKILL_ENTRIES) {
		if (!existsSync(join(skillSource, entry))) return { ok: false, failure: { kind: 'source-missing', message: `${forwardSlashes(join(skillSource, entry))} is missing: the canonical round skill is incomplete` } };
	}
	for (const entry of SKILL_EXPORT_REQUIRED_ENTRIES) {
		if (!existsSync(join(wfRoot, entry))) return { ok: false, failure: { kind: 'source-missing', message: `${forwardSlashes(join(wfRoot, entry))} is missing: the runtime wf runs on is incomplete` } };
	}
	let created = false;
	try {
		// Non-recursive: it fails instead of silently merging when the path appeared since the check
		// above, so an existing destination is never written into.
		mkdirSync(dest);
		created = true;
		const scripts = join(dest, 'scripts');
		const runtime = join(scripts, 'runtime');
		mkdirSync(scripts);
		mkdirSync(runtime);
		copyFileSync(join(skillSource, 'SKILL.md'), join(dest, 'SKILL.md'));
		// Bind the bootstrap once. Re-export preserves that binding, so incomplete copies cannot
		// accidentally import a different checkout's entry (2026-10-19 shadow-entry regression).
		const wrapper = readFileSync(join(skillSource, 'scripts', 'wf.mjs'), 'utf8')
			.replace("const RUNTIME_ENTRY = '../../../wf.mjs';", "const RUNTIME_ENTRY = './runtime/wf.mjs';");
		writeFileSync(join(scripts, 'wf.mjs'), wrapper);
		// Only the module boundary is needed, including under a CommonJS host. Development
		// dependencies and checkout package metadata do not belong in an exported skill.
		writeFileSync(join(runtime, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
		for (const entry of SKILL_EXPORT_SKILL_OPTIONAL_ENTRIES) {
			const from = join(skillSource, entry);
			if (existsSync(from)) cpSync(from, join(dest, entry), { recursive: true, filter: keptRuntimePath });
		}
		for (const entry of SKILL_EXPORT_REQUIRED_ENTRIES) {
			const from = join(wfRoot, entry);
			const to = join(runtime, entry);
			if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true, filter: keptRuntimePath });
			else copyFileSync(from, to);
		}
		return { ok: true, destination: dest, entry: forwardSlashes(join(scripts, 'wf.mjs')), files: countFiles(dest) };
	} catch (e) {
		// A half-written folder would meet the next attempt as an existing destination, so the one this
		// call created is removed; the caller's path is left as it was found.
		if (created) rmSync(dest, { recursive: true, force: true });
		return { ok: false, failure: { kind: 'write-failed', message: `could not write ${forwardSlashes(dest)}: ${errorText(e)}` } };
	}
}

/** `wf skill export <new-directory>`; argv is `['export', <directory>]`. Prints where the copy is and how to run it; a refusal exits 2. */
export function runSkillExport(argv: string[]): void {
	const [command, destination, ...extra] = argv;
	if (command !== 'export' || !destination || extra.length) {
		console.error('usage: wf skill export <new-directory>');
		refuseCaller();
	}
	const outcome = exportSkillFolder(WF_ROOT, destination);
	if (!outcome.ok) {
		console.error(`wf skill export: ${outcome.failure.message}`);
		refuseCaller();
	}
	const folder = forwardSlashes(outcome.destination);
	console.log(`wf skill export: wrote ${outcome.files} files to ${folder}`);
	console.log(`  skill: ${folder}/SKILL.md`);
	console.log(`  run it as: node "${outcome.entry}" <command>`);
}

if (process.argv[1]?.endsWith('skill-export.ts')) runSkillExport(process.argv.slice(2));
