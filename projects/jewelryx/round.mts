// projects/jewelryx/round.mts — what a new JewelryX round gets besides its folder (index.mts newRound).
import { existsSync, lstatSync, mkdirSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Origins } from './index.mts';

const SKILL_DIRS = ['.pi/skills', '.claude/skills', '.agents/skills'];

// Shay's rounds run one flow, the round skill. The tools step runs link-tools, which links dev's
// v1 orchestrators into every worktree, and both answer "start <id>". Its verify-b2b and verify-admin
// claim the job of the project's verify-jewelryx (VERIFY_SKILL), which v2 uses instead (wf
// docs/plans/2026-09-27-verification-skill.md, step 5e). The links are local and gitignored:
// removing them here changes nobody else's machine, and the team keeps v1.
const COMPETING_SKILLS = ['bug-fix-orchestrator', 'cr-implement-orchestrator', 'verify-b2b', 'verify-admin'];
export function unlinkCompetingSkills(worktree: string): string[] {
	const removed: string[] = [];
	for (const dir of SKILL_DIRS) {
		for (const name of COMPETING_SKILLS) {
			const link = join(worktree, dir, name);
			try { if (!lstatSync(link).isSymbolicLink()) continue; } catch { continue; }
			rmdirSync(link); // the link only (junction or symlink), never the skill folder it points at
			removed.push(`${dir}/${name}`);
		}
	}
	return removed;
}

// The project's verification skill: one CLI (control-jewelryx) and a feature map, committed in the
// project. Linked here, in Shay's worktrees only, not by link-tools: that would show the team a
// second "verify B2B" skill next to v1's (the plan's Constraint). A base without it links nothing.
export const VERIFY_SKILL = 'docs/agents/verify-jewelryx';
export function linkVerifySkill(worktree: string): string[] {
	const target = join(worktree, VERIFY_SKILL);
	if (!existsSync(target)) return [];
	const linked: string[] = [];
	for (const dir of SKILL_DIRS) {
		const link = join(worktree, dir, 'verify-jewelryx');
		if (existsSync(link)) continue;
		mkdirSync(join(worktree, dir), { recursive: true });
		symlinkSync(target, link, 'junction'); // as link-tools does: a junction needs no admin rights on Windows
		linked.push(`${dir}/verify-jewelryx`);
	}
	return linked;
}

// Pure: the stack's direct URLs, for control-jewelryx (it reads .verify-stack.env at the repo root),
// and the file its three servers write to, whose errors control-jewelryx prints: of 568 agent
// sessions (June to 2026-09-28), 33 met a real 500 and 3 read that output; 25 wrote their own
// browser listeners instead.
export function verifyStackEnv(direct: Origins, log: string): string {
	return `B2B_URL=${direct.b2b}\nADMIN_URL=${direct.admin}\nAPI_URL=${direct.api}\nSTACK_LOG=${log}\n`;
}

// Pure: the repro's playwright config. A repro that uses import.meta — itself, or through a helper
// such as verification/tests/support/otp-lock.ts — fails to load before any test runs: bug-reports/
// sits outside verification/'s ES module package (BJEW-461 Claude Code spike, 2026-09-23: the research
// budget went on the config, the defect was never measured). With the verification skill in the base,
// the config also logs the three roles in first, so a spec holds only the defect's own steps (the five
// repros of 2026-09-27 had four login implementations).
export function reproConfig({ direct, withAuth }: { direct: Origins; withAuth: boolean }): string {
	return `// Written by wf new. Keep the repro self-contained: import only @playwright/test and node:*,
// never import.meta (use __dirname) — see wf/projects/jewelryx/round.mts reproConfig.
import { defineConfig, devices } from '@playwright/test';${withAuth ? "\nimport { resolve } from 'node:path';" : ''}

// This round's stack, direct ports: Node on Windows cannot resolve *.jewelryx.localhost.
process.env.B2B_URL ??= '${direct.b2b}';
process.env.ADMIN_URL ??= '${direct.admin}';
process.env.API_URL ??= '${direct.api}';
${withAuth ? `
// global-setup.ts saves buyer.json, seller.json and admin.json here before the tests run. Start
// logged in, with no login code in the spec:
//   test.use({ storageState: \`\${process.env.VERIFY_AUTH}/seller.json\` });
process.env.VERIFY_AUTH ??= resolve(__dirname, '../../../.verify/auth');
` : ''}
export default defineConfig({
	testDir: '.',
	testMatch: /\\.spec\\.ts$/,${withAuth ? "\n\tglobalSetup: './global-setup.ts'," : ''}
	timeout: 120_000,
	retries: 0,
	reporter: [['list']],
	outputDir: 'test-results',
	use: { ...devices['Desktop Chrome'], screenshot: 'off', trace: 'off' },
});
`;
}

// Pure: logs each role in through the skill's CLI (control-jewelryx auth <role>), all three at once:
// 7 s together, measured 2026-09-27.
export const REPRO_GLOBAL_SETUP = `// Written by wf new: the three seed roles' logins, saved by the verification skill's CLI
// (${VERIFY_SKILL}/SKILL.md). A red line here is the stack, not the defect: run its doctor.
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const cli = resolve(root, '${VERIFY_SKILL}/control-jewelryx.mjs');

const auth = (role: string) =>
	new Promise<void>((done, fail) =>
		execFile(process.execPath, [cli, 'auth', role], { cwd: root }, (e, _out, err) =>
			e ? fail(new Error(\`control-jewelryx auth \${role}: \${err || e.message}\`)) : done(),
		),
	);

export default async function globalSetup() {
	await Promise.all(['buyer', 'seller', 'admin'].map(auth));
}
`;

// The verification skill's own config, one for every round (JewelryX #242): a base that has it gets
// no per-round files, and the repro runs with `-c ../<REPRO_CONFIG> ../<folder>/repro`.
export const REPRO_CONFIG = `${VERIFY_SKILL}/repro.config.ts`;

// 'wx' leaves a reopened round's own files alone. Only for a base older than REPRO_CONFIG.
export function writeReproConfig({ worktree, folder, direct }: { worktree: string; folder: string; direct: Origins }): void {
	const withAuth = existsSync(join(worktree, VERIFY_SKILL));
	const dir = join(worktree, folder, 'repro');
	mkdirSync(dir, { recursive: true });
	if (existsSync(join(worktree, REPRO_CONFIG))) return;
	const files: Record<string, string> = { 'playwright.config.ts': reproConfig({ direct, withAuth }), ...(withAuth ? { 'global-setup.ts': REPRO_GLOBAL_SETUP } : {}) };
	for (const [name, text] of Object.entries(files)) {
		try { writeFileSync(join(dir, name), text, { flag: 'wx' }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
	}
}
