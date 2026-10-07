// index.selfcheck.ts — node projects/jewelryx/index.selfcheck.ts → exit 0 when green.
// Pure arms: JewelryX's ports and addresses, pages and tracker note (index.ts), the worktree's .env
// (env.ts), its database's name (db.ts) and its dev-server commands (dev.ts), with no machine
// plugged in. Shay's machine's arms: env/projects/jewelryx/index.selfcheck.ts. Nothing is run; the repro files are written into a temp folder.
import { worktreeDatabase } from './db.ts';
import { devCommands } from './dev.ts';
import { includedFiles, sanitizeEnv } from './env.ts';
import { handoffGap } from '../../src/round/handoff.ts';
import { checks, directUrls, pageOf, planGap, setup, stackUrls, teardown, trackerNote } from './index.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPRO_CONFIG, REPRO_GLOBAL_SETUP, reproConfig, verifyStackEnv, VERIFY_SKILL, writeReproConfig } from './round.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── ports and addresses
const direct = directUrls(12345);
check('direct: B2B on P, admin P+20000, API on 127.0.0.1 at P+10000', direct.b2b === 'http://localhost:12345' && direct.admin === 'http://localhost:32345' && direct.api === 'http://127.0.0.1:22345/api/v1', JSON.stringify(direct));
check('with no machine names, a person gets the direct addresses, B2B first (wf status probes it)', JSON.stringify(stackUrls({ slug: 's', port: 12345 })) === JSON.stringify(direct) && Object.keys(direct)[0] === 'b2b');
check('setup steps in wt order: env node verify tools db', Object.keys(setup).join(' ') === 'env node verify tools db', Object.keys(setup).join(' '));

// ── pages a reviewer should open
check('a b2b page, route groups dropped', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')) === '{"app":"b2b","path":"b2b/login"}', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')));
check('an admin root layout is the app root', JSON.stringify(pageOf('packages/frontend/admin/src/routes/+layout.ts')) === '{"app":"admin","path":"admin"}');
check('a params segment stays for the reviewer to fill', pageOf('packages/frontend/b2b/src/routes/orders/[id]/+page.server.ts')?.path === 'b2b/orders/[id]');
check('a component is not a page', pageOf('packages/frontend/b2b/src/lib/x.svelte') === null);

// ── teardown
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:/wt/fix-bjew-1' });
check('with no machine plugged in, a teardown drops the worktree\'s database, in-process', down.map((s) => s.label).join() === 'drop database' && typeof down[0].run === 'function' && !down[0].cmd);

// ── the tracker note
const note = trackerNote({ ids: ['JX-1112', 'JX-1113'], url: 'https://github.com/x/y/pull/7' });
check('the note is JIRA.md', note.file === 'JIRA.md');
check('one section per id, each with the PR url', note.text.includes('## JX-1112\nתוקן ✅') && note.text.includes('## JX-1113\nתוקן ✅') && note.text.split('PR: https://github.com/x/y/pull/7').length === 3, note.text);
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
check('global setup logs all three roles in through control-jewelryx auth', REPRO_GLOBAL_SETUP.includes("['buyer', 'seller', 'admin'].map(auth)") && REPRO_GLOBAL_SETUP.includes('docs/agents/verify-jewelryx/control-jewelryx.mjs') && REPRO_GLOBAL_SETUP.includes("'auth', role"));

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
const [spec] = checks({ toplevel: stackTree, changed: [], test: 'verification/specs/login-relogin.spec.ts' }).filter((t) => t.stack);
check('a verification spec runs as the seeded owner and supplier, who are in the round database (not verification-owner@)', spec?.env?.B2B_OWNER_EMAIL === 'buyer@seed.jewelryx' && spec.env.B2B_OWNER_PASSWORD === 'seed1234' && spec.env.B2B_SUPPLIER_EMAIL === 'seller@seed.jewelryx' && spec.env.B2B_SUPPLIER_PASSWORD === 'seed1234', JSON.stringify(spec?.env));
check('and still against the round stack', spec?.env?.B2B_URL === direct.b2b && spec.env.API_URL === direct.api, JSON.stringify(spec?.env));
rmSync(stackTree, { recursive: true, force: true });

// ── the oracle guard, where wf meets it: the plan's hand-off, and a row's check on a real branch
const planWith = (files: string) => ['# plan', '## Commits', '| # | message | files | check |', '|---|---|---|---|', `| 1 | test(verification): x | ${files} | verification/tests/x.spec.ts |`, '<!-- brief: aa -->'].join('\n');
const brief = { token: 'aa' };
check('handoff: a fix/ plan row with a verification/ file is not a handoff, wherever wf asks (next, the stop hook, the implement brief)', handoffGap('plan', planWith('verification/tests/x.spec.ts'), brief, undefined, 'fix/bjew-617-x')?.includes('oracle-guard') === true);
check('handoff: the same plan on a verification/ branch, or with no branch known, is one', handoffGap('plan', planWith('verification/tests/x.spec.ts'), brief, undefined, 'verification/x') === null && handoffGap('plan', planWith('verification/tests/x.spec.ts'), brief) === null);
check('handoff: a fix/ plan that stays in the product is one', handoffGap('plan', planWith('packages/backend/app/x.py'), brief, undefined, 'fix/x') === null);
check('planGap is what handoff asks', planGap({ branch: 'feat/x', rows: [{ n: 1, message: 'm', files: ['verification/a.ts'] }] }) !== null);
{
  const repo = mkdtempSync(join(tmpdir(), 'wf-oracle-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const guard = () => checks({ toplevel: repo, changed: [], test: null }).find((t) => t.label === 'oracle-guard')?.missing;
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
  git('commit', '-q', '-am', 'row 1');
  check('row check: and committed, as row 2 met it', guard()?.includes('verification/a.spec.ts') === true);
  git('checkout', '-q', 'dev', '--', 'verification/a.spec.ts');
  check('row check: the revert row, the tree back at the base, is not refused', guard() === undefined, String(guard()));
  writeFileSync(join(repo, 'verification', 'new.spec.ts'), 'n\n');
  check('row check: an untracked new oracle file is refused', guard()?.includes('verification/new.spec.ts') === true);
  git('checkout', '-q', '-b', 'verification/y');
  check('row check: a verification/ branch may edit it', guard() === undefined);
  rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
