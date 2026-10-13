// env/models.selfcheck.ts — node env/models.selfcheck.ts → exit 0 when green.
// Pure resolution plus the real CLI's account routing through an isolated `pi --list-models`
// catalog. No provider requests or worker models are started.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { modelFor, withModel } from '../src/models.ts';
import { WF_ROOT } from '../src/paths.ts';
import { listed, pickModel, PI_PERSONAL_MODELS, PI_ANTHROPIC_MODELS, piModelsForProvider } from './models.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const table = `provider        model                         context  max-out  thinking  images
anthropic       claude-3-7-sonnet-latest      200K     64K      yes       yes
anthropic       claude-opus-4-7               1M       128K     yes       yes
anthropic       claude-opus-5-5               1M       128K     yes       yes
anthropic       claude-opus-5-5-20260801      1M       128K     yes       yes
anthropic       claude-sonnet-4-6             1M       64K      yes       yes
anthropic       claude-sonnet-5               1M       64K      yes       yes
anthropic       claude-sonnet-5-5             1M       64K      yes       yes
amazon-bedrock  us.anthropic.claude-sonnet-5  1M       64K      yes       yes
opencode-go     deepseek-v4.1-flash           1M       64K      yes       no
`;
const rows = listed(table);
check('the table is read as provider and id, header dropped', rows.length === 9 && rows[0][0] === 'anthropic' && rows[0][1] === 'claude-3-7-sonnet-latest', JSON.stringify(rows[0]));
check('low: exactly DeepSeek 4.1 Flash, not a fallback', pickModel(PI_PERSONAL_MODELS.low, rows) === 'opencode-go/deepseek-v4.1-flash', String(pickModel(PI_PERSONAL_MODELS.low, rows)));
check('medium: exactly DeepSeek 4.1 Flash', pickModel(PI_PERSONAL_MODELS.medium, rows) === 'opencode-go/deepseek-v4.1-flash', String(pickModel(PI_PERSONAL_MODELS.medium, rows)));
check('undated over its dated id, thinking kept', pickModel('anthropic/opus:medium', rows) === 'anthropic/claude-opus-5-5:medium');
check('personal round-worker phases dispatch only DeepSeek 4.1 Flash', ['agree', 'build', 'assess'].every((phase) => modelFor(phase, piModelsForProvider('opencode-go')) === 'opencode-go/deepseek-v4.1-flash'));
check('work round-worker phases use Sonnet with medium thinking', ['agree', 'build', 'assess'].every((phase) => modelFor(phase, piModelsForProvider('anthropic')) === 'anthropic/sonnet:medium'));
check('other work helpers use Sonnet with low thinking, not personal credentials', pickModel(PI_ANTHROPIC_MODELS.low, rows) === 'anthropic/claude-sonnet-5-5:low');
check('missing work models never fall back to the personal catalog', Object.values(PI_ANTHROPIC_MODELS).every((model) => pickModel(model, rows.filter(([provider]) => provider !== 'anthropic')) === null));
check('other personal providers and bare terminals retain Flash', ['openai-codex', 'google', '', undefined].every((provider) => piModelsForProvider(provider) === PI_PERSONAL_MODELS));
for (const agent of ['round-worker', 'harness-fixer', 'codebase-locator', 'codebase-analyzer']) {
	const installed = withModel(readFileSync(join(WF_ROOT, 'agents', `${agent}.md`), 'utf8'), null);
	check(`${agent}'s installed default inherits its caller's account`, !/^(model|effort):/m.test(installed) && installed.includes(`name: ${agent}`));
}
check('inheriting a model preserves CRLF and tool defaults', withModel('name: x\r\neffort: low\r\ntools: read\r\n', null) === 'name: x\r\n\r\ntools: read\r\n');
check('an exact id is that id', pickModel('anthropic/claude-sonnet-5', rows) === 'anthropic/claude-sonnet-5');
check('no match is null: wf models says so and exits 1', pickModel('anthropic/haiku', rows) === null && pickModel('openai/opus', rows) === null);
check('pi\'s agents get the pi model for their level, line endings kept', withModel('name: x\r\neffort: low\r\ntools: read\r\n', PI_PERSONAL_MODELS) === 'name: x\r\nmodel: opencode-go/deepseek-v4.1-flash\r\ntools: read\r\n');

// Exercise the real env entry: an installed catalog is not the caller's account policy.
const bin = mkdtempSync(join(tmpdir(), 'wf-model-catalog-'));
try {
	writeFileSync(join(bin, 'catalog.cjs'), `console.log(${JSON.stringify(table)});`);
	const win = process.platform === 'win32';
	writeFileSync(join(bin, win ? 'pi.cmd' : 'pi'), win ? `@"${process.execPath}" "%~dp0catalog.cjs"\r\n` : `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/catalog.cjs"\n`, win ? {} : { mode: 0o755 });
	for (const provider of ['anthropic', 'opencode-go', 'openai-codex']) {
		const run = spawnSync(process.execPath, [join(WF_ROOT, 'env/wf.mjs'), 'models'], { env: { ...process.env, PI_PROVIDER: provider, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: 'utf8' });
		const expected = provider === 'anthropic' ? 'anthropic/claude-sonnet-5-5:medium' : 'opencode-go/deepseek-v4.1-flash';
		check(`wf models under ${provider} selects workers in the caller's account`, run.status === 0 && run.stdout.includes(expected) && (provider !== 'anthropic' || (run.stdout.includes('anthropic/claude-sonnet-5-5:low') && !run.stdout.includes('opencode-go/'))), `${run.stdout}${run.stderr}`);
	}
} finally {
	rmSync(bin, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
