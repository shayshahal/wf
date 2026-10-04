// eslint.config.js — lint-kit's error-handling set over wf's own code, run by src/selfcheck.ts.
// 2026-10-04: its first run found 20 catch blocks that drop the error; 4 hid real failures (reap
// deleting a worktree whose paperwork it could not list, T2 headers listing no files). The rest say
// why in a comment, which the rule accepts.
// No TypeScript parser: @typescript-eslint/parser wants TypeScript < 6.1 and wf checks with 7. wf's
// TypeScript is erasable only (AGENTS.md), so Node's stripTypeScriptTypes blanks the types and keeps
// every line and column, and ESLint's own parser reads what is left.
import { stripTypeScriptTypes } from 'node:module';
import errorHandling from 'lint-kit/error-handling';

const erasable = {
	meta: { name: 'erasable-ts' },
	processors: {
		strip: {
			preprocess: (text) => [{ text: stripTypeScriptTypes(text), filename: 'stripped.js' }],
			postprocess: (messages) => messages.flat(),
			supportsAutofix: false,
		},
	},
};

export default [
	{ ignores: ['docs/**', 'claude/**'] },
	{ files: ['**/*.ts'], plugins: { erasable }, processor: 'erasable/strip' },
	{ files: ['**/*.mjs', '**/*.ts/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
	...errorHandling.config({ files: ['**/*.mjs', '**/*.ts/*.js'], ignores: ['**/*.selfcheck.ts/**'] }),
];
