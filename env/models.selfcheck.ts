// env/models.selfcheck.ts — node env/models.selfcheck.ts → exit 0 when green.
// Pure arms: what pi makes of each level's pattern (models.ts pickModel), from a `pi --list-models`
// table. Nothing is run.
import { withModel } from '../src/models.ts';
import { listed, pickModel, PI_MODELS } from './models.ts';

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
`;
const rows = listed(table);
check('the table is read as provider and id, header dropped', rows.length === 8 && rows[0][0] === 'anthropic' && rows[0][1] === 'claude-3-7-sonnet-latest', JSON.stringify(rows[0]));
check('low: the newest Sonnet on anthropic, not bedrock\'s (whose id sorts higher)', pickModel(PI_MODELS.low, rows) === 'anthropic/claude-sonnet-5-5', String(pickModel(PI_MODELS.low, rows)));
check('medium: the newest Opus, undated over its dated id, thinking kept', pickModel(PI_MODELS.medium, rows) === 'anthropic/claude-opus-5-5:medium', String(pickModel(PI_MODELS.medium, rows)));
check('an exact id is that id', pickModel('anthropic/claude-sonnet-5', rows) === 'anthropic/claude-sonnet-5');
check('no match is null: wf models says so and exits 1', pickModel('anthropic/haiku', rows) === null && pickModel('openai/opus', rows) === null);
check('pi\'s agents get the pi model for their level, line endings kept', withModel('name: x\r\neffort: low\r\ntools: read\r\n', PI_MODELS) === 'name: x\r\nmodel: anthropic/sonnet\r\ntools: read\r\n');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
