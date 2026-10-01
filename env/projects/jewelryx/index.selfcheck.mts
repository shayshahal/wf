// env/projects/jewelryx/index.selfcheck.mts — node env/projects/jewelryx/index.selfcheck.mts → exit 0 when green.
// Pure arms: JewelryX on Shay's machine: its mongo container (mongo.mts), portless names and wrapping,
// and what the kit's project folder does with them plugged in. Nothing is run.
import { devCommands } from '../../../projects/jewelryx/dev.mts';
import { stackUrls, teardown } from '../../../projects/jewelryx/index.mts';
import { plug } from '../../../seams.mts';
import { pieces, portlessServers, stackNames } from './index.mts';
import { mongoPortForBase, mongoUrlFromDockerPort, worktreeMongoUrl } from './mongo.mts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── the mongo container
check('mongo sits at 40000+(P-10000)', mongoPortForBase(12345) === 42345 && worktreeMongoUrl(17554) === 'mongodb://localhost:47554');
let range = '';
try { mongoPortForBase(9999); } catch (e) { range = (e as Error).message; }
check('a base port outside 10000-19999 throws', range.includes('out of range'), range);
check('the seeder writes to the container\'s published port', mongoUrlFromDockerPort('0.0.0.0:47554\n[::]:47554\n') === 'mongodb://127.0.0.1:47554');

// ── portless
check('names carry the full slug', stackNames('tools-workflow-v2').b2b === 'http://tools-workflow-v2.b2b.jewelryx.localhost');
check('B2B is the first app: it answers on the base port wf status probes', Object.keys(stackNames('s'))[0] === 'b2b');
const s = portlessServers('my-slug');
const named = devCommands('18001', { origins: s!.origins, wrap: s!.wrap });
check('each server runs behind its portless name', named[1].command === 'portless --name my-slug.b2b.jewelryx --app-port 18001 -- pnpm dev:frontend --port 18001 --strictPort' && named[2].env.PUBLIC_API_URL === 'http://my-slug.api.jewelryx.localhost/api/v1', named[1].command);
check('an auto-started proxy stays plain HTTP', named.every((c) => c.env.PORTLESS_HTTPS === '0'));
process.env.PORTLESS = '0';
check('PORTLESS=0 serves the ports directly', portlessServers('my-slug') === null);
delete process.env.PORTLESS;

// ── the kit's project folder, with these pieces plugged in
plug({ project: pieces });
check('a person gets the portless names', stackUrls({ slug: 'my-slug', port: 18001 }).b2b === 'http://my-slug.b2b.jewelryx.localhost');
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:/wt/fix-bjew-1' });
check('teardown: mongo container, volume, compose network, then portless routes', down.map((x) => x.label).join(' → ') === 'docker rm mongo → docker volume rm → docker network rm → portless prune', down.map((x) => x.label).join(' → '));
check('docker names come from the slug', down[0].args!.at(-1) === 'jewelryx-mongo-fix-bjew-1' && down[1].args!.at(-1) === 'jewelryx-wt-mongo-fix-bjew-1');
check('the compose network is removed by its slug name', down[2].args!.join(' ') === 'network rm jewelryx-wt-fix-bjew-1_default', down[2].args!.join(' '));
check('portless prune runs with CI=1', (down[3] as { env: Record<string, string> }).env.CI === '1' && down[3].args!.join(' ') === 'prune');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
