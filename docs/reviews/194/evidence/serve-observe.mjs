// Observation-only replay. Run: node docs/reviews/194/evidence/serve-observe.mjs [source-root]
// No source rewrite, timeout changes, successful-response alteration or automatic retry.
import fs from 'node:fs';
import cp from 'node:child_process';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const read = fs.readFileSync;
const spawn = cp.spawnSync;
const fetchOnce = globalThis.fetch;
const listeners = new Map();
const log = (event) => console.log('[serve-observe]', JSON.stringify(event));
fs.readFileSync = function (...args) {
  const result = read.apply(this, args);
  const path = String(args[0]);
  if (/[/\\](stack|descendant)\.json$/.test(path)) {
    const listener = JSON.parse(String(result));
    listeners.set(listener.port, { ...listener, folder: dirname(path) });
  }
  if (/[/\\]serve\.pid$/.test(path)) log({ event: 'pid-read', path, bytes: String(result) });
  return result;
};
cp.spawnSync = function (...args) {
  const result = spawn.apply(this, args);
  if (args[1]?.[0]?.includes('server entry [x].mjs')) log({ event: 'cli', args: args[1].slice(1), status: result.status, error: result.error?.message, output: `${result.stdout ?? ''}${result.stderr ?? ''}` });
  return result;
};
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code; } };
const freshHttp = (url) => new Promise((resolve) => {
  const request = http.get(url, { agent: false, headers: { Connection: 'close' } }, response => {
    let body = ''; response.setEncoding('utf8'); response.on('data', data => body += data);
    response.on('end', () => resolve({ status: response.statusCode, body }));
  });
  request.setTimeout(2000, () => request.destroy(new Error('fresh control timeout')));
  request.on('error', error => resolve({ error: error.message, code: error.code }));
});
globalThis.fetch = async function (...args) {
  const start = performance.now();
  try {
    const response = await fetchOnce.apply(this, args);
    log({ event: 'http', url: String(args[0]), status: response.status, ms: performance.now() - start });
    return response;
  } catch (error) {
    const listener = listeners.get(Number(new URL(String(args[0])).port));
    log({ event: 'http-error', url: String(args[0]), ms: performance.now() - start, error: error.message, cause: error.cause?.code, listener, alive: listener && alive(listener.pid) });
    if (listener) {
      const authority = {};
      for (const file of ['serve.pid', 'serve-owner.json']) {
        try { authority[file] = String(read(join(listener.folder, file))); }
        catch (e) { authority[file] = e.code; }
      }
      log({ event: 'fresh-control', url: String(args[0]), response: await freshHttp(String(args[0])), alive: alive(listener.pid), authority });
    }
    throw error;
  }
};
syncBuiltinESMExports();
log({ event: 'start', platform: process.platform, node: process.version, source: resolve(process.argv[2] ?? process.cwd()) });
await import(pathToFileURL(join(resolve(process.argv[2] ?? process.cwd()), 'src/worktrees/serve.selfcheck.ts')).href);
