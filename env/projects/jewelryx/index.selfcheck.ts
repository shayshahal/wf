// env/projects/jewelryx/index.selfcheck.ts — node env/projects/jewelryx/index.selfcheck.ts → exit 0 when green.
// Pure arms: JewelryX on Shay's machine: an old worktree's own mongo container (mongo.ts), portless names and
// wrapping, and what the kit's project folder does with them plugged in. Nothing is run.
import { devCommands } from '../../../projects/jewelryx/dev.ts';
import { seedUrl, stackUrls, teardown } from '../../../projects/jewelryx/index.ts';
import { plug } from '../../../src/seams.ts';
import { oldContainerSteps, pieces, portlessServers, stackNames } from './index.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
  (console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

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

// ── the worktrees' databases are the kit's: the repo's own MongoDB on 27017 (2026-10-04)
check('a worktree\'s database is in the kit\'s MongoDB, whatever its own port', seedUrl({ slug: 'fix-bjew-1', port: 17554 }) === 'mongodb://127.0.0.1:27017');
const down = teardown({ slug: 'fix-bjew-1', worktree: 'C:/wt/fix-bjew-1' });
check('reap drops the worktree\'s database, then its own container if it has one, then portless routes', down.map((x) => x.label).join(' → ') === 'drop database → its own mongo container, if any → portless prune', down.map((x) => x.label).join(' → '));
check('the plan itself runs nothing (the container is looked for at reap)', down.slice(0, 2).every((x) => typeof x.run === 'function'));
// A worktree made before 2026-10-04: its own container, volume and compose network.
const old = oldContainerSteps('fix-bjew-1', true);
check('made before: container (with its anonymous volumes, -v), volume, compose network', old.map((x) => x.label).join(' → ') === 'docker rm mongo → docker volume rm → docker network rm' && old[0].args!.includes('-v'), old.map((x) => x.label).join(' → '));
check('docker names come from the slug', old[0].args!.at(-1) === 'jewelryx-mongo-fix-bjew-1' && old[1].args!.at(-1) === 'jewelryx-wt-mongo-fix-bjew-1' && old[2].args!.join(' ') === 'network rm jewelryx-wt-fix-bjew-1_default');
check('none: nothing to remove', oldContainerSteps('fix-bjew-1', false).length === 0);
check('portless prune runs with CI=1', (down[2] as { env: Record<string, string> }).env.CI === '1' && down[2].args!.join(' ') === 'prune');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
