// Real git evidence for the narrow committed T2 recipe exception (#234).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessmentRecipeOnlyCommits } from './assessment-reuse.ts';
import { agreementSha, AGREEMENT_FILE } from './agreement.ts';
import { wfSync } from '../in-process-wf.ts';
import { WF_STATE_VERSION } from './state.ts';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'ok' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++; };
const repo = mkdtempSync(join(tmpdir(), 'wf-assessment-reuse-'));
const folder = 'bug-reports/r';
const agreement = `# r
Class: B
## Observed
- existing behavior — a.txt:1
## Agreed
- Behavior: retain behavior. Excluding: other behavior.
- Choice: retain it (rejected: remove it).
- Verification: existing test passes.
- **T2 walk.** none — no visible change
- **Not asked for.** none — all requested
## Verification
Evidence: original
`;
const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const file = join(repo, folder, AGREEMENT_FILE);
const save = (text: string) => writeFileSync(file, text);
const commit = () => { git('add', '-A'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PI_SESSION') && key !== 'CLAUDE_CODE_SESSION_ID'));
const cli = (...args: string[]) => wfSync(args, { cwd: repo, env });
try {
	git('init', '-q', '-b', 'main');
	git('config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	commit();
	git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
	git('checkout', '-qb', 'fix/r');
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'));
	save(agreement);
	const measured = commit();
	const state = { wf_version: WF_STATE_VERSION, round: 'r', id: 'r', folder, base: 'origin/dev', step: 'assess', class: 'B' };
	const stateAtAssess = () => writeFileSync(join(repo, '.wf/state.json'), JSON.stringify(state));
	stateAtAssess();
	writeFileSync(join(repo, folder, 'AGREEMENT-REVIEW.md'), `verdict: approved\nagreement-sha: ${agreementSha(repo, 'B', folder)}\n`);
	const assessment = `# r\nVerdict: clean\nhead: ${measured}\n## Intent\n- retained\n`;
	const reportFile = join(repo, folder, 'ASSESSMENT.md');
	writeFileSync(reportFile, assessment);
	const recipe = agreement.replace('none — no visible change', 'none — corrected viewing instructions');
	save(recipe);
	let result = cli('next');
	check('uncommitted recipe correction keeps the independent assessment', result.status === 0 && result.stdout.startsWith('review: T2'), result.stdout + result.stderr);
	// Only the recipe is committed; existing assessment/T1 files remain outside the measured range.
	git('add', `${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', 'recipe only');
	const recipeHead = git('rev-parse', 'HEAD');
	check('real git recipe-only commit is reusable', assessmentRecipeOnlyCommits(repo, measured, recipeHead, folder));
	result = cli('next');
	check('CLI next reaches T2 after a recipe-only commit', result.status === 0 && result.stdout.startsWith('review: T2'), result.stdout + result.stderr);
	result = cli('step', 'review');
	check('CLI direct step review accepts the same trusted exception', result.status === 0, result.stdout + result.stderr);
	check('the assessor report and measured head are never rewritten', readFileSync(reportFile, 'utf8') === assessment);
	stateAtAssess();
	const continuation = recipe.replace('none — corrected viewing instructions', 'none — corrected viewing instructions\n  continued walk detail');
	save(continuation); git('add', `${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', 'walk continuation');
	check('indented walk continuation can be committed without another assessment', assessmentRecipeOnlyCommits(repo, measured, git('rev-parse', 'HEAD'), folder));
	git('reset', '--hard', recipeHead);
	check('unknown measured head fails closed', !assessmentRecipeOnlyCommits(repo, 'f'.repeat(40), recipeHead, folder));
	check('mutable refs fail closed', !assessmentRecipeOnlyCommits(repo, 'HEAD~1', recipeHead, folder));
	check('missing round folder fails closed', !assessmentRecipeOnlyCommits(repo, measured, recipeHead, null));
	check('nonancestor measured head fails closed', !assessmentRecipeOnlyCommits(repo, recipeHead, measured, folder));
	for (const [name, text] of [
		['agreed behavior', recipe.replace('retain behavior', 'change behavior')],
		['verification proof', recipe.replace('Evidence: original', 'Evidence: changed')],
		['sibling bullet', recipe.replace('all requested', 'different exclusions')],
		['unindented blank separator', recipe.replace('- **Not asked for.**', '\n- **Not asked for.**')],
		['two unindented blank separators', recipe.replace('- **Not asked for.**', '\n\n- **Not asked for.**')],
		['whitespace-only separator', recipe.replace('- **Not asked for.**', ' \t\n- **Not asked for.**')],
		['separator before heading', recipe.replace('## Verification', '\n## Verification')],
		['unrelated whitespace', `${recipe}\n`],
		['line endings outside recipe', recipe.replace(/\n/g, '\r\n')],
		['final newline outside recipe', recipe.replace(/\n$/, '')],
	] as const) {
		save(text); git('add', `${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', name);
		check(`${name} is not recipe-only`, !assessmentRecipeOnlyCommits(repo, measured, git('rev-parse', 'HEAD'), folder));
		git('reset', '--hard', recipeHead);
	}
	for (const path of ['a.txt', 'a.test.ts', `${folder}/ASSESSMENT.md`, `${folder}/TICKET.md`, `${folder}/OTHER.md`]) {
		writeFileSync(join(repo, path), 'changed\n');
		git('add', path); git('commit', '-qm', 'not recipe');
		check(`${path} change cannot reuse assessment`, !assessmentRecipeOnlyCommits(repo, measured, git('rev-parse', 'HEAD'), folder));
		if (path === 'a.txt') {
			result = cli('step', 'review');
			check('CLI product commit still requires fresh assessment', result.status === 2 && (result.stdout + result.stderr).includes('HEAD is'), result.stdout + result.stderr);
		}
		git('reset', '--hard', recipeHead);
	}
	for (const newline of ['\n', '\r\n']) {
		const base = recipe.replace(/\n/g, newline);
		save(base); git('add', `${folder}/${AGREEMENT_FILE}`); git('commit', '--allow-empty', '-qm', 'separator baseline');
		const separatorHead = git('rev-parse', 'HEAD');
		for (const [name, separator] of [['blank', newline], ['two blanks', newline + newline], ['whitespace', ` \t${newline}`]] as const) {
			for (const boundary of ['- **Not asked for.**', '## Verification']) {
				save(base.replace(boundary, separator + boundary));
				git('add', `${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', 'separator change');
				check(`${name} separator at ${boundary} stays bound (${JSON.stringify(newline)})`, !assessmentRecipeOnlyCommits(repo, separatorHead, git('rev-parse', 'HEAD'), folder));
				git('reset', '--hard', separatorHead);
			}
		}
		git('reset', '--hard', recipeHead);
	}
	git('update-index', '--chmod=+x', `${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', 'mode change');
	check('mode changes fail closed', !assessmentRecipeOnlyCommits(repo, measured, git('rev-parse', 'HEAD'), folder));
	git('reset', '--hard', recipeHead);
	const target = git('hash-object', '-w', '--stdin');
	// An index symlink works on Windows too: no OS symlink privilege is required.
	git('update-index', '--cacheinfo', `120000,${target},${folder}/${AGREEMENT_FILE}`); git('commit', '-qm', 'symlink');
	check('symlink substitution fails closed', !assessmentRecipeOnlyCommits(repo, measured, git('rev-parse', 'HEAD'), folder));
} finally {
	rmSync(repo, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
