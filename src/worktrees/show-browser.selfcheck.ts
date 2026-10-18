// show-browser.selfcheck.ts — node show-browser.selfcheck.ts → exit 0 when green.
// The browser `wf show` opens belongs to the round (#180): recorded from the pid the CLI reports,
// released by identity before the worktree goes, and never a browser wf did not start. The process
// inventory is injected, so the arms are deterministic and no real browser is opened here.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plug, seams } from '../seams.ts';
import type { ProcessIdentity, ProcessSnapshot } from '../process-tree.ts';
import { browserPidFromOutput, parseShowOwner, recordShowBrowser, showOwnerPath, SHOW_OWNER_FILE, stopShowBrowser } from './show-browser.ts';

let failures = 0;
const check = (name: string, condition: unknown, detail = '') => {
	console.log(condition ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
	if (!condition) failures++;
};

// ── pure: the pid line playwright-cli prints (measured 2026-10-18, @playwright/cli 0.1.21)
check('the browser pid comes from the CLI\'s own open line', browserPidFromOutput('### Browser `show` opened with pid 24324.\n### Ran Playwright code\n') === 24324);
check('it reads through CRLF and finds the line below other output', browserPidFromOutput('noise\r\n### Browser `show` opened with pid 7.\r\n') === 7);
check('another session name is as good as "show"', browserPidFromOutput('### Browser `default` opened with pid 12.') === 12);
check('output without the line reports no pid rather than guessing', browserPidFromOutput('### Ran Playwright code\n') === null && browserPidFromOutput('') === null && browserPidFromOutput(null) === null);
check('a pid of 0 or a huge number is refused', browserPidFromOutput('### Browser `show` opened with pid 0.') === null && browserPidFromOutput('### Browser `show` opened with pid 99999999999999999999.') === null);

const good = { token: 't', state: 'running', processes: [{ pid: 5, parent: 1, born: '2026-10-18T10:00:00.000Z' }] };
check('a well-formed record parses', parseShowOwner(good)?.processes.length === 1);
check('a malformed record authorizes nothing', parseShowOwner({ ...good, token: '' }) === null && parseShowOwner({ ...good, processes: [] }) === null && parseShowOwner({ ...good, state: 'stopped' }) === null && parseShowOwner({ token: 't', state: 'running', processes: [{ pid: 5, parent: 1, born: 'nope' }] }) === null && parseShowOwner(null) === null);

// ── an injected process table: the arms never touch a real browser
type Table = Map<number, ProcessIdentity>;
const owner = (pid: number, parent: number, born: string): ProcessIdentity => ({ pid, parent, born });
function fakeTable(initial: ProcessIdentity[]) {
	const table: Table = new Map(initial.map((p) => [p.pid, p]));
	const killed: number[] = [];
	const processes = {
		snapshot: (): ProcessSnapshot => ({ kind: 'known', processes: [...table.values()] }),
		kill: (owners: readonly ProcessIdentity[]) => {
			if (owners.some((o) => o.pid === process.pid)) return false;
			if (owners.some((o) => table.get(o.pid)?.born !== o.born)) return false;
			for (const o of owners) { table.delete(o.pid); killed.push(o.pid); }
			return true;
		},
	};
	return { processes, table, killed };
}
const worktree = mkdtempSync(join(tmpdir(), 'wf-show-browser-'));
mkdirSync(join(worktree, '.wf'), { recursive: true });
const read = () => JSON.parse(readFileSync(showOwnerPath(worktree), 'utf8')) as { processes: ProcessIdentity[]; state: string };

// The CLI's browser (24324) with its browser child and a renderer, plus a stranger wf never started.
const browser = owner(24324, 1, '2026-10-18T10:00:00.000Z');
const browserChild = owner(24325, 24324, '2026-10-18T10:00:01.000Z');
const renderer = owner(24326, 24325, '2026-10-18T10:00:02.000Z');
const stranger = owner(999, 1, '2026-10-18T09:00:00.000Z');
const fixture = fakeTable([browser, browserChild, renderer, stranger]);
const realProcesses = seams.processes;
plug({ processes: fixture.processes });

check('a record is written from the pid the CLI reported, expanded to its descendants', recordShowBrowser(worktree, [24324]) === 3 && read().processes.length === 3 && read().state === 'running');
check('a pid that is not alive records nothing', recordShowBrowser(worktree, [4242]) === 3 && read().processes.length === 3);
check('a second show merges into the same record instead of replacing it', recordShowBrowser(worktree, [24324]) === 3);
const second = fakeTable([browser, browserChild, renderer, stranger, owner(555, 1, '2026-10-18T10:05:00.000Z')]);
plug({ processes: second.processes });
check('a second browser in the same round is added to the record', recordShowBrowser(worktree, [555]) === 4 && read().processes.some((p) => p.pid === 555));

const stopped = await stopShowBrowser(worktree);
check('release stops the recorded tree, and confirms it is gone before deleting the record', stopped.kind === 'stopped' && stopped.stopped === 4 && !existsSync(showOwnerPath(worktree)), JSON.stringify(stopped));
check('every recorded identity was killed, including the descendants that hold the folder', [24324, 24325, 24326, 555].every((pid) => fixture.killed.includes(pid) || second.killed.includes(pid)));
check('a browser wf did not start is never killed', !fixture.killed.includes(999) && !second.killed.includes(999) && second.table.has(999));

// ── a reused PID: the record cannot authorize killing its successor
writeFileSync(showOwnerPath(worktree), JSON.stringify({ token: 't', state: 'running', processes: [browser] }));
const reused = fakeTable([owner(24324, 1, '2026-10-18T11:00:00.000Z')]);
plug({ processes: reused.processes });
const reuseResult = await stopShowBrowser(worktree);
check('a recorded pid now owned by another process is pruned, not killed', reuseResult.kind === 'stopped' && reuseResult.stopped === 0 && reused.killed.length === 0 && reused.table.has(24324));
check('its record is retired once nothing of ours remains', !existsSync(showOwnerPath(worktree)));

// ── refusals keep the record, so reap keeps its journal instead of deleting a held folder
writeFileSync(showOwnerPath(worktree), JSON.stringify({ token: 't', state: 'running', processes: [browser] }));
plug({ processes: { snapshot: () => ({ kind: 'unknown' }), kill: () => false } });
const unknown = await stopShowBrowser(worktree);
check('an unavailable process inventory refuses and retains the record', unknown.kind === 'refused' && existsSync(showOwnerPath(worktree)), JSON.stringify(unknown));
writeFileSync(showOwnerPath(worktree), '{ not json');
plug({ processes: fixture.processes });
const malformed = await stopShowBrowser(worktree);
check('a malformed record refuses rather than killing by guess', malformed.kind === 'refused' && readFileSync(showOwnerPath(worktree), 'utf8') === '{ not json', JSON.stringify(malformed));
rmSync(showOwnerPath(worktree), { force: true });
check('no record is not a failure', (await stopShowBrowser(worktree)).kind === 'absent');

// ── a browser that will not die: release refuses and keeps the record for the retry
writeFileSync(showOwnerPath(worktree), JSON.stringify({ token: 't', state: 'running', processes: [browser] }));
plug({ processes: { snapshot: () => ({ kind: 'known', processes: [browser] }), kill: () => true } });
const stubborn = await stopShowBrowser(worktree, { timeoutMs: 50, pollMs: 10 });
check('a browser that outlives the deadline refuses, with its record retained', stubborn.kind === 'refused' && existsSync(showOwnerPath(worktree)) && (stubborn.why ?? '').includes('still hold'));
plug({ processes: realProcesses });
rmSync(worktree, { recursive: true, force: true });
check('the record lives in .wf/ beside the other round metadata', SHOW_OWNER_FILE === 'show-owner.json' && showOwnerPath('W').endsWith(join('.wf', 'show-owner.json')));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
