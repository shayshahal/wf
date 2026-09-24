// projects/jewelryx/round.mjs — what a new JewelryX round gets besides its folder (index.mjs newRound).
import { lstatSync, mkdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Shay's rounds run one flow, the round skill. The tools step runs link-tools, which links dev's
// v1 orchestrators into every worktree, and both answer "start <id>". The links are local and
// gitignored: removing them here changes nobody else's machine.
const COMPETING_SKILLS = ['bug-fix-orchestrator', 'cr-implement-orchestrator'];
export function unlinkCompetingSkills(worktree) {
	const removed = [];
	for (const dir of ['.pi/skills', '.claude/skills', '.agents/skills']) {
		for (const name of COMPETING_SKILLS) {
			const link = join(worktree, dir, name);
			try { if (!lstatSync(link).isSymbolicLink()) continue; } catch { continue; }
			rmdirSync(link); // the link only (junction or symlink), never the skill folder it points at
			removed.push(`${dir}/${name}`);
		}
	}
	return removed;
}

// A repro that uses import.meta — itself, or through a helper such as verification/tests/support/otp-lock.ts —
// fails to load before any test runs: bug-reports/ sits outside verification/'s ES module package
// (BJEW-461 Claude Code spike, 2026-09-23: the research budget went on the config, the defect was never
// measured). Research starts from this file, which loads; 'wx' leaves a reopened round's own config alone.
export function writeReproConfig({ worktree, folder, direct }) {
	const config = `// Written by wf new. Keep the repro self-contained: import only @playwright/test and node:*,
// never import.meta (use __dirname) — see wf/projects/jewelryx/round.mjs writeReproConfig.
import { defineConfig, devices } from '@playwright/test';

// This round's stack, direct ports: Node on Windows cannot resolve *.jewelryx.localhost.
process.env.B2B_URL ??= '${direct.b2b}';
process.env.ADMIN_URL ??= '${direct.admin}';
process.env.API_URL ??= '${direct.api}';

export default defineConfig({
	testDir: '.',
	testMatch: /\\.spec\\.ts$/,
	timeout: 120_000,
	retries: 0,
	reporter: [['list']],
	outputDir: 'test-results',
	use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off' },
});
`;
	mkdirSync(join(worktree, folder, 'repro'), { recursive: true });
	try { writeFileSync(join(worktree, folder, 'repro', 'playwright.config.ts'), config, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}
