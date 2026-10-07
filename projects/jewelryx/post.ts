#!/usr/bin/env node
// wf post — post the round's filled tracker note (JIRA.md) to Jira: per `## <key>` section not yet
// `(posted)`, attach the round's before/after pictures to the issue, post the section as a comment
// with those pictures shown in it, set *Fixed in Local*, and mark the heading. The round skill fills
// the Hebrew text and shows it to the user first; this does the rest, the same way every round.
// JX-268 (BJEW-562, 2026-10-07): the post was hand-made from MCP calls, the pictures were left for
// the user to attach, and the reap after it deleted them. Atlassian's MCP cannot put a picture in a
// comment; REST v2 can: wiki markup `!name|thumbnail!` shows an attachment of the issue (tried on a
// throwaway issue, 2026-10-07: Jira stored it as the comment's own media).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proofPairs } from '../../src/gates/review-format.ts';
import { readState, toplevelOf } from '../../src/round/state.ts';

const SITE = 'https://raynw.atlassian.net';
const DELIVERED = 'Fixed in Local';

export type Section = { key: string; posted: boolean; text: string };

// Pure: the note's sections, each the lines under its `## <key>` heading, without the HTML comment.
export function sectionsOf(note: string): Section[] {
	const parts = note.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split(/^## /m).slice(1);
	return parts.map((p) => {
		const [head, ...rest] = p.split('\n');
		const [key, ...tail] = head.trim().split(/\s+/);
		return { key, posted: tail.join(' ').includes('(posted)'), text: rest.join('\n').trim() };
	});
}

// Pure: why a section cannot be posted yet, or null. The scaffold's <...> lines are for the round to fill.
export function unfilled(s: Section): string | null {
	const left = s.text.split('\n').filter((l) => /<[^>]*>/.test(l));
	return left.length ? `${s.key}: not filled: ${left.join(' | ')}` : null;
}

export const prNumberOf = (text: string) => /\/pull\/(\d+)/.exec(text)?.[1] ?? null;

// Pure: the round's pictures as they are named on the issue, under the PR's number so a second run
// knows its own (`<pr>-before-1.png`), paired by number.
export function picturesOf(pr: string, names: string[]) {
	return proofPairs(names).map((p) => ({
		before: p.before ? { file: p.before, as: `${pr}-${p.before}` } : undefined,
		after: p.after ? { file: p.after, as: `${pr}-${p.after}` } : undefined,
	}));
}

// Pure: the comment, in Jira wiki markup (the REST v2 body): the section's lines, then each pair.
export function commentBody(text: string, pictures: ReturnType<typeof picturesOf>): string {
	const shown = pictures.flatMap((p) => [
		...(p.before ? ['לפני:', `!${p.before.as}|thumbnail!`] : []),
		...(p.after ? ['אחרי:', `!${p.after.as}|thumbnail!`] : []),
	]);
	return shown.length ? `${text}\n\n${shown.join('\n')}` : text;
}

// Pure: the note with one more heading marked.
export const markPosted = (note: string, key: string) =>
	note.replace(new RegExp(`^## ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm'), `## ${key} (posted)`);

async function jira(auth: string, path: string, init: RequestInit = {}) {
	const r = await fetch(`${SITE}/rest/api/${path}`, { ...init, headers: { authorization: `Basic ${auth}`, accept: 'application/json', ...init.headers } });
	if (!r.ok) throw new Error(`Jira ${init.method ?? 'GET'} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
	return r.status === 204 ? null : r.json();
}

export async function runPost(): Promise<void> {
	const { JIRA_EMAIL: email, JIRA_TOKEN: token } = process.env;
	if (!email || !token) {
		console.error('wf post: this session has no JIRA_EMAIL or JIRA_TOKEN (set them, then start a new session and "resume <id>"); nothing posted');
		process.exit(1);
	}
	const auth = Buffer.from(`${email}:${token}`).toString('base64');
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const notePath = state?.note ? join(toplevel, state.note) : null;
	if (!notePath || !existsSync(notePath)) {
		console.error('wf post: no tracker note recorded for this round (wf deliver writes it)');
		process.exit(1);
	}
	let note = readFileSync(notePath, 'utf8');
	const todo = sectionsOf(note).filter((s) => !s.posted);
	const gaps = todo.map(unfilled).filter((g) => g !== null);
	if (gaps.length) {
		console.error(`wf post: fill the note first (${state!.note}); nothing posted\n${gaps.join('\n')}`);
		process.exit(1);
	}
	const proofDir = join(toplevel, state!.folder ?? '', 'proof');
	const names = existsSync(proofDir) ? readdirSync(proofDir) : [];
	for (const s of todo) {
		const pr = prNumberOf(s.text);
		if (!pr) {
			console.error(`wf post: ${s.key} has no PR url; nothing posted for it`);
			process.exit(1);
		}
		const issue = await jira(auth, `2/issue/${s.key}?fields=attachment,comment`);
		// A session can die between the post and the mark: a comment with this PR's url is that post.
		const already = issue.fields.comment.comments.some((c: { body: string }) => c.body.includes(`/pull/${pr}`));
		const pictures = picturesOf(pr, names);
		if (!already) {
			const have = new Set(issue.fields.attachment.map((a: { filename: string }) => a.filename));
			for (const pic of pictures.flatMap((p) => [p.before, p.after]).filter((p) => p !== undefined)) {
				if (have.has(pic.as)) continue;
				const form = new FormData();
				form.append('file', new Blob([readFileSync(join(proofDir, pic.file))], { type: 'image/png' }), pic.as);
				await jira(auth, `3/issue/${s.key}/attachments`, { method: 'POST', body: form, headers: { 'X-Atlassian-Token': 'no-check' } });
			}
			await jira(auth, `2/issue/${s.key}/comment`, { method: 'POST', body: JSON.stringify({ body: commentBody(s.text, pictures) }), headers: { 'content-type': 'application/json' } });
		}
		const { transitions } = await jira(auth, `3/issue/${s.key}/transitions`);
		const to = transitions.find((t: { to: { name: string } }) => t.to.name === DELIVERED);
		if (!to) throw new Error(`wf post: ${s.key} has no transition to ${DELIVERED}`);
		await jira(auth, `3/issue/${s.key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: to.id } }), headers: { 'content-type': 'application/json' } });
		note = markPosted(note, s.key);
		writeFileSync(notePath, note);
		const count = pictures.flatMap((p) => [p.before, p.after]).filter(Boolean).length;
		console.log(`${s.key}: ${already ? 'already posted' : `posted with ${count} picture(s)`}, ${DELIVERED} — ${SITE}/browse/${s.key}`);
	}
}

if (process.argv[1]?.endsWith('post.ts')) await runPost();
