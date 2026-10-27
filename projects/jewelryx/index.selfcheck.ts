// index.selfcheck.ts — node projects/jewelryx/index.selfcheck.ts → exit 0 when green.
// Pure arms: JewelryX's ports and addresses, pages and tracker note (index.ts), the worktree's .env
// (env.ts), its database's name and the stranded test databases (db.ts) and its dev-server commands (dev.ts), with no machine
// plugged in. Shay's machine's arms: env/projects/jewelryx/index.selfcheck.ts. Nothing is run; the repro files are written into a temp folder.
import { strandedTestDatabases, worktreeDatabase } from './db.ts';
import { devCommands } from './dev.ts';
import { includedFiles, sanitizeEnv } from './env.ts';
import { agreementGap } from '../../src/round/agreement.ts';
import { protectedFilesGap, directUrls, pageOf, agreementCaseGap, prBaseOf, roundFolderSubject, baselineRunnerEnv, baselineStackEnv, runnerEnv, secretsGap, setup, stackUrls, teardown, trackerNote, verificationStackEnv } from './index.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../../src/paths.ts';
import { basePortForBranch } from '../../src/worktrees/worktree.ts';
import { installShim, SHIM_CMD, SHIM_SH, REPRO_CONFIG, REPRO_GLOBAL_SETUP, reproConfig, verifyStackEnv, VERIFY_SKILL, writeReproConfig } from './round.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── ports and addresses
const direct = directUrls(12345);
check('direct: B2B on P, admin P+20000, API on 127.0.0.1 at P+10000', direct.b2b === 'http://localhost:12345' && direct.admin === 'http://localhost:32345' && direct.api === 'http://127.0.0.1:22345/api/v1', JSON.stringify(direct));
check('with no machine names, a person gets the direct addresses, B2B first (wf status probes it)', JSON.stringify(stackUrls({ slug: 's', port: 12345 })) === JSON.stringify(direct) && Object.keys(direct)[0] === 'b2b');
check('setup steps in wt order: env node verify tools db', Object.keys(setup).join(' ') === 'env node verify tools db', Object.keys(setup).join(' '));

check('node setup prepares both frontend checks after the shared builds in one serial chain', setup.node === 'pnpm install --frozen-lockfile && pnpm build:types && pnpm build:data && pnpm build:filters && pnpm --filter jewelryx-admin-dashboard check:prep && pnpm --filter jewelryx-frontend check:prep', String(setup.node));

// ── the bare control-jewelryx: a shim that runs the cwd's worktree's own copy
{
  const home = mkdtempSync(join(tmpdir(), 'wf-shim-'));
  const bin = join(home, 'bin');
  const mk = (n: string) => { const w = join(home, n); mkdirSync(join(w, VERIFY_SKILL), { recursive: true }); execFileSync('git', ['init', '-q', w]); writeFileSync(join(w, VERIFY_SKILL, 'control-jewelryx.mjs'), `console.log('${n}', process.argv.slice(2).join(' '))`); return w; };
  const a = mk('wt-a'), b = mk('wt-b');
  check('no PATH folder: no shim, no throw', installShim([join(home, 'missing')]) === null);
  mkdirSync(bin);
  check('installs into the first existing folder', installShim([join(home, 'missing'), bin]) === bin && existsSync(join(bin, 'control-jewelryx')) && existsSync(join(bin, 'control-jewelryx.cmd')));
  check('the .cmd shim is CRLF and passes arguments on', SHIM_CMD.includes('\r\n') && SHIM_CMD.includes('%*'));
  if (process.platform !== 'win32' || process.env.MSYSTEM) {
    const run = (cwd: string) => execFileSync('sh', [join(bin, 'control-jewelryx').replaceAll('\\', '/'), 'doctor', 'x'], { cwd, encoding: 'utf8' }).trim();
    check("bare command in worktree a runs a's copy, in b runs b's", run(a) === 'wt-a doctor x' && run(join(a, VERIFY_SKILL)) === 'wt-a doctor x' && run(b) === 'wt-b doctor x');
  }
  rmSync(home, { recursive: true, force: true });
  void SHIM_SH;
}

// ── the red-base proof's environment (#133 review): ONE curated env, hashed and handed to the runner
// Host bookkeeping (PWD, PI_*, _, SHLVL) must not reach the runner nor the proof; OS/tool lookups and
// the test flags must. The isolated merge replaces ONLY the live stack's owned keys with the baseline
// branch's, and drops a key with no baseline value rather than leaking the live one.
const ambient = { PATH: '/bin:/usr/bin', HOME: '/home/x', TEMP: '/tmp', PWD: '/a', PI_SESSION: 's1', _: '/bin/node', SHLVL: '2', CLAUDECODE: '1', CI: '1', TZ: 'UTC', VERIFY_ACTORS: 'seed', OTHER: 'x', npm_config_registry: 'https://r', MONGO_URL: 'mongodb://live' } as NodeJS.ProcessEnv;
const curated = runnerEnv(ambient);
check('the runner env keeps every non-bookkeeping key (OS/tool config, CI, arbitrary flags) and drops only host/session bookkeeping', curated.PATH === '/bin:/usr/bin' && curated.HOME === '/home/x' && curated.CI === '1' && curated.TZ === 'UTC' && curated.VERIFY_ACTORS === 'seed' && curated.npm_config_registry === 'https://r' && curated.OTHER === 'x' && curated.MONGO_URL === 'mongodb://live' && curated.PWD === undefined && curated.PI_SESSION === undefined && curated._ === undefined && curated.SHLVL === undefined && curated.CLAUDECODE === undefined, JSON.stringify(curated));
check('baseline stack env is the seed actors and the BASELINE branch\'s URLs, no live port and no DB', (() => { const e = baselineStackEnv('fix/r'); const base = directUrls(basePortForBranch('fix/r')); return e.B2B_OWNER_EMAIL === 'buyer@seed.jewelryx' && e.B2B_URL === base.b2b && e.API_URL === base.api && e.STACK_LOG === undefined && e.B2B_URL !== directUrls(12345).b2b; })());
const live = directUrls(12345);
const isolated = baselineRunnerEnv({ ambient, taskEnv: { B2B_URL: live.b2b, ADMIN_URL: live.admin, API_URL: live.api, STACK_LOG: '/live/.wf/logs/dev.log', B2B_OWNER_EMAIL: 'live@x', VERIFY_CUSTOM: 'keep' }, branch: 'fix/r' });
const baseline = baselineStackEnv('fix/r');
check('the isolated effective env replaces only the live resource keys, keeps other test config, has no live URL/DB/path', isolated.B2B_URL === baseline.B2B_URL && isolated.API_URL === baseline.API_URL && isolated.B2B_OWNER_EMAIL === baseline.B2B_OWNER_EMAIL && isolated.B2B_OWNER_EMAIL !== 'live@x' && isolated.STACK_LOG === undefined && isolated.MONGO_URL === undefined && isolated.VERIFY_CUSTOM === 'keep' && isolated.OTHER === 'x' && isolated.PATH === '/bin:/usr/bin', JSON.stringify(isolated));
// ── pages a reviewer should open
check('a b2b page, route groups dropped', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')) === '{"app":"b2b","path":"b2b/login"}', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')));
check('an admin root layout is the app root', JSON.stringify(pageOf('packages/frontend/admin/src/routes/+layout.ts')) === '{"app":"admin","path":"admin"}');
check('a params segment stays for the reviewer to fill', pageOf('packages/frontend/b2b/src/routes/orders/[id]/+page.server.ts')?.path === 'b2b/orders/[id]');
check('a component is not a page', pageOf('packages/frontend/b2b/src/lib/x.svelte') === null);

// ── teardown
// The browsers go first: a window keeps the folder as its working folder and Windows will not delete
// it (#180), so the plan closes them before the database steps. The expectation was not updated with
// that step and read red on main until 2026-10-25.
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:/wt/fix-bjew-1' });
check('with no machine plugged in, a teardown closes this checkout\'s browsers, then drops the worktree\'s database and stranded test databases, in-process', down.map((s) => s.label).join() === "close this checkout's browsers,drop database,drop stranded test databases" && down.every((s) => typeof s.run === 'function' && !s.cmd), down.map((s) => s.label).join());
// The backend's names (tests/support/database.py): <name>_test_<pid>_<8 hex>[_<suffix>]; pid 7 is running.
const stranded = strandedTestDatabases(['jewelryx', 'jewelryx_fix-bjew-1', 'jewelryx_test_9304_2cb586fe', 'jewelryx_bench-suites_test_15260_b50c2d2b', 'jewelryx_test_9304_2cb586fe_fx', 'jewelryx_test_7_71d9a288', 'jewelryx-test', 'jewelryx_fix-test_1'], (pid) => pid === 7);
check('stranded: a dead run\'s database and its suffixed one; not a running run\'s, a worktree\'s or one named by hand', stranded.join() === 'jewelryx_test_9304_2cb586fe,jewelryx_bench-suites_test_15260_b50c2d2b,jewelryx_test_9304_2cb586fe_fx', stranded.join());

// ── the tracker note
check('round-folder subject: a ticketed branch starts with its ticket, as the ticket-id hook asks', roundFolderSubject({ id: 'fix/JX-1534-admin-media-import' }).startsWith('JX-1534: round folder'), roundFolderSubject({ id: 'fix/JX-1534-admin-media-import' }));
check('round-folder subject: the first ticket id of a round on sub-tasks', roundFolderSubject({ id: 'feat/JX-1-x', ids: ['JX-1112', 'JX-1113'] }).startsWith('JX-1112: '));
check('round-folder subject: a round with no ticket keeps docs(id)', roundFolderSubject({ id: 'chore/cjx-files' }).startsWith('docs(chore/cjx-files): round folder'));
const note = trackerNote({ ids: ['JX-1112', 'JX-1113'], url: 'https://github.com/x/y/pull/7' });
check('the note is JIRA.md', note.file === 'JIRA.md');
check('one section per id, each with the PR url', note.text.includes('## JX-1112\nהשינוי מוכן ב-PR וממתין למיזוג.') && note.text.includes('## JX-1113\nהשינוי מוכן ב-PR וממתין למיזוג.') && note.text.split('PR: https://github.com/x/y/pull/7').length === 3, note.text);
check('the scaffold carries no code: it is filled for the reporter, in Hebrew', !/Cause|Approach|\.py|\.ts|:\d/.test(note.text.replace(/https:\/\/\S+/g, '')) && note.text.includes('מה היה:') && note.text.includes('לבדיקה:'), note.text);

// ── the worktree's .env (cases from the project's sanitize-worktree-env test)
const prod = '# Backend configuration\r\nMONGODB_URL=mongodb+srv://u:secret@cluster.mongodb.net\r\nDATABASE_NAME=jewelryx_dev\r\nMEDIA_STORAGE_BACKEND=s3\r\nAWS_S3_ACCESS_KEY_ID=AKIAPROD\r\nAWS_S3_SECRET_ACCESS_KEY=prodsecret\r\nAWS_S3_BUCKET_NAME=jewelryx-prod-static-content\r\nAWS_SES_ACCESS_KEY_ID=AKIASES\r\nAWS_SES_SECRET_ACCESS_KEY=sessecret\r\nAWS_S3_REGION=eu-central-1\r\nOTP_DEV_EXPOSE=true\r\n';
const db = { url: 'mongodb://localhost:47554', name: worktreeDatabase('probe-wf2c') };
const env = sanitizeEnv(prod, db);
check('production credentials are blanked, storage is local', !/prodsecret|sessecret|AKIA|prod-static/.test(env) && /^MEDIA_STORAGE_BACKEND=local\r?$/m.test(env), env);
check('the database is the worktree\'s own: the machine\'s URL, jewelryx_<slug>', /^MONGODB_URL=mongodb:\/\/localhost:47554\r?$/m.test(env) && /^DATABASE_NAME=jewelryx_probe-wf2c\r?$/m.test(env), env);
check('comments, unrelated keys and CRLF are kept', env.startsWith('# Backend configuration\r\n') && /^OTP_DEV_EXPOSE=true\r?$/m.test(env) && /^AWS_S3_REGION=eu-central-1\r?$/m.test(env));
check('a missing MEDIA_STORAGE_BACKEND is added (the backend defaults to s3)', /^MEDIA_STORAGE_BACKEND=local$/m.test(sanitizeEnv('A=1\n', db)));
check('sanitizing twice changes nothing', sanitizeEnv(env, db) === env);

// ── the secrets a worktree copies
check('.worktreeinclude: plain paths, leading / dropped, comments and blanks skipped', includedFiles('/.env\r\n# x\r\n\r\n/packages/backend/.env\r\n').join() === '.env,packages/backend/.env');
let glob = '';
try { includedFiles('/packages/*/.env'); } catch (e) { glob = (e as Error).message; }
check('a pattern is refused, not silently skipped', glob.includes('is a pattern'), glob);

// ── a round's secrets, asked before `wf new` creates anything (2026-10-25: the bare kit entry cut a
// worktree, a database and two builds in a bare layout, and setup's env step failed last).
const cloneDir = mkdtempSync(join(tmpdir(), 'wf-secrets-clone-'));
const bareDir = mkdtempSync(join(tmpdir(), 'wf-secrets-bare-'));
try {
  execFileSync('git', ['init', '-q', cloneDir]);
  execFileSync('git', ['init', '-q', '--bare', join(bareDir, 'repo.git')]);
  check('a clone answers: this machine copies a round\'s secrets from its own main checkout', secretsGap(cloneDir) === null, String(secretsGap(cloneDir)));
  check('a bare layout is named before a worktree exists', secretsGap(join(bareDir, 'repo.git'))?.includes('no main checkout') === true, String(secretsGap(join(bareDir, 'repo.git'))));
} finally {
  rmSync(cloneDir, { recursive: true, force: true });
  rmSync(bareDir, { recursive: true, force: true });
}

// ── the dev servers (cases from the project's dev-worktree.mjs --check)
const plain = devCommands('18001');
check('ports: API P+10000 on 127.0.0.1 for the servers, admin P+20000', plain[0].env.DEV_BACKEND_PORT === '28001' && plain[1].env.INTERNAL_API_URL === 'http://127.0.0.1:28001' && plain[2].command === 'pnpm dev:admin --port 38001 --strictPort');
check('no -- separator reaches vite', plain.every((c) => !/\s--\s/.test(c.command)));
check('with no machine names, the servers use the direct origins', plain[1].env.ORIGIN === 'http://localhost:18001' && plain[2].env.PUBLIC_API_URL === 'http://localhost:28001/api/v1');
check('the two vites run as under an agent, so they forward the browser console to dev.log', plain[1].env.AI_AGENT && plain[2].env.AI_AGENT && !plain[0].env.AI_AGENT);

// ── a round's repro and the verification skill's stack file
check('.verify-stack.env: the three direct URLs and the servers\' log, the keys control-jewelryx reads', verifyStackEnv(direct, 'C:/w/.wf/logs/dev.log') === 'B2B_URL=http://localhost:12345\nADMIN_URL=http://localhost:32345\nAPI_URL=http://127.0.0.1:22345/api/v1\nSTACK_LOG=C:/w/.wf/logs/dev.log\n');
const bare = reproConfig({ direct, withAuth: false });
const authed = reproConfig({ direct, withAuth: true });
check('repro config without the skill: no global setup', !/globalSetup|VERIFY_AUTH/.test(bare) && bare.includes("process.env.B2B_URL ??= 'http://localhost:12345'"), bare);
check('repro config with the skill: global setup, and the saved logins under the gitignored .verify/auth', authed.includes("globalSetup: './global-setup.ts'") && authed.includes("resolve(__dirname, '../../../.verify/auth')"), authed);
check('the repro files never use import.meta (they sit outside verification/)', ![bare, authed, REPRO_GLOBAL_SETUP].some((t) => t.replace(/^\/\/.*$/gm, '').includes('import.meta')));
// The fallback is a self-contained harness on purpose: it exists only for a base without the
// project's repro.config.ts, and it bans the project's support helpers (whose import.meta the
// commonjs package cannot load). A round that reuses them needs the project-owned config.
check('the legacy fallback config is self-contained by design: it bans the project helpers (import only @playwright/test and node:*)', /import only @playwright\/test and node:\*/.test(bare) && !/verification\/tests\/support/.test(bare), bare);
const agree = readFileSync(join(WF_ROOT, 'projects', 'jewelryx', 'prompts', 'agree.md'), 'utf8');
check('the agree prompt defers runner support to project testing notes and the checkout config', agree.includes('testing.md') && agree.includes('per-round Playwright config') && agree.includes('runtime support'), agree);
// The first-run baseline save must run alone: `control-jewelryx auth` saves the whole database when
// none exists yet, and three concurrent saves raced in db_snapshot.py's glob/unlink (a FileNotFoundError
// on a *.bson). The remaining roles still log in together once the manifest exists (#133 review).
check('global setup initializes the baseline alone, then logs the remaining roles in parallel through control-jewelryx auth', REPRO_GLOBAL_SETUP.includes("await auth('buyer');") && REPRO_GLOBAL_SETUP.includes("await Promise.all(['seller', 'admin'].map(auth));") && !REPRO_GLOBAL_SETUP.includes("['buyer', 'seller', 'admin'].map(auth)") && REPRO_GLOBAL_SETUP.includes('docs/agents/verify-jewelryx/control-jewelryx.mjs') && REPRO_GLOBAL_SETUP.includes("'auth', role"));

// A base with the verification skill's own repro config gets no per-round files (JewelryX #242).
const tree = mkdtempSync(join(tmpdir(), 'wf-repro-'));
mkdirSync(join(tree, VERIFY_SKILL), { recursive: true });
writeReproConfig({ worktree: tree, folder: 'bug-reports/old', direct });
check('a base without the shared config: the round gets its own config and setup', existsSync(join(tree, 'bug-reports/old/repro/playwright.config.ts')) && existsSync(join(tree, 'bug-reports/old/repro/global-setup.ts')));
writeFileSync(join(tree, REPRO_CONFIG), '');
writeReproConfig({ worktree: tree, folder: 'bug-reports/new', direct });
check('a base with it: an empty repro/ for the specs, no config', existsSync(join(tree, 'bug-reports/new/repro')) && !existsSync(join(tree, 'bug-reports/new/repro/playwright.config.ts')));
rmSync(tree, { recursive: true, force: true });

// ── wf check's env for a verification/ spec: the stack's URLs and the round seed's actors
const stackTree = mkdtempSync(join(tmpdir(), 'wf-checks-'));
writeFileSync(join(stackTree, '.verify-stack.env'), verifyStackEnv(direct, 'dev.log'));
const vEnv = verificationStackEnv(stackTree);
check('the verification/repro env carries the round\'s seed actors and the stack URLs', vEnv.B2B_OWNER_EMAIL === 'buyer@seed.jewelryx' && vEnv.B2B_OWNER_PASSWORD === 'seed1234' && vEnv.B2B_SUPPLIER_EMAIL === 'seller@seed.jewelryx' && vEnv.B2B_URL === direct.b2b && vEnv.API_URL === direct.api, JSON.stringify(vEnv));
// ── the oracle guard, where wf meets it: the plan's hand-off, and a row's check on a real branch
const agreementWith = (files: string) => ['# r — agreement', 'Class: B', '## Observed', '- x — `a.ts:1`', '## Agreed', 'Behavior.', '- T2 walk: none — checked by the contract test', '## Verification', '| # | case | files | check |', '|---|---|---|---|', `| 1 | test(verification): x | ${files} | verification/tests/x.spec.ts |`].join('\n');
check('agreement: a fix/ case with a verification/ file is refused (the oracle guard)', agreementGap(agreementWith('verification/tests/x.spec.ts'), 'B', 'fix/bjew-617-x')?.includes('oracle-guard') === true);
check('agreement: the same case on a verification/ branch, or with no branch known, is accepted', agreementGap(agreementWith('verification/tests/x.spec.ts'), 'B', 'verification/x') === null && agreementGap(agreementWith('verification/tests/x.spec.ts'), 'B') === null);
check('agreement: a fix/ case that stays in the product is accepted', agreementGap(agreementWith('packages/backend/app/x.py'), 'B', 'fix/x') === null);
check('agreementCaseGap is what the agreement gap asks', agreementCaseGap({ branch: 'feat/x', rows: [{ n: 1, message: 'm', files: ['verification/a.ts'] }] }) !== null);
{
  const repo = mkdtempSync(join(tmpdir(), 'wf-oracle-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const guard = () => protectedFilesGap(repo) ?? undefined;
  git('init', '-q', '-b', 'dev');
  mkdirSync(join(repo, 'verification'));
  writeFileSync(join(repo, 'verification', 'a.spec.ts'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  check('row check: on dev, nothing is guarded', guard() === undefined);
  git('checkout', '-q', '-b', 'fix/x');
  check('row check: a fix/ branch with a clean tree is not refused', guard() === undefined);
  writeFileSync(join(repo, 'verification', 'a.spec.ts'), 'b\n');
  check('row check: BJEW-617 row 1, the edit uncommitted (where lefthook pre-push cannot see it), is refused naming the file', guard()?.includes('verification/a.spec.ts') === true, String(guard()));
  git('add', 'verification/a.spec.ts');
  writeFileSync(join(repo, 'verification/a.spec.ts'), 'a\n');
  check('protected oracle: staged edit is refused even with baseline worktree bytes', guard()?.includes('verification/a.spec.ts') === true);
  writeFileSync(join(repo, 'verification/a.spec.ts'), 'b\n');
  git('commit', '-q', '-am', 'row 1');
  check('protected oracle: committed edits remain refused', guard()?.includes('verification/a.spec.ts') === true);
  git('checkout', '-q', 'dev', '--', 'verification/a.spec.ts');
  check('row check: the revert row, the tree back at the base, is not refused', guard() === undefined, String(guard()));
  writeFileSync(join(repo, 'verification', 'new.spec.ts'), 'n\n');
  check('row check: an untracked new oracle file is refused', guard()?.includes('verification/new.spec.ts') === true);
  git('checkout', '-q', '-b', 'verification/y');
  check('row check: a verification/ branch may edit it', guard() === undefined);
  // A round cut from a release branch is judged against that branch, not against dev (JX-1476).
  rmSync(join(repo, 'verification', 'new.spec.ts'));
  git('checkout', '-q', 'dev');
  git('checkout', '-q', '-b', 'rel');
  writeFileSync(join(repo, 'verification', 'a.spec.ts'), 'rel');
  git('commit', '-q', '-am', 'release moved the oracle');
  git('checkout', '-q', '-b', 'fix/from-rel');
  check('release round: judged against the project base, the release oracle edit is refused', guard()?.includes('verification/a.spec.ts') === true);
  check('release round: judged against its own base (rel), nothing is refused', protectedFilesGap(repo, 'rel') === null);
  rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
