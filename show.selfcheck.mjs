// show.selfcheck.mjs — node show.selfcheck.mjs → exit 0 when green.
import assert from 'node:assert/strict';
import { openLineOf, parseOpen } from './show.mjs';

assert.deepEqual(parseOpen('b2b /catalog as buyer mobile'), { app: 'b2b', path: '/catalog', as: 'buyer', mobile: true });
assert.deepEqual(parseOpen('admin /orders'), { app: 'admin', path: '/orders', as: 'admin', mobile: false });
assert.deepEqual(parseOpen('b2b /my-inventory as seller'), { app: 'b2b', path: '/my-inventory', as: 'seller', mobile: false });
assert.equal(parseOpen('the catalog, logged in'), null);
assert.equal(parseOpen('b2b catalog'), null);
const plan = '# X\n\n## T2 walk\nopen: `b2b /catalog as buyer mobile`\nZoom on a heart.\n\n## Asks\nnone\n';
assert.equal(openLineOf(plan), 'b2b /catalog as buyer mobile');
assert.equal(openLineOf(plan.replace(/\n/g, '\r\n')), 'b2b /catalog as buyer mobile');
assert.equal(openLineOf('## T2 walk\nZoom.\n## Asks\nopen: b2b /x\n'), null);
console.log('all arms green');
