// update.selfcheck.mjs — node JewelryX-Tools/wf/update.selfcheck.mjs
import { shouldUpdate } from './update.mjs';

let failed = 0;
const check = (name, cond) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
check('a live copy behind the pushed branch updates', shouldUpdate({ runningFromLive: true, installed: 'a', published: 'b' }));
check('a live copy at the pushed branch does not', !shouldUpdate({ runningFromLive: true, installed: 'b', published: 'b' }));
check('the workflow-v2 checkout never updates itself', !shouldUpdate({ runningFromLive: false, installed: 'a', published: 'b' }));
check('no REVISION (a hand-made copy) or no ref: leave it', !shouldUpdate({ runningFromLive: true, installed: null, published: 'b' }) && !shouldUpdate({ runningFromLive: true, installed: 'a', published: null }));
console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
