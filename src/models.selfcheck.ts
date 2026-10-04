// models.selfcheck.ts — node src/models.selfcheck.ts → exit 0 when green.
// Pure arms: every phase has an effort level, and an agent file's level becomes a model (models.ts).
import { CLAUDE_CODE_MODELS, EFFORTS, modelFor, PHASE_EFFORT, withModel } from './models.ts';
import { PHASES } from './round/prompt.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const missing = PHASES.filter((p) => !(p in PHASE_EFFORT));
check('every phase wf prompt composes has an effort level', !missing.length, missing.join(', '));
check('every level has the kit\'s model', EFFORTS.every((e) => CLAUDE_CODE_MODELS[e]));
check('the judges are low, the builders medium', modelFor('validate', CLAUDE_CODE_MODELS) === 'sonnet' && modelFor('implement', CLAUDE_CODE_MODELS) === 'opus');
check('an effort line becomes the model line, nothing else moves', withModel('name: a\neffort: low\ntools: read\n', CLAUDE_CODE_MODELS) === 'name: a\nmodel: sonnet\ntools: read\n');
check('no effort line: the text as it is (the agent inherits)', withModel('name: a\n', CLAUDE_CODE_MODELS) === 'name: a\n');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
