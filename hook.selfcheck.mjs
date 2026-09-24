// hook.selfcheck.mjs — node hook.selfcheck.mjs → exit 0 when green.
// Pure arms: the wt hook block and its install, the reap gate, the worktree's .env, its database
// names and seed decisions, its dev-server commands. Nothing is run.
import { gateVerdict, hookBlock, PROJECT, withHookBlock } from './hook.mjs';
import { devCommands } from './stack/dev.mjs';
import { mongoUrlFromDockerPort, seedPlan, worktreeDatabase, worktreeMongoUrl } from './stack/db.mjs';
import { sanitizeEnv } from './stack/env.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

// ── the block and its install
const block = hookBlock('C:/wf/wf.mjs');
check('every pre-start step calls wf hook with slug and port', ['env', 'node', 'verify', 'tools', 'python', 'db'].every((s) => block.includes(`${s} = 'node C:/wf/wf.mjs hook ${s} {{ branch | sanitize }} {{ branch | hash_port }}'`)), block);
check('the dev servers run under wt\'s tether', block.includes(`server = 'wt step tether -- node C:/wf/wf.mjs hook serve`));
check('the tables are this project\'s only', block.split('\n').filter((l) => l.startsWith('[')).every((l) => l.startsWith(`[projects."${PROJECT}".`)));
const user = 'worktree-path = "~/x"\n[aliases]\nurls = "echo && node {{ worktree_path }}/scripts/dev-worktree.mjs --urls 1"\nother = "x"\n';
const once = withHookBlock(user, block);
check('install appends the block and drops the alias that called the project\'s script', once.includes(block) && !once.includes('dev-worktree') && once.includes('other = "x"'), once);
check('install is idempotent: a second run replaces the block', withHookBlock(once, block) === once);
check('a changed block replaces the old one', withHookBlock(once, hookBlock('D:/wf.mjs')).split('# >>> wf worktree hooks').length === 2);

// ── the reap gate
check('a worktree outside the workflow is removable', gateVerdict({ state: undefined, force: false }) === null);
check('a merged round is removable', gateVerdict({ state: { step: 'merged' }, force: false }) === null);
check('an unmerged round is refused, naming its step', /"implement"/.test(gateVerdict({ state: { step: 'implement' }, force: false })));
check('unreadable state is refused', /unreadable/.test(gateVerdict({ state: null, force: false })));
check('WF_FORCE_REAP overrides', gateVerdict({ state: { step: 'implement' }, force: true }) === null);

// ── the worktree's .env (cases from the project's sanitize-worktree-env test)
const prod = '# Backend configuration\r\nMONGODB_URL=mongodb+srv://u:secret@cluster.mongodb.net\r\nDATABASE_NAME=jewelryx_dev\r\nMEDIA_STORAGE_BACKEND=s3\r\nAWS_S3_ACCESS_KEY_ID=AKIAPROD\r\nAWS_S3_SECRET_ACCESS_KEY=prodsecret\r\nAWS_S3_BUCKET_NAME=jewelryx-prod-static-content\r\nAWS_SES_ACCESS_KEY_ID=AKIASES\r\nAWS_SES_SECRET_ACCESS_KEY=sessecret\r\nAWS_S3_REGION=eu-central-1\r\nOTP_DEV_EXPOSE=true\r\n';
const db = { url: worktreeMongoUrl(17554), name: worktreeDatabase('probe-wf2c') };
const env = sanitizeEnv(prod, db);
check('production credentials are blanked, storage is local', !/prodsecret|sessecret|AKIA|prod-static/.test(env) && /^MEDIA_STORAGE_BACKEND=local\r?$/m.test(env), env);
check('the database is the worktree\'s own: 40000+(P-10000), jewelryx_<slug>', /^MONGODB_URL=mongodb:\/\/localhost:47554\r?$/m.test(env) && /^DATABASE_NAME=jewelryx_probe-wf2c\r?$/m.test(env), env);
check('comments, unrelated keys and CRLF are kept', env.startsWith('# Backend configuration\r\n') && /^OTP_DEV_EXPOSE=true\r?$/m.test(env) && /^AWS_S3_REGION=eu-central-1\r?$/m.test(env));
check('a missing MEDIA_STORAGE_BACKEND is added (the backend defaults to s3)', /^MEDIA_STORAGE_BACKEND=local$/m.test(sanitizeEnv('A=1\n', db)));
check('sanitizing twice changes nothing', sanitizeEnv(env, db) === env);

// ── the database
check('a hit restores only; a miss seeds first; --reset drops the target either way',
  JSON.stringify([seedPlan({ archiveExists: true, reset: false }), seedPlan({ archiveExists: false, reset: true })]) === JSON.stringify([{ seed: false, dropTarget: false }, { seed: true, dropTarget: true }]));
check('the seeder writes to the container\'s published port', mongoUrlFromDockerPort('0.0.0.0:47554\n[::]:47554\n') === 'mongodb://127.0.0.1:47554');
// ── the dev servers (cases from the project's dev-worktree.mjs --check)
const plain = devCommands('18001', { portless: false });
check('ports: API P+10000 on 127.0.0.1 for the servers, admin P+20000', plain[0].env.DEV_BACKEND_PORT === '28001' && plain[1].env.INTERNAL_API_URL === 'http://127.0.0.1:28001' && plain[2].command === 'pnpm dev:admin --port 38001 --strictPort');
check('no -- separator reaches vite', plain.every((c) => !/\s--\s/.test(c.command)));
const named = devCommands('18001', { slug: 'my-slug' });
check('with a slug each server runs behind its portless name', named[1].command === 'portless --name my-slug.b2b.jewelryx --app-port 18001 -- pnpm dev:frontend --port 18001 --strictPort' && named[2].env.PUBLIC_API_URL === 'http://my-slug.api.jewelryx.localhost/api/v1');
check('PORTLESS=0 serves the ports directly', devCommands('18001', { slug: 'my-slug', portless: false })[1].env.ORIGIN === 'http://localhost:18001');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
