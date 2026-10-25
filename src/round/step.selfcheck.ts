// step.selfcheck.ts — node step.selfcheck.ts → exit 0 when green.
// #138: JX-1068 (2026-10-13) captured `control-jewelryx screenshot` timestamps into proof/, and a
// class A build handed off clean; wf post attaches only before-/after- names, so the round posted
// text with no pictures. The naming policy is the project's (project.ts proofNamingGap, built on
// core's review-format.ts pairing rule); step.ts's handoff check refuses the capture at the
// build-to-assess and pre-review handoffs, while the worker is still here to rename it. The real CLI
// arms below prove the refusal, the rename and the untouched state.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WF_ROOT } from '../paths.ts';
import { worktreeContentSha } from '../gates/content-identity.ts';
import { proofNamingGap } from '../project.ts';
import { readState } from './state.ts';

let failures = 0;
const check = (name: string, cond: unknown, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// Pure: the project's naming policy, which core's review-format.ts pairing rule backs.
check('an empty proof/ has nothing to refuse', proofNamingGap([]) === null);
check('only pictures count: markdown, a trace and the call stack are not captures', proofNamingGap(['CALL-STACK-AS-BUILT.md', 'trace.zip', 'notes.md']) === null);
check('named pairs and named single sides are accepted', proofNamingGap(['before-1.png', 'after-1.png', 'after-he-1280-assess.jpg', 'before-he.webp']) === null);
const gap = proofNamingGap(['2026-10-13T11-06-50-433Z-jx1068-length-34-80.png', 'after-1.png']);
check('a timestamp capture is refused, and the line names it and the rename', gap?.includes('proof/2026-10-13T11-06-50-433Z-jx1068-length-34-80.png') === true && gap?.includes('after-<label>.png') === true, String(gap));
check('a near-miss picture is refused too', (proofNamingGap(['afterwards-1.png']) ?? '').includes('afterwards-1.png'));
check('a non-picture never hides a picture that is unnamed', (proofNamingGap(['listing.png', 'notes.md']) ?? '').includes('listing.png'));

const git = (repo: string, ...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const cli = (repo: string, ...args: string[]) => {
	const run = spawnSync(process.execPath, [join(WF_ROOT, 'wf.mjs'), ...args], { cwd: repo, encoding: 'utf8' });
	return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() };
};
// A class A round at `step build` with a green `wf check` of its bytes: proof/ starts absent, so a
// caller adds exactly the captures it wants the handoff to judge.
function newRepo() {
	const repo = mkdtempSync(join(tmpdir(), 'wf-proof-handoff-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'core.autocrlf', 'false');
	writeFileSync(join(repo, 'a.txt'), 'fixed code\n');
	writeFileSync(join(repo, '.gitignore'), '.wf/\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'fixed');
	git(repo, 'checkout', '-qb', 'fix/r');
	const folder = 'bug-reports/r';
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'), { recursive: true });
	writeFileSync(join(repo, folder, 'TICKET.md'), '# r\n## Intent\n- "x": y\n\n## Notes\n- **T2 walk.** none — this fixture has no live application\n');
	writeFileSync(join(repo, '.wf/state.json'), JSON.stringify({ wf_version: 3, folder, round: 'r', id: 'r', base: 'main', class: 'A', step: 'build' }));
	appendFileSync(join(repo, '.wf/checks.log'), `${JSON.stringify({ result: 'green', content: worktreeContentSha(repo, folder, null, 'row') })}\n`);
	return { repo, proof: join(repo, folder, 'proof') };
}

const timestamp = '2026-10-13T11-06-50-433Z-jx1068-length-34-80.png';
const main = newRepo();
try {
	mkdirSync(main.proof, { recursive: true });
	writeFileSync(join(main.proof, timestamp), 'img');
	const stateFile = join(main.repo, '.wf/state.json');
	const before = readFileSync(stateFile, 'utf8');
	const refused = cli(main.repo, 'step', 'assess');
	check('a class A build handoff with a timestamp capture is refused, naming it without rewriting authority', refused.code === 2 && refused.out.includes(timestamp) && readFileSync(stateFile, 'utf8') === before, refused.out + JSON.stringify(readState(main.repo)));

	renameSync(join(main.proof, timestamp), join(main.proof, 'after-1.png'));
	const allowed = cli(main.repo, 'step', 'assess');
	check('renamed after-<label>, the handoff is allowed', allowed.code === 0 && readState(main.repo)?.step === 'assess', allowed.out + JSON.stringify(readState(main.repo)));

	writeFileSync(join(main.proof, timestamp), 'img');
	const review = cli(main.repo, 'step', 'review');
	check('a capture added during assessment is refused before review, state untouched', review.code === 2 && review.out.includes(timestamp) && readState(main.repo)?.step === 'assess', review.out + JSON.stringify(readState(main.repo)));
	const report = `Verdict: clean\nhead: ${git(main.repo, 'rev-parse', 'HEAD')}\n## Intent\n- "x": met: before: old behavior · after: fixed behavior\n`;
	writeFileSync(join(main.repo, 'bug-reports/r/ASSESSMENT.md'), report);
	const next = cli(main.repo, 'next');
	check('next returns an assessor capture to build before offering T2, without a human ruling', next.out.startsWith('work build') && next.out.includes(timestamp) && readState(main.repo)?.step === 'build' && !readState(main.repo)?.questions?.length, next.out);
	renameSync(join(main.proof, timestamp), join(main.proof, 'after-2.png'));
	const rehandoff = cli(main.repo, 'step', 'assess');
	writeFileSync(join(main.repo, 'bug-reports/r/ASSESSMENT.md'), report.replace('## Intent', 'assessed-at: 2026-10-14T10:00:00Z\n## Intent'));
	const restored = cli(main.repo, 'next');
	check('named captures and a fresh assessment restore T2', rehandoff.code === 0 && restored.out.startsWith('review: T2'), restored.out);

	// JX-436 (2026-10-25): `setup: cd packages/backend && uv run python …` reached T2 and was refused
	// only by `wf show`. The handoff now runs the same project validator, so the build rewrites the
	// line it wrote; both admitted recipe forms pass.
	const walk = (setup: string, ready = '') => `# r\n## Intent\n- "x": y\n\n## Notes\n- **T2 walk.** open: b2b /catalog/rings as buyer\n${ready}${setup}\n`;
	const ticket = join(main.repo, 'bug-reports/r', 'TICKET.md');
	writeFileSync(ticket, walk('  setup: cd packages/backend && uv run python ../../tools/set-sales-count.py\n'));
	const shellSetup = cli(main.repo, 'step', 'assess');
	check('a walk setup line wf show cannot run is refused at the handoff, naming both admitted forms', shellSetup.code === 2 && shellSetup.out.includes('TICKET.md: the T2 walk `setup:` line') && shellSetup.out.includes('must be `api <fn> <json> as <buyer|seller|admin>` or `script ["executable","arg",...]`'), shellSetup.out);
	writeFileSync(ticket, walk('  setup: api createVariant {"path":{"product_id":"13bd"}} as seller\n', '  ready: api listInventory {} as buyer\n'));
	const apiSetup = cli(main.repo, 'step', 'assess');
	check('the api form passes the handoff', apiSetup.code === 0, apiSetup.out);
	writeFileSync(ticket, walk('  setup: script ["node","scenario.mjs","prepare"]\n', '  ready: script ["node","scenario.mjs","ready"]\n  reset: script ["node","scenario.mjs","reset"]\n'));
	const scriptSetup = cli(main.repo, 'step', 'assess');
	check('the script form passes the handoff', scriptSetup.code === 0, scriptSetup.out);
} finally {
	rmSync(main.repo, { recursive: true, force: true });
}

// Empty and non-image proof/ never stop a handoff: neither is a capture the post must attach.
const plain = newRepo();
try {
	const empty = cli(plain.repo, 'step', 'assess');
	check('a round with no proof/ folder hands off', empty.code === 0 && readState(plain.repo)?.step === 'assess', empty.out + JSON.stringify(readState(plain.repo)));
	mkdirSync(plain.proof, { recursive: true });
	writeFileSync(join(plain.proof, 'notes.md'), '# notes\n');
	writeFileSync(join(plain.proof, 'trace.zip'), 'zip');
	const nonImage = cli(plain.repo, 'step', 'assess');
	check('a proof/ folder of only non-pictures hands off', nonImage.code === 0 && readState(plain.repo)?.step === 'assess', nonImage.out + JSON.stringify(readState(plain.repo)));
	mkdirSync(join(plain.proof, 'archive.png')); // A directory is not a captured file.
	check('picture-like directory names are not proof captures', cli(plain.repo, 'step', 'assess').code === 0);
	rmSync(plain.proof, { recursive: true });
	writeFileSync(plain.proof, 'not a directory');
	const unreadable = cli(plain.repo, 'step', 'assess');
	check('an unreadable proof folder refuses with a controlled handoff diagnostic', unreadable.code === 2 && unreadable.out.includes('proof handoff: cannot read'), unreadable.out);
} finally {
	rmSync(plain.repo, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
