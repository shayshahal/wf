#!/usr/bin/env node
// wf seed [--reset] — put this worktree's fixtures back to their fixed values (db.mjs). --reset drops the
// worktree DB first, for when a repro dirtied the data mid-round. Fixtures: docs/agents/seed.md.
import { execFileSync } from 'node:child_process';
import { seedDatabase, worktreeDatabase } from './db.mjs';
import { slugForBranch } from '../../worktree.mjs';

export function runSeed(argv) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const slug = slugForBranch(git('rev-parse', '--abbrev-ref', 'HEAD'));
  seedDatabase({ worktree: git('rev-parse', '--show-toplevel'), slug, database: worktreeDatabase(slug), reset: argv.includes('--reset') });
}

if (process.argv[1]?.endsWith('seed.mjs')) runSeed(process.argv.slice(2));
