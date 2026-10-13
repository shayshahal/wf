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
const exampleModels = { low: 'helper-model', medium: 'worker-model' };
for (const models of [CLAUDE_CODE_MODELS, exampleModels]) {
	check('every round phase maps to the supplied medium model', PHASES.every((phase) => modelFor(phase, models) === models.medium));
	for (const effort of EFFORTS) {
		check('an effort line becomes the supplied model line, nothing else moves', withModel(`name: a\neffort: ${effort}\ntools: read\n`, models) === `name: a\nmodel: ${models[effort]}\ntools: read\n`);
	}
}
check('no effort line: the text as it is (the agent inherits)', withModel('name: a\n', CLAUDE_CODE_MODELS) === 'name: a\n');
check('no machine pin: remove the effort so the agent inherits its caller', withModel('name: a\neffort: low\ntools: read\n', null) === 'name: a\n\ntools: read\n');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
