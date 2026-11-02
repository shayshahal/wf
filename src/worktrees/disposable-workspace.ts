// Disposable workspace ownership, not round policy. The same guarded cleanup executor also serves reap.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, lstatSync, readFileSync, readlinkSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { acquireProcessLock } from '../process-lock.ts';
import { reconcileCheckProcesses, runCheckProcess } from '../gates/check-process.ts';
import type { CheckProcessResult } from '../gates/check-process.ts';
import { runRemovalStep } from './removal.ts';
import { reapWorkspaceGap } from './session-workspace.ts';
import { allocateWorkspace, workspaceAllocationPath } from './workspace-allocation.ts';
import { roundPort } from './round-port.ts';
import { listWorktrees, slugForBranch, worktreePathKey } from './worktree-registry.ts';
import { scratchDestination } from './workspace-probes.ts';
import { withGitHooksDisabled } from './git-hooks.ts';
import { readWorkspaceCleanup, runWorkspaceCleanup, workspaceDirectoryIdentity } from './workspace-cleanup.ts';
import type { WorkspaceCleanupResult } from './workspace-cleanup.ts';
import type { WorkspaceDependencyResult, WorkspaceProject, WorkspaceProjectContext } from './workspace-project.ts';
import type { RemovalStep } from '../seams.ts';

type WorkspaceDiagnostic =
	| { readonly kind: 'pending'; readonly id: string }
	| { readonly kind: 'confirmed' | 'retained'; readonly id: string; readonly digest: string };

// Acquisition identity is separate from cleanup progress. Only workspace-cleanup owns the journal.
type WorkspaceOwner = {
	readonly version: 1;
	readonly repository: string;
	readonly common: string;
	readonly branch: string;
	readonly path: string;
	readonly ref: string;
	readonly project: string;
	readonly token: string;
	readonly directory: string | null;
	readonly allocated: boolean;
	readonly log: string;
	readonly diagnostic?: WorkspaceDiagnostic;
};

/** One native command, with caller-supplied environment; never inferred from a live round. */
export type WorkspaceDiagnosticCommand = { readonly executable: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv };

/** Retention failure preserves authority; unavailable execution supplies no confirmed output. */
export type WorkspaceDiagnosticResult =
	| { readonly kind: 'retained'; readonly execution: CheckProcessResult }
	| { readonly kind: 'retention-failed'; readonly execution: CheckProcessResult; readonly why: string }
	| { readonly kind: 'unavailable'; readonly why: string };

/** A workspace lease owns only its newly created scratch; release is memoized, recovery is explicit. */
export type DisposableWorkspace = {
	readonly context: WorkspaceProjectContext;
	readonly ref: string;
	readonly receipt: string;
	readonly dependencies: Extract<WorkspaceDependencyResult, { kind: 'ready' }>;
	/** Own at most one diagnostic; publish durable intent before execution and retain before teardown. */
	readonly runDiagnostic: (command: WorkspaceDiagnosticCommand) => Promise<WorkspaceDiagnosticResult>;
	readonly release: () => Promise<WorkspaceCleanupResult>;
};

/** Failed acquisition retains an actionable receipt whenever allocation may have created resources. */
export type DisposableWorkspaceResult =
	| { readonly kind: 'ready'; readonly workspace: DisposableWorkspace }
	| { readonly kind: 'refused'; readonly why: string; readonly receipt: string | null; readonly cleanup?: WorkspaceCleanupResult };

/** Caller supplies explicit project binding and probe inputs; the ref is resolved before allocation. */
export type DisposableWorkspaceInput = {
	readonly repository: string;
	readonly branch: string;
	readonly ref: string;
	readonly project: WorkspaceProject;
	readonly probeFiles: readonly string[];
	readonly log: string;
};

function workspaceLocations(repository: string, branch: string) {
	const common = execFileSync('git', ['-C', repository, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: 'pipe' }).trim();
	const stem = join(common, `wf-workspace-${createHash('sha256').update(branch).digest('hex')}`);
	return { common, receipt: `${stem}.owner.json`, journal: `${stem}.cleanup.json` };
}

function writeWorkspaceOwner(receipt: string, owner: WorkspaceOwner): void {
	const temp = `${receipt}.${process.pid}.tmp`;
	writeFileSync(temp, JSON.stringify(owner));
	renameSync(temp, receipt);
}

function readWorkspaceOwner(receipt: string): WorkspaceOwner | null {
	const value: unknown = JSON.parse(readFileSync(receipt, 'utf8'));
	if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
		|| !('repository' in value) || typeof value.repository !== 'string' || !isAbsolute(value.repository)
		|| !('common' in value) || typeof value.common !== 'string' || !isAbsolute(value.common)
		|| !('branch' in value) || typeof value.branch !== 'string' || !value.branch
		|| !('path' in value) || typeof value.path !== 'string' || !isAbsolute(value.path)
		|| !('ref' in value) || typeof value.ref !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.ref)
		|| !('project' in value) || typeof value.project !== 'string' || !value.project
		|| !('token' in value) || typeof value.token !== 'string' || !/^[a-f0-9-]{36}$/.test(value.token)
		|| !('directory' in value) || (value.directory !== null && typeof value.directory !== 'string')
		|| !('allocated' in value) || typeof value.allocated !== 'boolean'
		|| !('log' in value) || typeof value.log !== 'string' || !isAbsolute(value.log)) return null;
	let diagnostic: WorkspaceDiagnostic | undefined;
	if ('diagnostic' in value) {
		const saved = value.diagnostic;
		if (!value.allocated || value.directory === null || typeof saved !== 'object' || saved === null || !('id' in saved) || typeof saved.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(saved.id) || !('kind' in saved)) return null;
		if (saved.kind === 'pending') {
			if ('digest' in saved) return null;
			diagnostic = { kind: 'pending', id: saved.id };
		} else if ((saved.kind === 'confirmed' || saved.kind === 'retained') && 'digest' in saved && typeof saved.digest === 'string' && /^[a-f0-9]{64}$/.test(saved.digest)) {
			diagnostic = { kind: saved.kind, id: saved.id, digest: saved.digest };
		} else return null;
	}
	return { version: 1, repository: value.repository, common: value.common, branch: value.branch, path: value.path, ref: value.ref, project: value.project, token: value.token, directory: value.directory, allocated: value.allocated, log: value.log, ...(diagnostic ? { diagnostic } : {}) };
}

function workspaceContext(owner: WorkspaceOwner): WorkspaceProjectContext {
	return { worktree: owner.path, branch: owner.branch, slug: slugForBranch(owner.branch), port: roundPort(owner.path, owner.branch), log: owner.log };
}

function branchHead(owner: WorkspaceOwner): string | null {
	const result = spawnSync('git', ['--git-dir', owner.common, 'rev-parse', '--verify', `refs/heads/${owner.branch}`], { encoding: 'utf8' });
	if (result.status === 0) return result.stdout.trim();
	// rev-parse uses 128 for an absent ref as well as unavailable storage. Query absence separately.
	const absent = spawnSync('git', ['--git-dir', owner.common, 'show-ref', '--verify', '--quiet', `refs/heads/${owner.branch}`]);
	if (absent.status === 1) return null;
	throw new Error('disposable workspace: branch state is unavailable; retained for inspection');
}

function confirmWorkspaceOwner(owner: WorkspaceOwner, receipt: string): void {
	const saved = readWorkspaceOwner(receipt);
	if (!saved || JSON.stringify(saved) !== JSON.stringify(owner)) throw new Error('disposable workspace: acquisition authority changed; nothing removed');
	if (existsSync(owner.path) && workspaceDirectoryIdentity(owner.path) !== owner.directory) throw new Error('disposable workspace: replacement directory retained');
}

// Canonical existing ancestors handle ordinary aliases and absent leaves. lstat also finds
// dangling destination/parent links before allocation makes their inside-checkout target exist.
function diagnosticSurvivesWorkspace(path: string, log: string): boolean {
	let destination = resolve(log);
	const seen = new Set<string>();
	for (;;) {
		let ancestor = destination;
		const missing: string[] = [];
		let stat = lstatSync(ancestor, { throwIfNoEntry: false });
		while (!stat) {
			const parent = dirname(ancestor);
			if (parent === ancestor) throw new Error('disposable workspace: diagnostic destination identity unavailable; nothing removed');
			missing.unshift(basename(ancestor));
			ancestor = parent;
			stat = lstatSync(ancestor, { throwIfNoEntry: false });
		}
		if (!stat.isSymbolicLink()) break;
		if (seen.has(ancestor)) throw new Error('disposable workspace: diagnostic destination link cycle; nothing removed');
		seen.add(ancestor);
		destination = resolve(dirname(ancestor), readlinkSync(ancestor), ...missing);
	}
	const target = worktreePathKey(path);
	const output = worktreePathKey(destination);
	return output !== target && !output.startsWith(`${target}/`);
}

function confirmWorkspaceCheckout(owner: WorkspaceOwner): void {
	if (!diagnosticSurvivesWorkspace(owner.path, owner.log)) throw new Error('disposable workspace: diagnostics must survive physically outside the disposable checkout; nothing removed');
	const target = worktreePathKey(owner.path);
	const trees = listWorktrees(owner.repository);
	if (trees.some((tree) => tree.branch === owner.branch && worktreePathKey(tree.path) !== target)) throw new Error('disposable workspace: baseline branch is rebound to another checkout; nothing removed');
	// A completed removal can leave only the owner/journal and a prunable registration. Do not
	// demand live Git metadata from a genuinely absent directory during explicit recovery.
	if (!existsSync(owner.path)) return;
	const registered = trees.filter((tree) => worktreePathKey(tree.path) === target);
	if (registered.length !== 1 || registered[0].branch !== owner.branch || registered[0].detached || registered[0].bare) throw new Error('disposable workspace: checkout registration switched or detached; replacement work retained');
	const git = (...args: string[]) => execFileSync('git', ['-C', owner.path, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
	if (worktreePathKey(git('rev-parse', '--path-format=absolute', '--git-common-dir')) !== worktreePathKey(owner.common)
		|| worktreePathKey(git('rev-parse', '--show-toplevel')) !== target
		|| git('symbolic-ref', '--quiet', 'HEAD') !== `refs/heads/${owner.branch}`
		|| git('rev-parse', '--verify', 'HEAD') !== owner.ref) throw new Error('disposable workspace: checkout Git identity changed; replacement work retained');
	const gitDirectory = git('rev-parse', '--absolute-git-dir');
	if (worktreePathKey(resolve(gitDirectory, readFileSync(join(gitDirectory, 'gitdir'), 'utf8').trim())) !== worktreePathKey(join(owner.path, '.git'))) throw new Error('disposable workspace: checkout Git registration rebound; replacement work retained');
}

function diagnosticFallback(owner: WorkspaceOwner, id: string): string {
	return join(owner.path, '.wf', `baseline-diagnostic-${id}.output`);
}

// Appending is at-least-once: a crash after append but before the receipt transition may repeat
// the same diagnostic ID on explicit recovery. It must never lose output to make cleanup green.
function retainWorkspaceDiagnostic(owner: WorkspaceOwner, receipt: string): WorkspaceOwner {
	confirmWorkspaceOwner(owner, receipt);
	if (!diagnosticSurvivesWorkspace(owner.path, owner.log)) throw new Error('disposable workspace: diagnostic destination no longer survives the checkout; output and authority retained');
	const diagnostic = owner.diagnostic;
	if (!diagnostic || diagnostic.kind === 'retained') return owner;
	if (diagnostic.kind === 'pending') throw new Error('disposable workspace: diagnostic output is uncertain; pending authority retained for inspection');
	const output = readFileSync(diagnosticFallback(owner, diagnostic.id));
	if (createHash('sha256').update(output).digest('hex') !== diagnostic.digest) throw new Error('disposable workspace: confirmed diagnostic output changed; authority retained');
	appendFileSync(owner.log, output);
	const retained: WorkspaceOwner = { ...owner, diagnostic: { ...diagnostic, kind: 'retained' } };
	writeWorkspaceOwner(receipt, retained);
	return retained;
}

async function releaseWorkspace(owner: WorkspaceOwner, project: WorkspaceProject, receipt: string, journal: string): Promise<WorkspaceCleanupResult> {
	const refused = (reason: string): WorkspaceCleanupResult => ({ kind: 'refused', journal, reason });
	try {
		confirmWorkspaceOwner(owner, receipt);
		confirmWorkspaceCheckout(owner);
		if (owner.diagnostic && owner.diagnostic.kind !== 'retained') return refused('disposable workspace: diagnostic retention incomplete; recover explicitly before teardown');
		const binding = await reapWorkspaceGap(owner.path, { recovering: existsSync(journal) });
		if (binding) return refused(binding);
		const recovery = readWorkspaceCleanup(journal, owner.branch);
		if (recovery.kind === 'refused') return refused(recovery.reason);
		const context = workspaceContext(owner);
		const registered = listWorktrees(owner.repository).filter((tree) => tree.branch === owner.branch);
		// A lost allocator response is reconciled only against the reserved directory and exact ref.
		const allocated = owner.allocated || registered.some((tree) => worktreePathKey(tree.path) === worktreePathKey(owner.path));
		if (!allocated && branchHead(owner) !== null) return refused('disposable workspace: allocation outcome is uncertain; branch retained for inspection');
		const confirmAuthority = () => {
				confirmWorkspaceOwner(owner, receipt);
				confirmWorkspaceCheckout(owner);
				if (existsSync(join(owner.path, '.wf', 'state.json'))) throw new Error('disposable workspace: round state appeared in the scratch; refusing adoption or deletion');
				const head = branchHead(owner);
				if (head !== null && head !== owner.ref) throw new Error('disposable workspace: branch content changed; retain new work instead of disposing it');
				const gap = reconcileCheckProcesses(owner.path);
				if (gap) throw new Error(gap);
		};
		// Recovery may already have advanced past this step; authority must still hold on every retry.
		try { confirmAuthority(); } catch (error) { return refused(error instanceof Error ? error.message : String(error)); }
		const steps: RemovalStep[] = [
			{ label: 'confirm disposable workspace authority', run: confirmAuthority },
			...(allocated ? project.teardown(context) : []),
			{ label: 'remove disposable workspace', rm: owner.path },
			{ label: 'prune disposable workspace registration', run: () => { execFileSync('git', ['--git-dir', owner.common, 'worktree', 'prune'], { stdio: 'pipe' }); } },
			...(allocated ? [{ label: 'delete disposable baseline branch', run: () => {
				const head = branchHead(owner);
				if (head === null) return;
				if (head !== owner.ref) throw new Error('disposable workspace: replacement branch retained');
				withGitHooksDisabled((env) => execFileSync('git', ['--git-dir', owner.common, 'update-ref', '-d', `refs/heads/${owner.branch}`, owner.ref], { stdio: 'pipe', env }));
			} }] : []),
		];
		// Preserve the existing journal plan, including resumptions past the first authority step.
		// Recheck after each awaited teardown before allowing the next destructive effect.
		const guardedSteps: RemovalStep[] = steps.map((step, index) => index === 0 ? step : ({ label: step.label, run: async () => {
			confirmAuthority();
			const outcome = await runRemovalStep(step);
			if (!outcome.ok) throw new Error(outcome.say);
		} }));
		const priorCwd = process.cwd();
		try {
			const result = await runWorkspaceCleanup({ branch: owner.branch, path: owner.path, journal, common: owner.common, survivor: owner.repository, recovery, steps: guardedSteps, merged: false, directory: owner.directory, say: (line) => appendFileSync(owner.log, `\n${line}`) });
			if (result.kind === 'complete') unlinkSync(receipt);
			return result;
		} finally {
			if (existsSync(priorCwd)) process.chdir(priorCwd);
		}
	} catch (error) {
		return { kind: 'incomplete', journal, reason: `disposable workspace release: ${error instanceof Error ? error.message : String(error)}` };
	}
}

/** Allocate, set up and admit required dependencies; no round scaffolding or behavioral skills run. */
export async function acquireDisposableWorkspace(input: DisposableWorkspaceInput): Promise<DisposableWorkspaceResult> {
	let receipt: string | null = null;
	try {
		const repository = resolve(input.repository);
		const { common, receipt: ownerFile, journal } = workspaceLocations(repository, input.branch);
		receipt = ownerFile;
		const lock = acquireProcessLock(`${receipt}.lock`);
		if (lock.kind === 'refused') return { kind: 'refused', why: lock.why, receipt };
		let handedOff = false;
		try {
			if (existsSync(receipt) || existsSync(journal)) return { kind: 'refused', why: 'disposable workspace: interrupted ownership exists; recover it explicitly before a new allocation', receipt };
			execFileSync('git', ['check-ref-format', '--branch', input.branch], { cwd: repository, stdio: 'pipe' });
			const path = workspaceAllocationPath(repository, input.branch);
			const log = resolve(input.log);
			if (!diagnosticSurvivesWorkspace(path, log)) return { kind: 'refused', why: 'disposable workspace: diagnostics must survive physically outside the disposable checkout', receipt: null };
			if (existsSync(path) || spawnSync('git', ['--git-dir', common, 'show-ref', '--verify', '--quiet', `refs/heads/${input.branch}`]).status !== 1) return { kind: 'refused', why: 'disposable workspace: pre-existing or unavailable branch/path; no adoption is authorized', receipt: null };
			const ref = execFileSync('git', ['-C', repository, 'rev-parse', '--verify', `${input.ref}^{commit}`], { encoding: 'utf8', stdio: 'pipe' }).trim();
			mkdirSync(dirname(log), { recursive: true });
			let owner: WorkspaceOwner = { version: 1, repository, common, branch: input.branch, path, ref, project: input.project.name, token: randomUUID(), directory: null, allocated: false, log };
			// Worktrunk refuses even an empty precreated destination. Publish intent first; only a
			// confirmed allocation grants directory identity. Lost responses retain unknown ownership.
			writeWorkspaceOwner(receipt, owner);
			try {
				const allocation = await allocateWorkspace({ repository, branch: input.branch, ref, log });
				if (allocation.kind === 'refused') throw new Error(allocation.why);
				owner = { ...owner, allocated: true, directory: workspaceDirectoryIdentity(path) };
				writeWorkspaceOwner(receipt, owner);
				const context = workspaceContext(owner);
				await input.project.setup(context);
				for (const file of input.probeFiles) {
					const target = scratchDestination(path, file);
					mkdirSync(dirname(target), { recursive: true });
					copyFileSync(join(repository, file), target);
				}
				const dependencies = await input.project.acquire(context);
				if (dependencies.kind === 'refused') throw new Error(dependencies.why);
				let released: Promise<WorkspaceCleanupResult> | undefined;
				let activeDiagnostic: Promise<WorkspaceDiagnosticResult> | undefined;
				const runDiagnostic = (command: WorkspaceDiagnosticCommand): Promise<WorkspaceDiagnosticResult> => {
					if (released || activeDiagnostic) return Promise.resolve({ kind: 'unavailable', why: 'disposable workspace: diagnostic already started or release requested' });
					activeDiagnostic = (async (): Promise<WorkspaceDiagnosticResult> => {
						let execution: CheckProcessResult | null = null;
						try {
							confirmWorkspaceOwner(owner, ownerFile);
							const id = randomUUID();
							owner = { ...owner, diagnostic: { kind: 'pending', id } };
							writeWorkspaceOwner(ownerFile, owner);
							execution = await runCheckProcess(command.executable, [...command.args], { cwd: path, worktree: path, env: command.env, shell: false, maxBuffer: 64 * 1024 * 1024, signal: dependencies.signal });
							confirmWorkspaceOwner(owner, ownerFile);
							const output = `\n--- baseline diagnostic output ${id} ---\n${execution.stdout}${execution.stderr}\n--- exit ${execution.status} ---\n`;
							const fallback = diagnosticFallback(owner, id);
							mkdirSync(dirname(fallback), { recursive: true });
							writeFileSync(`${fallback}.tmp`, output);
							renameSync(`${fallback}.tmp`, fallback);
							owner = { ...owner, diagnostic: { kind: 'confirmed', id, digest: createHash('sha256').update(output).digest('hex') } };
							writeWorkspaceOwner(ownerFile, owner);
							owner = retainWorkspaceDiagnostic(owner, ownerFile);
							return { kind: 'retained', execution };
						} catch (error) {
							const why = `disposable workspace: diagnostic retention failed (${error instanceof Error ? error.message : String(error)})`;
							return execution === null ? { kind: 'unavailable', why } : { kind: 'retention-failed', execution, why };
						}
					})();
					return activeDiagnostic;
				};
				const release = () => released ??= (async () => {
					try {
						await activeDiagnostic;
						confirmWorkspaceOwner(owner, ownerFile);
						confirmWorkspaceCheckout(owner);
						if (owner.diagnostic && owner.diagnostic.kind !== 'retained') return { kind: 'incomplete', journal, reason: 'disposable workspace: diagnostic retention incomplete; recover explicitly before teardown' } as const;
						const gap = reconcileCheckProcesses(owner.path);
						if (gap) return { kind: 'refused', journal, reason: gap } as const;
						const why = await dependencies.release();
						if (why) return { kind: 'incomplete', journal, reason: why } as const;
						return await releaseWorkspace(owner, input.project, ownerFile, journal);
					} catch (error) {
						return { kind: 'refused', journal, reason: `disposable workspace release: ${error instanceof Error ? error.message : String(error)}` } as const;
					} finally { lock.release(); }
				})();
				handedOff = true;
				return { kind: 'ready', workspace: { context, ref, receipt: ownerFile, dependencies, runDiagnostic, release } };
			} catch (error) {
				const why = error instanceof Error ? error.message : String(error);
				appendFileSync(log, `\ndisposable workspace acquisition failed: ${why}\n`);
				const cleanup = await releaseWorkspace(owner, input.project, receipt, journal);
				return { kind: 'refused', why, receipt: cleanup.kind === 'complete' ? null : receipt, cleanup };
			}
		} finally { if (!handedOff) lock.release(); }
	} catch (error) {
		return { kind: 'refused', why: `disposable workspace: ${error instanceof Error ? error.message : String(error)}`, receipt };
	}
}

/** Unknown repository discovery has no truthful cleanup journal location. */
export type DisposableWorkspaceRecoveryResult = WorkspaceCleanupResult | { readonly kind: 'refused'; readonly journal: null; readonly reason: string };

/** Recover confirmed fallback output before teardown; pending output remains uncertain, never rerun. */
export async function recoverDisposableWorkspace({ repository, branch, project }: { readonly repository: string; readonly branch: string; readonly project: WorkspaceProject }): Promise<DisposableWorkspaceRecoveryResult> {
	let locations: ReturnType<typeof workspaceLocations>;
	try { locations = workspaceLocations(resolve(repository), branch); }
	catch (error) { return { kind: 'refused', journal: null, reason: `disposable workspace recovery: repository unavailable (${error instanceof Error ? error.message : String(error)})` }; }
	const lock = acquireProcessLock(`${locations.receipt}.lock`);
	if (lock.kind === 'refused') return { kind: 'refused', journal: locations.journal, reason: lock.why };
	try {
		if (!existsSync(locations.receipt)) return { kind: 'refused', journal: locations.journal, reason: 'disposable workspace: no acquisition receipt; refusing adoption' };
		const owner = readWorkspaceOwner(locations.receipt);
		if (!owner || owner.repository !== resolve(repository) || owner.common !== locations.common || owner.branch !== branch || owner.project !== project.name || resolve(owner.path) !== resolve(workspaceAllocationPath(repository, branch))) return { kind: 'refused', journal: locations.journal, reason: 'disposable workspace: invalid or mismatched acquisition receipt; original authority retained' };
		confirmWorkspaceOwner(owner, locations.receipt);
		confirmWorkspaceCheckout(owner);
		const gap = reconcileCheckProcesses(owner.path);
		if (gap) return { kind: 'refused', journal: locations.journal, reason: gap };
		const retained = retainWorkspaceDiagnostic(owner, locations.receipt);
		return await releaseWorkspace(retained, project, locations.receipt, locations.journal);
	} catch (error) {
		return { kind: 'refused', journal: locations.journal, reason: `disposable workspace recovery: ${error instanceof Error ? error.message : String(error)}` };
	} finally { lock.release(); }
}
