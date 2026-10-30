// A fresh process observes the neutral consumer's actual runtime dependency graph, not just direct imports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const entry = new URL('./baseline-diagnostic.ts', import.meta.url).href;
const source = `import {registerHooks} from 'node:module';
const files=[];
registerHooks({resolve(specifier, context, next){const result=next(specifier,context); files.push(result.url); return result;}});
await import(${JSON.stringify(entry)});
console.log(JSON.stringify(files));`;
const imports: unknown = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', stdio: 'pipe' }));
assert.ok(Array.isArray(imports) && imports.every((path): path is string => typeof path === 'string'));
assert.ok(imports.some((path) => path.endsWith('/workspace-cleanup.ts')));
assert.ok(!imports.some((path) => path.includes('/projects/') || path.endsWith('/src/project.ts') || path.includes('/env/')), imports.join('\n'));
console.log('fresh-process neutral diagnostic imports no project implementation, static project selection or machine env modules');
