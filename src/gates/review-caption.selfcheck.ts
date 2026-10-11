// Public T2 CLI regression: no live services, windows, approval callback or remote operation.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';
const root = WF_ROOT;
const { agreementSha } = await import(pathToFileURL(join(root, 'src/round/agreement.ts')).href);
const serveUrl = pathToFileURL(join(root, 'src/worktrees/serve.ts')).href;
let failures = 0;
for (const klass of ['A', 'B']) {
  const dir = mkdtempSync(join(tmpdir(), 'wf-review-caption-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    writeFileSync(join(dir, 'product.txt'), 'before\n');
    git('add', '-A'); git('commit', '-qm', 'base'); git('checkout', '-qb', 'fix/caption');
    writeFileSync(join(dir, 'product.txt'), 'after\n'); git('add', '-A'); git('commit', '-qm', 'change');
    const folder = 'bug-reports/caption';
    mkdirSync(join(dir, folder, 'proof'), { recursive: true });
    mkdirSync(join(dir, '.wf'), { recursive: true });
    const agreementName = klass === 'A' ? 'TICKET.md' : 'AGREEMENT.md';
    const material = klass === 'A' ? '## Intent\nKeep the intended behavior.\n' : '## Observed\n- behavior — `product.txt:1`\n\n## Agreed\n- Keep the intended behavior.\n';
    writeFileSync(join(dir, folder, agreementName), `${material}\n## Before\nproof/before-1.png — ROUND-BEFORE-${klass}\n`);
    writeFileSync(join(dir, 'ASSESSMENT.md'), 'proof/after-1.png — WRONG-ROOT-CAPTION\n');
    git('add', 'ASSESSMENT.md'); git('commit', '-qm', 'root caption decoy');
    writeFileSync(join(dir, folder, 'ASSESSMENT.md'), `head: ${git('rev-parse', 'HEAD')}\nVerdict: clean\n\n## Live\nproof/after-1.png — ROUND-AFTER-${klass}\n`);
    // Real PNG bytes, not strings masquerading as images. Browser loading is verified separately.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pAAAAABJRU5ErkJggg==', 'base64');
    writeFileSync(join(dir, folder, 'proof/before-1.png'), png);
    writeFileSync(join(dir, folder, 'proof/after-1.png'), png);
    if (klass === 'B') writeFileSync(join(dir, folder, 'AGREEMENT-REVIEW.md'), `agreement-sha: ${agreementSha(dir, klass, folder)}\nverdict: approved\n`);
    writeFileSync(join(dir, '.wf/state.json'), JSON.stringify({ wf_version: 2, made_by: 'kit', round: 'fix/caption', id: 'caption', folder, base: 'main', class: klass, step: 'assess' }));
    const hook = `${dir}-skip-fixture-services.mjs`;
    writeFileSync(hook, `import { registerHooks } from 'node:module';\nregisterHooks({ load(url, context, nextLoad) {\n const loaded = nextLoad(url, context);\n if (url !== ${JSON.stringify(serveUrl)}) return loaded;\n const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');\n const marker = 'export async function ensureServers(worktree: string, { wait = false, timeoutMs = 180_000 }: { wait?: boolean; timeoutMs?: number } = {}): Promise<string> {';\n if (!source.includes(marker)) throw Error('review caption CLI: service fixture boundary not found');\n return { ...loaded, source: source.replace(marker, marker + '\\n return "review caption CLI: services intentionally stubbed";') };\n}});\n`);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, join(root, 'wf.mjs'), 'review', 'fix/caption', '--base', 'main'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1' }, timeout: 20000 });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /services intentionally stubbed/);
    const html = readFileSync(join(dir, '.wf/before-after.html'), 'utf8');
    assert.match(html, new RegExp(`ROUND-BEFORE-${klass}`), 'caption must come from the round agreement');
    assert.match(html, new RegExp(`ROUND-AFTER-${klass}`), 'caption must come from the round assessment');
    assert.ok(!html.includes('WRONG-ROOT-CAPTION'), 'root decoy must not be used');
    assert.ok(html.includes(`../${folder}/proof/before-1.png`), 'image resolves from the actual .wf page');
    console.log(`ok class ${klass}: public review reads both round captions, not root decoy`);
  } catch (error) {
    failures++;
    console.error(`FAIL class ${klass}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(`${dir}-skip-fixture-services.mjs`, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exitCode = failures ? 1 : 0;
