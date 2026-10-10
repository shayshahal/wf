// next.selfcheck.ts — node next.selfcheck.ts → exit 0 when green.
// Pure arms: wf next's action for the smaller route (#110-#113) — ordinary (class A), consequential
// (B/C) with T1, build, one final assessment with bounded repair, unmet-intent T2 refusal and
// material-change escalation. A real CLI arm builds a temp git repo and drives wf step/next through
// the ordinary and complex examples (the command path, not only the pure snapshot).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextAction, lastSuites, unpostedSections } from './next.ts';
import type { Snapshot } from './next.ts';
import { readState, legacyStateGap } from './state.ts';
import { WF_ROOT } from '../paths.ts';

let failures = 0;
const check = (name: string, cond: boolean, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

const AGREEMENT = `# r — agreement
Class: B
## Observed
- the header renders at the top — \`src/Page.svelte:12\`
## Agreed
- Behavior: two columns with a sidebar. Excluding: the data shown.
- Choice: extract DetailsLayout (rejected: absolute-position).
- Verification: the existing tests pass, plus the sidebar region renders.
## Verification
| # | case | files | check |
|---|---|---|---|
| 1 | layout: sidebar renders | src/Page.svelte | src/Page.spec.ts::sidebar renders@42 |
`;
const TICKET = `# r — ticket
## Intent
- "x": the modal keeps its scroll position
`;
const ASSESS = (patch: { verdict?: string; head?: string; material?: string; intent?: string } = {}) => `# r — assessment
Verdict: ${patch.verdict ?? 'clean'}
head: ${patch.head ?? 'H4'}
## Intent
${patch.intent ?? '- "x": met: src/Page.svelte:1 · before: red · after: green'}
## Agreement
${patch.material ? `material: ${patch.material}` : '(none)'}
`;

const base = (patch: Partial<Snapshot> = {}): Snapshot => ({
	branch: 'fix/r', entry: 'C:/wf/wf.mjs', step: 'classify', klass: 'A', check: false, questions: [], answered: [],
	files: { agreement: null, assessment: null, review: null, blocked: null },
	t1: { sha: null, reviewed: null, verdict: null },
	commits: [], checks: [], repro: {}, head: 'H4', suites: null, note: null, repairs: 0,
	...patch,
});
const say = (s: Snapshot) => nextAction(s).say;
const steps = (s: Snapshot) => nextAction(s).effects.filter((e) => e.step).map((e) => e.step!.join(' '));
const asks = (s: Snapshot) => nextAction(s).effects.filter((e) => e.ask).map((e) => e.ask!);
const repairs = (s: Snapshot) => nextAction(s).effects.filter((e) => e.repair).length;

// ── ordinary (class A): the ticket is the agreement, no T1, straight to build
check('class A: the ticket is the agreement → step build and dispatch build', steps(base()) .join() === 'build' && say(base()).startsWith('dispatch build'), say(base()));
check('class A build: one phase, resumed in place (no per-commit dispatch)', say(base({ step: 'build' })) === 'dispatch build: run `node C:/wf/wf.mjs brief build` in this worktree and do exactly what it prints', say(base({ step: 'build' })));
check('a blocked build waits on the user with the question', say(base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } })) === 'wait user: blocked — which label?');

// ── a check round: it writes ## Repro, then wf check --repro is the answer
check('a check round with no ## Repro: dispatch agree to write it', say(base({ check: true })).startsWith('dispatch agree') && say(base({ check: true })).includes('no `## Repro`'), say(base({ check: true })));
check('a check round with ## Repro: run wf check --repro and wait on the user', say(base({ check: true, files: { agreement: TICKET + '\n## Repro\ncommand: yarn repro\n', assessment: null, review: null, blocked: null } })).startsWith('check: run `node C:/wf/wf.mjs check --repro`'), say(base({ check: true })));

// ── consequential (B/C): one agreement, one T1
check('B/C with no agreement: dispatch agree with the gap', say(base({ klass: 'B' })).startsWith('dispatch agree') && say(base({ klass: 'B' })).includes('no AGREEMENT.md'), say(base({ klass: 'B' })));
check('B/C agreement not yet approved: wait on the user for T1 with wf agree', say(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: null, verdict: null } })) === 'wait user: T1 on AGREEMENT.md — `node C:/wf/wf.mjs agree fix/r`', say(base({ klass: 'B' })));
check('B/C T1 approved: step build and dispatch build', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build', say(base({ klass: 'B' })));
check('B/C T1 changes-requested: dispatch agree again', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'changes-requested' } })).startsWith('dispatch agree'));
check('B/C a new agreement sha (material changed): T1 again, not approved', say(base({ klass: 'B', step: 'agree', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));

// ── the assessment
check('no ASSESSMENT.md: dispatch assess', say(base({ step: 'assess' })).startsWith('dispatch assess') && say(base({ step: 'assess' })).includes('no ASSESSMENT.md'), say(base({ step: 'assess' })));
check('an assessment of an earlier HEAD is re-run', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ head: 'H3' }), review: null, blocked: null } })).includes('HEAD is H4'), say(base({ step: 'assess' })));
check('clean assessment → T2 review', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS(), review: null, blocked: null } })).startsWith('review: T2'), say(base({ step: 'assess' })));
check('an intent line without a verdict is not a clean assessment', say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ intent: '- "x": looks fine' }), review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ intent: '- "x": looks fine' }), review: null, blocked: null } })).includes('has no verdict'), say(base({ step: 'assess' })));

// repair: back to build, bounded
const repair = base({ step: 'assess', repairs: 0, files: { agreement: null, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('a repair assessment returns to build, counted', repairs(repair) === 1 && steps(repair).join() === 'build' && say(repair).includes('repair 1 of 2'), say(repair));
const spent = base({ step: 'assess', repairs: 2, files: { agreement: null, assessment: ASSESS({ verdict: 'repair' }), review: null, blocked: null } });
check('two unsuccessful repairs: one contextual escalation, not another build', repairs(spent) === 0 && steps(spent).length === 0 && asks(spent).length === 1 && asks(spent)[0].source.startsWith('ASSESSMENT.md#'), say(spent));

// blocked: unmet intent / still-reproducing symptom cannot pass to T2 silently
const blocked = base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ verdict: 'blocked', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a blocked assessment asks one fix-or-accept ruling, not T2', asks(blocked).length === 1 && asks(blocked)[0].text.startsWith('fix or accept:') && !say(blocked).startsWith('review: T2'), say(blocked));
const accepted = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an explicit accept goes to T2 with the ruling recorded', say(accepted).startsWith('review: T2'), say(accepted));
const toFix = { ...blocked, answered: [{ n: 1, to: 'user', text: 'fix or accept: x', source: asks(blocked)[0].source, answer: 'fix it', asked: 't', answered: 't' }] };
check('a fix ruling returns to build, not an endless question', steps(toFix).join() === 'build' && asks(toFix).length === 0, say(toFix));

// material change: one renewed-agreement escalation
const material = base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ material: 'the round also changes the API shape' }), review: null, blocked: null } });
check('a material change is one renewed-agreement escalation, not a repair', asks(material).length === 1 && asks(material)[0].text.includes('Renew the agreement') && repairs(material) === 0, say(material));

// ── T2 / delivery
check('an open question holds the round before anything else', say(base({ step: 'assess', questions: [{ n: 3, to: 'einat', text: 'which label?', asked: 't' }] })) === 'wait einat: q3 which label?');
check('a review dismissed without a verdict waits on the user', say(base({ step: 'review', files: { agreement: null, assessment: null, review: 'verdict: dismissed\n', blocked: null } })).startsWith('wait user: T2 was closed'), say(base({ step: 'review' })));
check('pr → deliver', say(base({ step: 'pr' })).startsWith('deliver: T2 approved'));
check('merged with no note sections left → done and reap', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1 (posted)\n' } })) === 'done: `node C:/wf/wf.mjs reap fix/r`');
check('merged with an unposted section → post it first', say(base({ step: 'merged', note: { file: 'bug-reports/r/NOTE.md', text: '## JX-1\n' } })).startsWith('post: JX-1'));

// ── the class is measured from the agreement, not assumed: a declared `Class:` line, or a case whose
// files reach a contract path, upgrades A→B so T1 cannot be skipped by how the worktree was opened
check('an A round whose agreement declares Class: B steps classify --class B before any build', steps(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).join() === 'classify --class B' && say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })).startsWith('classify:'), say(base({ klass: 'A', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null } })));
const noClass = AGREEMENT.replace('Class: B\n', '');
check('a case on a contract path upgrades A→B without a Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', files: { agreement: noClass, assessment: null, review: null, blocked: null } })));
check('R-4: a changed file on a contract path upgrades A→B with no case and no Class: line', steps(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B', say(base({ klass: 'A', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })));
check('R-4: the actual diff is measured at step build too, not only at classify/agree', steps(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: ['src/Deep.svelte'], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).join() === 'classify --class B');
check('R-4: a round-paperwork-only change is not a contract-path change (control)', say(base({ klass: 'A', step: 'build', contractPaths: 'src/**', filesChanged: [], files: { agreement: TICKET, assessment: null, review: null, blocked: null } })).startsWith('dispatch build'));
check('a B round with an approved agreement stays B (never downgrades)', steps(base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })).join() === 'build');

// ── T1 stays live after the build starts: a changed agreed material (or a recorded revision) sends the
// round back to a fresh T1, while a progress edit (same sha) does not
const liveB = (patch: Partial<Snapshot>) => base({ klass: 'B', files: { agreement: AGREEMENT, assessment: null, review: null, blocked: null }, ...patch });
check('B/C build: a changed ## Agreed sends back to T1, not build', say(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1') && steps(liveB({ step: 'build', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).join() === 'agree --waiting-on user');
check('B/C assess: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'assess', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C review: a changed ## Agreed sends back to T1 too', say(liveB({ step: 'review', t1: { sha: 's2', reviewed: 's1', verdict: 'approved' } })).startsWith('wait user: T1'));
check('B/C build: an approved agreement at the same sha builds (progress does not renew T1)', say(liveB({ step: 'build', t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } })) === 'dispatch build: run `node C:/wf/wf.mjs brief build` in this worktree and do exactly what it prints');

// ── a recorded revision (`wf decide --revise`) reaches a fresh agreement before any build, and an
// unchanged agreement cannot leave the old T1 approval in force
const revised = liveB({ step: 'agree', revisions: [{ text: 'the header must also show the count', at: 't', sha: 's1' }], t1: { sha: 's1', reviewed: 's1', verdict: 'approved' } });
check('a recorded revision dispatches a fresh agreement before build', say(revised).startsWith('dispatch agree') && say(revised).includes('asked the agreement to change'), say(revised));
check('a revision whose material sha moved is answered (no re-dispatch)', !say({ ...revised, t1: { sha: 's2', reviewed: 's2', verdict: 'approved' } }).startsWith('dispatch agree'));
check('R-3: an unchanged agreement after --revise cannot build on the old T1', say({ ...revised, step: 'build' }).startsWith('dispatch agree') && steps({ ...revised, step: 'build' }).join() === 'agree --waiting-on user', say({ ...revised, step: 'build' }));
check('R-3: an unchanged agreement after --revise also refuses at assess', say({ ...revised, step: 'assess' }).startsWith('dispatch agree'));
const revisedA = base({ step: 'agree', klass: 'A', revisions: [{ text: 'change x', at: 't', sha: null }], files: { agreement: TICKET, assessment: null, review: null, blocked: null } });
check('a revision on a class A round also dispatches a fresh agreement', say(revisedA).startsWith('dispatch agree'));

// ── an answered BLOCKED.md resumes the build once; the same answer never loops
const blockedBuild = base({ step: 'build', files: { agreement: null, assessment: null, review: null, blocked: 'Question: which label?\n' } });
check('a blocked build with no answer waits on the user', say(blockedBuild) === 'wait user: blocked — which label?');
const answeredBlocked = { ...blockedBuild, answered: [{ n: 1, to: 'user', text: 'which label?', source: 'BLOCKED.md', answer: 'cancel', asked: 't', answered: 't' }] };
check('an answered BLOCKED.md resumes the build once', say(answeredBlocked).startsWith('dispatch build') && say(answeredBlocked).includes('answered'), say(answeredBlocked));
check('the same answer does not resume a second time', say({ ...answeredBlocked, blockedAnswered: 1 }) === 'wait user: blocked — which label?');

// ── the assessment must name the HEAD it judged, and a clean verdict cannot carry an unmet item
check('an assessment with no head: line is refused', say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).startsWith('dispatch assess') && say(base({ step: 'assess', files: { agreement: null, assessment: '# r\nVerdict: clean\n## Intent\n- "x": met: a:1 · before: b · after: c\n', review: null, blocked: null } })).includes('head:'));
const cleanNotMet = base({ step: 'assess', files: { agreement: null, assessment: ASSESS({ verdict: 'clean', intent: '- "x": not met: the modal still jumps' }), review: null, blocked: null } });
check('a clean assessment that states an unmet item is refused', say(cleanNotMet).startsWith('dispatch assess') && say(cleanNotMet).includes('says clean but states an unmet item'), say(cleanNotMet));

// ── the material and repair-cap escalations are recorded, so the same question cannot repeat, and a
// material change needs an EXPLICIT accept to reach T2 (R-2): hold/end/no/looks fine/fix do not
const materialAnswered = { ...material, answered: [{ n: 1, to: 'user', text: 'the assessment found a material change', source: asks(material)[0].source, answer: 'accept: ship it', asked: 't', answered: 't' }] };
check('an explicit accept of a material change opens T2', asks(materialAnswered).length === 0 && say(materialAnswered).startsWith('review: T2'), say(materialAnswered));
for (const answer of ['hold the round until n', 'end it, drop this round', 'no', 'looks fine, carry on', 'fix: tighten the API']) {
	const ruled = { ...material, answered: [{ n: 1, to: 'user', text: 'the assessment found a material change', source: asks(material)[0].source, answer, asked: 't', answered: 't' }] };
	check(`R-2: a material answer "${answer}" does not open T2 (it returns to build)`, asks(ruled).length === 0 && !say(ruled).startsWith('review: T2') && steps(ruled).join() === 'build', say(ruled));
}
check('R-6: the fix-or-accept question names the unmet finding', asks(blocked)[0].text.includes('not met: the modal still jumps'), asks(blocked)[0].text);
const spentAnswered = { ...spent, answered: [{ n: 1, to: 'user', text: 'x', source: asks(spent)[0].source, answer: 'accept: it is a separate ticket', asked: 't', answered: 't' }] };
check('an answered repair-cap escalation does not repeat', asks(spentAnswered).length === 0 && say(spentAnswered).startsWith('review: T2'), say(spentAnswered));

// ── helpers
check('lastSuites reads the latest whole-suite line', JSON.stringify(lastSuites('{"row":"suites","ts":"t1","head":"h","result":"green"}\n')) === JSON.stringify({ ts: 't1', head: 'h', result: 'green' }));
check('unpostedSections names the sections without (posted)', unpostedSections('## A (posted)\n## B\n').join() === 'B');

// ── the version guard: an old round state is refused, not reinterpreted
check('a state with no wf_version is refused with an actionable line', (legacyStateGap({ step: 'implement' }) ?? '').includes('older wf') && (legacyStateGap({ step: 'implement' }) ?? '').includes('wf_version'));
check('a versionless state at a shared step (classify/review/pr/held/merged) is refused too', ['classify', 'review', 'pr', 'held', 'merged'].every((step) => (legacyStateGap({ step }) ?? '').includes('older wf')));
check('a versionless state with no step is refused too', (legacyStateGap({ round: 'r' }) ?? '').includes('older wf'));
check('a state at the current version is accepted', legacyStateGap({ wf_version: 2, step: 'build' }) === null);
check('no state is not a legacy round', legacyStateGap(null) === null);

// ── real CLI: an ordinary class A round reaches build through wf next; a legacy state is refused
const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });
const cli = (repo: string, ...args: string[]) => {
	try { return { out: execFileSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' }), code: 0 }; } catch (e) {
		const err = e as { stdout?: string; stderr?: string; status?: number };
		return { out: `${err.stdout ?? ''}${err.stderr ?? ''}`, code: err.status ?? 1 };
	}
};
{
	const repo = mkdtempSync(join(tmpdir(), 'wf-next-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'a\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'fix/r');
	mkdirSync(join(repo, 'bug-reports/r'), { recursive: true });
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), TICKET);
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'A' }, null, 2)}\n`);
	const next = cli(repo, 'next');
	check('CLI: an ordinary class A round steps to build and dispatches it', next.code === 0 && next.out.includes('dispatch build') && readState(repo)?.step === 'build', next.out);
	// the class is measured: a ticket declaring Class: B upgrades the round before any build
	writeFileSync(join(repo, 'bug-reports/r/TICKET.md'), `${TICKET}\nClass: B\n`);
	mkdirSync(join(repo, 'docs', 'agents'), { recursive: true });
	writeFileSync(join(repo, 'docs', 'agents', 'contract-paths.txt'), 'src/**\n');
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ wf_version: 2, round: 'r', id: 'r', folder: 'bug-reports/r', base: 'main', step: 'classify', class: 'A' }, null, 2)}\n`);
	const upgraded = cli(repo, 'next');
	check('CLI: an agreement declaring Class: B upgrades the round and takes T1', upgraded.code === 0 && readState(repo)?.class === 'B' && upgraded.out.includes('T1'), upgraded.out);
	// the version guard refuses a mutating command on a legacy state
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ round: 'r', id: 'r', folder: 'bug-reports/r', step: 'implement' }, null, 2)}\n`);
	const refused = cli(repo, 'step', 'build');
	check('CLI: a legacy state refuses a mutating command before it writes', refused.code === 1 && /older wf/.test(refused.out), refused.out);
	check('CLI: the refused legacy state was not rewritten', JSON.parse(readFileSync(join(repo, '.wf', 'state.json'), 'utf8')).step === 'implement');
	// a versionless state parked at a shared step is refused by wf next too (it mutates)
	writeFileSync(join(repo, '.wf', 'state.json'), `${JSON.stringify({ round: 'r', id: 'r', folder: 'bug-reports/r', step: 'review' }, null, 2)}\n`);
	const legacyNext = cli(repo, 'next');
	check('CLI: wf next refuses a versionless state parked at review', legacyNext.code === 1 && /older wf/.test(legacyNext.out), legacyNext.out);
	rmSync(repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
