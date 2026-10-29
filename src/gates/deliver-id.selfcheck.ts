// Real delivery dispatcher, local bare origin and recording gh adapter: no network or real rounds.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
import { approvalIdentity, trackerNotePath } from './content-identity.ts';

const root = mkdtempSync(join(tmpdir(), 'wf-deliver-id-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_') && !key.startsWith('T3_') && !key.startsWith('T3CODE_')));
env.GIT_CONFIG_GLOBAL = join(root, 'gitconfig');
env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_GLOBAL;
writeFileSync(env.GIT_CONFIG_GLOBAL, '');
process.env.GIT_CONFIG_GLOBAL = env.GIT_CONFIG_GLOBAL;
process.env.GIT_CONFIG_SYSTEM = env.GIT_CONFIG_SYSTEM;
const git = (cwd: string, ...args: string[]) => {
	const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env });
	if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
	return result.stdout.trim();
};
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
	console.log(`${ok ? 'ok' : 'FAIL'} ${name}${ok ? '' : `: ${detail}`}`);
	if (!ok) failures++;
};
const harness = join(root, 'harness.mjs');
writeFileSync(harness, `
import { run } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/run.ts')).href)};
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
await run(JSON.parse(process.env.ARGS ?? '["deliver"]'), { gh(args, cwd) {
  appendFileSync('gh.jsonl', JSON.stringify(args) + '\\n');
  const branch = process.env.BRANCH ?? 'fix/JX-1534-gap';
  const pr = (state, head) => JSON.stringify([{url:'https://github.com/o/r/pull/1', state, headRefOid:head, headRefName:branch, baseRefName:'dev', isCrossRepository:false, mergeable:'MERGEABLE', baseRefOid:'a'.repeat(40)}]);
  if (args[1] === 'create' && process.env.PR_OPENS) return { status: 0, stdout: 'https://github.com/o/r/pull/1\\n', stderr: '' };
  if (args[1] === 'list') {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    const created = process.env.PR_OPENS && readFileSync('gh.jsonl', 'utf8').includes('"create"');
    return { status: 0, stdout: process.env.ALREADY_MERGED ? pr('MERGED', head) : created ? pr('OPEN', head) : '[]', stderr: '' };
  }
  return { status: 1, stdout: '', stderr: 'fixture stops at PR mutation' };
}});
`);
// The recording adapter's log is excluded from approval, just like the round's other local state.
function fixture(name: string, identity: { id?: string; ids?: readonly string[]; round?: string }, branch = 'fix/JX-1534-gap') {
	const dir = join(root, name);
	const work = join(dir, 'work');
	const origin = join(dir, 'origin.git');
	mkdirSync(work, { recursive: true });
	git(dir, 'init', '-q', '--bare', origin);
	git(work, 'init', '-q', '-b', 'dev');
	git(work, 'config', 'user.name', 'wf');
	git(work, 'config', 'user.email', 'wf@selfcheck');
	git(work, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(work, '.gitignore'), '.wf/\ngh.jsonl\n');
	writeFileSync(join(work, 'README.md'), 'base\n');
	git(work, 'add', '-A');
	git(work, 'commit', '-qm', 'base');
	git(work, 'remote', 'add', 'origin', 'https://github.com/o/r.git');
	git(work, 'config', `url.${pathToFileURL(origin).href}.insteadOf`, 'https://github.com/o/r.git');
	git(work, 'push', '-q', 'origin', 'dev');
	git(work, 'checkout', '-qb', branch);
	const folder = 'bug-reports/gap';
	mkdirSync(join(work, folder), { recursive: true });
	writeFileSync(join(work, folder, 'TICKET.md'), '# JX-1534\n\n## Intent\n- fix gap\n');
	writeFileSync(join(work, folder, 'ASSESSMENT.md'), `head: ${git(work, 'rev-parse', 'HEAD')}\nVerdict: clean\n\n## Intent\n- fix gap: met\n`);
	mkdirSync(join(work, '.wf'));
	const statePath = join(work, '.wf/state.json');
	writeFileSync(statePath, JSON.stringify({ wf_version: 3, class: 'A', round: branch, folder, base: 'dev', step: 'pr', made_by: 'kit', ...identity }));
	const approved = approvalIdentity(work, folder, trackerNotePath(folder));
	writeFileSync(join(work, folder, 'REVIEW.md'), `content-sha: ${approved.worktree}\nhead-sha: ${approved.head}\nverdict: approved\n`);
	return { work, statePath, folder };
}
try {
	for (const [name, identity] of [
		['branch fallback', { id: 'fix/JX-1534-gap' }],
		['legacy round fallback', {}],
		['mixed IDs', { id: 'JX-1534', ids: ['JX-1534', 'fix/JX-1534-gap'] }],
		['empty IDs', { id: 'JX-1534', ids: [] }],
	] as const) {
		const f = fixture(name.replaceAll(' ', '-'), identity);
		const before = { head: git(f.work, 'rev-parse', 'HEAD'), index: git(f.work, 'write-tree'), state: readFileSync(f.statePath, 'utf8') };
		const result = spawnSync(process.execPath, [harness], { cwd: f.work, env, encoding: 'utf8' });
		const output = result.stdout + result.stderr;
		check(`${name}: actionable early refusal`, result.status === 2 && output.includes('tracker ticket IDs') && output.includes('wf new --id'), output);
		check(`${name}: no local delivery mutation`, git(f.work, 'rev-parse', 'HEAD') === before.head && git(f.work, 'write-tree') === before.index && readFileSync(f.statePath, 'utf8') === before.state && !existsSync(join(f.work, f.folder, 'JIRA.md')));
		check(`${name}: no PR request or branch push`, !existsSync(join(f.work, 'gh.jsonl')) && !git(f.work, 'ls-remote', '--heads', 'origin', 'fix/JX-1534-gap'));
	}
	// Legacy malformed IDs must not hide a human merge of an already-published candidate.
	{
		const f = fixture('published-legacy', { id: 'fix/JX-1534-gap' });
		const head = git(f.work, 'rev-parse', 'HEAD');
		const state = JSON.parse(readFileSync(f.statePath, 'utf8'));
		writeFileSync(f.statePath, JSON.stringify({ ...state, pr_handoff: { url: 'https://github.com/o/r/pull/1', head, contentSha: `tree:${'a'.repeat(40)}` } }));
		const result = spawnSync(process.execPath, [harness], { cwd: f.work, env: { ...env, ALREADY_MERGED: '1' }, encoding: 'utf8' });
		const after = JSON.parse(readFileSync(f.statePath, 'utf8'));
		check('legacy published candidate still reconciles human merge', result.status === 0 && after.delivery?.head === head && after.step === 'merged', result.stdout + result.stderr);
		check('reconciliation does not publish again', !readFileSync(join(f.work, 'gh.jsonl'), 'utf8').includes('"create"') && git(f.work, 'rev-parse', 'HEAD') === head);
	}
	for (const [name, identity] of [
		['valid single ID', { id: 'JX-1534' }],
		['valid multiple IDs', { id: 'JX-1534', ids: ['JX-1534', 'BJEW-1'] }],
	] as const) {
		const f = fixture(name.replaceAll(' ', '-'), identity);
		const result = spawnSync(process.execPath, [harness], { cwd: f.work, env, encoding: 'utf8' });
		check(`${name}: reaches publication`, existsSync(join(f.work, 'gh.jsonl')) && readFileSync(join(f.work, 'gh.jsonl'), 'utf8').includes('"create"') && !!git(f.work, 'ls-remote', '--heads', 'origin', 'fix/JX-1534-gap'), result.stdout + result.stderr);
	}
	// A round with no ticket at all (a chore) delivers without a tracker note, and has none afterwards.
	for (const [name, identity] of [
		['ticketless branch id', { id: 'chore/verify-suite-in-round' }],
		['ticketless round only', {}],
	] as const) {
		const chore = 'chore/verify-suite-in-round';
		const f = fixture(name.replaceAll(' ', '-'), identity, chore);
		const wf = (extra: Record<string, string>) => spawnSync(process.execPath, [harness], { cwd: f.work, env: { ...env, BRANCH: chore, ...extra }, encoding: 'utf8' });
		const result = wf({ PR_OPENS: '1' });
		const open = JSON.parse(readFileSync(f.statePath, 'utf8'));
		check(`${name}: reaches publication with no tracker note`, result.status === 0 && readFileSync(join(f.work, 'gh.jsonl'), 'utf8').includes('"create"') && !!git(f.work, 'ls-remote', '--heads', 'origin', chore) && !!open.pr_handoff && open.note === undefined && !existsSync(join(f.work, f.folder, 'JIRA.md')), result.stdout + result.stderr);
		const waiting = wf({ ARGS: '["next"]', PR_OPENS: '1' });
		check(`${name}: next while the PR is open waits for the human merge`, waiting.stdout.startsWith('wait user: PR') && !waiting.stdout.includes('post'), waiting.stdout + waiting.stderr);
		const merged = wf({ ALREADY_MERGED: '1' });
		const after = JSON.parse(readFileSync(f.statePath, 'utf8'));
		check(`${name}: merge reconciles with no tracker note`, merged.status === 0 && after.step === 'merged' && !!after.delivery && after.note === undefined && !existsSync(join(f.work, f.folder, 'JIRA.md')), merged.stdout + merged.stderr);
		const done = wf({ ARGS: '["next"]' });
		check(`${name}: next after merge goes straight to reap`, done.stdout.startsWith('done: ') && done.stdout.includes(`reap ${chore}`) && !done.stdout.includes('post'), done.stdout + done.stderr);
		const posted = wf({ ARGS: '["post"]' });
		check(`${name}: wf post says there is nothing to post and succeeds`, posted.status === 0 && posted.stdout.includes('nothing to post') && !existsSync(join(f.work, f.folder, 'JIRA.md')), posted.stdout + posted.stderr);
	}
	// A key anywhere in the branch is a ticket: the #234 refusal stays, whatever the key's case.
	for (const branch of ['fix/jx-1449', 'fix/JX-1534-gap']) {
		const f = fixture(`keyed-${branch.replace('/', '-')}`, { id: branch }, branch);
		const result = spawnSync(process.execPath, [harness], { cwd: f.work, env: { ...env, BRANCH: branch, PR_OPENS: '1' }, encoding: 'utf8' });
		check(`${branch} with no ids is still refused`, result.status === 2 && (result.stdout + result.stderr).includes('wf new --id') && !existsSync(join(f.work, 'gh.jsonl')), result.stdout + result.stderr);
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
