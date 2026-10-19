// env/worktrees.selfcheck.ts — node env/worktrees.selfcheck.ts → exit 0 when green.
// Removal policy plus disposable real Git/worktrunk allocation (no project setup).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { teardown } from '../src/project.ts';
import { plug } from '../src/seams.ts';
import { pieces } from './projects/jewelryx/index.ts';
import { createWorktree, removalPlan } from './worktrees.ts';
import { createWorktree as allocateWorktree, listWorktrees, slugForBranch } from '../src/worktrees/worktree.ts';
import { seams } from '../src/seams.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

plug({ project: pieces });
const plan = removalPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 }, 'win32');
const labels = plan.map((step) => step.label);
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:\\wt\\fix-bjew-1' });
check('verified owned releases precede project teardown and directory removal', labels.join('|') === ['stop owned servers', 'close the show browser', ...down.map((step) => step.label), 'wt remove', 'rm -rf worktree', 'git worktree prune'].join('|'));
check('the show browser is released before the folder, by identity', plan.slice(0, 2).every((step) => Boolean(step.run) && !step.cmd));
check('release uses the identity-verifying operation, never a path sweep', Boolean(plan[0].run) && !plan[0].cmd);
check('wt remove preserves the local branch', plan.find((step) => step.label === 'wt remove')?.args?.includes('--no-delete-branch'));
const served = mkdtempSync(join(tmpdir(), 'wf-served-'));
mkdirSync(join(served, '.wf'));
writeFileSync(join(served, '.wf', 'serve.pid'), '5150');
const withStack = removalPlan({ branch: 'fix/bjew-1', path: served, slug: 'fix-bjew-1', pid: 4242 }, 'win32');
check('both served and unserved worktrees use verified release', Boolean(withStack[0].run) && withStack[0].label === plan[0].label);
rmSync(served, { recursive: true, force: true });

// Real wt proves TOML parsing, argv boundaries, --create refusal and hook selection. On a kit-only
// machine this optional machine-integration arm is explicit; shared allocation has its own Git test.
if (spawnSync('wt', ['--version'], { encoding: 'utf8' }).status !== 0) {
  console.log('  SKIP real wt allocation: worktrunk is not installed');
} else {
  const root = mkdtempSync(join(tmpdir(), "wf wt ' allocation "));
  const cwd = process.cwd();
  const originalEnv = { ...process.env };
  const originalAllocator = seams.createWorktree;
  const repo = join(root, process.platform === 'win32' ? "repo ' spaces" : `repo ' and \" quotes`);
  const config = join(root, 'user.toml');
  const events = join(root, 'events.jsonl');
  const trap = join(root, 'project-hook-ran');
  const hook = join(root, 'hook.mjs');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    mkdirSync(repo);
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    mkdirSync(join(repo, '.config'));
    writeFileSync(join(repo, '.config', 'wt.toml'), `pre-start = ${JSON.stringify(`node -e \"require('fs').writeFileSync('${trap.replace(/\\/g, '/')}', 'bad')\"`)}\npost-start = \"exit 31\"\n`);
    git('add', '.');
    git('-c', 'user.name=wf', '-c', 'user.email=wf@test', 'commit', '-qm', 'fixture');
    writeFileSync(hook, `import { appendFileSync, existsSync } from 'node:fs';\nappendFileSync(${JSON.stringify(events)}, JSON.stringify({ cwd: process.cwd(), metadata: existsSync('.wf/.gitignore') }) + '\\n');\nif (process.env.WF_WT_TEST_HOOK_FAIL === '1') process.exit(17);\n`);
    // The conflicting saved destination and env override stand in for another tool's preferences.
    const saved = `worktree-path = ${JSON.stringify(`${root.replace(/\\/g, '/')}/other-tool/{{ branch | sanitize }}`)}\npre-start = ${JSON.stringify(`node \"${hook.replace(/\\/g, '/')}\"`)}\n`;
    writeFileSync(config, saved);
    process.env.WORKTRUNK_CONFIG_PATH = config;
    process.env.WORKTRUNK_SYSTEM_CONFIG_PATH = join(root, 'no-system.toml');
    process.env.WORKTRUNK_PROJECT_CONFIG_PATH = '.config/wt.toml';
    process.env.WORKTRUNK_WORKTREE_PATH = `${root.replace(/\\/g, '/')}/environment-other-tool/{{ branch | sanitize }}`;
    process.chdir(repo);
    plug({ createWorktree });
    const records = (): { cwd: string; metadata: boolean }[] => existsSync(events) ? readFileSync(events, 'utf8').trim().split('\n').map((s) => JSON.parse(s)) : [];
    const canonical = (path: string) => realpathSync.native(path).toLowerCase();
    for (const branch of ['round/one', 'wf-baseline/round-one']) {
      const tree = await allocateWorktree({ branch, base: 'main', log: join(root, `${slugForBranch(branch)}.log`) });
      const expected = join(repo, '.claude', 'worktrees', slugForBranch(branch));
      check(`${branch}: real wt honors the shared destination, not saved or environment config`, canonical(tree.path) === canonical(expected) && git('-C', tree.path, 'rev-parse', 'HEAD') === git('rev-parse', 'main'));
      check(`${branch}: user pre-start runs once, only after registration and metadata`, records().length === (branch === 'round/one' ? 1 : 2) && records().at(-1)?.metadata && canonical(records().at(-1)?.cwd ?? '') === canonical(expected) && !existsSync(trap));
    }
    for (const branch of ['round/one', 'wf-baseline/round-one', 'round/existing-ref']) {
      if (branch === 'round/existing-ref') git('branch', branch);
      const before = git('worktree', 'list', '--porcelain');
      let failure = '';
      try { await allocateWorktree({ branch, base: 'main', log: join(root, 'refusal.log') }); }
      catch (e) { failure = e instanceof Error ? e.message : String(e); }
      check(`${branch}: --create refuses existing branches without adopting or running setup`, failure.includes('wt switch --create failed') && records().length === 2 && git('worktree', 'list', '--porcelain') === before && git('show-ref', '--verify', `refs/heads/${branch}`).length > 0, failure);
    }
    // Worktrunk templates even a literal string. A deliberately templated request makes wt create
    // elsewhere: validation must refuse before metadata/hooks and preserve the registered tree.
    const wrong = join(repo, '.claude', 'worktrees', 'literal-{{ branch | sanitize }}');
    let mismatch = '';
    try { createWorktree({ branch: 'round/mismatch', base: 'main', log: join(root, 'mismatch.log'), path: wrong }); }
    catch (e) { mismatch = e instanceof Error ? e.message : String(e); }
    const misplaced = listWorktrees().find((tree) => tree.branch === 'round/mismatch');
    check('wrong registered destination refuses before metadata/setup, without deleting or adopting it', mismatch.includes('wt allocation destination mismatch:') && records().length === 2 && misplaced && existsSync(misplaced.path) && !existsSync(join(misplaced.path, '.wf')), mismatch);
    // Windows cannot create a double quote in a filename. wt still parses that TOML/argv string
    // before Git rejects the path; Unix exercises both quote kinds in the successful repo path.
    if (process.platform === 'win32') {
      let quoted = '';
      try { createWorktree({ branch: 'round/quoted', base: 'main', log: join(root, 'quoted.log'), path: join(repo, 'double\" quote') }); }
      catch (e) { quoted = e instanceof Error ? e.message : String(e); }
      check('double quotes survive TOML parsing as literal path data, not extra config or shell input', quoted.includes('wt switch --create failed') && !quoted.includes('invalid TOML') && records().length === 2, quoted);
    }
    process.env.WF_WT_TEST_HOOK_FAIL = '1';
    let hookFailure = '';
    try { await allocateWorktree({ branch: 'round/hook-failure', base: 'main', log: join(root, 'hook-failure.log') }); }
    catch (e) { hookFailure = e instanceof Error ? e.message : String(e); }
    check('failed pre-start reports failure and preserves the newly allocated worktree', hookFailure.includes('pre-start hooks failed') && records().length === 3 && listWorktrees().some((tree) => tree.branch === 'round/hook-failure'), hookFailure);
    check('saved global config is byte-identical and no other-tool directory is created', readFileSync(config, 'utf8') === saved && !existsSync(join(root, 'other-tool')) && !existsSync(join(root, 'environment-other-tool')));
  } finally {
    process.chdir(cwd);
    plug({ createWorktree: originalAllocator });
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
