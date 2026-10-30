import type { RemovalStep } from '../seams.ts';

/** Workspace identity is allocated by the lifecycle owner; log is outside the disposable checkout. */
export type WorkspaceProjectContext = {
	readonly worktree: string;
	readonly branch: string;
	readonly slug: string;
	readonly port: number;
	readonly log: string;
};

/** Readiness is dependency admission, not product verification; release never owns a borrowed resource. */
export type WorkspaceDependencyResult =
	| { readonly kind: 'ready'; readonly disposition: 'none' | 'owned' | 'borrowed'; readonly release: () => Promise<string | null>; readonly signal?: AbortSignal }
	| { readonly kind: 'refused'; readonly why: string };

/** Explicit project binding; workflow policy and runtime project selection stay outside this contract. */
export type WorkspaceProject = {
	readonly name: string;
	readonly setup: (context: WorkspaceProjectContext) => Promise<void>;
	readonly acquire: (context: WorkspaceProjectContext) => Promise<WorkspaceDependencyResult>;
	readonly teardown: (context: WorkspaceProjectContext) => RemovalStep[];
};
