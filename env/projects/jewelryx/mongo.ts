// env/projects/jewelryx/mongo.ts — Shay's machine: the MongoDB container a worktree made before
// 2026-10-04 has of its own, and what removes it (reap, index.ts). Worktrees now keep their database
// in the repo's own MongoDB (the kit's, projects/jewelryx/index.ts); once no jewelryx-mongo-<slug>
// container is left, this file goes.
import type { RemovalStep } from '../../../src/seams.ts';

export const containerOf = (slug: string): string => `jewelryx-mongo-${slug}`;
export const volumeOf = (slug: string): string => `jewelryx-wt-mongo-${slug}`;
export const composeProjectOf = (slug: string): string => `jewelryx-wt-${slug}`;

// Pure: what removing one leaves behind, in order. Each step tolerates "already gone". The compose
// network outlives its container; 23 of them exhausted docker's address pools and the next `wf new`
// failed: "all predefined address pools have been fully subnetted" (3187601171). -v: the mongo image
// declares /data/configdb a volume too, an anonymous one per container, which a plain rm leaves; 137
// had piled up (2026-10-03).
export function mongoTeardown(slug: string): RemovalStep[] {
	return [
		{ label: 'docker rm mongo', cmd: 'docker', args: ['rm', '-f', '-v', containerOf(slug)] },
		{ label: 'docker volume rm', cmd: 'docker', args: ['volume', 'rm', volumeOf(slug)] },
		{ label: 'docker network rm', cmd: 'docker', args: ['network', 'rm', `${composeProjectOf(slug)}_default`] },
	];
}
