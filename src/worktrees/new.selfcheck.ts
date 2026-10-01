// new.selfcheck.ts — node new.selfcheck.ts → exit 0 when green.
// Pure arms: the fetch before a round branches, and the worktree's .claude/launch.json for Claude
// Code Desktop's Browser pane (new.ts).
import { cloneLaunch, decisionsOf, earlierText, fetchFor, launchConfig, namesId } from './new.ts';
import { entryGap } from '../round/state.ts';

type Launch = { version: string; configurations: { name: string; url: string; runtimeExecutable?: string; program?: string }[] };

let failures = 0;
const check = (name: string, cond: unknown, detail: string | null = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const config: Launch = JSON.parse(launchConfig({ b2b: 'http://localhost:12345', admin: 'http://localhost:32345', api: 'http://127.0.0.1:22345/api/v1' }));
check('one entry per app, in the stack\'s order', config.configurations.map((c) => c.name).join() === 'b2b,admin,api');
check('attach mode: a url and no command', config.configurations.every((c) => c.url && !c.runtimeExecutable && !c.program));
check('a bare origin: Desktop refuses a localhost url with a path', config.configurations[2].url === 'http://127.0.0.1:22345', config.configurations[2].url);
check('the version Desktop writes', config.version === '0.0.1');

// The clone's launch.json: where Desktop reads it (TJEW-670's T2, 2026-09-28).
const rounds = { b2b: 'http://localhost:12345', admin: 'http://localhost:32345', api: 'http://127.0.0.1:22345/api/v1' };
const mine = JSON.stringify({ version: '0.0.1', configurations: [{ name: 'my dev server', runtimeExecutable: 'pnpm', runtimeArgs: ['dev'], port: 5173 }] });
const added: Launch = JSON.parse(cloneLaunch(mine, 'fix-a', rounds)!);
check('the clone gets the round\'s apps as "<slug> <app>", origins only, and keeps its own entries', added.configurations.map((c) => c.name).join() === 'my dev server,fix-a b2b,fix-a admin,fix-a api' && added.configurations[3].url === 'http://127.0.0.1:22345', JSON.stringify(added));
const twice: Launch = JSON.parse(cloneLaunch(JSON.stringify(added), 'fix-a', rounds)!);
check('writing it again does not duplicate', twice.configurations.length === 4);
const other: Launch = JSON.parse(cloneLaunch(JSON.stringify(added), 'fix-b', rounds)!);
const reaped: Launch = JSON.parse(cloneLaunch(JSON.stringify(other), 'fix-a', null)!);
check('reap takes out only its own round\'s entries', reaped.configurations.map((c) => c.name).join() === 'my dev server,fix-b b2b,fix-b admin,fix-b api', JSON.stringify(reaped.configurations.map((c) => c.name)));
check('no file yet: a new one; a file that is not JSON: left alone', JSON.parse(cloneLaunch('', 'fix-a', rounds)!).configurations.length === 3 && cloneLaunch('{ nope', 'fix-a', rounds) === null);
check('a remote base is fetched first, that branch only', fetchFor('origin/dev')?.join(' ') === 'fetch --quiet origin dev' && fetchFor('origin/release/2.1')?.at(-1) === 'release/2.1');
check('a local ref or a sha is taken as it is', fetchFor('dev') === null && fetchFor('328e238fb') === null);

const plan = '# p\r\n## Asks\r\n- x? \u2014 default: y\r\n\r\n## Decisions\r\n- 2026-09-23 Calendar popover width: at least the input\'s width \u2014 Shay 2026-09-23\r\n- 2026-09-23 A held time is raised, not cleared\r\n\r\n## Other\r\n- not a decision\r\n';
check('an earlier plan\'s Decisions, verbatim, and nothing after them', decisionsOf(plan).length === 2 && decisionsOf(plan)[1] === '- 2026-09-23 A held time is raised, not cleared', JSON.stringify(decisionsOf(plan)));
check('no Decisions, or no plan: none', decisionsOf('# p\n').length === 0 && decisionsOf(null).length === 0);
const earlier = earlierText({ ids: ['TJEW-682'], dupes: ['bug-reports/fix-tjew682-a', 'commit 2228a7c Merge fix/tjew682-a'], rulings: [{ folder: 'bug-reports/fix-tjew682-a', lines: decisionsOf(plan) }, { folder: 'bug-reports/fix-tjew682-b', lines: [] }] });
check('EARLIER.md: the earlier work, then each round\'s rulings under its folder', earlier.includes('- commit 2228a7c') && earlier.includes('## Earlier rulings') && earlier.includes('bug-reports/fix-tjew682-a:\n- 2026-09-23 Calendar') && !earlier.includes('fix-tjew682-b:'), earlier);
check('an id matches its folder and subject however they punctuate it', namesId('fix-tjew682-auction-pickers', 'TJEW-682') && namesId('TJEW-661-remove-supplier-sort', 'TJEW661') && namesId('BJEW-461 - cancel', 'bjew-461') && namesId('Merge pull request #9 from x/fix/bjew461-cancel', 'BJEW-461'));
check('a subitem id: its own round, not its siblings\'', namesId('feat-tjew670-1-back-button', 'TJEW-670.1') && !namesId('feat-tjew670-10-x', 'TJEW-670.1') && !namesId('feat-tjew670-11-x', 'TJEW-670.1') && !namesId('feat-tjew670-2-texts', 'TJEW-670.1'));
check('a number never continues into another digit', !namesId('fix-bjew461-cancel', 'BJEW-46') && !namesId('fix-bjew1461', 'BJEW-461') && namesId('fix-bjew461-2fa', 'BJEW-461'));
check('no rulings: no section', !earlierText({ ids: ['X-1'], dupes: ['commit abc x-1'], rulings: [] }).includes('Earlier rulings'));

// ── which wf may run in a round (state.ts entryGap; new.ts records made_by and entry)
const kitRound = { made_by: 'kit', entry: 'C:/Users/x/.claude/plugins/cache/wf/wf/0.1.0/wf.mjs' };
check("the env's wf is refused in a kit round, naming the kit's", entryGap(kitRound, 'env')?.includes('node "C:/Users/x/.claude/plugins/cache/wf/wf/0.1.0/wf.mjs"') && entryGap(kitRound, 'env')!.includes('CLAUDE_PLUGIN_ROOT'), entryGap(kitRound, 'env'));
check("the kit's wf is refused in an env round", entryGap({ made_by: 'env', entry: 'C:/h/.local/share/wf/env/wf.mjs' }, 'kit')?.startsWith('this round was made by the env'));
check('the same wf, a round from before the field, or no round: allowed', entryGap(kitRound, 'kit') === null && entryGap({ id: 'x' }, 'env') === null && entryGap(null, 'kit') === null);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
