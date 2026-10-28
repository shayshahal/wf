// Controlled #149 repro: real Git/state/reconciliation; no live remote or project stack.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot = process.argv[2] ?? fileURLToPath(new URL('../../../', import.meta.url));
const importSource = (path) => import(pathToFileURL(join(sourceRoot, path)).href);
const { reconcilePublishedDelivery } = await importSource('src/gates/deliver.ts');
const { readState } = await importSource('src/round/state.ts');
const { plug } = await importSource('src/seams.ts');
const { nextAction } = await importSource('src/round/next.ts');
const { headContentSha, trackerNotePath } = await importSource('src/gates/content-identity.ts');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'wf-149-conflict-repro-'));
const fixtureWorktree = join(fixtureRoot, 'work');
mkdirSync(fixtureWorktree);
process.env.GIT_CONFIG_GLOBAL = join(fixtureRoot, 'gitconfig');
process.env.GIT_CONFIG_SYSTEM = process.env.GIT_CONFIG_GLOBAL;
process.env.WF_FULL_COMMAND = '1';
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
for (const key of Object.keys(process.env)) {
  if ((key.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'].includes(key)) || key.startsWith('T3_') || key.startsWith('T3CODE_')) delete process.env[key];
}
const gitFixture = (...args) => {
  const result = spawnSync('git', args, { cwd: fixtureWorktree, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Conflict repro Git command failed: ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};
try {
  gitFixture('init', '-q', '-b', 'dev');
  gitFixture('config', 'user.name', 'wf conflict repro');
  gitFixture('config', 'user.email', 'wf@selfcheck');
  gitFixture('config', 'core.autocrlf', 'false');
  writeFileSync(join(fixtureWorktree, 'README.md'), 'base\n');
  gitFixture('add', '.');
  gitFixture('commit', '-qm', 'fixture base');
  const baseHead = gitFixture('rev-parse', 'HEAD');
  const branch = 'fix/149-conflict-repro';
  gitFixture('switch', '-qc', branch);
  writeFileSync(join(fixtureWorktree, 'README.md'), 'published feature\n');
  gitFixture('add', '.');
  gitFixture('commit', '-qm', 'fixture published head');
  const head = gitFixture('rev-parse', 'HEAD');
  gitFixture('remote', 'add', 'origin', 'https://github.com/o/r.git');
  const folder = 'docs/reviews/149';
  mkdirSync(join(fixtureWorktree, folder), { recursive: true });
  writeFileSync(join(fixtureWorktree, folder, 'TICKET.md'), '# Controlled conflict repro\n');
  mkdirSync(join(fixtureWorktree, '.wf'));
  const url = 'https://github.com/o/r/pull/149';
  const stateFile = join(fixtureWorktree, '.wf/state.json');
  writeFileSync(stateFile, JSON.stringify({ wf_version: 3, round: branch, class: 'A', id: 'GH-149', ids: ['GH-149'], folder, base: 'dev', step: 'pr', made_by: 'kit', pr_handoff: { url, head, contentSha: headContentSha(fixtureWorktree, folder, trackerNotePath(folder)) } }));
  const remoteCalls = [];
  plug({ gh: (args) => {
    remoteCalls.push(args);
    if (args[0] !== 'pr' || args[1] !== 'list') throw new Error(`Conflict repro unexpected remote mutation: ${args.join(' ')}`);
    return { status: 0, stderr: '', stdout: JSON.stringify([{ url, state: 'OPEN', headRefOid: head, headRefName: branch, baseRefName: 'dev', isCrossRepository: false, mergeable: 'CONFLICTING', baseRefOid: baseHead }]) };
  } });
  const reconciliation = await reconcilePublishedDelivery(fixtureWorktree);
  const state = readState(fixtureWorktree);
  const next = nextAction({ branch, entry: `${sourceRoot}/wf.mjs`, step: state.step, klass: 'A', check: false, questions: [], answered: [], files: { agreement: null, assessment: null, review: null, blocked: null }, t1: { sha: null, reviewed: null, verdict: null }, head, note: null, prHandoff: state.pr_handoff, prRepair: state.pr_repair, corrections: state.corrections });
  const corrections = state.corrections ?? [];
  console.log(`Baseline: ${gitFixture('rev-parse', 'HEAD')} (disposable fixture head)`);
  console.log('Controlled remote: OPEN, matching published head, mergeable=CONFLICTING');
  console.log(`Requested fields: ${remoteCalls[0]?.[remoteCalls[0].indexOf('--json') + 1]}`);
  console.log(`Reconciliation result: ${JSON.stringify(reconciliation)}`);
  console.log(`Recorded corrections: ${corrections.length}`);
  console.log(`Next action: ${next.say}`);
  console.log(`Candidate retained: ${JSON.parse(readFileSync(stateFile, 'utf8')).pr_handoff.url === url}`);
  const recovered = corrections.some((correction) => correction.kind === 'system') && !next.say.includes('remains open for human merge');
  console.log(recovered ? 'PASS: confirmed conflict has an actionable system correction' : 'FAIL: confirmed conflict is not routed to scoped repair');
  process.exitCode = recovered ? 0 : 1;
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
