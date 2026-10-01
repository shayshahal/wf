// env/update.selfcheck.mts — node env/update.selfcheck.mts (the path anchoring it installs: ../anchor.selfcheck.mts)
import { shouldUpdate } from './update.mts';

let failed = 0;
const check = (name: string, cond: unknown) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };
check('a live copy behind the pushed branch updates', shouldUpdate({ runningFromLive: true, installed: 'a', published: 'b' }));
check('a live copy at the pushed branch does not', !shouldUpdate({ runningFromLive: true, installed: 'b', published: 'b' }));
check('the workflow-v2 checkout never updates itself', !shouldUpdate({ runningFromLive: false, installed: 'a', published: 'b' }));
check('no REVISION (a hand-made copy) or no ref: leave it', !shouldUpdate({ runningFromLive: true, installed: null, published: 'b' }) && !shouldUpdate({ runningFromLive: true, installed: 'a', published: null }));
console.log(failed ? `\n${failed} FAILED` : '\nall arms green');
process.exit(failed ? 1 : 0);
