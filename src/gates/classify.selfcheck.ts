// classify.selfcheck.ts — node classify.selfcheck.ts → exit 0 when green.
// The contract-path globs `wf next` measures a plan's own files with, against the gitattributes file
// the same globs make: `git check-attr` is the truth, and the pure matcher has to agree with it path
// by path. A temp repo stands in; nothing is committed.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classAttributes, classFromFiles, contractGlob } from './classify.ts';

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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
