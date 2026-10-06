// Herdr adapter: who a worktree belongs to (seams.opener). Inside a Herdr pane every agent's shell
// carries its pane and, under pi, its session; herdr-pi-tree matches them against `wf status --json`
// to draw the worktree under the agent that opened it. The session is the steadier key: a pane moved
// to another workspace gets a new id. The step it used to push as a pane summary never reached the
// sidebar (`herdr pane report-metadata` refused it: no pane id and no --source, measured 2026-10-06).
export function herdrOpener(): Record<string, string> | null {
	const opener: Record<string, string> = {};
	if (process.env.HERDR_PANE_ID) opener.pane = process.env.HERDR_PANE_ID;
	if (process.env.PI_SESSION_ID) opener.session = process.env.PI_SESSION_ID;
	return Object.keys(opener).length ? opener : null;
}
