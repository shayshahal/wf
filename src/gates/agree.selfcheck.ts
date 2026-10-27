// agree.selfcheck.ts — a missing walk stops the actual T1 entry before state, page or UI changes.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wfSync } from '../in-process-wf.ts';
import { pathToFileURL } from 'node:url';
import { WF_ROOT } from '../paths.ts';

const repo = mkdtempSync(join(tmpdir(), 'wf-agree-walk-'));
try {
	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'base'], { cwd: repo });
	execFileSync('git', ['checkout', '-qb', 'fix/r'], { cwd: repo });
	const folder = 'bug-reports/r';
	mkdirSync(join(repo, folder), { recursive: true });
	mkdirSync(join(repo, '.wf'), { recursive: true });
	const state = JSON.stringify({ wf_version: 3, round: 'fix/r', base: 'main', class: 'B', step: 'agree', folder });
	writeFileSync(join(repo, '.wf/state.json'), state);
	const agreement = '# r\n## Observed\n- measured at a.txt:1\n## Agreed\n- Behavior: the requested change\nUNASKED\nWALK\n## Verification\n| # | case | files | check |\n|---|---|---|---|\n| 1 | behavior | a.txt | manual: check behavior |\n';
	for (const walk of ['', '- T2 walk:', '- **T2 walk.**', '- T2 walk: open:', '- **T2 walk.** open: /catalog as buyer [review note]', '- T2 walk: none — command-only fixture\n  setup: echo unsafe']) {
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('UNASKED', '- **Not asked for.** none — the ticket names it').replace('WALK', walk));
		const out = wfSync(['agree', 'fix/r'], { cwd: repo });
		assert.equal(out.status, 2, `${out.stdout}${out.stderr}`);
		assert.match(out.stderr, /T2 walk.*finish the agreement before T1/);
		assert.equal(readFileSync(join(repo, '.wf/state.json'), 'utf8'), state);
		assert.equal(existsSync(join(repo, '.wf/AGREEMENT-T1.html')), false);
		assert.equal(existsSync(join(repo, folder, 'AGREEMENT-REVIEW.md')), false);
	}
	// JX-1367 (2026-10-18): no Not asked for bullet, or a bare none, is refused before T1 like a missing walk.
	for (const unasked of ['', '- **Not asked for.** none']) {
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('UNASKED', unasked).replace('WALK', '- T2 walk: none — command-only fixture'));
		const out = wfSync(['agree', 'fix/r'], { cwd: repo });
		assert.equal(out.status, 2, `${out.stdout}${out.stderr}`);
		assert.match(out.stderr, /Not asked for.*finish the agreement before T1/);
		assert.equal(existsSync(join(repo, '.wf/AGREEMENT-T1.html')), false);
	}
	// Fake only the review UI. The actual agree command still parses, validates and renders the page.
	for (const [marker, feedback] of [['T2 walk:', ''], ['**T2 walk.**', ''], ['**T2 walk.**', '{"decision":"dismissed"}']]) {
		writeFileSync(join(repo, folder, 'AGREEMENT.md'), agreement.replace('UNASKED', '- **Not asked for.**\n  - a held-total line on the bid form — the split legs must total it').replace('WALK', `- ${marker} none — command-only fixture`));
		const code = `import { plug } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/seams.ts')).href)};
import { runAgree } from ${JSON.stringify(pathToFileURL(join(WF_ROOT, 'src/gates/agree.ts')).href)};
plug({reviewUI:{available:()=>true,annotate:()=>{console.log('T1_OPEN');return ${JSON.stringify(feedback)};}}});
await runAgree(['fix/r']);`;
		const out = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: repo, encoding: 'utf8' });
		assert.equal(out.status, 0, `${out.stdout}${out.stderr}`);
		assert.match(out.stdout, /T1_OPEN/);
		assert.match(out.stdout, /review dismissed — no approval was recorded/);
		assert.match(out.stdout, /--verdict <approved\|changes-requested\|dismissed> --sha [a-f0-9]{64} --note/);
		assert.match(readFileSync(join(repo, folder, 'AGREEMENT-REVIEW.md'), 'utf8'), /verdict: dismissed\s*$/);
		assert.match(out.stdout, /not asked for — decide each at T1:\n {2}- a held-total line on the bid form/);
		assert.equal(existsSync(join(repo, '.wf/AGREEMENT-T1.html')), false);
		assert.equal(existsSync(join(repo, '.wf/AGREEMENT-T1.md')), true);
	}
} finally {
	rmSync(repo, { recursive: true, force: true });
}
console.log('all arms green');
