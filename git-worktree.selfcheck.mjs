// git-worktree.selfcheck.mjs — node git-worktree.selfcheck.mjs → exit 0 when green.
// Pure arms: the kit's removal plan (git-worktree.mjs), the step that stops a stack (serve.mjs).
// Nothing is run, created or removed but a temp folder standing in for a worktree, and a temp repo
// whose worktree add fails.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addWorktree, removalPlan } from './git-worktree.mjs';
import { stragglersStep } from './serve.mjs';
import { hiddenHop, stopServersStep } from './serve.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

check('Windows: taskkill takes the whole tree', stopServersStep(4242, 'win32').args.join(' ') === '/PID 4242 /T /F');
check('elsewhere: the detached process\'s group gets SIGTERM', stopServersStep(4242, 'darwin').cmd === 'kill' && stopServersStep(4242, 'darwin').args.join(' ') === '-TERM -4242');

const tree = mkdtempSync(join(tmpdir(), 'wf-gw-'));
const labels = () => removalPlan({ path: tree, slug: 'fix-a' }).map((s) => s.label).join(' → ');
check('no stack started: teardown before the folder goes, then prune', labels() === 'kill stragglers → drop database → rm -rf worktree → git worktree prune', labels());
mkdirSync(join(tree, '.wf'));
writeFileSync(join(tree, '.wf', 'serve.pid'), '31337\n');
check('a stack started: it stops first', labels().startsWith('stop servers → kill stragglers → drop database'), labels());
check('the stop names the recorded pid', removalPlan({ path: tree, slug: 'fix-a' })[0].args.includes(process.platform === 'win32' ? '31337' : '-31337'));
check('the folder goes in-process, no path through the shell', removalPlan({ path: tree, slug: 'fix-a' }).filter((s) => s.label !== 'kill stragglers').every((s) => !s.args?.includes(tree)));
const sweep = Buffer.from(stragglersStep('C:/wt/fix-a', 4242, 'win32').args[2], 'base64').toString('utf16le');
check('the sweep matches both path spellings and spares reap itself', sweep.includes('C:/wt/fix-a') && sweep.includes(String.raw`C:\wt\fix-a`) && sweep.includes('-ne 4242'), sweep);
check('elsewhere: pkill on the path', stragglersStep('/wt/fix-a', 1, 'darwin').args.join(' ') === '-f /wt/fix-a');
rmSync(tree, { recursive: true, force: true });

// A base git cannot check out (a git~1 entry: invalid path on every platform) fails the add after
// -b has made the branch.
const repo = mkdtempSync(join(tmpdir(), 'wf-gw-repo-'));
const git = (args, input) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
const id = ['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck'];
git(['init', '-q']);
git([...id, 'commit', '-q', '--allow-empty', '-m', 'base']);
const blob = git(['hash-object', '-w', '--stdin'], 'x');
const bad = git([...id, 'commit-tree', git(['mktree'], `100644 blob ${blob}\tgit~1\n`), '-p', 'HEAD', '-m', 'bad']);
const branches = () => git(['branch', '--list', 'round/*', '--format=%(refname:short)']).split('\n').filter(Boolean).join(' ');
const add = (branch) => { try { addWorktree({ branch, path: join(repo, '..', `${branch.replace('/', '-')}-wt`), base: bad, cwd: repo }); return 'added'; } catch { return 'threw'; } };
check('a failed checkout throws and takes the branch it made with it', add('round/new') === 'threw' && branches() === '', branches());
git(['branch', 'round/mine']);
check('a branch that was there before survives the failed add', add('round/mine') === 'threw' && branches() === 'round/mine', branches());
rmSync(repo, { recursive: true, force: true });

const hop = hiddenHop('win32', { PATH: 'x' });
check('Windows: the detached serve re-runs itself hidden, once', hop.options.windowsHide === true && hop.options.env.WF_SERVE_HIDDEN === '1' && hop.options.env.PATH === 'x' && hop.args.slice(1).join(' ') === 'serve --foreground' && hiddenHop('win32', hop.options.env) === null);
check('elsewhere: no hop', hiddenHop('linux', {}) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
