// update.selfcheck.mjs — node JewelryX-Tools/wf/update.selfcheck.mjs
import { anchorToolPaths, shouldUpdate } from './update.mjs';

let failed = 0;
const check = (name, cond) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
check('a live copy behind the pushed branch updates', shouldUpdate({ runningFromLive: true, installed: 'a', published: 'b' }));
check('a live copy at the pushed branch does not', !shouldUpdate({ runningFromLive: true, installed: 'b', published: 'b' }));
check('the workflow-v2 checkout never updates itself', !shouldUpdate({ runningFromLive: false, installed: 'a', published: 'b' }));
check('no REVISION (a hand-made copy) or no ref: leave it', !shouldUpdate({ runningFromLive: true, installed: null, published: 'b' }) && !shouldUpdate({ runningFromLive: true, installed: 'a', published: null }));
const live = 'C:\\Users\\x\\.local\\share\\jewelryx-wf';
check('a doc path points at the installed copy', anchorToolPaths('read `JewelryX-Tools/wf/process/A.md`', live) === 'read `C:/Users/x/.local/share/jewelryx-wf/JewelryX-Tools/wf/process/A.md`');
check('an already absolute path is left alone', anchorToolPaths('C:/y/JewelryX-Tools/wf/a.md', live) === 'C:/y/JewelryX-Tools/wf/a.md');
check('v1 paths are not touched', anchorToolPaths('JewelryX-Tools/Bug-Fix/x.md', live) === 'JewelryX-Tools/Bug-Fix/x.md');
console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
