// anchor.selfcheck.ts — node anchor.selfcheck.ts
import { anchorToolPaths } from './anchor.ts';

let failed = 0;
const check = (name: string, cond: unknown) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
const live = 'C:\\Users\\x\\.local\\share\\wf';
check('a doc path points at the installed copy', anchorToolPaths('read `{{wf}}/process/A.md`', live) === 'read `C:/Users/x/.local/share/wf/process/A.md`');
check('{{project}} is the project\'s folder in the installed copy', anchorToolPaths('`{{project}}/ROUND.md`', live, 'p') === '`C:/Users/x/.local/share/wf/projects/p/ROUND.md`');
check('an absolute path is left alone', anchorToolPaths('C:/y/process/a.md', live) === 'C:/y/process/a.md');
check('project paths are not touched', anchorToolPaths('JewelryX-Tools/Bug-Fix/x.md and packages/a.ts', live) === 'JewelryX-Tools/Bug-Fix/x.md and packages/a.ts');
console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
