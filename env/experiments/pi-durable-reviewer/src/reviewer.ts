// reviewer.ts — the read-only reviewer: the frozen review target, the narrow tool set, and the
// submission that starts one review (issue #116).
//
// Repository access is enforced by construction, not by instructions: the only tools that exist are
// `read`, `list_files`, an allowlisted `git`, and `review_target` (which returns the frozen diff and
// agreement). There is no write/edit tool, no shell, and no push/merge/tracker tool. A ToolTask hook
// blocks any tool name outside that set, so a stored agent that selected more still cannot reach one.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import type { Context } from '@earendil-works/chord';
import { Type } from '@earendil-works/pi-ai';
import {
	type Conversation,
	defineDoc,
	defineExtension,
	defineTool,
	type Extension,
	type Harness,
	hook,
	section,
	ToolTask,
} from '@earendil-works/pi-durable';
import { isStale, requestIdFor, sha256Hex, type ReviewIdentity, type ReviewTarget } from './identity.ts';
import { containedPath } from './path-safety.ts';

/** The frozen review target, stored next to the reviewer's transcript. */
export type ReviewState = {
	requestId: string;
	worktree: string;
	base: string;
	agreementPath: string;
	headSha: string;
	diffHash: string;
	agreementHash: string;
	diffText: string;
	agreementText: string;
	capturedAt: string;
	submissionId: number;
	/** True when the selection exceeded the review budget, so the frozen text is only a prefix. */
	partial: boolean;
};

/** The frozen review target, stored as a conversation document next to the reviewer's transcript. */
export const ReviewDoc = defineDoc<ReviewState>({
	kind: 'experiment.review-target',
	version: 1,
	scope: 'conversation',
	history: 'latest',
	fork: 'initial',
	initial: () => ({
		requestId: '',
		worktree: '',
		base: '',
		agreementPath: '',
		headSha: '',
		diffHash: '',
		agreementHash: '',
		diffText: '',
		agreementText: '',
		capturedAt: '',
		submissionId: 0,
		partial: false,
	}),
});

/** The role and output rules the reviewer runs under; a static system-prompt section. */
export const REVIEWER_ROLE = [
	'You are a read-only reviewer. You review a fixed change against a working agreement.',
	'Call the `review_target` tool to get the exact diff and agreement you must review; that text is frozen',
	'and your review is bound to it. `read`, `list_files` and `git` are for context only.',
	'You cannot edit files, run arbitrary commands, push, merge, or touch any tracker.',
	'Report findings as a short list: file, the problem, and why it matters.',
	'If there is nothing to report, say "No findings." End with a one-line verdict.',
].join('\n');

/** Test-only hold, so a process kill can land inside a read; never set in a real review. */
function testHoldMs(): number {
	const value = Number(process.env.PI_DURABLE_REVIEWER_TEST_HOLD_MS ?? '0');
	return Number.isFinite(value) && value > 0 ? value : 0;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Git's own environment, with every `GIT_*` variable removed so the surrounding environment cannot
 * redirect git to another repository (`GIT_DIR`, `GIT_WORK_TREE`) or inject configuration
 * (`GIT_CONFIG_COUNT`/`GIT_CONFIG_PARAMETERS`). Git runs from `cwd` and discovers the repository there.
 */
function gitEnvironment(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined && !key.startsWith('GIT_')) env[key] = value;
	}
	return env;
}

/** Byte cap for the `read` tool: the file's size is checked before it is read into memory. */
const MAX_READ_BYTES = 4 * 1024 * 1024;
/** Entry cap for the `list_files` tool; the directory reader is paged rather than read whole. */
const MAX_LIST_ENTRIES = 2000;

const readTool = defineTool({
	name: 'read',
	description: 'Read a UTF-8 text file from the reviewed checkout. Read-only.',
	parameters: Type.Object({
		path: Type.String(),
		offset: Type.Optional(Type.Number({ description: '1-based first line' })),
		limit: Type.Optional(Type.Number({ description: 'maximum lines, default 2000' })),
	}),
	// A read has no side effect, so an interrupted call reruns on recovery (issue #116, replay-safe read).
	replay: 'safe',
	execute: async (args, api, context) => {
		if (api.env === undefined) throw new Error('read: no environment');
		const path = containedPath(api.env.cwd, args.path);
		const hold = testHoldMs();
		if (hold > 0) await sleep(hold);
		const info = await api.env.fileInfo(path, context);
		if (!info.ok) throw new Error(`read ${args.path}: ${info.error.message}`);
		if (info.value.size > MAX_READ_BYTES) throw new Error(`read ${args.path}: ${info.value.size} bytes exceeds the ${MAX_READ_BYTES}-byte read cap`);
		const result = await api.env.readTextFile(path, context);
		if (!result.ok) throw new Error(`read ${args.path}: ${result.error.message}`);
		const lines = result.value.split('\n');
		const offset = Math.max(1, Math.trunc(args.offset ?? 1));
		const limit = Math.min(4000, Math.max(1, Math.trunc(args.limit ?? 2000)));
		const shown = lines.slice(offset - 1, offset - 1 + limit);
		return {
			content: [{ type: 'text' as const, text: shown.join('\n') }],
			details: { offset, lines: shown.length, total: lines.length },
		};
	},
});

const listTool = defineTool({
	name: 'list_files',
	description: 'List the entries of a directory in the reviewed checkout. Read-only.',
	parameters: Type.Object({ path: Type.Optional(Type.String({ description: 'default: the checkout root' })) }),
	replay: 'safe',
	execute: async (args, api, context) => {
		if (api.env === undefined) throw new Error('list_files: no environment');
		const path = containedPath(api.env.cwd, args.path ?? '.');
		const opened = await api.env.openDirReader(path, context);
		if (!opened.ok) throw new Error(`list_files ${args.path ?? '.'}: ${opened.error.message}`);
		const reader = opened.value;
		try {
			const page = await reader.next(MAX_LIST_ENTRIES, context);
			if (!page.ok) throw new Error(`list_files ${args.path ?? '.'}: ${page.error.message}`);
			const lines = page.value.entries.map((entry) => `${entry.kind === 'directory' ? 'd' : '-'} ${entry.name}`);
			const suffix = page.value.done ? '' : `\n... more than ${MAX_LIST_ENTRIES} entries; only the first ${MAX_LIST_ENTRIES} are shown`;
			const text = lines.length === 0 ? '(empty)' : `${lines.join('\n')}${suffix}`;
			return { content: [{ type: 'text' as const, text }] };
		} finally {
			await reader.close(context);
		}
	},
});

const GIT_SUBCOMMANDS = ['diff', 'show', 'log', 'status', 'rev-parse', 'ls-files'] as const;
type GitSubcommand = (typeof GIT_SUBCOMMANDS)[number];
// A ref never starts with `-`, so it cannot be read as a git option. The leading character class
// excludes `-` (2026-10-09: the previous pattern allowed it, so `--ext-diff` reached git and ran the
// repository-configured external diff, mutating the checkout).
const REF_PATTERN = /^[A-Za-z0-9_@][A-Za-z0-9._/~^@{}-]*$/;
// Git-level options that stop repository configuration from running helpers during a read:
// `core.fsmonitor` is an executable, and optional index refresh writes the repository.
const GIT_SAFE_GLOBAL = ['--no-optional-locks', '-c', 'core.fsmonitor=false'] as const;
// `git diff`/`show` honour `diff.external` and `textconv` from repository config unless told not to;
// either can run an arbitrary command (2026-10-09: a configured external diff mutated the checkout).
const GIT_SAFE_DIFF = ['--no-ext-diff', '--no-textconv'] as const;

/** Pure: the argv for one allowlisted read-only git command, or a refusal for an unsafe ref. */
export function buildGitArgv(subcommand: GitSubcommand, ref: string | undefined, limit: number | undefined): string[] {
	if (ref !== undefined && !REF_PATTERN.test(ref)) throw new Error(`git: refusing ref ${JSON.stringify(ref)}`);
	const head = ['git', ...GIT_SAFE_GLOBAL];
	switch (subcommand) {
		case 'diff':
			return [...head, 'diff', ...GIT_SAFE_DIFF, ...(ref === undefined ? [] : [ref])];
		case 'show':
			return [...head, 'show', ...GIT_SAFE_DIFF, ref ?? 'HEAD'];
		case 'log':
			return [...head, 'log', '--oneline', '-n', String(Math.min(200, Math.max(1, Math.trunc(limit ?? 20))))];
		case 'status':
			return [...head, 'status', '--short'];
		case 'rev-parse':
			return [...head, 'rev-parse', ref ?? 'HEAD'];
		case 'ls-files':
			return [...head, 'ls-files'];
	}
}

const gitTool = defineTool({
	name: 'git',
	description: 'Run one allowlisted read-only git command in the reviewed checkout. No shell, no mutation.',
	parameters: Type.Object({
		subcommand: Type.Union(GIT_SUBCOMMANDS.map((name) => Type.Literal(name))),
		ref: Type.Optional(Type.String()),
		limit: Type.Optional(Type.Number()),
	}),
	replay: 'safe',
	execute: async (args, api, context) => {
		if (api.env === undefined) throw new Error('git: no environment');
		const argv = buildGitArgv(args.subcommand, args.ref, args.limit);
		let output = '';
		const result = await api.env.exec(argv, { env: gitEnvironment(), inheritEnv: false, onOutput: (text) => (output += text) }, context);
		if (!result.ok) throw new Error(`git ${args.subcommand}: ${result.error.message}`);
		return { content: [{ type: 'text' as const, text: output === '' ? `(git ${args.subcommand}: no output)` : output }] };
	},
});

const reviewTargetTool = defineTool({
	name: 'review_target',
	description: 'Return the frozen diff and working agreement this review is bound to, with their identity.',
	parameters: Type.Object({}),
	replay: 'safe',
	execute: async (_args, api, context) => {
		const target = await api.snapshot(ReviewDoc, api.conversationId, context);
		if (target === undefined || target.requestId === '') throw new Error('review_target: nothing recorded yet');
		const text = [
			`request: ${target.requestId}`,
			`worktree: ${target.worktree}`,
			`base: ${target.base}`,
			`head: ${target.headSha}`,
			`diff sha256Hex: ${target.diffHash}`,
			`agreement sha256Hex: ${target.agreementHash}`,
			'',
			'--- working agreement ---',
			target.agreementText,
			'',
			'--- frozen diff ---',
			target.diffText,
		].join('\n');
		return { content: [{ type: 'text' as const, text }] };
	},
});

const probeSafeTool = defineTool({
	name: 'probe_safe',
	description: 'Test-only replay-safe probe: waits, then returns. Exercises interruption recovery.',
	parameters: Type.Object({ holdMs: Type.Number() }),
	replay: 'safe',
	execute: async (args) => {
		await sleep(Math.max(0, args.holdMs));
		return { content: [{ type: 'text' as const, text: `probe_safe finished after ${args.holdMs}ms` }] };
	},
});

const probeUnsafeTool = defineTool({
	name: 'probe_unsafe',
	description: 'Test-only non-replay-safe probe: waits, then returns. Exercises visible interruption.',
	parameters: Type.Object({ holdMs: Type.Number() }),
	replay: 'unsafe',
	execute: async (args) => {
		await sleep(Math.max(0, args.holdMs));
		return { content: [{ type: 'text' as const, text: `probe_unsafe finished after ${args.holdMs}ms` }] };
	},
});

/** Build the read-only reviewer extension; `probes` adds the two test-only interruption tools. */
export function createReviewerExtension(options: { probes: boolean }): Extension {
	const tools = [
		readTool,
		listTool,
		gitTool,
		reviewTargetTool,
		...(options.probes ? [probeSafeTool, probeUnsafeTool] : []),
	];
	const allowed = new Set(tools.map((tool) => tool.name));
	return defineExtension({
		name: 'read-only-reviewer',
		tools,
		sections: [section('role', () => REVIEWER_ROLE, { tag: false })],
		hooks: [
			hook(ToolTask, {
				beforeTool: (call) =>
					allowed.has(call.name) ? undefined : { block: `${call.name} is not available to the read-only reviewer` },
			}),
		],
	});
}

/** The reviewer's tool names, in order; the stored agent selects exactly these. */
export function reviewerToolNames(options: { probes: boolean }): string[] {
	return createReviewerExtension(options).tools!.map((tool) => tool.name);
}

/** Where the reviewed checkout, its base ref and the working agreement live. */
export type CaptureOptions = { worktree: string; base: string; agreementPath: string };

/** Run one hardened git argv; an unreadable repo or ref is a refusal, not a hashed error string. */
function runGit(argv: readonly string[], cwd: string): string {
	try {
		return execFileSync(argv[0]!, argv.slice(1), { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnvironment() });
	} catch (error) {
		const stderr = (error as { stderr?: Buffer | string }).stderr;
		const detail = stderr !== undefined && String(stderr).trim() !== '' ? String(stderr).trim() : error instanceof Error ? error.message : String(error);
		throw new Error(`git ${argv.slice(1).join(' ')} failed: ${detail}`);
	}
}

const MAX_DIFF_CHARS = 400_000;
const MAX_UNTRACKED_FILE_CHARS = 64_000;
/** Whole-file cap for an untracked file before it is read to be hashed; over it the capture refuses. */
const MAX_UNTRACKED_BYTES = 4 * 1024 * 1024;
const PARTIAL_REFUSAL = `review target is larger than the ${MAX_DIFF_CHARS}-character budget; refusing to review an unseen whole diff`;

/**
 * The nonignored untracked files as a reviewable section. `git diff` omits untracked files, so a new
 * source file left the captured review looking fresh (2026-10-09). Each file's size is checked before
 * it is read, and a file over the byte cap refuses the capture rather than reading it whole. Each file
 * carries its full-content hash, so a change past the shown excerpt still changes the identity. A file
 * that resolves outside the checkout refuses the capture rather than pulling content from outside it.
 */
function untrackedSection(worktree: string): string {
	const listing = runGit([...buildGitArgv('ls-files', undefined, undefined), '--others', '--exclude-standard', '-z'], worktree);
	const parts: string[] = [];
	for (const path of listing.split('\0').filter((entry) => entry !== '').sort()) {
		const absolute = containedPath(worktree, path);
		const size = statSync(absolute).size;
		if (size > MAX_UNTRACKED_BYTES) throw new Error(`untracked file ${path} is ${size} bytes, over the ${MAX_UNTRACKED_BYTES}-byte capture cap; refusing to read it whole`);
		const bytes = readFileSync(absolute);
		const hash = sha256Hex(bytes.toString('base64'));
		parts.push(`--- untracked new file: ${path} (${bytes.length} bytes, sha256 ${hash}) ---`);
		if (bytes.includes(0)) {
			parts.push('[binary file, content not shown]');
			continue;
		}
		const text = bytes.toString('utf8');
		parts.push(text.length > MAX_UNTRACKED_FILE_CHARS ? `${text.slice(0, MAX_UNTRACKED_FILE_CHARS)}\n[truncated: full sha256 ${hash}]` : text);
	}
	return parts.join('\n');
}

/**
 * Read the worktree once and freeze the selection, the agreement and their hashes. The hash covers the
 * whole selection (tracked diff plus untracked files), not only the truncated text the model is shown.
 */
export function captureReviewTarget(options: CaptureOptions): ReviewTarget {
	const headSha = runGit(buildGitArgv('rev-parse', 'HEAD', undefined), options.worktree).trim();
	const tracked = runGit(buildGitArgv('diff', options.base, undefined), options.worktree);
	const untracked = untrackedSection(options.worktree);
	const selection = untracked === '' ? tracked : `${tracked}\n${untracked}`;
	const partial = selection.length > MAX_DIFF_CHARS;
	const diffText = partial ? `${selection.slice(0, MAX_DIFF_CHARS)}\n[truncated]` : selection;
	const agreementText = readFileSync(options.agreementPath, 'utf8');
	return {
		requestId: requestIdFor(options.worktree, options.base, options.agreementPath),
		worktree: options.worktree,
		base: options.base,
		agreementPath: options.agreementPath,
		headSha,
		diffHash: sha256Hex(selection),
		agreementHash: sha256Hex(agreementText),
		diffText,
		agreementText,
		capturedAt: new Date().toISOString(),
		partial,
	};
}

/** Re-read the worktree now, for the staleness check; `undefined` when it cannot be read. */
export function currentIdentity(options: CaptureOptions): Omit<ReviewIdentity, 'requestId' | 'worktree' | 'base' | 'agreementPath'> | undefined {
	try {
		const target = captureReviewTarget(options);
		return { headSha: target.headSha, diffHash: target.diffHash, agreementHash: target.agreementHash };
	} catch (error) {
		// An unreadable worktree or agreement makes the captured result stale by definition.
		if (error instanceof Error) return undefined;
		return undefined;
	}
}

/** Whether a captured identity is stale against the worktree as it is now. */
export function targetIsStale(target: ReviewIdentity, options: CaptureOptions): boolean {
	return isStale(target, currentIdentity(options));
}

/**
 * Reuse the stored target when one exists; capture and commit one on first start. Never recaptures on
 * restart, so a restart recovers the same review instead of reviewing whatever the worktree holds now.
 * A target over the review budget is refused: the model would see only a prefix, so its result could
 * not honestly claim to have reviewed the whole diff.
 */
export async function ensureReviewTarget(
	harness: Harness,
	conversation: Conversation,
	options: CaptureOptions,
	context: Context,
): Promise<ReviewTarget> {
	const existing = await harness.snapshot(ReviewDoc, conversation.id, context);
	if (existing !== undefined && existing.requestId !== '') {
		if (existing.partial === true) throw new Error(PARTIAL_REFUSAL);
		return { ...existing };
	}
	const target = captureReviewTarget(options);
	if (target.partial) throw new Error(PARTIAL_REFUSAL);
	await conversation.commit(async (tx) => {
		Object.assign(await tx.doc(ReviewDoc, conversation.id), target);
	}, context);
	return target;
}

/** The one input that starts (or, after a restart, re-finds) the review. */
export function reviewPrompt(target: ReviewIdentity): string {
	return [
		`Review request ${target.requestId}.`,
		`The frozen target is diff ${target.diffHash.slice(0, 12)} of ${target.worktree} against ${target.base},`,
		`under the agreement ${target.agreementHash.slice(0, 12)}.`,
		'Call `review_target` to read the exact diff and agreement, then report your findings.',
	].join(' ');
}
