// index.selfcheck.mjs — node projects/jewelryx/index.selfcheck.mjs → exit 0 when green.
// Pure arms: JewelryX's names and ports, pages, teardown and tracker note (index.mjs), the worktree's
// .env (env.mjs), its database (db.mjs) and its dev-server commands (dev.mjs). Nothing is run.
import { mongoPortForBase, mongoUrlFromDockerPort, worktreeDatabase, worktreeMongoUrl } from './db.mjs';
import { devCommands } from './dev.mjs';
import { includedFiles, sanitizeEnv } from './env.mjs';
import { directUrls, pageOf, setup, stackNames, teardown, trackerNote } from './index.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

// ── names and ports
check('mongo sits at 40000+(P-10000)', mongoPortForBase(12345) === 42345);
let range = '';
try { mongoPortForBase(9999); } catch (e) { range = e.message; }
check('a base port outside 10000-19999 throws', range.includes('out of range'), range);
check('names carry the full slug', stackNames('tools-workflow-v2').b2b === 'http://tools-workflow-v2.b2b.jewelryx.localhost');
check('B2B is the first app: it answers on the base port wf status probes', Object.keys(stackNames('s'))[0] === 'b2b');
const direct = directUrls(12345);
check('direct: B2B on P, admin P+20000, API on 127.0.0.1 at P+10000', direct.b2b === 'http://localhost:12345' && direct.admin === 'http://localhost:32345' && direct.api === 'http://127.0.0.1:22345/api/v1', JSON.stringify(direct));
check('setup steps in wt order: env node verify tools db', Object.keys(setup).join(' ') === 'env node verify tools db', Object.keys(setup).join(' '));

// ── pages a reviewer should open
check('a b2b page, route groups dropped', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')) === '{"app":"b2b","path":"b2b/login"}', JSON.stringify(pageOf('packages/frontend/b2b/src/routes/(auth)/login/+page.svelte')));
check('an admin root layout is the app root', JSON.stringify(pageOf('packages/frontend/admin/src/routes/+layout.ts')) === '{"app":"admin","path":"admin"}');
check('a params segment stays for the reviewer to fill', pageOf('packages/frontend/b2b/src/routes/orders/[id]/+page.server.ts')?.path === 'b2b/orders/[id]');
check('a component is not a page', pageOf('packages/frontend/b2b/src/lib/x.svelte') === null);

// ── teardown
const down = teardown('fix-bjew-1');
check('teardown: mongo container, volume, compose network, then portless routes', down.map((s) => s.label).join(' → ') === 'docker rm mongo → docker volume rm → docker network rm → portless prune', down.map((s) => s.label).join(' → '));
check('docker names come from the slug', down[0].args.at(-1) === 'jewelryx-mongo-fix-bjew-1' && down[1].args.at(-1) === 'jewelryx-wt-mongo-fix-bjew-1');
check('the compose network is removed by its slug name', down[2].args.join(' ') === 'network rm jewelryx-wt-fix-bjew-1_default', down[2].args.join(' '));
check('portless prune runs with CI=1', down[3].env.CI === '1' && down[3].args.join(' ') === 'prune');

// ── the tracker note
const plan = ['# Plan', '', 'Cause: the send result is discarded at auth.py:599', 'Approach: capture it'].join('\r\n');
const note = trackerNote({ planText: plan, url: 'https://github.com/x/y/pull/7' });
check('the note is MONDAY.md', note.file === 'MONDAY.md');
check('MONDAY.md is ≤6 lines', note.text.trimEnd().split('\n').length <= 6, String(note.text.trimEnd().split('\n').length));
check('MONDAY.md carries cause, approach and the PR url', note.text.includes('סיבה: the send result is discarded at auth.py:599') && note.text.includes('מה שונה: capture it') && note.text.includes('pull/7'), note.text);

// ── the worktree's .env (cases from the project's sanitize-worktree-env test)
const prod = '# Backend configuration\r\nMONGODB_URL=mongodb+srv://u:secret@cluster.mongodb.net\r\nDATABASE_NAME=jewelryx_dev\r\nMEDIA_STORAGE_BACKEND=s3\r\nAWS_S3_ACCESS_KEY_ID=AKIAPROD\r\nAWS_S3_SECRET_ACCESS_KEY=prodsecret\r\nAWS_S3_BUCKET_NAME=jewelryx-prod-static-content\r\nAWS_SES_ACCESS_KEY_ID=AKIASES\r\nAWS_SES_SECRET_ACCESS_KEY=sessecret\r\nAWS_S3_REGION=eu-central-1\r\nOTP_DEV_EXPOSE=true\r\n';
const db = { url: worktreeMongoUrl(17554), name: worktreeDatabase('probe-wf2c') };
const env = sanitizeEnv(prod, db);
check('production credentials are blanked, storage is local', !/prodsecret|sessecret|AKIA|prod-static/.test(env) && /^MEDIA_STORAGE_BACKEND=local\r?$/m.test(env), env);
check('the database is the worktree\'s own: 40000+(P-10000), jewelryx_<slug>', /^MONGODB_URL=mongodb:\/\/localhost:47554\r?$/m.test(env) && /^DATABASE_NAME=jewelryx_probe-wf2c\r?$/m.test(env), env);
check('comments, unrelated keys and CRLF are kept', env.startsWith('# Backend configuration\r\n') && /^OTP_DEV_EXPOSE=true\r?$/m.test(env) && /^AWS_S3_REGION=eu-central-1\r?$/m.test(env));
check('a missing MEDIA_STORAGE_BACKEND is added (the backend defaults to s3)', /^MEDIA_STORAGE_BACKEND=local$/m.test(sanitizeEnv('A=1\n', db)));
check('sanitizing twice changes nothing', sanitizeEnv(env, db) === env);

// ── the secrets a worktree copies
check('.worktreeinclude: plain paths, leading / dropped, comments and blanks skipped', includedFiles('/.env\r\n# x\r\n\r\n/packages/backend/.env\r\n').join() === '.env,packages/backend/.env');
let glob = '';
try { includedFiles('/packages/*/.env'); } catch (e) { glob = e.message; }
check('a pattern is refused, not silently skipped', glob.includes('is a pattern'), glob);

// ── the database
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
