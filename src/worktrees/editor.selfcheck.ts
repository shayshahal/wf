// editor.selfcheck.ts — node editor.selfcheck.ts → exit 0 when green.
// Pure arm: how the editor fallback is started (editor.ts editorCommand). Nothing is started.
import { editorCommand, opensWindows } from './editor.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

check('any harness can retain UI ownership without identifying as Claude Code', !opensWindows({ WF_NO_OPEN: '1' }));
check('the existing Claude Code UI default is preserved', !opensWindows({ CLAUDECODE: '1' }));
check('T3 Code owns the panes it starts, so wf pops no window beside them', !opensWindows({ T3CODE_PROJECT_ROOT: 'C:/w' }));
check('a path prefix that only looks like T3 opens windows as usual', opensWindows({ T3CODE_PROJECT_ROOT_SUFFIX: 'C:/w' }));
check('plain interactive use may still open its external UI', opensWindows({}));

const [wcmd, wargs, wshell] = editorCommand('code --new-window', ['C:/w t', 'C:/w t/REVIEW.md'], 'win32');
check('Windows: one line through the shell, so code.cmd starts', wshell === true && wargs.length === 0 && wcmd === 'code --new-window "C:/w t" "C:/w t/REVIEW.md"', wcmd);
const [cmd, args, shell] = editorCommand('code -w', ['/w t/REVIEW.md'], 'darwin');
check('elsewhere: the binary and its arguments, no shell', cmd === 'code' && args.join('|') === '-w|/w t/REVIEW.md' && shell === false, JSON.stringify(args));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
