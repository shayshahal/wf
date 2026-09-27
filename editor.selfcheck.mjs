// editor.selfcheck.mjs — node editor.selfcheck.mjs → exit 0 when green.
// Pure arm: how the editor fallback is started (editor.mjs editorCommand). Nothing is started.
import { editorCommand } from './editor.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const [wcmd, wargs, wshell] = editorCommand('code --new-window', ['C:/w t', 'C:/w t/REVIEW.md'], 'win32');
check('Windows: one line through the shell, so code.cmd starts', wshell === true && wargs.length === 0 && wcmd === 'code --new-window "C:/w t" "C:/w t/REVIEW.md"', wcmd);
const [cmd, args, shell] = editorCommand('code -w', ['/w t/REVIEW.md'], 'darwin');
check('elsewhere: the binary and its arguments, no shell', cmd === 'code' && args.join('|') === '-w|/w t/REVIEW.md' && shell === false, JSON.stringify(args));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
