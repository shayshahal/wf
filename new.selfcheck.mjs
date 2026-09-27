// new.selfcheck.mjs — node new.selfcheck.mjs → exit 0 when green.
// Pure arms: the fetch before a round branches, and the worktree's .claude/launch.json for Claude
// Code Desktop's Browser pane (new.mjs).
import { decisionsOf, earlierText, fetchFor, launchConfig } from './new.mjs';
import { entryGap } from './state.mjs';

let failures = 0;
const check = (name, cond, detail = '') =>
	console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) || (cond || failures++);

const config = JSON.parse(launchConfig({ b2b: 'http://localhost:12345', admin: 'http://localhost:32345', api: 'http://127.0.0.1:22345/api/v1' }));
check('one entry per app, in the stack\'s order', config.configurations.map((c) => c.name).join() === 'b2b,admin,api');
check('attach mode: a url and no command', config.configurations.every((c) => c.url && !c.runtimeExecutable && !c.program));
check('a bare origin: Desktop refuses a localhost url with a path', config.configurations[2].url === 'http://127.0.0.1:22345', config.configurations[2].url);
check('the version Desktop writes', config.version === '0.0.1');
check('a remote base is fetched first, that branch only', fetchFor('origin/dev')?.join(' ') === 'fetch --quiet origin dev' && fetchFor('origin/release/2.1')?.at(-1) === 'release/2.1');
check('a local ref or a sha is taken as it is', fetchFor('dev') === null && fetchFor('328e238fb') === null);

const plan = '# p\r\n## Asks\r\n- x? \u2014 default: y\r\n\r\n## Decisions\r\n- 2026-09-23 Calendar popover width: at least the input\'s width \u2014 Shay 2026-09-23\r\n- 2026-09-23 A held time is raised, not cleared\r\n\r\n## Other\r\n- not a decision\r\n';
check('an earlier plan\'s Decisions, verbatim, and nothing after them', decisionsOf(plan).length === 2 && decisionsOf(plan)[1] === '- 2026-09-23 A held time is raised, not cleared', JSON.stringify(decisionsOf(plan)));
check('no Decisions, or no plan: none', decisionsOf('# p\n').length === 0 && decisionsOf(null).length === 0);
const earlier = earlierText({ ids: ['TJEW-682'], dupes: ['bug-reports/fix-tjew682-a', 'commit 2228a7c Merge fix/tjew682-a'], rulings: [{ folder: 'bug-reports/fix-tjew682-a', lines: decisionsOf(plan) }, { folder: 'bug-reports/fix-tjew682-b', lines: [] }] });
check('EARLIER.md: the earlier work, then each round\'s rulings under its folder', earlier.includes('- commit 2228a7c') && earlier.includes('## Earlier rulings') && earlier.includes('bug-reports/fix-tjew682-a:\n- 2026-09-23 Calendar') && !earlier.includes('fix-tjew682-b:'), earlier);
check('no rulings: no section', !earlierText({ ids: ['X-1'], dupes: ['commit abc x-1'], rulings: [] }).includes('Earlier rulings'));

// ── which wf may run in a round (state.mjs entryGap; new.mjs records made_by and entry)
const kitRound = { made_by: 'kit', entry: 'C:/Users/x/.claude/plugins/cache/wf/wf/0.1.0/wf.mjs' };
check("the env's wf is refused in a kit round, naming the kit's", entryGap(kitRound, 'env')?.includes('node "C:/Users/x/.claude/plugins/cache/wf/wf/0.1.0/wf.mjs"') && entryGap(kitRound, 'env').includes('CLAUDE_PLUGIN_ROOT'), entryGap(kitRound, 'env'));
check("the kit's wf is refused in an env round", entryGap({ made_by: 'env', entry: 'C:/h/.local/share/wf/env/wf.mjs' }, 'kit')?.startsWith('this round was made by the env'));
check('the same wf, a round from before the field, or no round: allowed', entryGap(kitRound, 'kit') === null && entryGap({ id: 'x' }, 'env') === null && entryGap(null, 'kit') === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
