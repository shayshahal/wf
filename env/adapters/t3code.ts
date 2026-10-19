// t3code.ts — T3 Code owns the native tools; wf prepares their handoff, not an MCP session.
// 2026-10-19: the terminal probe exposed T3CODE_PROJECT_ROOT, not MCP credentials. That proves
// terminal detection, not the agent's environment. Keep tool execution in the session that owns it.
import type { NativePresentation } from '../../src/seams.ts';

/** Select the T3 Code adapter from inherited markers; credentials are neither read nor printed. */
export function t3Presentation(env: NodeJS.ProcessEnv): NativePresentation | null {
	if (!env.T3CODE_PROJECT_ROOT?.trim() && !env.T3_MCP_URL?.trim()) return null;
	return {
		guidance: [
			'## Native presentation — T3 Code',
			'Use the tools exposed in this session; discover their names and input schemas before calling them.',
			'Generated views: html_preview to inspect layout/console, then html_render to show the person inline.',
			'Live app: preview_open, then preview_navigate to the project URL or its environment-port target. Keep the returned tabId for subsequent actions; operate only your own tab.',
			'Use a native file/diff view when available. If a tool is absent or fails, show the exact markdown and artifact paths and say which view is unavailable.',
			'Read the files before presenting them. A visual is a presentation of those files, not new scope, proof of a live app, or approval.',
		].join('\n'),
		reviewHandoff: ({ kind, document, pages, reviewFile, worktree }) => [
			`native review handoff: T3 Code — ${kind} (not opened by wf)`,
			`worktree: ${worktree}`,
			`read: ${document}`,
			...pages.map((page) => `view: ${page}`),
			`record: ${reviewFile}`,
			'Present a compact decision sheet and the relevant visual using this session\'s native tools. At T1 show the full Observed + Agreed material, including exclusions, choices and unrequested additions; keep source references accessible.',
			...(kind === 'review' ? ['At T2 show the diff against the record\'s base, assessment findings, manual checks, evidence and unmeasured behavior. Use the native diff view if available.'] : []),
			'For HTML, read the page and resolve its local views/images before rendering; if native rendering cannot carry them faithfully, show those artifacts separately and retain the exact markdown.',
			'After the person actually rules, retain the identity header and append a note naming what was shown, their comments and their exact verdict in the record. Until then leave it pending; a generated control or tool success is not approval.',
		].join('\n'),
	};
}
