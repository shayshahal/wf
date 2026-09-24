// hook.mjs — what worktrunk runs around a JewelryX worktree. The project does not use worktrunk; wf
// does, so the hooks live here and reach wt through the user config, per project:
//   wf hook install            write the block below into wt's user config (replaces an earlier one)
//   wf hook <step> <slug> [P]  one step, called by wt with {{ branch | sanitize }} {{ branch | hash_port }}
// Steps: pre-start env node verify tools db (in parallel; db syncs python, starts mongo, seeds) · post-start serve · pre-remove
// gate · post-remove down · alias urls.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stackNameLines, stackNames } from './worktree.mjs';

export const PROJECT = 'github.com/Raynw-MediaTech/jeweleryx';
const BEGIN = '# >>> wf worktree hooks';
const END = '# <<< wf worktree hooks';

// Setup steps that are plain commands in the worktree. `node` stays one chain: pre-start steps run in
// parallel, and as a sibling step `pnpm build:types` started a second `pnpm install` over the same
// node_modules/.pnpm and killed the first with EPERM (measured 2026-09-20, three runs).
// `tools` is the project's own linker (package.json tools:install). The python environment is
// synced inside `db`, because the seeder runs in it.
export const COMMANDS = {
	node: 'pnpm install --frozen-lockfile && pnpm build:types && pnpm build:data && pnpm build:filters',
	verify: 'pnpm --dir verification install --ignore-workspace',
	tools: 'node scripts/link-tools.mjs',
};
const PYTHON_SYNC = 'uv sync --dev --directory packages/backend';

// Pure: the block for wt's user config. `wf` is the wf.mjs the hooks call.
export function hookBlock(wf) {
	const call = (step, args = '{{ branch | sanitize }} {{ branch | hash_port }}') => `'node ${wf} hook ${step} ${args}'`;
	const t = (name) => `[projects."${PROJECT}".${name}]`;
	return [
		`${BEGIN} (written by \`wf hook install\`; change wf/hook.mjs, not this block)`,
		t('pre-start'),
		...['env', ...Object.keys(COMMANDS), 'db'].map((s) => `${s} = ${call(s)}`),
		'',
		t('post-start'),
		`server = 'wt step tether -- node ${wf} hook serve {{ branch | sanitize }} {{ branch | hash_port }}'`,
		'',
		t('pre-remove'),
		`gate = ${call('gate', '{{ branch | sanitize }}')}`,
		'',
		t('post-remove'),
		`down = ${call('down', '{{ branch | sanitize }}')}`,
		'',
		t('aliases'),
		`urls = ${call('urls', '{{ branch | sanitize }}')}`,
		END,
	].join('\n');
}

// Pure: the user config with the block in place of an earlier one, or appended. The global `urls`
// alias that called the project's scripts/dev-worktree.mjs goes: the block's alias replaces it.
export function withHookBlock(config, block) {
	const s = config.replace(/\r\n/g, '\n').replace(/^urls = .*scripts\/dev-worktree\.mjs.*\n/m, '');
	const a = s.indexOf(BEGIN);
	const b = s.indexOf(END);
	if (a >= 0 && b > a) return `${s.slice(0, a)}${block}${s.slice(b + END.length)}`;
	return `${s.replace(/\n*$/, '\n\n')}${block}\n`;
}

// Pure: the reap gate. A worktree whose round has not reached "merged" is refused; one that never
// entered the workflow (no state) is removable; WF_FORCE_REAP=1 overrides.
export function gateVerdict({ state, force }) {
	if (force || state === undefined) return null;
	if (state === null) return 'its .wf/state.json is unreadable';
	return state.step === 'merged' ? null : `round step is "${state.step ?? 'unknown'}" (expected "merged"); run wf step merged first`;
}

function userConfigPath() {
	const out = spawnSync('wt', ['config', 'show'], { encoding: 'utf8' }).stdout ?? '';
	const path = /USER CONFIG @ (\S+)/.exec(out)?.[1];
	if (!path) throw new Error('wf hook install: `wt config show` names no user config');
	return path.replace(/^~/, process.env.USERPROFILE ?? process.env.HOME);
}

function sh(command) {
	const r = spawnSync(command, { stdio: 'inherit', shell: true });
	if (r.status !== 0) process.exit(r.status ?? 1);
}

export async function runHook(argv) {
	const [step, slug, port] = argv;
	if (step === 'install') {
		const file = userConfigPath();
		const wf = fileURLToPath(new URL('./wf.mjs', import.meta.url)).replace(/\\/g, '/');
		writeFileSync(file, withHookBlock(existsSync(file) ? readFileSync(file, 'utf8') : '', hookBlock(wf)));
		return console.log(`wf hook install: hooks for ${PROJECT} → ${file} (calling ${wf})`);
	}
	const worktree = process.cwd();
	// Change-over: a checkout that still ships its own .config/wt.toml runs those hooks; running ours
	// too would install and serve twice. Delete this once no branch in use carries the file.
	if (existsSync(join(worktree, '.config', 'wt.toml'))) return;
	if (!slug) throw new Error(`usage: wf hook <step> <slug> [base-port]  (got: ${argv.join(' ')})`);
	if (step in COMMANDS) return sh(COMMANDS[step]);
	if (step === 'env') {
		sh('wt step copy-ignored --from dev --require-include');
		// wf's own files in the worktree (.wf/: state, logs) stay out of git without the project
		// naming them: the exclude file is shared by every worktree of the repository.
		const exclude = join(spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim(), 'info', 'exclude');
		mkdirSync(dirname(exclude), { recursive: true });
		if (!(existsSync(exclude) ? readFileSync(exclude, 'utf8') : '').split(/\r?\n/).includes('.wf/')) appendFileSync(exclude, '\n.wf/\n');
		const { sanitizeWorktreeEnv } = await import('./stack/env.mjs');
		const { worktreeDatabase, worktreeMongoUrl } = await import('./stack/db.mjs');
		return sanitizeWorktreeEnv(worktree, { url: worktreeMongoUrl(port), name: worktreeDatabase(slug) });
	}
	if (step === 'db') {
		const { mongoUp, seedDatabase, worktreeDatabase } = await import('./stack/db.mjs');
		sh(PYTHON_SYNC);
		await mongoUp({ slug, base: port });
		return seedDatabase({ worktree, slug, database: worktreeDatabase(slug) });
	}
	if (step === 'serve') {
		const { runDev } = await import('./stack/dev.mjs');
		return runDev({ worktree, basePort: port, slug });
	}
	if (step === 'gate') {
		const file = join(worktree, '.wf', 'state.json');
		let state;
		if (existsSync(file)) try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { state = null; }
		const refusal = gateVerdict({ state, force: process.env.WF_FORCE_REAP === '1' });
		if (!refusal) return;
		console.error(`refusing to remove ${worktree}: ${refusal}, or set WF_FORCE_REAP=1`);
		process.exit(1);
	}
	if (step === 'down') {
		const { mongoDown } = await import('./stack/db.mjs');
		const failures = mongoDown(slug);
		// Routes whose server died with the worktree; CI=1 keeps portless from prompting.
		spawnSync('portless', ['prune'], { stdio: 'inherit', shell: true, env: { ...process.env, CI: '1' } });
		if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
		return console.log(`worktree down: ${slug}`);
	}
	if (step === 'urls') return console.log(stackNameLines(stackNames(slug)));
	throw new Error(`wf hook: unknown step "${step}"`);
}
