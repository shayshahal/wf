#!/usr/bin/env node
// wf seed [--reset] — put this worktree's fixtures back to their fixed values (db.ts). --reset drops the
// worktree DB first, for when a repro dirtied the data mid-round. Fixtures: docs/agents/seed.md.
import { execFileSync } from 'node:child_process';
import { seedDatabase, worktreeDatabase } from './db.ts';
import { seedUrl } from './index.ts';
import { basePortForBranch, slugForBranch } from '../../src/worktrees/worktree.ts';

export function runSeed(argv: string[]): void {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const slug = slugForBranch(branch);
  const mongoUrl = seedUrl({ slug, port: basePortForBranch(branch) });
  seedDatabase({ worktree: git('rev-parse', '--show-toplevel'), database: worktreeDatabase(slug), mongoUrl, reset: argv.includes('--reset') });
}

if (process.argv[1]?.endsWith('seed.ts')) runSeed(process.argv.slice(2));
