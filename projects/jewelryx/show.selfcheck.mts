// show.selfcheck.mts — node show.selfcheck.mts → exit 0 when green.
import assert from 'node:assert/strict';
import { opensWindows } from '../../editor.mts';
import type { Origins } from './index.mts';
import { openLineOf, paneText, parseOpen, setupArgs, setupLinesOf, showArgs, unMsys } from './show.mts';

assert.deepEqual(parseOpen('b2b /catalog as buyer mobile'), { app: 'b2b', path: '/catalog', as: 'buyer', mobile: true });
assert.deepEqual(parseOpen('admin /orders'), { app: 'admin', path: '/orders', as: 'admin', mobile: false });
assert.deepEqual(parseOpen('b2b /my-inventory as seller'), { app: 'b2b', path: '/my-inventory', as: 'seller', mobile: false });
assert.equal(parseOpen('the catalog, logged in'), null);
assert.deepEqual(parseOpen('admin products as admin'), { app: 'admin', path: '/products', as: 'admin', mobile: false });
assert.equal(parseOpen('admin C:/Program Files/Git/products'), null);
const plan = '# X\n\n## T2 walk\nopen: `b2b /catalog as buyer mobile`\nZoom on a heart.\n\n## Asks\nnone\n';
assert.equal(openLineOf(plan), 'b2b /catalog as buyer mobile');
assert.equal(openLineOf(plan.replace(/\n/g, '\r\n')), 'b2b /catalog as buyer mobile');
assert.equal(openLineOf('## T2 walk\nZoom.\n## Asks\nopen: b2b /x\n'), null);
const cli = 'docs/agents/verify-jewelryx/control-jewelryx.mjs';
assert.deepEqual(showArgs(parseOpen('b2b /catalog as seller mobile')!), [cli, 'open', 'b2b', '/catalog', 'as', 'seller', 'mobile', '--headed']);
assert.deepEqual(showArgs(parseOpen('admin /orders')!), [cli, 'open', 'admin', '/orders', 'as', 'admin', '--headed']);
const gitBash = { MSYSTEM: 'MINGW64', EXEPATH: 'C:\\Program Files\\Git\\bin' };
assert.equal(unMsys('C:/Program Files/Git/products', gitBash), '/products');
assert.equal(unMsys('C:/Program Files/Git/products', {}), 'C:/Program Files/Git/products');
assert.equal(unMsys('/b2b/orders?order=1', gitBash), '/b2b/orders?order=1');

// Under Claude Code: no window, the Browser pane's login and page (BJEW-562 T2, 2026-09-27).
assert.equal(opensWindows({ CLAUDECODE: '1' }), false);
assert.equal(opensWindows({}), true);
const pane = paneText(parseOpen('b2b /inventory as seller')!, { b2b: 'http://localhost:13111', admin: 'http://localhost:33111' } as Origins, 'fix-a');
assert.match(pane, /preview_start with name "fix-a b2b"/);
assert.match(pane, /the page: http:\/\/localhost:13111\/b2b\/inventory\n/);
assert.match(pane, /login: http:\/\/localhost:13111\/b2b\/login as seller@seed\.jewelryx \/ seed1234/);

// The T2 walk's setup lines: the data the page needs, made once per plan through the CLI's api.
const walked = '## T2 walk\nopen: b2b /inventory/13bd/variants as seller\nsetup: api createVariant {"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}} as seller\nsetup: `api listInventory {} as seller`\nLook at the header.\n\n## Asks\nsetup: not this one\n';
assert.deepEqual(setupLinesOf(walked), ['api createVariant {"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}} as seller', 'api listInventory {} as seller']);
assert.deepEqual(setupArgs(setupLinesOf(walked)[0])!.slice(1), ['api', 'createVariant', '{"path":{"product_id":"13bd"},"body":{"attribute_values":{"size":"45"}}}', '--as', 'seller']);
assert.equal(setupArgs('curl -X POST http://x'), null);
assert.deepEqual(setupLinesOf('## T2 walk\nopen: b2b / as buyer\n'), []);
console.log('all arms green');
