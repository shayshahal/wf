// hook.selfcheck.ts — node hook.selfcheck.ts → exit 0 when green.
// Pure arms: the wt hook block and its install, the reap gate, what a teardown counts as failed.
// Nothing is run. What the project's steps do: projects/<name>/index.selfcheck.ts.
import { gateVerdict, hookBlock, splitTeardownSteps, teardownFailures, withHookBlock } from './hook.ts';
import { repo, setup } from '../src/project.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../src/paths.ts';
import { headContentSha } from '../src/gates/content-identity.ts';
import { WF_STATE_VERSION } from '../src/round/state.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the block and its install
const block = hookBlock('C:/wf/wf.mjs');
check('every project setup step is a pre-start step calling wf hook with slug and port', Object.keys(setup).every((s) => block.includes(`${s} = 'node C:/wf/wf.mjs hook ${s} {{ branch | sanitize }} {{ branch | hash_port }}'`)), block);
// No post-start: nothing serves a worktree when it is made (2026-10-04; serve.ts ensureServers).
check('no post-start hook: the worktree is not served at creation', !block.includes('post-start') && !block.includes('tether'));
check('the tables are this project\'s only', block.split('\n').filter((l) => l.startsWith('[')).every((l) => l.startsWith(`[projects."${repo}".`)));
const user = 'worktree-path = "~/x"\n[aliases]\nurls = "echo && node {{ worktree_path }}/scripts/dev-worktree.mjs --urls 1"\nother = "x"\n';
const once = withHookBlock(user, block);
check('install appends the block and drops the alias that called the project\'s script', once.includes(block) && !once.includes('dev-worktree') && once.includes('other = "x"'), once);
check('install is idempotent: a second run replaces the block', withHookBlock(once, block) === once);
check('a changed block replaces the old one', withHookBlock(once, hookBlock('D:/wf.mjs')).split('# >>> wf worktree hooks').length === 2);

// ── the reap gate
check('a worktree outside the workflow is removable', gateVerdict({ state: undefined, force: false }) === null);
check('a merged round is removable', gateVerdict({ state: { step: 'merged' }, force: false }) === null);
check('an unmerged round is refused, naming its step', /"implement"/.test(gateVerdict({ state: { step: 'implement' }, force: false })!));
check('unreadable state is refused', /unreadable/.test(gateVerdict({ state: null, force: false })!));
check('WF_FORCE_REAP overrides', gateVerdict({ state: { step: 'implement' }, force: true }) === null);

// ── direct wt pre-remove follows the same delivery protection as wf reap, before unlinking.
const dir = mkdtempSync(join(tmpdir(), 'wf-hook-delivery-'));
const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' }).trim();
const gate = (force: boolean) => spawnSync(process.execPath, [join(WF_ROOT, 'env/wf.mjs'), 'hook', 'gate', 'fixture'], { cwd: dir, env: { ...process.env, WF_FORCE_REAP: force ? '1' : '0' }, encoding: 'utf8' });
try {
  git('init', '-q', '-b', 'dev'); git('config', 'core.autocrlf', 'false');
  writeFileSync(join(dir, 'product.txt'), 'delivered\n');
  git('add', '.'); git('commit', '-qm', 'delivered');
  mkdirSync(join(dir, '.wf'));
  const folder = 'bug-reports/fixture';
  const state = { wf_version: WF_STATE_VERSION, round: 'fixture', folder, step: 'merged', delivery: { url: 'https://github.com/o/r/pull/1', head: git('rev-parse', 'HEAD'), contentSha: headContentSha(dir, folder, null, 'row') } };
  writeFileSync(join(dir, '.wf/state.json'), JSON.stringify(state));
  check('direct pre-remove permits an unchanged delivered tree', gate(false).status === 0);
  writeFileSync(join(dir, 'product.txt'), 'follow-up\n');
  const refusal = gate(false);
  check('direct pre-remove refuses follow-up product work', refusal.status === 1 && refusal.stderr.includes('product changes exist after delivery'), refusal.stderr);
  check('explicit force permits intentional direct removal', gate(true).status === 0);
  git('add', 'product.txt'); writeFileSync(join(dir, 'product.txt'), 'delivered\n');
  check('direct pre-remove sees index-only follow-up work', gate(false).status === 1);
  git('reset', '-q', '--', 'product.txt');
  const { delivery: _receipt, ...unbound } = state;
  writeFileSync(join(dir, '.wf/state.json'), JSON.stringify(unbound));
  check('unbound old rounds cannot be silently removed', gate(false).status === 1);
  check('explicit force is also a recovery for unbound old rounds', gate(true).status === 0);
} finally { rmSync(dir, { recursive: true, force: true }); }

// ── teardown: a piece already gone is not a failure
const run = (status: number, stderr: string) => ({ t: { cmd: 'docker', args: ['rm', 'x'] }, r: { status, stdout: '', stderr } });
check('a clean teardown has no failures', teardownFailures([run(0, ''), run(0, '')]).length === 0);
// #180: a project step that runs in-process (closing this checkout's browsers) must reach the hook.
{
  const split = splitTeardownSteps([
    { label: 'drop database', cmd: 'docker', args: ['rm', 'x'] },
    { label: "close this checkout's browsers", run: () => null },
  ]);
  check('the teardown split keeps a run step out of the spawn path', split.cmds.map((s) => s.label).join() === 'drop database' && split.runs.map((s) => s.label).join() === "close this checkout's browsers");
  check('every step lands in exactly one of the two', split.cmds.length + split.runs.length === 2);
}
check('"no such container" and "not found" are already gone', teardownFailures([run(1, 'Error: No such container: x'), run(1, 'network x not found')]).length === 0);
check('any other error is a failure, naming the command', teardownFailures([run(1, 'daemon is not running')])[0] === 'docker rm x: daemon is not running');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
