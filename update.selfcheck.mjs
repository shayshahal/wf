// update.selfcheck.mjs — node update.selfcheck.mjs
import { anchorToolPaths, shouldUpdate } from './update.mjs';

let failed = 0;
const check = (name, cond) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
check('a live copy behind the pushed branch updates', shouldUpdate({ runningFromLive: true, installed: 'a', published: 'b' }));
check('a live copy at the pushed branch does not', !shouldUpdate({ runningFromLive: true, installed: 'b', published: 'b' }));
check('the workflow-v2 checkout never updates itself', !shouldUpdate({ runningFromLive: false, installed: 'a', published: 'b' }));
check('no REVISION (a hand-made copy) or no ref: leave it', !shouldUpdate({ runningFromLive: true, installed: null, published: 'b' }) && !shouldUpdate({ runningFromLive: true, installed: 'a', published: null }));
const live = 'C:\\Users\\x\\.local\\share\\jewelryx-wf';
check('a doc path points at the installed copy', anchorToolPaths('read `{{wf}}/process/A.md`', live) === 'read `C:/Users/x/.local/share/jewelryx-wf/process/A.md`');
check('an absolute path is left alone', anchorToolPaths('C:/y/process/a.md', live) === 'C:/y/process/a.md');
check('project paths are not touched', anchorToolPaths('JewelryX-Tools/Bug-Fix/x.md and packages/a.ts', live) === 'JewelryX-Tools/Bug-Fix/x.md and packages/a.ts');
console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
