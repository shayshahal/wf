// classify.selfcheck.ts — node classify.selfcheck.ts → exit 0 when green.
// The contract-path globs `wf next` measures a plan's own files with, against the gitattributes file
// the same globs make: `git check-attr` is the truth, and the pure matcher has to agree with it path
// by path. A temp repo stands in; nothing is committed.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classAttributes, classFromFiles, contractGlob } from './classify.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// JewelryX's globs (docs/agents/contract-paths.txt) and a path for every rule, including the ones a
// plan would list.
const contractPaths = [
  '# comment',
  'packages/backend/app/models/**',
  'packages/backend/app/schemas/**',
  'packages/backend/app/api/**',
  'packages/backend/openapi.json',
  'packages/frontend/*/src/lib/*.remote.ts',
  'packages/frontend/*/src/lib/**/*.remote.ts',
  'packages/frontend/*/src/lib/server/**',
  'packages/frontend/shared/**',
  '**/auth/**',
  '**/permissions*',
  '**/core/security*',
  'package.json',
  'pnpm-lock.yaml',
  'pyproject.toml',
  'requirements.txt',
  'packages/backend/migrations/**',
  'packages/backend/scripts/migrate*',
  'packages/backend/app/core/config.py',
  '.github/**',
  'docker-compose*.yml',
  'infrastructure/**',
].join('\n');
const paths = [
  'packages/backend/app/models/user.py',
  'packages/backend/app/services/cart.py',
  'packages/backend/openapi.json',
  'packages/frontend/b2b/src/lib/api.remote.ts',
  'packages/frontend/b2b/src/lib/deep/api.remote.ts',
  'packages/frontend/b2b/src/lib/server/db.ts',
  'packages/frontend/shared/types/x.ts',
  'packages/backend/app/auth/login.py',
  'packages/backend/app/permissions.py',
  'packages/backend/app/core/security.py',
  'package.json',
  'packages/backend/package.json',
  'docker-compose.worktree.yml',
  'infrastructure/x.tf',
  '.github/workflows/x.yml',
  'packages/backend/migrations/0001_x.py',
  'packages/backend/scripts/migrate_users.py',
  'docs/agents/contract-paths.txt',
  'packages/frontend/admin/src/routes/+page.svelte',
  'packages/backend/tests/test_x.py',
  'src/gates/check.ts',
];

const repo = mkdtempSync(join(tmpdir(), 'wf-classify-'));
writeFileSync(join(repo, 'attrs'), classAttributes(contractPaths));
execFileSync('git', ['init', '-q'], { cwd: repo, stdio: ['pipe', 'pipe', 'ignore'] });
const out = execFileSync('git', ['-c', `core.attributesFile=${join(repo, 'attrs').replace(/\\/g, '/')}`, 'check-attr', '--stdin', 'wf-class'], { cwd: repo, input: paths.join('\n'), encoding: 'utf8' });
const gitClass = new Map(out.split('\n').filter(Boolean).map((l) => {
  const m = /^(.*): wf-class: (\S+)$/.exec(l)!;
  return [m[1], m[2] === 'unspecified' ? 'A' : m[2]] as const;
}));
for (const p of paths) check(`the matcher agrees with git check-attr: ${p}`, classFromFiles([p], contractPaths) === gitClass.get(p), `matcher ${classFromFiles([p], contractPaths)}, git ${gitClass.get(p)}`);
rmSync(repo, { recursive: true, force: true });

// The edges the table does not spell out.
check('`*` does not cross a slash', contractGlob('packages/frontend/*/x.ts', 'packages/frontend/b2b/deep/x.ts') === false && contractGlob('packages/frontend/*/x.ts', 'packages/frontend/b2b/x.ts') === true);
check('`**` crosses slashes', contractGlob('packages/frontend/*/src/lib/**/*.remote.ts', 'packages/frontend/b2b/src/lib/a/b/x.remote.ts') === true);
check('a pattern with no slash matches at any level, and is not a prefix', contractGlob('package.json', 'a/b/package.json') === true && contractGlob('package.json', 'package.json.bak') === false);
check('a comment and a blank line match nothing', classFromFiles(['src/x.ts'], '# a\n\n') === 'A');
check('one contract path among many files is B', classFromFiles(['a.ts', 'packages/backend/app/models/u.py'], contractPaths) === 'B');
check('a plan that touches no contract path is A', classFromFiles(['src/x.ts', 'docs/y.md'], contractPaths) === 'A');
check('no files is A', classFromFiles([], contractPaths) === 'A');

// The real command route, not the pure matcher: run.ts dispatches `classify` to runClassify, and only
// running wf.mjs the way a person does exercises the arguments it owns, its output and its failure
// modes. 2026-10-09: the route only imported the module, so `wf classify` printed nothing and exited 0.
const cliEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const cliWf = (repo: string, args: string[]) => spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, env: cliEnv, encoding: 'utf8', timeout: 15000 });
const jsonClass = (out: string): string | undefined => { try { return JSON.parse(out).class; } catch { return undefined; } };
// A repo on `main` and a round branch one commit ahead, with the project's contract-paths file
// (project.ts) unless the test is about it missing.
const cliRepo = (paths: string | null) => {
  const repo = mkdtempSync(join(tmpdir(), 'wf-classify-cli-'));
  const git = (args: string[]) => {
    const r = spawnSync('git', args, { cwd: repo, env: cliEnv, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`fixture git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
  };
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'wf classify selfcheck']);
  git(['config', 'user.email', 'wf-classify@example.invalid']);
  if (paths !== null) {
    mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'agents', 'contract-paths.txt'), paths);
  }
  writeFileSync(join(repo, 'product.ts'), 'export const value = 0;\n');
  git(['add', '.']);
  git(['commit', '-qm', 'base']);
  git(['switch', '-qc', 'round/classify-cli']);
  writeFileSync(join(repo, 'product.ts'), 'export const value = 1;\n');
  git(['add', 'product.ts']);
  git(['commit', '-qm', 'change product']);
  return repo;
};

const bRepo = cliRepo('**/*.ts\n');
try {
  const json = cliWf(bRepo, ['classify', '--base', 'main', '--json']);
  check('wf classify --base main --json exits 0 with output', json.status === 0 && json.stdout.trim() !== '', `exit ${json.status}, out ${JSON.stringify(json.stdout)}`);
  let parsed: { class?: string; files?: unknown } = {};
  try { parsed = JSON.parse(json.stdout); } catch { /* the next check reports the raw output */ }
  check('wf classify --base main --json returns class B and product.ts', parsed.class === 'B' && JSON.stringify(parsed.files) === JSON.stringify([{ path: 'product.ts', class: 'B' }]), json.stdout.trim());
  const text = cliWf(bRepo, ['classify', '--base', 'main']);
  check('wf classify (text) lists the file then the class', text.status === 0 && text.stdout === 'B\tproduct.ts\nclass: B\n', JSON.stringify(text.stdout));
  const badBase = cliWf(bRepo, ['classify', '--base', 'no-such-ref']);
  check('--base reaches the diff: a missing ref fails the command', badBase.status !== 0, `exit ${badBase.status}, out ${JSON.stringify(badBase.stdout)}`);
  // No --base: the persisted .wf/state.json base (set by `wf new`) is the one the diff uses.
  mkdirSync(join(bRepo, '.wf'), { recursive: true });
  writeFileSync(join(bRepo, '.wf', 'state.json'), `${JSON.stringify({ base: 'main' })}\n`);
  const persisted = cliWf(bRepo, ['classify', '--json']);
  check('without --base the state.json base is used', persisted.status === 0 && jsonClass(persisted.stdout) === 'B', `exit ${persisted.status}, out ${JSON.stringify(persisted.stdout)}`);
} finally { rmSync(bRepo, { recursive: true, force: true }); }

const aRepo = cliRepo('packages/backend/app/models/**\n');
try {
  const run = cliWf(aRepo, ['classify', '--base', 'main', '--json']);
  check('a change off every contract path is class A', run.status === 0 && jsonClass(run.stdout) === 'A', `exit ${run.status}, out ${JSON.stringify(run.stdout)}`);
} finally { rmSync(aRepo, { recursive: true, force: true }); }

const noDocs = cliRepo(null);
try {
  const run = cliWf(noDocs, ['classify', '--base', 'main', '--json']);
  check('a missing contract-paths file fails, not reads as A', run.status !== 0 && /contract-paths\.txt is missing/.test(run.stderr), `exit ${run.status}, err ${JSON.stringify(run.stderr)}`);
} finally { rmSync(noDocs, { recursive: true, force: true }); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
