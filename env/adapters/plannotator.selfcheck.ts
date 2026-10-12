// The adapter's worktree-local review logs must not mutate shared config or invalidate T2.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worktreeContentSha } from '../../src/gates/content-identity.ts';
import { excludeWfFolder } from '../../src/worktrees/worktree.ts';
import { prepareReviewDataDir } from './plannotator.ts';

const repo = mkdtempSync(join(tmpdir(), 'wf-review-data-'));
try {
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base', '--allow-empty');
  excludeWfFolder(repo);
  const exclude = join(repo, '.git', 'info', 'exclude');
  const shared = readFileSync(exclude, 'utf8');
  const before = worktreeContentSha(repo, null, null, 'approval');
  const dir = prepareReviewDataDir(repo);
  writeFileSync(join(dir, 'review-log.json'), '{}\n');
  if (readFileSync(exclude, 'utf8') !== shared || worktreeContentSha(repo, null, null, 'approval') !== before) throw new Error('review logs changed shared excludes or the reviewed identity');
  console.log('  ok   local review logs leave shared configuration and T2 identity unchanged');
} finally {
  rmSync(repo, { recursive: true, force: true });
}
