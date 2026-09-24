// worktree.selfcheck.mjs — node worktree.selfcheck.mjs → exit 0 when green.
// Pure arms only: parsing the worktree list, resolving a name, the stack's addresses, the removal
// plan. Nothing is run, created or removed.
import { directUrls, mongoPortForBase, parseWorktreeList, removalPlan, resolveWorktree, stackNameLines, stackNames } from './worktree.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
  console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const porcelain = 'worktree C:/r/.bare\r\nbare\r\n\r\nworktree C:/wt/dev\r\nHEAD abc\r\nbranch refs/heads/dev\r\n\r\nworktree C:/wt/qa\r\nHEAD def\r\ndetached\r\n\r\nworktree C:/wt/fix-bjew-1\r\nHEAD 123\r\nbranch refs/heads/fix/bjew-1\r\n';
const trees = parseWorktreeList(porcelain);
check('the list parses CRLF porcelain: bare, branch, detached', JSON.stringify(trees) === JSON.stringify([
  { path: 'C:/r/.bare', branch: null, detached: false },
  { path: 'C:/wt/dev', branch: 'dev', detached: false },
  { path: 'C:/wt/qa', branch: null, detached: true },
  { path: 'C:/wt/fix-bjew-1', branch: 'fix/bjew-1', detached: false },
]), JSON.stringify(trees));
check('resolve by branch', resolveWorktree('fix/bjew-1', trees).path === 'C:/wt/fix-bjew-1');
check('resolve by folder name', resolveWorktree('qa', trees).path === 'C:/wt/qa');
check('resolve by absolute path, either slash', resolveWorktree('C:\\wt\\dev\\', trees).branch === 'dev');
let err = '';
try { resolveWorktree('nope', trees); } catch (e) { err = e.message; }
check('an unknown name throws with the candidates', err.startsWith('no worktree for "nope"') && err.includes('fix/bjew-1  C:/wt/fix-bjew-1'), err);

check('mongo sits at 40000+(P-10000)', mongoPortForBase(12345) === 42345);
let range = '';
try { mongoPortForBase(9999); } catch (e) { range = e.message; }
check('a base port outside 10000-19999 throws', range.includes('out of range'), range);
check('names carry the full slug', stackNames('tools-workflow-v2').b2b === 'http://tools-workflow-v2.b2b.jewelryx.localhost');
const direct = directUrls(12345);
check('direct: B2B on P, admin P+20000, API on 127.0.0.1 at P+10000', direct.b2b === 'http://localhost:12345' && direct.admin === 'http://localhost:32345' && direct.api === 'http://127.0.0.1:22345/api/v1', JSON.stringify(direct));
check('the header lines name all three apps', stackNameLines(stackNames('s')).split('\n').length === 3);

const plan = removalPlan({ branch: 'fix/bjew-1', path: 'C:\\wt\\fix-bjew-1', slug: 'fix-bjew-1', pid: 4242 });
const sweep = Buffer.from(plan[0].args[2], 'base64').toString('utf16le');
check('eight steps in teardown order', plan.map((s) => s.label).join(' → ') === 'kill stragglers → wt remove → rm -rf worktree → git worktree prune → docker rm mongo → docker volume rm → docker network rm → portless prune', plan.map((s) => s.label).join(' → '));
check('wt remove keeps the branch and runs in the foreground', plan[1].args.join(' ') === 'remove fix/bjew-1 --no-delete-branch --force --foreground -y', plan[1].args.join(' '));
check('the straggler sweep matches both path spellings and spares this process', sweep.includes('C:\\wt\\fix-bjew-1') && sweep.includes('-ne 4242'), sweep);
check('the sweep only targets node and python', sweep.includes("Name='node.exe' or Name='python.exe'"));
check('rm is in-process, not a command', plan[2].rm === 'C:\\wt\\fix-bjew-1' && !plan[2].cmd);
check('docker names come from the slug', plan[4].args.at(-1) === 'jewelryx-mongo-fix-bjew-1' && plan[5].args.at(-1) === 'jewelryx-wt-mongo-fix-bjew-1');
check('the compose network is removed by its slug name', plan[6].args.join(' ') === 'network rm jewelryx-wt-fix-bjew-1_default', plan[6].args.join(' '));
check('portless prune runs with CI=1', plan[7].env.CI === '1' && plan[7].args.join(' ') === 'prune');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
