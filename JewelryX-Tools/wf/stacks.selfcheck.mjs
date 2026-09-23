// stacks.selfcheck.mjs — node JewelryX-Tools/wf/stacks.selfcheck.mjs → exit 0 when green.
// Pure arm: the QA env (providers off), the dev env overrides, the watcher's decision and
// the addresses `wf stacks status` probes. Nothing is started.
import { DEV_SERVER_PATTERN, devEnv, qaEnvText, qaWatchDecision, stackAddresses } from './stacks.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const env = Object.fromEntries(
  qaEnvText({ jwtSecret: 'x'.repeat(64) }).split('\n').filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
check('qa: media on local disk, no S3 keys', env.MEDIA_STORAGE_BACKEND === 'local' && env.AWS_S3_ACCESS_KEY_ID === '' && env.AWS_S3_SECRET_ACCESS_KEY === '' && env.AWS_S3_BUCKET_NAME === '');
check('qa: SES has neither keys nor an IAM role (email_service.is_configured → false)', env.AWS_SES_USE_IAM_ROLE === 'false' && !('AWS_SES_ACCESS_KEY_ID' in env));
check('qa: Hallo SMS off, no token', env.HALLO_SMS_ENABLED === 'false' && env.HALLO_SMS_TOKEN === '');
check('qa: own mongo service and database', env.MONGODB_URL === 'mongodb://mongo:27017' && env.DATABASE_NAME === 'jewelryx_qa');
check('qa: nginx port outside the round ranges and off 3000/3001/8000', Number(env.QA_HTTP_PORT) < 10000 && ![3000, 3001, 8000].includes(Number(env.QA_HTTP_PORT)));
check('qa: CORS on the portless name', env.CORS_ORIGINS.startsWith('http://qa.jewelryx.localhost'));
check('qa: B2B links pass config.py with DEBUG=false (no "localhost" in B2B_PUBLIC_URL)', env.DEBUG === 'false' && !env.B2B_PUBLIC_URL.includes('localhost'), env.B2B_PUBLIC_URL);
check('qa: the JWT secret is the one passed in', env.JWT_SECRET_KEY === 'x'.repeat(64));

const dev = devEnv(42193);
check('dev: its own mongo + database', dev.MONGODB_URL === 'mongodb://127.0.0.1:42193' && dev.DATABASE_NAME === 'jewelryx_dev');
check('dev: the dev folder .env providers are switched off', dev.MEDIA_STORAGE_BACKEND === 'local' && dev.HALLO_SMS_ENABLED === 'false' && dev.AWS_SES_USE_IAM_ROLE === 'false' && dev.AWS_S3_ACCESS_KEY_ID === '');

check('watch: same sha → nothing', qaWatchDecision({ deployed: 'a', remote: 'a', failed: '' }) === 'none');
check('watch: moved → deploy', qaWatchDecision({ deployed: 'a', remote: 'b', failed: '' }) === 'deploy');
check('watch: never deployed → deploy', qaWatchDecision({ deployed: '', remote: 'b', failed: '' }) === 'deploy');
check('watch: the sha that just failed is not rebuilt every 5 min', qaWatchDecision({ deployed: 'a', remote: 'b', failed: 'b' }) === 'skip-failed');
check('watch: a newer sha after a failure deploys', qaWatchDecision({ deployed: 'a', remote: 'c', failed: 'b' }) === 'deploy');

const urls = stackAddresses().map(([, u]) => u);
check('status probes the five agreed addresses', urls.join(' ') === [
  'http://dev.b2b.jewelryx.localhost/b2b/', 'http://dev.admin.jewelryx.localhost/admin/', 'http://dev.api.jewelryx.localhost/openapi.json',
  'http://qa.jewelryx.localhost/b2b/', 'http://qa.jewelryx.localhost/admin/',
].join(' '), urls.join(' '));

const devServer = new RegExp(DEV_SERVER_PATTERN);
const ours = [
  '"mise" x -- portless --name dev.api.jewelryx --app-port 22193 -- pnpm dev:backend',
  String.raw`node  "C:\mise\portless\dist\cli.js" --name dev.b2b.jewelryx --app-port 12193 -- pnpm dev:frontend --port 12193 --strictPort`,
  String.raw`"C:\Program Files\nodejs\node.exe" C:\wt\workflow-v2\scripts\dev-worktree.mjs 12193 --slug dev`,
];
const theirs = [
  '"mise" x -- portless --name fix-dev.b2b.jewelryx --app-port 18001 -- pnpm dev:frontend',
  'portless --name dev-x.admin.jewelryx --app-port 38001 -- pnpm dev:admin',
  'node scripts/dev-worktree.mjs 15748 --slug tools-workflow-v2',
  'node scripts/dev-worktree.mjs 12000 --slug devx',
];
check('the dev sweep matches every dev-stack process', ours.every((c) => devServer.test(c)), ours.filter((c) => !devServer.test(c)).join(' | '));
check('the dev sweep never matches a round', !theirs.some((c) => devServer.test(c)), theirs.filter((c) => devServer.test(c)).join(' | '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
