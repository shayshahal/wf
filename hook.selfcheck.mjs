// hook.selfcheck.mjs — node hook.selfcheck.mjs → exit 0 when green.
// Pure arms: the wt hook block and its install, the reap gate, what a teardown counts as failed.
// Nothing is run. What the project's steps do: projects/<name>/index.selfcheck.mjs.
import { gateVerdict, hookBlock, teardownFailures, withHookBlock } from './hook.mjs';
import { repo, setup } from './project.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

// ── the block and its install
const block = hookBlock('C:/wf/wf.mjs');
check('every project setup step is a pre-start step calling wf hook with slug and port', Object.keys(setup).every((s) => block.includes(`${s} = 'node C:/wf/wf.mjs hook ${s} {{ branch | sanitize }} {{ branch | hash_port }}'`)), block);
check('the dev servers run under wt\'s tether', block.includes(`server = 'wt step tether -- node C:/wf/wf.mjs hook serve`));
check('the tables are this project\'s only', block.split('\n').filter((l) => l.startsWith('[')).every((l) => l.startsWith(`[projects."${repo}".`)));
const user = 'worktree-path = "~/x"\n[aliases]\nurls = "echo && node {{ worktree_path }}/scripts/dev-worktree.mjs --urls 1"\nother = "x"\n';
const once = withHookBlock(user, block);
check('install appends the block and drops the alias that called the project\'s script', once.includes(block) && !once.includes('dev-worktree') && once.includes('other = "x"'), once);
check('install is idempotent: a second run replaces the block', withHookBlock(once, block) === once);
check('a changed block replaces the old one', withHookBlock(once, hookBlock('D:/wf.mjs')).split('# >>> wf worktree hooks').length === 2);

// ── the reap gate
check('a worktree outside the workflow is removable', gateVerdict({ state: undefined, force: false }) === null);
check('a merged round is removable', gateVerdict({ state: { step: 'merged' }, force: false }) === null);
check('an unmerged round is refused, naming its step', /"implement"/.test(gateVerdict({ state: { step: 'implement' }, force: false })));
check('unreadable state is refused', /unreadable/.test(gateVerdict({ state: null, force: false })));
check('WF_FORCE_REAP overrides', gateVerdict({ state: { step: 'implement' }, force: true }) === null);

// ── teardown: a piece already gone is not a failure
const run = (status, stderr) => ({ t: { cmd: 'docker', args: ['rm', 'x'] }, r: { status, stdout: '', stderr } });
check('a clean teardown has no failures', teardownFailures([run(0, ''), run(0, '')]).length === 0);
check('"no such container" and "not found" are already gone', teardownFailures([run(1, 'Error: No such container: x'), run(1, 'network x not found')]).length === 0);
check('any other error is a failure, naming the command', teardownFailures([run(1, 'daemon is not running')])[0] === 'docker rm x: daemon is not running');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
