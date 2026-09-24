#!/usr/bin/env node
// wf seed [--reset] — restore this worktree's fixture snapshot (stack/db.mjs). --reset drops the
// worktree DB first, for when a repro dirtied the data mid-round. Fixtures: docs/agents/seed.md.
import { execFileSync } from 'node:child_process';
import { seedDatabase, worktreeDatabase } from './stack/db.mjs';
import { slugForBranch } from './worktree.mjs';

// Printed by `wf new`. The full fixture list (ids, statuses, balances) is in
// docs/agents/seed.md; these three logins are what a round needs on line one.
export const SEED_CREDENTIALS = [
  'Seed logins: admin@jewelryx.com / admin123 · seller@seed.jewelryx / seed1234 · buyer@seed.jewelryx / seed1234',
  'Fixtures:    SG-0001..SG-0005 · ORD-0001..ORD-0009 · MKT-0001 · AUC-0001 · SEED-RNG-001 … (docs/agents/seed.md)',
].join('\n');

export function runSeed(argv) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const slug = slugForBranch(git('rev-parse', '--abbrev-ref', 'HEAD'));
  seedDatabase({ worktree: git('rev-parse', '--show-toplevel'), slug, database: worktreeDatabase(slug), reset: argv.includes('--reset') });
}

if (process.argv[1]?.endsWith('seed.mjs')) runSeed(process.argv.slice(2));
