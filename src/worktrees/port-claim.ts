// port-claim.ts — which base port a round's stack uses. The branch hashes to one (ports.ts), and
// nothing checked that something else was not holding it or its project's other ports: 2026-11-02,
// a round's stack failed to start on a port another process held, with no word of why. A round's
// port is the one recorded in its state when it had to move, else the hash; it moves to the next free
// slot only when a port is held by something that is not the round's own stack, and stays moved.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { moveStack, stackPorts, stackUrls } from '../project.ts';
import { readState, writeState } from '../round/state.ts';
import { roundPort } from './round-port.ts';
import { basePortForBranch } from './worktree-registry.ts';

export { roundPort };

const FIRST_BASE = 10000;
const SLOTS = 10000;

/** Whether nothing listens on `port` on either loopback address (Windows lets both be bound apart). */
export async function portIsFree(port: number): Promise<boolean> {
	const free = (host: string) => new Promise<boolean>((resolve) => {
		const server = createServer();
		server.once('error', (e: NodeJS.ErrnoException) => resolve(e.code !== 'EADDRINUSE' && e.code !== 'EACCES'));
		server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
	});
	return (await free('127.0.0.1')) && (await free('::1'));
}

export type Free = (port: number) => Promise<boolean>;

/** The first base, from `from` on and wrapping within the hash range, whose every port is free. */
export async function firstFreeBase({ from, free = portIsFree, ports = stackPorts }: { from: number; free?: Free; ports?: (base: number) => number[] }): Promise<{ base: number; held: number[] }> {
	let held: number[] = [];
	for (let i = 0; i < SLOTS; i++) {
		const base = FIRST_BASE + ((from - FIRST_BASE + i) % SLOTS);
		const busy = (await Promise.all(ports(base).map(async (p) => ((await free(p)) ? null : p)))).filter((p): p is number => p !== null);
		if (i === 0) held = busy;
		if (busy.length === 0) return { base, held };
	}
	throw new Error(`no free port slot: every base from ${FIRST_BASE} to ${FIRST_BASE + SLOTS - 1} has a port in use`);
}

export const movedLine = (from: number, held: number[], to: number) => `wf: port${held.length > 1 ? 's' : ''} ${held.join(', ')} held by another process; this round's stack moves from base ${from} to ${to}`;

/** At `wf new`, before the worktree exists: the base to give setup, and a line to print when it moved. */
export async function chooseNewPort(branch: string, free?: Free): Promise<{ port: number; moved: boolean; line: string | null }> {
	const hashed = basePortForBranch(branch);
	const { base, held } = await firstFreeBase({ from: hashed, free });
	return { port: base, moved: base !== hashed, line: base === hashed ? null : movedLine(hashed, held, base) };
}

/** The files that carry the round's old port: the project's, and the Browser pane's launch.json entries. */
async function rewriteAddresses({ worktree, slug, port }: { worktree: string; slug: string; port: number }): Promise<void> {
	await moveStack({ worktree, slug, port, folder: readState(worktree)?.folder });
	// new.ts imports this module, so it loads late.
	const { launchConfig, writeCloneLaunch } = await import('./new.ts');
	const urls = stackUrls({ slug, port });
	mkdirSync(join(worktree, '.claude'), { recursive: true });
	writeFileSync(join(worktree, '.claude', 'launch.json'), launchConfig(urls));
	writeCloneLaunch(slug, urls);
}

/**
 * At `wf serve`, when this round's own stack is not running: keep the round's port if its ports are
 * free, else move to the next free slot and record it. The files that carry the old port are rewritten.
 */
export async function claimRoundPort({ worktree, branch, slug, free, rewrite = rewriteAddresses }: { worktree: string; branch: string; slug: string; free?: Free; rewrite?: (o: { worktree: string; slug: string; port: number }) => Promise<void> }): Promise<{ port: number; line: string | null }> {
	const current = roundPort(worktree, branch);
	const { base, held } = await firstFreeBase({ from: current, free });
	if (base === current) return { port: current, line: null };
	writeState(worktree, () => ({ port: base }));
	await rewrite({ worktree, slug, port: base });
	return { port: base, line: `${movedLine(current, held, base)} (recorded in .wf/state.json)` };
}
