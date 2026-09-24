// hook.mjs — what worktrunk runs around a project's worktree. The project does not use worktrunk; wf
// does, so the hooks live here and reach wt through the user config, per project:
//   wf hook install            write the block below into wt's user config (replaces an earlier one)
//   wf hook <step> <slug> [P]  one step, called by wt with {{ branch | sanitize }} {{ branch | hash_port }}
// Steps: pre-start = the project's setup steps (in parallel) · post-start serve · pre-remove gate ·
// post-remove down (the project's teardown) · alias urls. What each does is the project's (project.mjs).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repo, serve, setup, stackNames, teardown } from './project.mjs';
import { urlLines } from './worktree.mjs';

const BEGIN = '# >>> wf worktree hooks';
const END = '# <<< wf worktree hooks';

// Pure: the block for wt's user config. `wf` is the wf.mjs the hooks call.
export function hookBlock(wf) {
	const call = (step, args = '{{ branch | sanitize }} {{ branch | hash_port }}') => `'node ${wf} hook ${step} ${args}'`;
	const t = (name) => `[projects."${repo}".${name}]`;
	return [
		`${BEGIN} (written by \`wf hook install\`; change wf/hook.mjs, not this block)`,
		t('pre-start'),
		...Object.keys(setup).map((s) => `${s} = ${call(s)}`),
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

// Pure: the teardown steps that failed. A piece that is already gone is not a failure.
export function teardownFailures(runs) {
	return runs.flatMap(({ t, r }) => {
		const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
		return r.status === 0 || /no such (container|volume|network)|not found/i.test(out) ? [] : [`${t.cmd} ${t.args.join(' ')}: ${out.trim()}`];
	});
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
		return console.log(`wf hook install: hooks for ${repo} → ${file} (calling ${wf})`);
	}
	const worktree = process.cwd();
	if (!slug) throw new Error(`usage: wf hook <step> <slug> [base-port]  (got: ${argv.join(' ')})`);
	if (Object.hasOwn(setup, step)) {
		const s = setup[step];
		return typeof s === 'string' ? sh(s) : s({ worktree, slug, port });
	}
	if (step === 'serve') return serve({ worktree, slug, port });
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
		const failures = teardownFailures(teardown(slug).map((t) => ({ t, r: spawnSync(t.cmd, t.args, { encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, ...t.env } }) })));
		if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
		return console.log(`worktree down: ${slug}`);
	}
	if (step === 'urls') return console.log(urlLines(stackNames(slug)));
	throw new Error(`wf hook: unknown step "${step}"`);
}
