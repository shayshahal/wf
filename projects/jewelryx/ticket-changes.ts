// ticket-changes.ts — what changed on a tracker issue after the round began: the description (or
// title) edited, a comment added or edited, by anyone but the round's own earlier post. wf post and
// wf review refuse on any of it. JX-810 (2026-10-12): the round's TICKET.md was fetched ~12:00; at
// 13:18, 13:26 and 13:43 the product owner corrected the requirement in a comment and rewrote the
// description; the round built to the old text, passed T2, merged, and at 15:14 `wf post` said
// "תוקן ✅" and set Fixed in Local. Nothing in wf looked at the issue between the fetch and the post.
import { hasPrUrl, prUrlOf } from './post-completion.ts';
import type { State } from '../../src/round/state.ts';

export type Change = { what: 'description edited' | 'title edited' | 'comment added' | 'comment edited'; who: string; at: string };
type Who = { displayName?: string };
export type History = { created: string; author?: Who; items: { field: string }[] };
export type IssueComment = { body: string; created: string; updated?: string; author?: Who };

const EDITED_FIELDS: Record<string, Change['what']> = { description: 'description edited', summary: 'title edited' };

// Pure: Jira's `2026-10-12T13:43:02.638+0300` as epoch ms (the offset has no colon; Date wants one).
export const jiraTime = (s: string) => Date.parse(s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));

// Pure: the moment the round's reading of the ticket dates from: the last recorded re-read, else the
// round's first step. wf records no fetch time and `wf new` writes no start; the first step is the
// earliest stamp every round has (a ticket edited between the fetch and that step is not seen).
// null: the round recorded neither.
export function baselineOf(state: State | null): string | null {
	const stamps = [state?.ticket_read, state?.history?.[0]?.at].filter((t): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t)));
	return stamps.length ? stamps.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}

// Pure: whether a comment is the round's own earlier post of this section (wf post's comment starts
// with the section's first line and carries the PR's url), so a session that died after the post is
// not refused for its own comment.
export function isOwnPost(body: string, sectionText: string): boolean {
	const norm = (t: string) => t.replace(/\r\n/g, '\n').trim();
	const first = norm(sectionText).split('\n')[0];
	const url = prUrlOf(sectionText);
	return url !== null && first !== '' && norm(body).startsWith(first) && hasPrUrl(body, url);
}

// Pure: the edits and comments after `since`, oldest first. A comment edited after `since` counts
// too (the words it carried are not the words the round read).
export function changesSince(o: { since: string; histories: History[]; comments: IssueComment[]; own?: (body: string) => boolean }): Change[] {
	const after = Date.parse(o.since);
	const changes: Change[] = [];
	for (const h of o.histories) {
		if (jiraTime(h.created) <= after) continue;
		for (const item of h.items) {
			const what = EDITED_FIELDS[item.field];
			if (what) changes.push({ what, who: h.author?.displayName ?? 'unknown', at: h.created });
		}
	}
	for (const c of o.comments) {
		if (o.own?.(c.body)) continue;
		const who = c.author?.displayName ?? 'unknown';
		if (jiraTime(c.created) > after) changes.push({ what: 'comment added', who, at: c.created });
		else if (c.updated && jiraTime(c.updated) > after) changes.push({ what: 'comment edited', who, at: c.updated });
	}
	return changes.sort((a, b) => jiraTime(a.at) - jiraTime(b.at));
}

// Pure: the refusal text for the issues that changed, or null when none did.
export function refusalText(since: string, found: { key: string; changes: Change[] }[], then: string): string | null {
	const changed = found.filter((f) => f.changes.length);
	if (!changed.length) return null;
	const lines = changed.flatMap((f) => [`${f.key} changed since the round began (${since}):`, ...f.changes.map((c) => `  - ${c.who}, ${c.at}: ${c.what}`)]);
	return `${lines.join('\n')}\nThe round's TICKET.md and agreement may no longer say what was asked. A person reads the changes; TICKET.md is re-fetched (and the agreement revised if the requirement moved); then \`wf post --ticket-reread\` records it. After that, ${then}.`;
}

// The issue's changes after `since`. `get` is wf post's Jira GET (REST v2 path in, JSON out).
export async function changesOf(get: (path: string) => Promise<any>, key: string, since: string, own?: (body: string) => boolean): Promise<Change[]> {
	const issue = await get(`2/issue/${key}?fields=comment`);
	const histories: History[] = [];
	for (let startAt = 0; ;) {
		const page = await get(`2/issue/${key}/changelog?startAt=${startAt}&maxResults=100`);
		histories.push(...page.values);
		startAt += page.values.length;
		if (page.isLast || !page.values.length) break;
	}
	return changesSince({ since, histories, comments: issue.fields.comment.comments, own });
}
