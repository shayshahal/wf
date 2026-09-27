// show.selfcheck.mjs — node show.selfcheck.mjs → exit 0 when green.
import assert from 'node:assert/strict';
import { opensWindows } from '../../editor.mjs';
import { openLineOf, paneText, parseOpen, showArgs, unMsys } from './show.mjs';

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
assert.deepEqual(showArgs(parseOpen('b2b /catalog as seller mobile')), [cli, 'open', 'b2b', '/catalog', 'as', 'seller', 'mobile', '--headed']);
assert.deepEqual(showArgs(parseOpen('admin /orders')), [cli, 'open', 'admin', '/orders', 'as', 'admin', '--headed']);
const gitBash = { MSYSTEM: 'MINGW64', EXEPATH: 'C:\\Program Files\\Git\\bin' };
assert.equal(unMsys('C:/Program Files/Git/products', gitBash), '/products');
assert.equal(unMsys('C:/Program Files/Git/products', {}), 'C:/Program Files/Git/products');
assert.equal(unMsys('/b2b/orders?order=1', gitBash), '/b2b/orders?order=1');

// Under Claude Code: no window, the Browser pane's login and page (BJEW-562 T2, 2026-09-27).
assert.equal(opensWindows({ CLAUDECODE: '1' }), false);
assert.equal(opensWindows({}), true);
const pane = paneText(parseOpen('b2b /inventory as seller'), { b2b: 'http://localhost:13111', admin: 'http://localhost:33111' });
assert.match(pane, /log in: http:\/\/localhost:13111\/b2b\/login as seller@seed\.jewelryx \/ seed1234/);
assert.match(pane, /then: {3}http:\/\/localhost:13111\/b2b\/inventory$/);
console.log('all arms green');
