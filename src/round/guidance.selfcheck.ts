// guidance.selfcheck.ts — node guidance.selfcheck.ts → exit 0 when green.
// Pure arms: a note's globs read from its frontmatter, the notes a row's files match, and the brief
// section they make (guidance.ts). Nothing is read from disk.
import { guidanceSection, notesFor, parseNote } from './guidance.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── a note
const backend = parseNote('docs/agents/backend.md', "---\r\nglobs:\r\n  - 'packages/backend/**/*.py'\r\n  - \"packages/backend/alembic/**\"\r\ntitle: Backend\r\n---\r\n\r\nRaise `AppError(code)`, never a bare HTTPException.\r\n");
check('list form, CRLF, quotes dropped, the list ends at the next key', JSON.stringify(backend?.globs) === '["packages/backend/**/*.py","packages/backend/alembic/**"]', JSON.stringify(backend?.globs));
check('the body is the text after the frontmatter', backend?.body === 'Raise `AppError(code)`, never a bare HTTPException.', JSON.stringify(backend?.body));
check('flow form and a single glob', JSON.stringify(parseNote('n.md', "---\nglobs: ['**/*.svelte', '**/*.remote.ts']\n---\nx")?.globs) === '["**/*.svelte","**/*.remote.ts"]' && JSON.stringify(parseNote('n.md', '---\nglobs: **/*.svelte\n---\nx')?.globs) === '["**/*.svelte"]');
check('no globs, or no frontmatter: not a note for a brief', parseNote('seed.md', '---\nname: seed\n---\nx') === null && parseNote('layout.md', '# Layout\n') === null && parseNote('e.md', '---\nglobs:\n---\nx') === null);

// ── which notes a row's files match
const svelte = parseNote('docs/agents/frontend.md', '---\nglobs:\n  - "packages/frontend/**/*.svelte"\n---\nUse the design tokens.')!;
const picked = notesFor([svelte, backend!], ['packages/backend/app/api/orders.py', 'packages/backend/tests/test_orders.py']);
check('a row in the backend gets the backend note only, with the files it matched', picked.length === 1 && picked[0].path === 'docs/agents/backend.md' && picked[0].files.length === 2, JSON.stringify(picked.map((n) => n.path)));
check('a row matching both gets both, in path order', notesFor([svelte, backend!], ['packages/frontend/src/A.svelte', 'packages/backend/x.py']).map((n) => n.path).join() === 'docs/agents/backend.md,docs/agents/frontend.md');
check('Windows separators and ./ in a row\'s files still match', notesFor([backend!], ['.\\packages\\backend\\app\\x.py']).length === 1);
check('a row touching none of them gets none', notesFor([svelte, backend!], ['README.md']).length === 0 && guidanceSection([]) === '');

// ── the brief's section
const section = guidanceSection(picked);
check('the section names each note and its files, then its text as it is', section.includes('## This project\'s notes for these files') && section.includes('### `docs/agents/backend.md` (for `packages/backend/app/api/orders.py`, `packages/backend/tests/test_orders.py`)') && section.includes('Raise `AppError(code)`'), section);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
