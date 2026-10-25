// Disposable executed recovery probe; never invokes project database teardown or shared hooks.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RemovalStep } from '../src/seams.ts';
import { plug } from '../src/seams.ts';
import { runReap } from '../src/worktrees/reap.ts';
import { removalPlan as kitPlan } from '../src/worktrees/git-worktree.ts';
import { removalPlan as envPlan } from './worktrees.ts';
import { pieces as envProject } from './projects/jewelryx/index.ts';
import { runRemovalStep } from '../src/worktrees/removal.ts';
const script = fileURLToPath(import.meta.url);
const journalFor = (root: string, branch: string) => join(root, '.git', `wf-reap-${createHash('sha256').update(branch).digest('hex')}.json`);
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (process.argv[2] === 'child') {
  const [root, target, branch, builder, stop] = process.argv.slice(3);
  process.chdir(root);
  process.env.WF_FORCE_REAP = '1';
  plug({ project: builder === 'env' ? envProject : {}, processes: { snapshot: () => ({ kind: 'known', processes: [{ pid: process.pid, parent: 1, born: '2026-10-24T00:00:00Z' }] }), kill: () => { throw Error('no process kill allowed'); } }, removalPlan: (o) => {
    const plan = (builder === 'kit' ? kitPlan : envPlan)(o);
    console.log('actual plan:', plan.map(s => s.label).join(' → '));
    return plan.map((step): RemovalStep => {
      if (['drop database', 'drop stranded test databases', 'its own mongo container, if any', 'portless prune'].includes(step.label)) return { label: step.label, run: () => console.log('fixture: database intentionally not invoked') };
      if (step.label === 'wt remove') return { label: step.label, run: () => { if (existsSync(target)) git(root, 'worktree', 'remove', '--force', target); } };
      if (step.rm) return { label: step.label, run: async () => { const result = await runRemovalStep(step); assert.ok(result.ok); if (stop === 'before-save') process.exit(73); } };
      if (step.label === 'git worktree prune') return { label: step.label, run: async () => {
        if (stop === 'after-save') process.exit(74);
        if (stop === 'failed-prune') throw Error('fixture: prune failed');
        writeFileSync(join(root, 'prune-attempted'), 'yes');
        const result = await runRemovalStep(step); assert.ok(result.ok);
      } };
      return step;
    });
  } });
  await runReap([branch]);
} else {
  let failures = 0;
  const run = (...args: string[]) => spawnSync(process.execPath, [script, 'child', ...args], { encoding: 'utf8' });
  for (const builder of ['kit', 'env']) for (const stop of ['before-save', 'after-save', 'failed-prune']) {
    const root = mkdtempSync(join(tmpdir(), 'wf-192-A-'));
    try {
      const target = join(root, 'target'); const branch = 'bench/192-a';
      git(root, 'init', '-q', '-b', 'main');
      git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'base');
      git(root, 'worktree', 'add', '-qb', branch, target);
      for (const file of ['docs/agents/verify-jewelryx/control-jewelryx.mjs', 'verification/node_modules/@playwright/cli/playwright-cli.js']) {
        mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), '// harmless placeholder\n');
      }
      const first = run(root, target, branch, builder, stop);
      assert.equal(first.status, stop === 'before-save' ? 73 : stop === 'after-save' ? 74 : 1, first.stdout + first.stderr);
      assert.ok(!existsSync(target), 'actual checkout deletion occurred');
      const journal = journalFor(root, branch); assert.ok(existsSync(journal));
      const next = JSON.parse(readFileSync(journal, 'utf8')).next;
      const retry = run(root, target, branch, builder, 'retry');
      const confirmed = retry.status === 0 && existsSync(join(root, 'prune-attempted')) && !existsSync(journal);
      console.log(`A ${builder} ${stop}: saved next=${next}; retry=${retry.status}; prune attempted=${existsSync(join(root, 'prune-attempted'))}; journal retained=${existsSync(journal)}; ${confirmed ? 'PASS' : 'FAIL'}`);
      console.log(first.stdout.trim(), first.stderr.trim(), retry.stdout.trim(), retry.stderr.trim());
      assert.match(git(root, 'branch', '--list', branch), /bench\/192-a/, 'unmerged branch survives');
      if (!confirmed) failures++;
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  // Stable real kit plan: no checkout files at either construction; seed at the branch step.
  for (const deletedBeforeAck of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'wf-192-B-'));
    try {
      const target = join(root, 'gone'); const branch = 'bench/192-b';
      git(root, 'init', '-q', '-b', 'main');
      git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'base');
      git(root, 'branch', branch);
      if (deletedBeforeAck) git(root, 'branch', '-D', branch); // deletion succeeds; intentionally no journal acknowledgement
      else git(root, 'update-ref', '-d', `refs/heads/${branch}`);
      const next = kitPlan({ path: target, slug: 'bench-192-b', pid: process.pid }).length;
      const journal = journalFor(root, branch);
      writeFileSync(journal, JSON.stringify({ branch, path: resolve(target), token: 'fixture-192', directory: null, next, merged: true, plan: [...kitPlan({ path: target, slug: 'bench-192-b', pid: process.pid }).map(step => step.label), `delete local branch ${branch}`] }));
      const retry = run(root, target, branch, 'kit', 'retry');
      const confirmed = retry.status === 0 && !existsSync(journal);
      console.log(`B ${deletedBeforeAck ? 'deleted-before-ack' : 'already-absent'}: stable next=${next}; retry=${retry.status}; journal retained=${existsSync(journal)}; ${confirmed ? 'PASS' : 'FAIL'}`);
      console.log(retry.stdout.trim(), retry.stderr.trim());
      if (!confirmed) failures++;
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  // Corrupt/legacy authority is retained byte-for-byte, before any resumed effect.
  for (const variant of ['legacy-progress', 'changed', 'malformed', 'out-of-range', 'legacy-zero', 'branch-moved']) {
    const root = mkdtempSync(join(tmpdir(), 'wf-192-identity-'));
    try {
      const target = join(root, 'gone'); const branch = 'bench/192-identity';
      git(root, 'init', '-q', '-b', 'main');
      git(root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'base');
      git(root, 'branch', branch);
      const plan = kitPlan({ path: target, slug: 'bench-192-identity', pid: process.pid }).map(step => step.label);
      const journal = journalFor(root, branch);
      const next = variant === 'out-of-range' ? plan.length + 1 : variant === 'legacy-zero' ? 0 : plan.length - 1;
      const identity = variant === 'changed' ? [...plan].reverse() : variant === 'malformed' ? [null] : plan;
      const bytes = JSON.stringify({ branch, path: resolve(target), token: 'fixture-192', directory: null, next, merged: false,
        ...(variant.startsWith('legacy-') ? {} : { plan: identity }) });
      writeFileSync(journal, bytes);
      const other = join(root, 'other');
      if (variant === 'branch-moved') git(root, 'worktree', 'add', other, branch);
      const retry = run(root, target, branch, 'kit', 'retry');
      if (variant === 'legacy-zero') {
        assert.equal(retry.status, 0, retry.stdout + retry.stderr);
        assert.ok(!existsSync(journal) && existsSync(join(root, 'prune-attempted')));
      } else {
        assert.notEqual(retry.status, 0, retry.stdout + retry.stderr);
        assert.equal(readFileSync(journal, 'utf8'), bytes, 'refusal preserves original authority');
        assert.ok(!existsSync(join(root, 'prune-attempted')), 'refusal precedes outstanding effects');
        if (variant === 'branch-moved') assert.ok(existsSync(other), 'another worktree survives stale journal');
      }
      console.log(`identity ${variant}: PASS`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  console.log(`${failures} failed acceptance witnesses`); process.exitCode = failures ? 1 : 0;
}
