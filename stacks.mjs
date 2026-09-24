#!/usr/bin/env node
// stacks.mjs — wf stacks up|down|status: the two permanent local stacks (Shay, 2026-09-23).
//   DEV  the `dev` worktree served live by scripts/dev-worktree.mjs (slug dev, base port =
//        hash_port("dev") like any round), own mongo jewelryx-mongo-dev seeded once by
//        scripts/worktree-db.mjs. Never pulls: it serves whatever the dev folder holds.
//   QA   the qa worktree (detached at origin/qa, never committed to) built with its own
//        docker-compose.qa.yml + docker-compose.qa-local.yml, project jewelryx-qa, nginx on
//        127.0.0.1:8090 ← portless alias qa.jewelryx.localhost. Every 5 min origin/qa is
//        fetched; a new sha is checked out and rebuilt, the mongo volume kept.
// `run` is the long-lived supervisor the logon task starts (restarts the dev servers when
// they die, runs the QA watcher). `up` (re)registers + runs that task; `down` stops and
// disables it. `qa-check [--sha <sha>]` runs one watcher check now; --sha stands in for
// origin/qa, so the "moved" path is provable without touching the remote.
// State + logs: ~/.jewelryx-stacks (qa-watch.log = every check that acted).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, closeSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePortForBranch, mongoPortForBase, stackNames } from './worktree.mjs';

// TOOLS is wf's own root (docker-compose.qa-local.yml). The stacks themselves run from the project's
// worktrees, where worktrunk puts them (worktree-path ~/.herdr/worktrees/{{ remote_repo }}/…): wf left
// the JewelryX repo on 2026-09-23 and no longer sits next to them.
const TOOLS = dirname(fileURLToPath(import.meta.url));
const WORKTREES = join(homedir(), '.herdr', 'worktrees', 'jeweleryx');
const DEV_DIR = join(WORKTREES, 'dev');
const QA_DIR = join(WORKTREES, 'qa');
const STATE = join(homedir(), '.jewelryx-stacks');
const TASK = 'JewelryX Stacks';
const DEV_DB = 'jewelryx_dev';
const QA_DB = 'jewelryx_qa';
const QA_HTTP_PORT = 8090; // outside every round range (1xxxx-4xxxx) and off 3000/3001/8000
const QA_MONGO_PORT = 8091; // 127.0.0.1 only: the host-side seeder's way in on a cache miss
const QA_ALIAS = 'qa.jewelryx';
const QA_ORIGIN = `http://${QA_ALIAS}.localhost`;
const WATCH_MS = 5 * 60_000;
const at = (f) => join(STATE, f);

// ── pure (stacks.selfcheck.mjs) ─────────────────────────────────────────────

// Only JWT_SECRET_KEY survives a restart; everything else is rewritten, so a hand edit
// that turns a provider on does not stick.
export function qaEnvText({ jwtSecret }) {
  return [
    '# Written by wf stacks (stacks.mjs) on every start; only JWT_SECRET_KEY is kept.',
    '# External providers OFF: media on local disk (no S3 keys), SES without keys or IAM role, Hallo SMS disabled.',
    `QA_HTTP_PORT=${QA_HTTP_PORT}`,
    `QA_MONGO_PORT=${QA_MONGO_PORT}`,
    'MONGODB_URL=mongodb://mongo:27017',
    `DATABASE_NAME=${QA_DB}`,
    `JWT_SECRET_KEY=${jwtSecret}`,
    `CORS_ORIGINS=${QA_ORIGIN},http://localhost:${QA_HTTP_PORT},http://127.0.0.1:${QA_HTTP_PORT}`,
    // Not the portless name: with DEBUG=false (as on QA) config.py refuses any B2B_PUBLIC_URL
    // containing "localhost". The loopback port serves the same storefront.
    `B2B_PUBLIC_URL=http://127.0.0.1:${QA_HTTP_PORT}/b2b`,
    'COOKIE_SECURE=false',
    'REDIS_ENABLED=false',
    'DEBUG=false',
    'OTP_DEV_EXPOSE=true',
    'MEDIA_STORAGE_BACKEND=local',
    'AWS_S3_BUCKET_NAME=',
    'AWS_S3_ACCESS_KEY_ID=',
    'AWS_S3_SECRET_ACCESS_KEY=',
    'AWS_S3_USE_IAM_ROLE=false',
    'AWS_SES_USE_IAM_ROLE=false',
    'HALLO_SMS_ENABLED=false',
    'HALLO_SMS_USERNAME=',
    'HALLO_SMS_TOKEN=',
    'SEED_ADMIN_PHONE=',
    '',
  ].join('\n');
}

// Process env beats packages/backend/.env (pydantic-settings), and the dev folder's .env
// carries the live S3 + SMS keys: the switches below are what keep them unused.
export function devEnv(mongoPort) {
  return {
    MONGODB_URL: `mongodb://127.0.0.1:${mongoPort}`,
    DATABASE_NAME: DEV_DB,
    DOCUMENTDB_ENABLED: 'false',
    MEDIA_STORAGE_BACKEND: 'local',
    AWS_S3_BUCKET_NAME: '',
    AWS_S3_ACCESS_KEY_ID: '',
    AWS_S3_SECRET_ACCESS_KEY: '',
    AWS_S3_USE_IAM_ROLE: 'false',
    AWS_SES_ACCESS_KEY_ID: '',
    AWS_SES_SECRET_ACCESS_KEY: '',
    AWS_SES_USE_IAM_ROLE: 'false',
    HALLO_SMS_ENABLED: 'false',
    HALLO_SMS_USERNAME: '',
    HALLO_SMS_TOKEN: '',
    OTP_DEV_EXPOSE: 'true',
    PORTLESS_HTTPS: '0',
  };
}

// The watcher's one decision. A sha whose deploy failed is not retried every 5 minutes;
// the next push (or `wf stacks up`, which clears it) tries again.
export function qaWatchDecision({ deployed, remote, failed }) {
  if (!remote || remote === deployed) return 'none';
  if (remote === failed) return 'skip-failed';
  return 'deploy';
}

export function stackAddresses() {
  const dev = stackNames('dev');
  return [
    ['dev b2b', `${dev.b2b}/b2b/`],
    ['dev admin', `${dev.admin}/admin/`],
    // /docs is 404 on dev by design (docs_url=None since 3c047c884); the schema is the API's page.
    ['dev api', `${dev.api}/openapi.json`],
    ['qa b2b', `${QA_ORIGIN}/b2b/`],
    ['qa admin', `${QA_ORIGIN}/admin/`],
  ];
}

// ── plumbing ────────────────────────────────────────────────────────────────

const read = (f) => (existsSync(at(f)) ? readFileSync(at(f), 'utf8').trim() : '');
const write = (f, s) => writeFileSync(at(f), `${s}\n`);
function log(file, msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  appendFileSync(at(file), line);
  process.stdout.write(line);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Async so a 5-minute image build never blocks the dev supervisor's restart loop.
function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => resolve({ status: -1, out: `${out}${e.message}` }));
    child.on('close', (status) => resolve({ status, out }));
  });
}
async function must(cmd, args, opts) {
  const r = await sh(cmd, args, opts);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} → exit ${r.status}\n${tail(r.out)}`);
  return r.out;
}
const tail = (s, n = 25) => s.trim().split(/\r?\n/).slice(-n).join('\n');
const git = (dir, ...args) => must('git', ['-C', dir, ...args]).then((s) => s.trim());
const node = (script, ...args) => must(process.execPath, [join(DEV_DIR, 'scripts', script), ...args]);

function commandLineOf(pid) {
  const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`;
  return spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
}
// A pid file can outlive its process and the pid be reused: kill only when the command line still matches.
function alivePid(file, marker) {
  const pid = Number(read(file));
  return pid && commandLineOf(pid).includes(marker) ? pid : 0;
}
function killTree(file, marker) {
  const pid = alivePid(file, marker);
  if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  return pid;
}
// By command line, not by pid file: when the runner dies its dev-worktree.mjs child can die
// with it while the servers under it live on, orphaned, holding the ports and portless names
// (2026-09-23). Each server runs under `portless --name dev.<role>.jewelryx`; a round's is
// `--name <slug>.<role>…`, so the anchored `--name dev.` never matches a round.
export const DEV_SERVER_PATTERN = String.raw`--name dev\.(b2b|admin|api)\.jewelryx |dev-worktree\.mjs \d+ --slug dev(\s|"|$)`;
function killDevServers() {
  const ps = `Get-CimInstance Win32_Process | ? { $_.CommandLine -match '${DEV_SERVER_PATTERN}' } | % { $_.ProcessId }`;
  const encoded = Buffer.from(ps, 'utf16le').toString('base64'); // the pattern's quote would not survive -Command
  const pids = (spawnSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], { encoding: 'utf8', windowsHide: true }).stdout ?? '').match(/\d+/g) ?? [];
  for (const pid of pids) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { windowsHide: true });
  return pids.length;
}

function probe(url, timeoutMs = 20_000) {
  // Connect to the proxy directly with a Host header: Windows' resolver does not map
  // *.localhost to loopback (portless doctor), curl and browsers do it themselves.
  const u = new URL(url);
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port: 80, path: u.pathname, headers: { Host: u.host }, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve(e.message));
    req.end();
  });
}
const answers = (s) => typeof s === 'number' && s >= 200 && s < 400;

async function waitForDocker() {
  for (let i = 0; ; i++) {
    if ((await sh('docker', ['info'])).status === 0) return;
    if (i % 12 === 0) log('stacks.log', 'waiting for Docker Desktop…');
    await sleep(10_000);
  }
}

async function ensureProxy() {
  if (typeof (await probe('http://portless-probe.localhost/')) === 'number') return;
  log('stacks.log', 'portless proxy not answering on :80 — starting it (HTTP, --no-tls)');
  await sh('portless', ['proxy', 'start', '--no-tls', '-p', '80'], { env: { ...process.env, PORTLESS_HTTPS: '0' } });
}

// Seeded = the seed's buyer exists. Not "db is empty": the backend creates its collections
// at startup, so a DB that came up once unseeded would never be seeded after.
async function seedIfNeeded(container, database, slug) {
  const js = `db.getSiblingDB('${database}').users.countDocuments({ email: 'buyer@seed.jewelryx' })`;
  const n = (await must('docker', ['exec', container, 'mongosh', '--quiet', '--eval', js])).trim();
  if (n !== '0') return;
  log('stacks.log', `${database}: not seeded — seeding`);
  await node('worktree-db.mjs', 'seed', slug, '--database', database);
}

// ── DEV ─────────────────────────────────────────────────────────────────────

async function devLoop() {
  for (;;) {
    try {
      const base = basePortForBranch('dev');
      const env = { ...process.env, ...devEnv(mongoPortForBase(base)), WF_DEV_LOG: at('dev.log') };
      await node('worktree-db.mjs', 'up', 'dev', String(base));
      await seedIfNeeded('jewelryx-mongo-dev', DEV_DB, 'dev');
      const child = spawn(process.execPath, [join(DEV_DIR, 'scripts', 'dev-worktree.mjs'), String(base), '--slug', 'dev'], {
        cwd: DEV_DIR, env, stdio: 'ignore', windowsHide: true,
      });
      log('stacks.log', `dev: servers started (pid ${child.pid}, base ${base}, log ${at('dev.log')})`);
      const code = await new Promise((r) => child.on('close', r));
      log('stacks.log', `dev: servers exited (code ${code}) — restarting in 10s`);
    } catch (e) {
      log('stacks.log', `dev: ${e.message}`);
    }
    await sleep(10_000);
  }
}

// ── QA ──────────────────────────────────────────────────────────────────────

const compose = (...rest) => [
  'compose', '-p', 'jewelryx-qa',
  '-f', join(QA_DIR, 'docker-compose.qa.yml'), '-f', join(TOOLS, 'docker-compose.qa-local.yml'),
  '--env-file', at('qa.env'), ...rest,
];

// Two deploys at once (the runner's watcher and a hand-run qa-check) would fight over one checkout.
function takeQaLock() {
  const lock = at('qa.lock');
  for (let i = 0; i < 2; i++) {
    try {
      closeSync(openSync(lock, 'wx'));
      write('qa.lock', process.pid);
      return () => rmSync(lock, { force: true });
    } catch {
      const holder = Number(read('qa.lock'));
      if (holder && holder !== process.pid && isAlive(holder)) return null;
      rmSync(lock, { force: true });
    }
  }
  return null;
}
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function qaPrepare() {
  if (!existsSync(QA_DIR)) await must('git', ['-C', DEV_DIR, 'worktree', 'add', '--detach', QA_DIR, 'origin/qa']);
  // Detach (at the same commit) if it sits on a branch: nothing may ever be committed there.
  if ((await sh('git', ['-C', QA_DIR, 'symbolic-ref', '-q', 'HEAD'])).status === 0) await git(QA_DIR, 'checkout', '--detach');
  const jwtSecret = /^JWT_SECRET_KEY=(.+)$/m.exec(read('qa.env'))?.[1] ?? randomBytes(32).toString('hex');
  writeFileSync(at('qa.env'), qaEnvText({ jwtSecret }));
  await must('docker', compose('up', '-d', '--wait', 'mongo'));
  await seedIfNeeded('jewelryx-mongo-qa', QA_DB, 'qa');
  await must('portless', ['alias', QA_ALIAS, String(QA_HTTP_PORT), '--force']);
}

async function qaDeploy(sha, deployed) {
  log('qa-watch.log', `qa: ${deployed ? deployed.slice(0, 9) : '(none)'} → ${sha.slice(0, 9)} — checkout + build`);
  await git(QA_DIR, 'checkout', '--detach', '--force', sha);
  // One image at a time, then `up`: nothing is replaced until every build passed, so a failed
  // build leaves the previous containers serving. Not `up --build`: it runs the builds in
  // parallel (two vite builds at once in Docker Desktop's 8 GB VM), and the engine went down
  // during the first such build (2026-09-23).
  let r = { status: 0, out: '' };
  for (const service of ['backend', 'frontend', 'admin-dashboard']) {
    const b = await sh('docker', compose('build', service));
    r = { status: b.status, out: `${r.out}\n── build ${service}\n${b.out}` };
    if (b.status !== 0) break;
  }
  if (r.status === 0) {
    const u = await sh('docker', compose('up', '-d', '--wait'));
    r = { status: u.status, out: `${r.out}\n── up\n${u.out}` };
  }
  writeFileSync(at('qa-build.log'), r.out);
  if (r.status === 0) {
    write('qa-deployed', sha);
    rmSync(at('qa-failed'), { force: true });
    log('qa-watch.log', `qa: ${sha.slice(0, 9)} deployed`);
  } else {
    write('qa-failed', sha);
    // Back to what is running, so a later plain `up` (runner restart) cannot build the broken tree.
    if (deployed) await git(QA_DIR, 'checkout', '--detach', '--force', deployed);
    log('qa-watch.log', `qa: ${sha.slice(0, 9)} FAILED (exit ${r.status}); previous containers left running, worktree back at ${deployed ? deployed.slice(0, 9) : '-'}. Tail:\n${tail(r.out)}`);
  }
}

// One watcher check. `injected` stands in for origin/qa (proof arm; the remote is not touched).
export async function qaCheck({ injected } = {}) {
  const release = takeQaLock();
  if (!release) return log('stacks.log', 'qa-check: another deploy holds the lock — skipped');
  try {
    let remote = injected;
    if (!remote) {
      await git(QA_DIR, 'fetch', '--quiet', 'origin', 'qa');
      remote = await git(QA_DIR, 'rev-parse', 'origin/qa');
    } else remote = await git(QA_DIR, 'rev-parse', '--verify', `${remote}^{commit}`);
    const deployed = read('qa-deployed');
    const decision = qaWatchDecision({ deployed, remote, failed: read('qa-failed') });
    if (decision === 'deploy') await qaDeploy(remote, deployed);
    return decision;
  } finally {
    release();
  }
}

async function qaLoop() {
  for (let started = false; ; await sleep(started ? WATCH_MS : 60_000)) {
    try {
      if (!started) {
        await qaPrepare();
        // Containers stopped by `wf stacks down` come back without a rebuild.
        if (read('qa-deployed')) await must('docker', compose('up', '-d', '--wait'));
        started = true;
      }
      await qaCheck();
    } catch (e) {
      log('qa-watch.log', `qa: ${e.message}`);
    }
  }
}

// ── commands ────────────────────────────────────────────────────────────────

async function run() {
  // The logon task starts in System32; `wt step eval` (hash_port) needs a git checkout as cwd. Not
  // TOOLS: wf update renames that folder, and Windows refuses to rename a process's cwd.
  process.chdir(DEV_DIR);
  mkdirSync(STATE, { recursive: true });
  const other = alivePid('runner.pid', 'stacks');
  if (other && other !== process.pid) return console.log(`stacks: already running (pid ${other})`);
  write('runner.pid', process.pid);
  // A runner that died left its dev servers behind; they hold the ports the new ones need.
  if (killDevServers()) log('stacks.log', 'dev: killed servers left by a previous runner');
  log('stacks.log', `runner started (pid ${process.pid})`);
  await waitForDocker();
  await ensureProxy();
  devLoop();
  await qaLoop();
}

function registerTask() {
  const script = fileURLToPath(import.meta.url);
  // conhost --headless hosts one windowless console every child shares (a detached node would
  // pop a window per dev server). Not powershell -WindowStyle Hidden: with Windows Terminal as
  // the default console the flag is ignored, the runner's window stayed up, and closing it
  // killed the dev servers (2026-09-23). Repeating every 10 min + IgnoreNew is the
  // "restart if it dies": a live runner makes the repeat a no-op.
  const ps = [
    `$a = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument ('--headless "${process.execPath}" "${script}" run')`,
    `$t1 = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"`,
    `$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Minutes 10)`,
    // Left at its default (true, no duration) every repeat KILLED the running runner and started
    // a new one, orphaning its dev servers (measured 2026-09-23, 14:43 and 14:53).
    `$t2.Repetition.StopAtDurationEnd = $false`,
    `$s = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable`,
    `Register-ScheduledTask -TaskName '${TASK}' -Action $a -Trigger $t1,$t2 -Settings $s -Force | Out-Null`,
  ].join('; ');
  const r = spawnSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`registering '${TASK}' failed: ${r.stderr}`);
}

function up() {
  mkdirSync(STATE, { recursive: true });
  rmSync(at('qa-failed'), { force: true });
  registerTask();
  spawnSync('schtasks', ['/Change', '/TN', TASK, '/ENABLE'], { stdio: 'ignore' });
  const r = spawnSync('schtasks', ['/Run', '/TN', TASK], { encoding: 'utf8' });
  console.log(r.status === 0 ? `stacks: task '${TASK}' running — \`wf stacks status\` in a minute (first QA build takes longer)` : r.stderr);
}

async function down() {
  // Disabled, not deleted: the 10-min repeat would otherwise bring it straight back. `up` re-enables.
  spawnSync('schtasks', ['/Change', '/TN', TASK, '/DISABLE'], { stdio: 'ignore' });
  spawnSync('schtasks', ['/End', '/TN', TASK], { stdio: 'ignore' });
  const runner = killTree('runner.pid', 'stacks');
  const dev = killDevServers();
  console.log(`stacks: runner ${runner || '-'} + ${dev} dev server processes stopped`);
  await sh('docker', ['stop', 'jewelryx-mongo-dev']);
  const r = await sh('docker', compose('stop'));
  console.log(`stacks: dev mongo + qa containers stopped${r.status ? ` (compose: ${tail(r.out, 3)})` : ''}; volumes kept`);
}

async function status() {
  const task = spawnSync('schtasks', ['/Query', '/TN', TASK, '/FO', 'LIST'], { encoding: 'utf8' });
  const taskState = /Status:\s*(.+)/.exec(task.stdout ?? '')?.[1]?.trim() ?? 'not installed';
  const runner = alivePid('runner.pid', 'stacks');
  console.log(`task '${TASK}': ${taskState} · runner: ${runner ? `pid ${runner}` : 'not running'}`);
  for (const [name, url] of stackAddresses()) {
    const s = await probe(url);
    console.log(`  ${answers(s) ? '✓' : '✗'} ${name.padEnd(9)} ${url.padEnd(46)} ${s}`);
  }
  const short = (s) => (s ? s.slice(0, 9) : '-');
  const devHead = (await sh('git', ['-C', DEV_DIR, 'rev-parse', 'HEAD'])).out.trim();
  console.log(`dev: serving ${short(devHead)} (dev folder HEAD; never pulled) · db ${DEV_DB} in jewelryx-mongo-dev`);
  const remote = /^([0-9a-f]{40})/m.exec((await sh('git', ['-C', QA_DIR, 'ls-remote', 'origin', 'refs/heads/qa'])).out)?.[1];
  const deployed = read('qa-deployed');
  const failed = read('qa-failed');
  console.log(
    `qa: running ${short(deployed)} · origin/qa ${short(remote)} ${remote && remote === deployed ? '(current)' : '(behind — the watcher acts within 5 min)'}` +
      `${failed ? ` · last failed ${short(failed)}` : ''} · db ${QA_DB} in jewelryx-mongo-qa`,
  );
  console.log(`logs: ${STATE}\\{stacks,qa-watch,dev}.log`);
}

export async function runStacks(argv) {
  const [sub] = argv;
  mkdirSync(STATE, { recursive: true });
  if (sub === 'up') up();
  else if (sub === 'down') await down();
  else if (sub === 'status') await status();
  else if (sub === 'run') await run();
  else if (sub === 'qa-check') {
    const i = argv.indexOf('--sha');
    await qaPrepare();
    console.log(`qa-check: ${await qaCheck({ injected: i >= 0 ? argv[i + 1] : undefined })}`);
  } else {
    console.log('usage: wf stacks <up|down|status>   (internal: run · qa-check [--sha <sha>])');
    process.exit(2);
  }
}

if (process.argv[1]?.endsWith('stacks.mjs')) await runStacks(process.argv.slice(2));
