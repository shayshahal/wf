// t3code.ts — T3 Code owns the native tools; wf prepares their handoff, not an MCP session.
// 2026-10-19: T3's bundle sets T3CODE_PROJECT_ROOT only for project scripts, to the project root,
// not the thread worktree. Only thread-scoped Pi/ACP credentials establish native tool ownership.
import { basename } from 'node:path';
import type { NativePresentation, Seams } from '../seams.ts';
import { decisionSheetGuidance } from '../round/presentation.ts';
import { readT3BoundWorkspace } from './t3-workspace.ts';

const insideT3Session = (env: NodeJS.ProcessEnv) => Boolean(
	(env.T3_MCP_URL?.trim() && env.T3_MCP_BEARER_TOKEN?.trim())
	|| (env.T3_ACP_MCP_ENDPOINT?.trim() && env.T3_ACP_MCP_AUTHORIZATION?.trim()),
);

/** Select portable host capabilities without changing the round's configured entry or machine. */
export function t3SessionSeams(env: NodeJS.ProcessEnv): Pick<Seams, 'presentation' | 'sessionWorkspace' | 'workspaceHandoff'> {
	return {
		presentation: t3Presentation(env),
		sessionWorkspace: insideT3Session(env) ? () => readT3BoundWorkspace(env) : null,
		workspaceHandoff: t3WorkspaceHandoff(env),
	};
}

/** Select native presentation from T3 session credentials; never output those credentials. */
export function t3Presentation(env: NodeJS.ProcessEnv): NativePresentation | null {
	if (!insideT3Session(env)) return null;
	return {
		guidance: [
			'## Native presentation — T3 Code',
			'Use the tools exposed in this session; discover their names and input schemas before calling them.',
			// 2026-10-19: JX-1426 linked .wf/ from a separate wf worktree into T3's chat workspace.
			'Workspace binding: this thread\'s worktree_status path must be the round checkout; verify its actual branch with Git. A shell cd does not move chat/Files. If mismatched, open/resume a session bound to that exact checkout before continuing.',
			'wf owns worktree creation and cleanup. Bind with thread_launch using workspaceStrategy.type existing_worktree and its exact worktreePath; discover the actual tool schema first. A running T3 thread cannot rebind. Keep the wf round branch unchanged: omit optional branch metadata, which T3 may auto-rename for temporary-looking names.',
			'Existing-worktree launch reruns T3 project setup scripts: verify they are empty or safely repeatable before launching. Resume never runs wf new or repeats round initialization.',
			'Before reap, finish posting and archive/leave all round-bound threads. Launch a root-workspace cleanup session and run reap there; moving this shell is insufficient. The binding check knows only the calling thread, not sibling threads.',
			'Keep absolute paths in handoffs and verify each file target exists before linking it. Native round presentation belongs in the session bound to that same worktree.',
			'Plans/agreements and reviews: show the compact decision sheet and relevant generated view inline in this chat. Use html_preview to inspect layout/console, then html_render before asking for a verdict. A file path or printed handoff is not a presentation.',
			'Live app: preview_open, then preview_navigate to the project URL or its environment-port target. Keep the returned tabId for subsequent actions; operate only your own tab.',
			'Use a native file/diff view when available. If a tool is absent or fails, show the exact markdown and verified artifact paths and name the limitation.',
			'Read the files before presenting them. A visual is a presentation of those files, not new scope, proof of a live app, or approval.',
		].join('\n'),
		reviewHandoff: ({ kind, document, pages, reviewFile, worktree }) => [
			`native review handoff: T3 Code — ${kind} (not opened by wf)`,
			`worktree: ${worktree}`,
			`read: ${document}`,
			...pages.map((page) => `view: ${page}`),
			`record: ${reviewFile}`,
			decisionSheetGuidance(),
			'Present a compact decision sheet and the relevant visual using this session\'s native tools. At T1 show the full Observed + Agreed material, including exclusions, choices and unrequested additions; keep source references accessible.',
			...(kind === 'review' ? ['At T2 show the diff against the record\'s base, assessment findings, manual checks, evidence and unmeasured behavior. Use the native diff view if available.'] : []),
			'For HTML, read the page and resolve its local views/images before rendering; if native rendering cannot carry them faithfully, show those artifacts separately and retain the exact markdown.',
			'After the person actually rules, retain the identity header and append a note naming what was shown, their comments and their exact verdict in the record. Until then leave it pending; a generated control or tool success is not approval.',
		].join('\n'),
	};
}

/** Prepare an existing-checkout launch for the owning T3 session; wf executes no native write. */
export function t3WorkspaceHandoff(env: NodeJS.ProcessEnv): Seams['workspaceHandoff'] {
	if (!insideT3Session(env)) return null;
	return (worktree) => [
		'workspace handoff: T3 Code (not opened by wf)',
		`wf-owned checkout: ${worktree}`,
		'Before launch, save the complete request and scope answers in the round folder\'s TICKET.md (folder and entry are recorded in .wf/state.json).',
		'Discover the session\'s thread_launch input schema. Verify T3 project setup scripts are empty or safely repeatable: existing-worktree launch runs them again.',
		'Launch on this existing checkout, not a new worktree. Omit optional branch metadata so T3 preserves the Git branch. Carry any unsaved context into the launch message.',
		JSON.stringify({
			title: `wf ${basename(worktree)}`,
			workspaceStrategy: { type: 'existing_worktree', worktreePath: worktree },
			message: `Resume the existing wf round at ${worktree}; do not create or initialize another checkout. Read .wf/state.json for its configured entry and round folder, then the saved TICKET.md and round files. Verify the native workspace binding and actual Git branch, then run the recorded wf entry's next command from this checkout.`,
		}, null, 2),
		'Continue only in the newly bound thread. This handoff is not evidence that it was launched.',
	].join('\n');
}
