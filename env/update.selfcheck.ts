// env/update.selfcheck.ts — node env/update.selfcheck.ts (the path anchoring it installs: ../src/plugin/anchor.selfcheck.ts)
import { shouldUpdate } from './update.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../src/paths.ts';

let failed = 0;
const check = (name: string, cond: unknown) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
check('a live copy behind the pushed branch updates', shouldUpdate({ runningFromLive: true, installed: 'a', published: 'b' }));
check('a live copy at the pushed branch does not', !shouldUpdate({ runningFromLive: true, installed: 'b', published: 'b' }));
check('the workflow-v2 checkout never updates itself', !shouldUpdate({ runningFromLive: false, installed: 'a', published: 'b' }));
check('no REVISION (a hand-made copy) or no ref: leave it', !shouldUpdate({ runningFromLive: true, installed: null, published: 'b' }) && !shouldUpdate({ runningFromLive: true, installed: 'a', published: null }));
// Install into a child process's isolated home: changing account must not require reinstalling
// agent defaults, and an update run by a personal session must not pin work sessions to Flash.
const root = mkdtempSync(join(tmpdir(), 'wf-agent-install-'));
try {
	const repo = join(root, 'source');
	const home = join(root, 'home');
	const installedAgents = join(home, '.pi/agent/agents');
	mkdirSync(join(repo, 'src'), { recursive: true });
	mkdirSync(join(repo, 'agents'));
	mkdirSync(installedAgents, { recursive: true });
	mkdirSync(join(home, '.local/share'), { recursive: true });
	writeFileSync(join(repo, 'src/project.ts'), "export * from '../projects/fixture/index.ts';\n");
	const agents = readdirSync(join(WF_ROOT, 'agents'));
	for (const agent of agents) {
		writeFileSync(join(repo, 'agents', agent), readFileSync(join(WF_ROOT, 'agents', agent), 'utf8'));
		writeFileSync(join(installedAgents, agent), '---\nmodel: personal/stale-model:high\n---\nstale default\n');
	}
	const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), HOME: home, USERPROFILE: home, PI_PROVIDER: 'opencode-go' };
	const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck', ...args], { env, encoding: 'utf8' }).trim();
	git('init', '-q');
	git('config', 'core.autocrlf', 'false');
	git('add', '-A');
	git('commit', '-qm', 'agent templates');
	const rev = git('rev-parse', 'HEAD');
	const script = `import { homedir } from 'node:os';
if (homedir() !== ${JSON.stringify(home)}) throw new Error('selfcheck home isolation failed');
const { install } = await import(${JSON.stringify(pathToFileURL(join(WF_ROOT, 'env/update.ts')).href)});
if (install(${JSON.stringify(join(repo, '.git'))}, ${JSON.stringify(rev)}) !== ${JSON.stringify(rev)}) throw new Error('selfcheck installation did not run');`;
	const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
	check('the real installer succeeds in an isolated home', run.status === 0);
	if (run.status !== 0) console.error(run.stderr);
	for (const agent of agents) {
		const text = readFileSync(join(installedAgents, agent), 'utf8');
		check(`install replaces ${agent}'s stale global pin with caller inheritance`, !/^(model|effort):/m.test(text) && !text.includes('stale default'));
	}
} finally {
	rmSync(root, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
