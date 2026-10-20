#!/usr/bin/env node
// skill-export.selfcheck.ts — node src/skill/skill-export.selfcheck.ts → exit 0 when green.
// Pure arms cover the copy rules (which names are left behind, source/destination overlap, where the
// canonical skill is). The real arms exercise the exported folder at the interface a harness uses:
// `node "<folder>/scripts/wf.mjs" <command>` in a temp path with spaces, a local git fixture for
// `wf next`/`wf brief`, a delivery refusal, relocation, and a re-export from the copy.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { name as projectName } from '../project.ts';
import { canonicalSkillSource, exportSkillFolder, isSelfcheckArtifact, pathIsInside, SKILL_EXPORT_OMITTED_NAMES } from './skill-export.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// Git runs a hook with GIT_DIR set, and a check's temp repo would then work on this clone (the same
// reason src/selfcheck.ts strips them for its children).
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const nodeRun = (args: string[], cwd?: string) => spawnSync(process.execPath, args, { encoding: 'utf8', cwd, env });
const gitRun = (dir: string, args: string[]) => spawnSync('git', ['-C', dir, '-c', 'user.email=wf@selfcheck', '-c', 'user.name=wf', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', env });
const forward = (p: string) => p.replace(/\\/g, '/');
// Git's CRLF warnings fill a failing arm's detail with noise; the refusal or the prompt is the news.
const tail = (r: { status: number | null; stdout: string; stderr: string }) => `exit ${r.status}: ${(r.stdout + r.stderr).split('\n').filter((l) => !l.startsWith('warning: in the working copy')).join(' ').replace(/\s+/g, ' ').trim().slice(0, 300)}`;
const allFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)]));
const namesSourceCheckout = (text: string) => text.includes(forward(WF_ROOT)) || text.includes(WF_ROOT);
// The failure kind of an outcome, without narrowing every inline call site.
const failureKind = (outcome: ReturnType<typeof exportSkillFolder>): string => (outcome.ok ? 'none' : outcome.failure.kind);

const SKILL_MD = '---\nname: round\ndescription: the round skill\n---\n\n# Round\n\nRun a round.\n';

// ── pure arms ────────────────────────────────────────────────────────────────
check('selfcheck artifacts are left behind', [isSelfcheckArtifact('selfcheck.ts'), isSelfcheckArtifact('x.selfcheck.ts'), isSelfcheckArtifact('x.selfcheck.json')].every(Boolean));
check('ordinary files are not', !isSelfcheckArtifact('checks.ts') && !isSelfcheckArtifact('selfchecker.ts'));
check('a folder is inside itself and its children, not its siblings', pathIsInside('/a/b', '/a/b') && pathIsInside('/a/b', '/a/b/c') && !pathIsInside('/a/b', '/a/bc'));
check('the canonical skill is skills/round in the checkout', canonicalSkillSource(WF_ROOT) === join(WF_ROOT, 'skills', 'round'), String(canonicalSkillSource(WF_ROOT)));

// ── a synthetic source tree: the copy rules without the real checkout ────────
const synthetic = (root: string) => {
	for (const dir of ['skills/round/references', 'skills/round/scripts', 'prompts', 'process', 'projects/fixture', 'src/gates', 'src/skill', 'agents', 'env/adapters', 'docs/plans', 'claude/agents', '.claude-plugin', 'node_modules/x', '.git', '.delta']) mkdirSync(join(root, dir), { recursive: true });
	writeFileSync(join(root, 'skills/round/SKILL.md'), SKILL_MD);
	writeFileSync(join(root, 'skills/round/references/rules.md'), '# rules\n');
	writeFileSync(join(root, 'skills/round/scripts/wf.mjs'), 'export {};\n');
	writeFileSync(join(root, 'wf.mjs'), 'export {};\n');
	writeFileSync(join(root, 'package.json'), '{"type":"module","devDependencies":{"not-for-distribution":"1"}}\n');
	for (const [file, text] of [['prompts/agree.md.in', '# agree\n'], ['process/CLASSES.md', '# classes\n'], ['projects/fixture/index.ts', 'export {};\n'], ['src/gates/check.ts', 'export {};\n'], ['src/skill/skill-export.ts', 'export {};\n'], ['agents/round-worker.md', '# worker\n'], ['src/selfcheck.ts', 'export {};\n'], ['src/gates/check.selfcheck.ts', 'export {};\n'], ['src/gates/fixture.selfcheck.json', '{}\n'], ['tsconfig.json', '{}\n'], ['env/adapters/herdr.ts', 'export {};\n'], ['docs/plans/x.md', '# x\n'], ['claude/agents/round-worker.md', '# generated\n'], ['.claude-plugin/plugin.json', '{}\n'], ['node_modules/x/index.js', 'export {};\n'], ['.git/HEAD', 'ref: refs/heads/x\n'], ['.delta/scratch.md', '# scratch\n'], ['projects/fixture/.env', 'private configuration\n']] as const) writeFileSync(join(root, file), text);
};

// ── the real checkout: export, run, relocate, re-export ─────────────────────
const temp = mkdtempSync(join(tmpdir(), 'wf skill export '));
try {
	// A source tree that is not the real checkout, for the rules that do not need the runtime.
	const syntheticRoot = join(temp, 'synthetic source');
	synthetic(syntheticRoot);
	const syntheticOut = exportSkillFolder(syntheticRoot, join(temp, 'synthetic output'));
	const syntheticFiles = syntheticOut.ok ? allFiles(syntheticOut.destination).map((f) => relative(syntheticOut.destination, f)).map(forward) : [];
	const noSkill = exportSkillFolder(join(temp, 'no skill here'), join(temp, 'unused'));
	check('the export refuses a source with no skill folder', !noSkill.ok && noSkill.failure.kind === 'source-missing', noSkill.ok ? 'ok' : noSkill.failure.kind);
	check('a synthetic source exports its skill and runtime', syntheticOut.ok, syntheticOut.ok ? '' : syntheticOut.failure.message);
	check('it keeps SKILL.md, references/ and the wrapper', ['SKILL.md', 'references/rules.md', 'scripts/wf.mjs'].every((f) => syntheticFiles.includes(f)), syntheticFiles.join(' '));
	check('it keeps the runtime entries the commands read', ['scripts/runtime/wf.mjs', 'scripts/runtime/package.json', 'scripts/runtime/prompts/agree.md.in', 'scripts/runtime/process/CLASSES.md', 'scripts/runtime/projects/fixture/index.ts', 'scripts/runtime/src/gates/check.ts'].every((f) => syntheticFiles.includes(f)), syntheticFiles.join(' '));
	check('it leaves selfchecks and their fixtures behind', !syntheticFiles.some((f) => f.includes('.selfcheck.') || f.endsWith('runtime/src/selfcheck.ts')), syntheticFiles.filter((f) => f.includes('selfcheck')).join(' '));
	check('it leaves env, docs, the Claude copies, tsconfig and VCS/dependency trees behind', !syntheticFiles.some((f) => /(^|\/)(env|docs|claude|\.claude-plugin|node_modules|\.git|\.delta)\//.test(f) || f === 'tsconfig.json'), syntheticFiles.filter((f) => /env|docs|claude|node_modules|\.git|tsconfig/.test(f)).join(' '));
	check('private environment files are not distributed', !syntheticFiles.some((file) => file.endsWith('/.env')));
	check('the runtime manifest has no development dependencies', !readFileSync(join(temp, 'synthetic output/scripts/runtime/package.json'), 'utf8').includes('devDependencies'));
	check('optional harness agent profiles are not required or distributed', !syntheticFiles.some((file) => file.startsWith('scripts/runtime/agents/')));
	check('a destination inside the source is refused', failureKind(exportSkillFolder(syntheticRoot, join(syntheticRoot, 'inner'))) === 'destination-overlaps-source');
	check('a destination containing the source is refused', failureKind(exportSkillFolder(syntheticRoot, temp)) === 'destination-overlaps-source');
	// An existing destination is refused and not one byte of it changes.
	const sentinelDir = join(temp, 'sentinel destination');
	mkdirSync(sentinelDir);
	writeFileSync(join(sentinelDir, 'sentinel.txt'), 'mine\n');
	const refused = exportSkillFolder(syntheticRoot, sentinelDir);
	check('an existing destination is refused', !refused.ok && refused.failure.kind === 'destination-exists', refused.ok ? 'ok' : refused.failure.kind);
	check('the refused destination is untouched', readFileSync(join(sentinelDir, 'sentinel.txt'), 'utf8') === 'mine\n' && allFiles(sentinelDir).length === 1, allFiles(sentinelDir).join(' '));

	// The real export, in a folder whose name has spaces.
	const copy = join(temp, 'exported skill');
	const outcome = exportSkillFolder(WF_ROOT, copy);
	check('the checkout exports', outcome.ok, outcome.ok ? '' : outcome.failure.message);
	if (!outcome.ok) throw new Error(outcome.failure.message);
	const copyFiles = allFiles(copy).map((f) => relative(copy, f)).map(forward);
	const wfEntry = join(copy, 'scripts', 'wf.mjs');
	check('the export carries the skill, its references and the wrapper', ['SKILL.md', 'scripts/wf.mjs', 'scripts/runtime/wf.mjs'].every((f) => copyFiles.includes(f)), copyFiles.filter((f) => f.startsWith('scripts/')).slice(0, 5).join(' '));
	check('the export carries the runtime files the commands read', ['scripts/runtime/prompts/build.md.in', 'scripts/runtime/process/CLASSES.md', `scripts/runtime/projects/${projectName}/ROUND.md`, `scripts/runtime/projects/${projectName}/index.ts`, 'scripts/runtime/src/run.ts'].every((f) => copyFiles.includes(f)));
	check('the export carries no selfcheck, VCS or dependency tree', !copyFiles.some((f) => f.includes('.selfcheck.') || f === 'scripts/runtime/src/selfcheck.ts' || /(^|\/)(node_modules|\.git|\.delta)\//.test(f)), copyFiles.filter((f) => /selfcheck|node_modules|\.git/.test(f)).join(' '));
	check('the export carries no env, docs or generated Claude copies', !copyFiles.some((f) => /(^|\/)(env|docs|claude|\.claude-plugin)\//.test(f) || f === 'scripts/runtime/tsconfig.json' || f === 'scripts/runtime/eslint.config.js'), copyFiles.filter((f) => /env|docs|claude|tsconfig|eslint/.test(f)).join(' '));
	check('nothing in the export names the source checkout', allFiles(copy).every((f) => !namesSourceCheckout(readFileSync(f, 'utf8'))), allFiles(copy).filter((f) => namesSourceCheckout(readFileSync(f, 'utf8'))).map((f) => relative(copy, f)).join(' '));

	const help = nodeRun([wfEntry, '--help'], copy);
	check('the exported entry starts with no packages installed and prints usage', help.status === 0 && help.stdout.includes('usage: wf '), tail(help));
	const notes = nodeRun([wfEntry, 'notes'], copy);
	check('wf notes reads the project notes out of the copy', notes.status === 0 && notes.stdout.includes('round notes'), tail(notes));
	check('wf notes anchors paths only at the copy', notes.stdout.includes(forward(copy)) && !namesSourceCheckout(notes.stdout), tail(notes));

	// A local git fixture: one class A round at `agree`, its base resolvable.
	const fixture = join(temp, 'fixture round');
	mkdirSync(join(fixture, 'task-record'), { recursive: true });
	writeFileSync(join(fixture, 'task-record', 'TICKET.md'), '# TASK-1\n\n## Intent\n- "the slider jumps" — reporter, 2026-10-01\n');
	mkdirSync(join(fixture, '.wf'), { recursive: true });
	writeFileSync(join(fixture, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'task-1', id: 'TASK-1', folder: 'task-record', class: 'A', base: 'HEAD', step: 'agree', entry: forward(wfEntry) }, null, 2)}\n`);
	gitRun(fixture, ['init', '-q']);
	gitRun(fixture, ['add', '-A']);
	gitRun(fixture, ['commit', '-qm', 'fixture round']);
	const next = nodeRun([wfEntry, 'next'], fixture);
	check('wf next runs in a round this copy made', next.status === 0 && next.stdout.trim().length > 0, tail(next));
	check('wf next anchors paths only at the copy', !namesSourceCheckout(`${next.stdout}\n${next.stderr}`), tail(next));
	// Main's rename: `dispatch <phase> (model: <m>):` became the model-free `work <phase>:`. The phase
	// is read from the line wf printed, never hard-coded here.
	const phase = /(?:dispatch|work)\s+(agree|build|assess)\b/.exec(`${next.stdout}\n${next.stderr}`)?.[1] ?? null;
	check('wf next names the phase to work', phase !== null, tail(next));
	if (phase) {
		const brief = nodeRun([wfEntry, 'brief', phase], fixture);
		check(`wf brief ${phase} serves the phase wf next named`, brief.status === 0 && brief.stdout.includes('the slider jumps'), tail(brief));
		check(`wf brief ${phase} anchors paths only at the copy`, brief.stdout.includes(forward(copy)) && !namesSourceCheckout(brief.stdout), tail(brief));
	}
	const deliver = nodeRun([wfEntry, 'deliver'], fixture);
	check('a gate rejects delivery without T2 approval', deliver.status !== 0 && /approv/i.test(`${deliver.stdout}${deliver.stderr}`), tail(deliver));

	// Relocation: nothing in the copy names the folder it was written to.
	const moved = join(temp, 'moved skill');
	renameSync(copy, moved);
	const movedNotes = nodeRun([join(moved, 'scripts', 'wf.mjs'), 'notes'], moved);
	check('the copy runs from its new path', movedNotes.status === 0 && movedNotes.stdout.includes(forward(moved)), tail(movedNotes));
	check('nothing points back at the path it was exported to', !movedNotes.stdout.includes(forward(copy)), tail(movedNotes));
	// #184: a relocated kit must be able to start agreement before its class A ticket exists.
	const movedEntry = join(moved, 'scripts', 'wf.mjs');
	rmSync(join(fixture, 'task-record', 'TICKET.md'));
	writeFileSync(join(fixture, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'task-1', id: 'TASK-1', folder: 'task-record', class: 'A', base: 'HEAD', step: 'classify', entry: forward(movedEntry) })}\n`);
	const freshNext = nodeRun([movedEntry, 'next'], fixture);
	check('a relocated export routes a fresh class A round to agreement', freshNext.status === 0 && freshNext.stdout.startsWith('work agree:') && freshNext.stdout.includes('TICKET.md') && !namesSourceCheckout(freshNext.stdout), tail(freshNext));
	const freshBrief = nodeRun([movedEntry, 'brief', 'agree'], fixture);
	check('a relocated export serves the missing-ticket agreement brief from its own runtime', freshBrief.status === 0 && freshBrief.stdout.includes('## Intent') && freshBrief.stdout.includes('do not invent it') && freshBrief.stdout.includes(forward(moved)) && !namesSourceCheckout(freshBrief.stdout), tail(freshBrief));
	writeFileSync(join(fixture, 'task-record', 'TICKET.md'), '# TASK-1\n\n## Intent\n- "the slider jumps" — reporter, 2026-10-01\n');
	const readyNext = nodeRun([movedEntry, 'next'], fixture);
	check('a relocated export starts class A build after intent is recorded', readyNext.status === 0 && readyNext.stdout.startsWith('work build:'), tail(readyNext));

	// Re-export from a copy, through the copy's own wrapper: the skill source is the copy itself, two
	// levels above its runtime folder.
	const second = join(temp, 're-exported skill');
	const reExport = nodeRun([join(moved, 'scripts', 'wf.mjs'), 'skill', 'export', second], moved);
	check('a copy re-exports from itself through its wrapper', reExport.status === 0, tail(reExport));
	if (reExport.status === 0) {
		const movedFiles = allFiles(moved).map((f) => relative(moved, f)).map(forward).sort();
		const secondFiles = allFiles(second).map((f) => relative(second, f)).map(forward).sort();
		check('the re-export carries the skill and the runtime entry', existsSync(join(second, 'SKILL.md')) && existsSync(join(second, 'scripts', 'runtime', 'wf.mjs')) && existsSync(join(second, 'scripts', 'runtime', 'src', 'skill', 'skill-export.ts')));
		check('the re-export copies the skill whole', readFileSync(join(second, 'SKILL.md'), 'utf8') === readFileSync(join(moved, 'SKILL.md'), 'utf8'));
		check('the re-export is the same folder, file for file', secondFiles.join('\n') === movedFiles.join('\n'), secondFiles.filter((f) => !movedFiles.includes(f)).join(' '));
	}
	check('a second export into the same path is refused', !exportSkillFolder(moved, second).ok);

	// The canonical wrapper in the checkout: three levels above itself it finds the checkout's entry.
	const checkoutWrapper = nodeRun([join(WF_ROOT, 'skills', 'round', 'scripts', 'wf.mjs'), 'notes'], WF_ROOT);
	check('the source wrapper runs the checkout from skills/round/scripts/', checkoutWrapper.status === 0 && checkoutWrapper.stdout.includes(forward(WF_ROOT)), tail(checkoutWrapper));
	// A wrapper copied away from both an exported runtime and the checkout says what is missing.
	const orphan = join(temp, 'orphan scripts');
	mkdirSync(join(orphan, 'scripts'), { recursive: true });
	copyFileSync(join(WF_ROOT, 'skills', 'round', 'scripts', 'wf.mjs'), join(orphan, 'scripts', 'wf.mjs'));
	const orphanRun = nodeRun([join(orphan, 'scripts', 'wf.mjs'), 'notes'], orphan);
	check('a wrapper with no runtime beside it reports the missing entry', orphanRun.status === 1 && orphanRun.stderr.includes('no runtime entry at'), tail(orphanRun));

	// A package below a CommonJS host still runs; damage to it must not adopt that host's wf.
	const shadowRoot = join(temp, 'other host');
	mkdirSync(join(shadowRoot, 'skills'), { recursive: true });
	writeFileSync(join(shadowRoot, 'package.json'), '{"type":"commonjs"}\n');
	writeFileSync(join(shadowRoot, 'wf.mjs'), 'console.log("WRONG-WF-ENTRY");\n');
	const shadowCopy = join(shadowRoot, 'skills', 'round');
	check('a skill exports below a different host', exportSkillFolder(WF_ROOT, shadowCopy).ok);
	const hostRun = nodeRun([join(shadowCopy, 'scripts', 'wf.mjs'), 'notes'], shadowCopy);
	check('a CommonJS parent cannot change the runtime module mode', hostRun.status === 0 && hostRun.stdout.includes('round notes'), tail(hostRun));
	rmSync(join(shadowCopy, 'scripts', 'runtime', 'wf.mjs'));
	const brokenRun = nodeRun([join(shadowCopy, 'scripts', 'wf.mjs'), 'notes'], shadowCopy);
	check('an incomplete export refuses rather than adopting an unrelated wf entry', brokenRun.status === 1 && !brokenRun.stdout.includes('WRONG-WF-ENTRY'), tail(brokenRun));

	// The CLI translation: expected failures exit non-zero with the failure's message.
	const usage = nodeRun([join(WF_ROOT, 'src', 'skill', 'skill-export.ts'), 'export'], WF_ROOT);
	check('the CLI refuses a call with no directory', usage.status === 2 && usage.stderr.includes('usage: wf skill export <new-directory>'), tail(usage));
	const skipped = readFileSync(join(second, 'SKILL.md'), 'utf8');
	const exists = nodeRun([join(WF_ROOT, 'src', 'skill', 'skill-export.ts'), 'export', second], WF_ROOT);
	check('the CLI refuses an existing destination and says why', exists.status === 2 && exists.stderr.includes('already exists'), tail(exists));
	check('the CLI changed nothing in the destination it refused', readFileSync(join(second, 'SKILL.md'), 'utf8') === skipped && allFiles(second).length === allFiles(moved).length, String(allFiles(second).length));
} finally {
	rmSync(temp, { recursive: true, force: true });
}

check('the omitted names cover a VCS dir, scratch checkouts and installed deps', ['.git', '.delta', 'node_modules'].every((n) => SKILL_EXPORT_OMITTED_NAMES.includes(n)));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
