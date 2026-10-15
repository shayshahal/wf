// git-worktree.selfcheck.ts — node git-worktree.selfcheck.ts → exit 0 when green.
// Pure arms: the kit's removal plan (git-worktree.ts), the step that stops a stack (serve.ts).
// Nothing is run, created or removed but a temp folder standing in for a worktree, and a temp repo
// whose worktree add fails.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addWorktree, removalPlan } from './git-worktree.ts';
import { hiddenHop } from './serve.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);


const tree = mkdtempSync(join(tmpdir(), 'wf-gw-'));
const labels = () => removalPlan({ path: tree, slug: 'fix-a' } as Parameters<typeof removalPlan>[0]).map((s) => s.label).join(' → ');
check('no stack started: teardown before the folder goes, then prune', labels() === 'stop owned servers → drop database → drop stranded test databases → rm -rf worktree → git worktree prune', labels());
mkdirSync(join(tree, '.wf'));
writeFileSync(join(tree, '.wf', 'serve.pid'), '31337\n');
check('a stack started: it stops first', labels().startsWith('stop owned servers → drop database'), labels());
check('cleanup verifies ownership in-process rather than handing a raw PID or path to a kill command', Boolean(removalPlan({ path: tree, slug: 'fix-a' } as Parameters<typeof removalPlan>[0])[0].run));
rmSync(tree, { recursive: true, force: true });

// A base git cannot check out (a git~1 entry: invalid path on every platform) fails the add after
// -b has made the branch.
const repo = mkdtempSync(join(tmpdir(), 'wf-gw-repo-'));
const git = (args: string[], input?: string) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
const id = ['-c', 'user.name=wf', '-c', 'user.email=wf@selfcheck'];
git(['init', '-q']);
git([...id, 'commit', '-q', '--allow-empty', '-m', 'base']);
const blob = git(['hash-object', '-w', '--stdin'], 'x');
const bad = git([...id, 'commit-tree', git(['mktree'], `100644 blob ${blob}\tgit~1\n`), '-p', 'HEAD', '-m', 'bad']);
const branches = () => git(['branch', '--list', 'round/*', '--format=%(refname:short)']).split('\n').filter(Boolean).join(' ');
const add = (branch: string) => { try { addWorktree({ branch, path: join(repo, '..', `${branch.replace('/', '-')}-wt`), base: bad, cwd: repo }); return 'added'; } catch { return 'threw'; } };
check('a failed checkout throws and takes the branch it made with it', add('round/new') === 'threw' && branches() === '', branches());
git(['branch', 'round/mine']);
check('a branch that was there before survives the failed add', add('round/mine') === 'threw' && branches() === 'round/mine', branches());
rmSync(repo, { recursive: true, force: true });

const hop = hiddenHop('win32', { PATH: 'x' })!;
check('Windows: the detached serve re-runs itself hidden, once, with piped stdio (no console window)', hop.options.windowsHide === true && hop.options.stdio.join() === 'ignore,pipe,pipe' && hop.options.env.WF_SERVE_HIDDEN === '1' && hop.options.env.PATH === 'x' && hop.args.slice(1).join(' ') === 'serve --foreground' && hiddenHop('win32', hop.options.env) === null);
check('elsewhere: no hop', hiddenHop('linux', {}) === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
