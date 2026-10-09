// hardening.ts — regression tests for the #116 review-target hardening.
//
// They exercise the real public interfaces, not prompts: `captureReviewTarget`/`targetIsStale`, the
// argv from `buildGitArgv` run through the same spawn the tool uses, and the `read`/`list_files` tool
// `execute` against a real `NodeExecutionEnv`. Run from this folder: node test/hardening.ts
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context } from '@earendil-works/chord';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { assertOutsideRoots, canonicalPath, containedPath } from '../src/path-safety.ts';
import { buildGitArgv, captureReviewTarget, createReviewerExtension, targetIsStale } from '../src/reviewer.ts';
import { WF_ROOT } from '../../../../src/paths.ts';

const here = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = join(here, 'src', 'runner.ts');

let failures = 0;
async function check(name: string, test: () => void | Promise<void>): Promise<void> {
	try {
		await test();
		console.log(`  ok   ${name}`);
	} catch (error) {
		failures++;
		console.error(`  FAIL ${name}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
	}
}

const directory = mkdtempSync(join(tmpdir(), 'wf-durable-hardening-'));
// The host's global/system git config must not decide the result; each fixture sets its own.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const emptyConfig = join(directory, 'empty-gitconfig');
writeFileSync(emptyConfig, '');
env.GIT_CONFIG_GLOBAL = emptyConfig;
env.GIT_CONFIG_SYSTEM = emptyConfig;

function git(worktree: string, args: string[]): string {
	return execFileSync('git', args, { cwd: worktree, env, encoding: 'utf8' }).trim();
}

function fixture(name: string): { worktree: string; base: string; agreementPath: string } {
	const worktree = join(directory, name);
	mkdirSync(join(worktree, 'src'), { recursive: true });
	git(worktree, ['init', '-q', '-b', 'main']);
	git(worktree, ['config', 'core.autocrlf', 'false']);
	git(worktree, ['config', 'user.name', 'hardening']);
	git(worktree, ['config', 'user.email', 'hardening@example.invalid']);
	writeFileSync(join(worktree, 'src', 'target.txt'), 'base\n');
	git(worktree, ['add', '.']);
	git(worktree, ['commit', '-qm', 'base']);
	const agreementPath = join(directory, `${name}-agreement.md`);
	writeFileSync(agreementPath, '# Agreement\nReview the complete selected change.\n');
	return { worktree, base: 'HEAD', agreementPath };
}

/** Run the tool's own argv exactly as the tool would, returning exit status. */
function runArgv(worktree: string, argv: readonly string[]): number {
	const run = spawnSync(argv[0]!, argv.slice(1), { cwd: worktree, env, encoding: 'utf8' });
	return run.status ?? -1;
}

function markerScript(path: string): string {
	writeFileSync(path, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(join(directory, 'MUTATION-MARKER'))}, 'x');\n`);
	return `"${process.execPath.replace(/\\/g, '/')}" "${path.replace(/\\/g, '/')}"`;
}

type ToolLike = { name: string; execute(args: unknown, api: unknown, context: Context): Promise<unknown> };

const extension = createReviewerExtension({ probes: false });
const tools = extension.tools as readonly ToolLike[];
const read = tools.find((tool) => tool.name === 'read')!;
const list = tools.find((tool) => tool.name === 'list_files')!;
const context = {} as Context;

try {
	await check('a new untracked source file makes the captured result stale', () => {
		const options = fixture('untracked');
		const target = captureReviewTarget(options);
		writeFileSync(join(options.worktree, 'src', 'new-product.ts'), 'export const changed = true;\n');
		assert.equal(targetIsStale(target, options), true);
	});

	await check('the untracked file content is part of the frozen review text', () => {
		const options = fixture('untracked-visible');
		writeFileSync(join(options.worktree, 'src', 'new-product.ts'), 'export const changed = true;\n');
		const target = captureReviewTarget(options);
		assert.match(target.diffText, /untracked new file: src\/new-product\.ts/);
		assert.match(target.diffText, /export const changed = true;/);
	});

	await check('an ignored untracked file does not change the identity', () => {
		const options = fixture('ignored');
		writeFileSync(join(options.worktree, '.gitignore'), '*.tmp\n');
		git(options.worktree, ['add', '.gitignore']);
		git(options.worktree, ['commit', '-qm', 'ignore']);
		const target = captureReviewTarget(options);
		writeFileSync(join(options.worktree, 'scratch.tmp'), 'ignored\n');
		assert.equal(targetIsStale(target, options), false);
	});

	await check('an invalid base refuses capture instead of hashing an error string', () => {
		const options = fixture('invalid-base');
		assert.throws(() => captureReviewTarget({ ...options, base: 'no-such-base-reference' }));
	});

	await check('a directory that is not a git repository refuses capture', () => {
		const notRepo = join(directory, 'not-a-repo');
		mkdirSync(notRepo, { recursive: true });
		const agreementPath = join(directory, 'not-a-repo-agreement.md');
		writeFileSync(agreementPath, '# Agreement\n');
		assert.throws(() => captureReviewTarget({ worktree: notRepo, base: 'HEAD', agreementPath }));
	});

	await check('buildGitArgv refuses an option ref', () => {
		assert.throws(() => buildGitArgv('diff', '--ext-diff', undefined), /refusing ref/);
		assert.throws(() => buildGitArgv('show', '-c', undefined), /refusing ref/);
	});

	await check('the allowlisted git argv cannot run a repository external diff', () => {
		const options = fixture('external-diff');
		git(options.worktree, ['config', 'diff.external', markerScript(join(directory, 'external-diff.mjs'))]);
		writeFileSync(join(options.worktree, 'src', 'target.txt'), 'changed\n');
		rmSync(join(directory, 'MUTATION-MARKER'), { force: true });
		runArgv(options.worktree, buildGitArgv('diff', 'HEAD', undefined));
		assert.equal(existsSync(join(directory, 'MUTATION-MARKER')), false, 'external diff ran and mutated the checkout');
	});

	await check('the allowlisted git argv cannot run a repository textconv filter', () => {
		const options = fixture('textconv');
		git(options.worktree, ['config', 'diff.custom.textconv', markerScript(join(directory, 'textconv.mjs'))]);
		writeFileSync(join(options.worktree, '.gitattributes'), 'src/target.txt diff=custom\n');
		writeFileSync(join(options.worktree, 'src', 'target.txt'), 'changed\n');
		rmSync(join(directory, 'MUTATION-MARKER'), { force: true });
		runArgv(options.worktree, buildGitArgv('diff', 'HEAD', undefined));
		assert.equal(existsSync(join(directory, 'MUTATION-MARKER')), false, 'textconv ran and mutated the checkout');
	});

	await check('the allowlisted git argv cannot run a repository fsmonitor program', () => {
		const options = fixture('fsmonitor');
		git(options.worktree, ['config', 'core.fsmonitor', markerScript(join(directory, 'fsmonitor.mjs'))]);
		rmSync(join(directory, 'MUTATION-MARKER'), { force: true });
		runArgv(options.worktree, buildGitArgv('status', undefined, undefined));
		assert.equal(existsSync(join(directory, 'MUTATION-MARKER')), false, 'fsmonitor ran and mutated the checkout');
	});

	await check('containedPath keeps paths inside the checkout and refuses the rest', () => {
		const options = fixture('contained');
		const inside = containedPath(options.worktree, 'src/target.txt');
		assert.equal(inside, canonicalPath(join(options.worktree, 'src', 'target.txt')));
		assert.throws(() => containedPath(options.worktree, '../outside.txt'), /outside the reviewed checkout/);
		assert.throws(() => containedPath(options.worktree, join(directory, 'outside.txt')), /outside the reviewed checkout/);
	});

	await check('the read tool reads inside the checkout and refuses ../ and absolute outside paths', async () => {
		const options = fixture('read-tool');
		writeFileSync(join(directory, 'read-outside.txt'), 'outside\n');
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		const inside = (await read.execute({ path: 'src/target.txt' }, api, context)) as { content: { text: string }[] };
		assert.match(inside.content[0]!.text, /base/);
		await assert.rejects(read.execute({ path: '../read-outside.txt' }, api, context), /outside the reviewed checkout/);
		await assert.rejects(read.execute({ path: join(directory, 'read-outside.txt') }, api, context), /outside the reviewed checkout/);
	});

	await check('the list_files tool refuses a path outside the checkout', async () => {
		const options = fixture('list-tool');
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		const inside = (await list.execute({ path: 'src' }, api, context)) as { content: { text: string }[] };
		assert.match(inside.content[0]!.text, /target\.txt/);
		await assert.rejects(list.execute({ path: '..' }, api, context), /outside the reviewed checkout/);
		await assert.rejects(list.execute({ path: directory }, api, context), /outside the reviewed checkout/);
	});

	await check('a symlink out of the checkout is refused', async () => {
		const options = fixture('symlink');
		const outsideDir = join(directory, 'symlink-target');
		mkdirSync(outsideDir, { recursive: true });
		writeFileSync(join(outsideDir, 'secret.txt'), 'secret\n');
		const link = join(options.worktree, 'escape');
		try {
			symlinkSync(outsideDir, link, process.platform === 'win32' ? 'junction' : 'dir');
		} catch (error) {
			// Windows without the symlink privilege cannot make the fixture; the lexical checks above still run.
			console.log(`  skip a symlink out of the checkout is refused (${error instanceof Error ? error.message : String(error)})`);
			return;
		}
		assert.throws(() => containedPath(options.worktree, 'escape/secret.txt'), /outside the reviewed checkout/);
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		await assert.rejects(read.execute({ path: 'escape/secret.txt' }, api, context), /outside the reviewed checkout/);
	});

	await check('a change in a later file beyond the shown prefix is stale and the target is partial', () => {
		const options = fixture('multi-file-tail');
		writeFileSync(join(options.worktree, 'src', 'a-huge.txt'), 'start\n');
		writeFileSync(join(options.worktree, 'src', 'z-small.ts'), 'export const small = 1;\n');
		git(options.worktree, ['add', '.']);
		git(options.worktree, ['commit', '-qm', 'add two files']);
		writeFileSync(join(options.worktree, 'src', 'a-huge.txt'), 'x'.repeat(500_000));
		writeFileSync(join(options.worktree, 'src', 'z-small.ts'), 'export const small = 2;\n');
		const target = captureReviewTarget(options);
		assert.equal(target.partial, true, 'a 500k selection must be partial');
		assert.match(target.diffText, /\[truncated\]/);
		assert.doesNotMatch(target.diffText, /export const small = 2;/, 'the later file is beyond the shown prefix');
		writeFileSync(join(options.worktree, 'src', 'z-small.ts'), 'export const small = 3;\n');
		assert.equal(targetIsStale(target, options), true, 'a change in the unseen tail must be stale');
	});

	await check('the runner refuses a review target over the budget', () => {
		const options = fixture('runner-partial');
		writeFileSync(join(options.worktree, 'src', 'a-huge.txt'), 'start\n');
		git(options.worktree, ['add', '.']);
		git(options.worktree, ['commit', '-qm', 'add huge']);
		writeFileSync(join(options.worktree, 'src', 'a-huge.txt'), 'y'.repeat(500_000));
		const run = spawnSync(
			process.execPath,
			[RUNNER, '--storage', join(directory, 'runner-partial-storage'), '--worktree', options.worktree, '--agreement', options.agreementPath, '--provider', 'faux'],
			{ encoding: 'utf8' },
		);
		assert.equal(run.status, 1, run.stdout + run.stderr);
		assert.match(run.stderr, /larger than the 400000-character budget/);
	});

	await check('assertOutsideRoots refuses storage inside a root and allows a path outside', () => {
		const options = fixture('storage-location');
		assert.throws(() => assertOutsideRoots(join(options.worktree, 'storage'), [options.worktree], 'storage'), /is inside/);
		assert.throws(() => assertOutsideRoots(join(directory, 'storage'), [directory], 'storage'), /is inside/);
		const allowed = assertOutsideRoots(join(tmpdir(), 'wf-outside-storage'), [directory], 'storage');
		assert.equal(typeof allowed, 'string');
	});

	await check('storage reached through a symlink into the checkout is refused', () => {
		const options = fixture('storage-symlink');
		const link = join(directory, 'link-to-worktree');
		try {
			symlinkSync(options.worktree, link, process.platform === 'win32' ? 'junction' : 'dir');
		} catch (error) {
			// Windows without the symlink privilege cannot make the fixture; the direct checks above still run.
			console.log(`  skip storage reached through a symlink into the checkout is refused (${error instanceof Error ? error.message : String(error)})`);
			return;
		}
		assert.throws(() => assertOutsideRoots(join(link, 'storage'), [options.worktree], 'storage'), /is inside/);
	});

	await check('the runner refuses --storage inside the reviewed checkout before creating it', () => {
		const options = fixture('runner-storage');
		const inside = join(options.worktree, 'storage');
		const run = spawnSync(
			process.execPath,
			[RUNNER, '--storage', inside, '--worktree', options.worktree, '--agreement', options.agreementPath, '--provider', 'faux'],
			{ encoding: 'utf8' },
		);
		assert.equal(run.status, 1, run.stdout + run.stderr);
		assert.match(run.stderr, /is inside/);
		assert.equal(existsSync(inside), false, 'storage was created despite the refusal');
	});

	await check('the runner refuses --storage inside the wf checkout but outside the experiment folder', () => {
		const options = fixture('runner-wf-storage');
		// Inside WF_ROOT and env/experiments, but not inside the experiment folder itself: only the wf
		// checkout root refuses it.
		const insideWf = join(WF_ROOT, 'env', 'experiments', '.storage-refusal-test');
		rmSync(insideWf, { recursive: true, force: true });
		try {
			const run = spawnSync(
				process.execPath,
				[RUNNER, '--storage', insideWf, '--worktree', options.worktree, '--agreement', options.agreementPath, '--provider', 'faux'],
				{ encoding: 'utf8' },
			);
			assert.equal(run.status, 1, run.stdout + run.stderr);
			assert.match(run.stderr, /is inside/);
			assert.equal(existsSync(insideWf), false, 'storage was created inside the wf checkout');
		} finally {
			rmSync(insideWf, { recursive: true, force: true });
		}
	});

	await check('GIT_DIR in the environment cannot redirect capture to another repository', () => {
		const options = fixture('git-env');
		const other = fixture('git-env-other');
		writeFileSync(join(other.worktree, 'src', 'target.txt'), 'other\n');
		git(other.worktree, ['add', '.']);
		git(other.worktree, ['commit', '-qm', 'other']);
		const expected = git(options.worktree, ['rev-parse', 'HEAD']);
		const saved = process.env.GIT_DIR;
		process.env.GIT_DIR = join(other.worktree, '.git');
		try {
			assert.equal(captureReviewTarget(options).headSha, expected);
		} finally {
			if (saved === undefined) delete process.env.GIT_DIR;
			else process.env.GIT_DIR = saved;
		}
	});

	await check('GIT_CONFIG_COUNT in the environment cannot inject an external diff', () => {
		const options = fixture('git-env-config');
		writeFileSync(join(options.worktree, 'src', 'target.txt'), 'changed\n');
		const saved = { count: process.env.GIT_CONFIG_COUNT, key: process.env.GIT_CONFIG_KEY_0, value: process.env.GIT_CONFIG_VALUE_0 };
		process.env.GIT_CONFIG_COUNT = '1';
		process.env.GIT_CONFIG_KEY_0 = 'diff.external';
		process.env.GIT_CONFIG_VALUE_0 = markerScript(join(directory, 'env-diff.mjs'));
		rmSync(join(directory, 'MUTATION-MARKER'), { force: true });
		try {
			captureReviewTarget(options);
		} finally {
			if (saved.count === undefined) delete process.env.GIT_CONFIG_COUNT;
			else process.env.GIT_CONFIG_COUNT = saved.count;
			if (saved.key === undefined) delete process.env.GIT_CONFIG_KEY_0;
			else process.env.GIT_CONFIG_KEY_0 = saved.key;
			if (saved.value === undefined) delete process.env.GIT_CONFIG_VALUE_0;
			else process.env.GIT_CONFIG_VALUE_0 = saved.value;
		}
		assert.equal(existsSync(join(directory, 'MUTATION-MARKER')), false, 'injected config ran an external diff');
	});

	await check('the read tool refuses a file over the byte cap before reading it', async () => {
		const options = fixture('read-cap');
		writeFileSync(join(options.worktree, 'src', 'big.txt'), 'x'.repeat(4 * 1024 * 1024 + 1));
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		await assert.rejects(read.execute({ path: 'src/big.txt' }, api, context), /read cap/);
	});

	await check('the read cap applies through an in-checkout symlink to an oversized file', async () => {
		const options = fixture('read-symlink-cap');
		const big = join(options.worktree, 'src', 'big.txt');
		writeFileSync(big, 'x'.repeat(4 * 1024 * 1024 + 1));
		const link = join(options.worktree, 'src', 'big-link.txt');
		try {
			symlinkSync(big, link, 'file');
		} catch (error) {
			// Windows without the symlink privilege cannot make the fixture; the direct cap check above still runs.
			console.log(`  skip the read cap applies through an in-checkout symlink (${error instanceof Error ? error.message : String(error)})`);
			return;
		}
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		await assert.rejects(read.execute({ path: 'src/big-link.txt' }, api, context), /read cap/);
	});

	await check('an untracked file over the byte cap refuses capture instead of being read whole', () => {
		const options = fixture('untracked-cap');
		writeFileSync(join(options.worktree, 'src', 'huge-untracked.txt'), 'x'.repeat(4 * 1024 * 1024 + 1));
		assert.throws(() => captureReviewTarget(options), /capture cap/);
	});

	await check('the list_files tool pages a directory and reports the entry cap', async () => {
		const options = fixture('list-cap');
		const many = join(options.worktree, 'many');
		mkdirSync(many, { recursive: true });
		for (let index = 0; index < 2005; index++) writeFileSync(join(many, `f${String(index).padStart(4, '0')}.txt`), 'x');
		const api = { env: new NodeExecutionEnv({ cwd: options.worktree }) };
		const result = (await list.execute({ path: 'many' }, api, context)) as { content: { text: string }[] };
		assert.match(result.content[0]!.text, /more than 2000 entries/);
	});
} finally {
	if (failures === 0) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	else console.log(`\nkept test directory for inspection: ${directory}`);
}

console.log(failures === 0 ? '\nall hardening checks green' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
