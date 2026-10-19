// env/models.selfcheck.ts — node env/models.selfcheck.ts → exit 0 when green.
// Fixed synthetic examples test resolution; a catalog derived from configuration tests real CLI
// wiring. Changing model choices or thinking levels needs only models.ts, not this check.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { EFFORTS, withModel } from '../src/models.ts';
import { WF_ROOT } from '../src/paths.ts';
import { listed, pickModel, PI_PERSONAL_MODELS, PI_ANTHROPIC_MODELS, piModelsForProvider } from './models.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// These are resolver examples, not today's selected models.
const rows = listed(`provider model context max-out thinking images
anthropic family-1 1M 64K yes yes
anthropic family-2 1M 64K yes yes
anthropic family-2-20260801 1M 64K yes yes
anthropic dated-20260801 1M 64K yes yes
anthropic dated-20260901 1M 64K yes yes
personal family-9 1M 64K yes no
`);
check('catalog parsing drops the header and reads provider/id pairs', rows.length === 6 && rows[0][0] === 'anthropic' && rows[0][1] === 'family-1');
check('exact ids win over newer pattern matches', pickModel('anthropic/family-1', rows) === 'anthropic/family-1');
check('patterns prefer the newest undated id and retain thinking', pickModel('anthropic/family:medium', rows) === 'anthropic/family-2:medium');
check('dated ids are used when no undated match exists', pickModel('anthropic/dated:high', rows) === 'anthropic/dated-20260901:high');
check('resolution stays within the requested provider', pickModel('anthropic/family', rows) === 'anthropic/family-2' && pickModel('personal/family', rows) === 'personal/family-9');
check('missing matches never fall back to another provider', pickModel('missing/family', rows) === null && pickModel('anthropic/unknown', rows) === null);

// Configuration is the authority for choices; account boundaries and effort wiring are invariants.
check('work callers select the work table', piModelsForProvider('anthropic') === PI_ANTHROPIC_MODELS);
check('personal callers and bare terminals select the personal table', ['opencode-go', 'openai-codex', 'google', '', undefined].every((provider) => piModelsForProvider(provider) === PI_PERSONAL_MODELS));
check('work choices stay in the Anthropic account', Object.values(PI_ANTHROPIC_MODELS).every((model) => /^anthropic\//i.test(model)));
check('personal choices stay outside the Anthropic account', Object.values(PI_PERSONAL_MODELS).every((model) => !/^anthropic\//i.test(model)));
for (const [account, models] of [['work', PI_ANTHROPIC_MODELS], ['personal', PI_PERSONAL_MODELS]] as const) {
	for (const effort of EFFORTS) {
		check(`${account} ${effort} has an explicit provider and model`, /^[^/:]+\/[^:]+(?::\w+)?$/.test(models[effort]));
		check(`${account} ${effort} agent conversion preserves the configured model and thinking`, withModel(`name: x\r\neffort: ${effort}\r\ntools: read\r\n`, models) === `name: x\r\nmodel: ${models[effort]}\r\ntools: read\r\n`);
	}
}
for (const agent of ['round-worker', 'harness-fixer', 'codebase-locator', 'codebase-analyzer']) {
	const installed = withModel(readFileSync(join(WF_ROOT, 'agents', `${agent}.md`), 'utf8'), null);
	check(`${agent}'s installed default inherits its caller's account`, !/^(model|effort):/m.test(installed) && installed.includes(`name: ${agent}`));
}
check('inheriting a model preserves CRLF and tool defaults', withModel('name: x\r\neffort: low\r\ntools: read\r\n', null) === 'name: x\r\n\r\ntools: read\r\n');

// Treat configured patterns as available exact ids here. Pattern resolution is tested independently
// above; this CLI test proves that the entry passes the right table and retains its thinking suffixes.
const configured = [...Object.values(PI_PERSONAL_MODELS), ...Object.values(PI_ANTHROPIC_MODELS)];
const catalogRows: [string, string][] = configured.map((model) => {
	const ref = model.replace(/:[^:]+$/, '');
	const slash = ref.indexOf('/');
	return [ref.slice(0, slash), ref.slice(slash + 1)];
});
const catalog = ['provider model context max-out thinking images', ...catalogRows.map(([provider, id]) => `${provider} ${id} 1M 64K yes yes`)].join('\n');
for (const model of configured) {
	check('configured model resolution retains the entire reference', pickModel(model, catalogRows) === model, model);
	const provider = model.slice(0, model.indexOf('/'));
	check('configured model cannot resolve through another account', pickModel(model, catalogRows.filter(([p]) => p !== provider)) === null, model);
}
const bin = mkdtempSync(join(tmpdir(), 'wf-model-catalog-'));
try {
	writeFileSync(join(bin, 'catalog.cjs'), `console.log(${JSON.stringify(catalog)});`);
	const win = process.platform === 'win32';
	writeFileSync(join(bin, win ? 'pi.cmd' : 'pi'), win ? `@"${process.execPath}" "%~dp0catalog.cjs"\r\n` : `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/catalog.cjs"\n`, win ? {} : { mode: 0o755 });
	for (const provider of ['anthropic', 'opencode-go', 'openai-codex']) {
		const expected = provider === 'anthropic' ? PI_ANTHROPIC_MODELS : PI_PERSONAL_MODELS;
		const run = spawnSync(process.execPath, [join(WF_ROOT, 'env/wf.mjs'), 'models'], { env: { ...process.env, PI_PROVIDER: provider, PATH: `${bin}${delimiter}${process.env.PATH}` }, encoding: 'utf8' });
		check(`wf models under ${provider} prints and resolves its configured effort table`, run.status === 0 && EFFORTS.every((effort) => run.stdout.split('\n').includes(`${effort.padEnd(7)} ${expected[effort].padEnd(24)} → ${expected[effort]}`)), `${run.stdout}${run.stderr}`);
	}
} finally {
	rmSync(bin, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
