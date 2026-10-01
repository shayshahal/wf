// boundary.selfcheck.mts — node boundary.selfcheck.mts → exit 0 when green.
// The kit (everything outside env/) never imports the env and never names Shay's machine: the team
// runs the kit alone, and a kit that reached into env/ or ~/.herdr would break on their machines
// without a word (kit and env plan, step 2). The env imports the kit, never the other way round.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['env', 'docs', 'node_modules', '.git']);
const kitFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
	if (e.isDirectory()) return SKIP.has(e.name) && dir === root ? [] : kitFiles(join(dir, e.name));
	return /\.m[jt]s$/.test(e.name) ? [join(dir, e.name)] : [];
});

// Pure: the env imports in a file's text (static and dynamic).
export function envImports(text) {
	return [...text.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]*\benv\/[^'"]*)['"]/g)].map((m) => m[1]);
}
// Pure: Shay's machine paths in a file's code (comment lines are not code).
const MACHINE = [/\.herdr\b/, /['"/]\.bare\b/, /LOCALAPPDATA/, /['"]\.config['"],\s*['"]wf['"]/, /~\/\.config\/wf/, /['"]work['"],\s*['"]wf['"]/, /~\/work\/wf/];
export function machinePaths(text) {
	return text.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).flatMap((l) => MACHINE.filter((re) => re.test(l)).map(() => l.trim()));
}

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

check('envImports sees static and dynamic imports of env/', envImports("import { x } from './env/a.mts';\nawait import('../../env/b.mts');\nimport { y } from './env.mts';").join() === './env/a.mts,../../env/b.mts');
check('machinePaths skips comments and sees code', machinePaths("// ~/.herdr\nconst a = join(homedir(), '.config', 'wf');").length === 1);

// This file's own test strings name env/ on purpose.
const files = kitFiles(root).filter((f) => f !== fileURLToPath(import.meta.url));
const imports = files.flatMap((f) => envImports(readFileSync(f, 'utf8')).map((i) => `${relative(root, f)}: ${i}`));
check(`no kit file imports env/ (${files.length} files)`, imports.length === 0, imports.join('; '));
const paths = files.filter((f) => !f.endsWith('.selfcheck.mts')).flatMap((f) => machinePaths(readFileSync(f, 'utf8')).map((l) => `${relative(root, f)}: ${l}`));
check('no kit file names Shay\'s machine (~/.herdr, .bare, LOCALAPPDATA, ~/.config/wf, ~/work/wf)', paths.length === 0, paths.join('; '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
