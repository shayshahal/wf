// refusal.ts — the one thing a refusal can say about itself: whether it was about the round at all.
// A wf command that exits non-zero inside a round is written to .wf/events.log (run.ts), and reap's
// line counts those as "where wf or the person had to step in" — so the round agent's own command
// mistakes were counted as wf stepping in (BJEW-461, 2026-10-06: 3 of its 7 were `usage: wf decide`
// and `invalid step ""`). The sites where wf never read the round — argv it will not take, a worktree
// with no round in it — say so here.
// The kind travels in a module variable, not a return: run.ts writes the line from a synchronous
// 'exit' hook, and process.exit does not unwind to give a caller anything back.
export type RefusalKind = 'caller';

let kind: RefusalKind | null = null;

// Mark this refusal as not the round's, then exit 2 (the code every one of these sites already used).
// Call it where wf has not read the round yet.
export function refuseCaller(): never {
	kind = 'caller';
	process.exit(2);
}

export const refusalKind = (): RefusalKind | null => kind;
