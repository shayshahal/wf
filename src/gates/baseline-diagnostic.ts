// A non-round consumer of workspace ownership. Diagnostic meaning belongs to its caller.
import { acquireDisposableWorkspace } from '../worktrees/disposable-workspace.ts';
import type { DisposableWorkspaceInput } from '../worktrees/disposable-workspace.ts';
import type { WorkspaceCleanupResult } from '../worktrees/workspace-cleanup.ts';
import type { CheckProcessResult } from './check-process.ts';

/** Literal native argv runs without a shell; environment is explicit and is never inferred from a live round. */
export type BaselineDiagnosticInput = DisposableWorkspaceInput & {
	readonly command: { readonly executable: string; readonly args: readonly string[]; readonly env: NodeJS.ProcessEnv };
};

/** Observed exit/readiness/release are separate facts, not a certificate that the product claim is true. */
export type BaselineDiagnosticResult =
	| { readonly kind: 'observed'; readonly execution: CheckProcessResult; readonly retention: { readonly kind: 'retained' } | { readonly kind: 'failed'; readonly why: string }; readonly disposition: 'none' | 'owned' | 'borrowed'; readonly ref: string; readonly path: string; readonly receipt: string; readonly cleanup: WorkspaceCleanupResult }
	| { readonly kind: 'unavailable'; readonly why: string; readonly receipt: string | null; readonly cleanup?: WorkspaceCleanupResult };

/** Run one lease-owned baseline diagnostic and release after durable retention; no ticket, class or workflow dispatch is required. */
export async function runBaselineDiagnostic(input: BaselineDiagnosticInput): Promise<BaselineDiagnosticResult> {
	const acquired = await acquireDisposableWorkspace(input);
	if (acquired.kind === 'refused') return { ...acquired, kind: 'unavailable' };
	const workspace = acquired.workspace;
	const diagnostic = await workspace.runDiagnostic(input.command);
	const cleanup = await workspace.release();
	if (diagnostic.kind === 'unavailable') return { kind: 'unavailable', why: diagnostic.why, receipt: workspace.receipt, cleanup };
	const retention = diagnostic.kind === 'retained' ? { kind: 'retained' } as const : { kind: 'failed', why: diagnostic.why } as const;
	return { kind: 'observed', execution: diagnostic.execution, retention, disposition: workspace.dependencies.disposition, ref: workspace.ref, path: workspace.context.worktree, receipt: workspace.receipt, cleanup };
}
