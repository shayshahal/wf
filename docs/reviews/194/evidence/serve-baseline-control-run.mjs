// Evidence-only baseline controller; no source transformations or wf commands.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const repo = process.cwd();
const evidence = resolve('docs/reviews/194/evidence');
const revision = '8622ce7de2a1243f0dc34c806f5bc7682bc508fe';
const owner = mkdtempSync(join(tmpdir(), 'wf-194-serve-base-control-'));
const workspace = join(owner, 'base');
const hooks = join(owner, 'empty-hooks');
mkdirSync(hooks);
const records = [];
function run(command, args, cwd, logfile, timeout = 180000) {
 const start = new Date(); const clock = performance.now();
 const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
 const record = { command, args, cwd, started: start.toISOString(), elapsedSeconds: (performance.now()-clock)/1000, status: result.status, signal: result.signal, error: result.error?.message, logfile };
 records.push(record);
 writeFileSync(join(evidence, logfile), JSON.stringify(record, null, 2)+'\n\nSTDOUT\n'+(result.stdout??'')+'\nSTDERR\n'+(result.stderr??''));
 console.log(JSON.stringify(record));
 return result;
}
let added = false;
try {
 const add = run('git', ['-c', `core.hooksPath=${hooks}`, 'worktree', 'add', '--detach', workspace, revision], repo, 'serve-baseline-worktree-add.log');
 if (add.status !== 0) throw Error('baseline worktree add failed');
 added = true;
 run('git', ['rev-parse', 'HEAD'], workspace, 'serve-baseline-revision.log');
 run('git', ['status', '--porcelain'], workspace, 'serve-baseline-status-before.log');
 run(process.execPath, ['src/worktrees/serve.selfcheck.ts'], workspace, 'serve-baseline-run-1.log');
 run(process.execPath, ['src/worktrees/serve.selfcheck.ts'], workspace, 'serve-baseline-run-2.log');
 run('git', ['status', '--porcelain'], workspace, 'serve-baseline-status-after.log');
} finally {
 if (added) {
  const removal = run('git', ['-c', `core.hooksPath=${hooks}`, 'worktree', 'remove', workspace], repo, 'serve-baseline-worktree-remove.log');
  if (removal.status === 0) rmSync(owner, { recursive: true, force: true });
 }
 writeFileSync(join(evidence, 'serve-baseline-control-results.json'), JSON.stringify({ revision, node: process.version, platform: process.platform, arch: process.arch, records }, null, 2)+'\n');
}
