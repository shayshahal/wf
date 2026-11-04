// no-stash-brief.selfcheck.ts — node src/round/no-stash-brief.selfcheck.ts → exit 0 when green.
// 2026-11-04: two parallel rounds swapped work through `git stash` (one stack in the common git dir);
// two stashes were lost. Every phase brief must carry the rule: the shared context, and each
// template must include that context.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}`); if (!cond) failures++; };
const read = (name: string) => readFileSync(join(WF_ROOT, 'prompts', name), 'utf8').replace(/\s+/g, ' ');

const context = read('phase-context.md.in');
for (const s of ['Do not use `git stash` in a round', 'All worktrees share one stash stack', 'git reset --soft HEAD~1', 'git worktree add', 'git show <base>:<path> > <tmp>']) {
	check(`phase-context carries "${s}"`, context.includes(s));
}
for (const t of ['agree.md.in', 'agree-a.md.in', 'build.md.in', 'assess.md.in']) check(`${t} includes the shared context`, read(t).includes('{{context}}'));

process.exit(failures ? 1 : 0);
