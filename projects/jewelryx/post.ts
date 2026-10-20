#!/usr/bin/env node
// wf post — post the round's filled tracker note (JIRA.md) to Jira: per `## <key>` section not yet
// `(posted)`, attach the proof/ pictures its `pictures:` line names to the issue, post the section as a
// comment with those pictures shown in it, and mark the heading. Only a confirmed merged delivery
// sets Fixed in Local. The round skill
// fills the Hebrew text and shows it to the user first; this does the rest, the same way every round.
// JX-268 (BJEW-562, 2026-10-07): the post was hand-made from MCP calls, the pictures were left for
// the user to attach, and the reap after it deleted them. Atlassian's MCP cannot put a picture in a
// comment; REST v2 can: wiki markup `!name|thumbnail!` shows an attachment of the issue (tried on a
// throwaway issue, 2026-10-07: Jira stored it as the comment's own media).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isProofImage, proofPairs } from '../../src/gates/review-format.ts';
import { readState, roundFile, toplevelOf, writeState } from '../../src/round/state.ts';
import type { State } from '../../src/round/state.ts';
import { baselineOf, changesOf, isOwnPost, jiraTime, refusalText } from './ticket-changes.ts';

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

// Pure: the file's picture type for the upload (proofPairs accepts png, jpg, jpeg and webp).
export const pictureType = (file: string) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

// JX-1392 (2026-10-14, #148): the post took every before-/after- picture in proof/ (15, superseded
// states among them) where the note meant after-1.png and after-2.png; undoing it took a hand comment
// edit and 13 attachment deletions. proof/ is the round's evidence, not what the reporter is shown: each
// section names its pictures on a `pictures:` line (or `pictures: none`), and nothing else goes up. The
// line lives in the note itself, so the choice survives an interrupted post and a resumed round.
const PICTURES_LINE = /^pictures:[ \t]*(.*)$/i;

// Pure: the section's text as the comment carries it, without its `pictures:` line.
export const commentText = (s: Section) => s.text.split('\n').filter((l) => !PICTURES_LINE.test(l)).join('\n').trim();

// Pure: the proof/ files a section names for the reporter, each once, in the order the comment shows
// them (by label, before then after); or why it cannot be posted. A missing line is refused, never
// read as "all of proof/"; `none` is an empty selection.
export function selectedPictures(s: Section, proofNames: string[]): { files: string[] } | { gap: string } {
	const lines = s.text.split('\n').map((l) => PICTURES_LINE.exec(l)).filter((m) => m !== null);
	if (lines.length !== 1) return { gap: `${s.key}: ${lines.length ? 'more than one pictures: line' : 'no pictures: line'}; name the proof/ pictures the reporter sees (pictures: after-1.png after-2.png), or write pictures: none` };
	const names = [...new Set(lines[0][1].split(/[\s,]+/).filter(Boolean).map((n) => n.replace(/^proof\//, '')))];
	if (names.length === 1 && names[0].toLowerCase() === 'none') return { files: [] };
	if (!names.length || names.some((n) => n.toLowerCase() === 'none')) return { gap: `${s.key}: pictures: names files or says none, not both and not neither` };
	const missing = names.filter((n) => !proofNames.includes(n));
	if (missing.length) return { gap: `${s.key}: pictures: ${missing.join(', ')} not in proof/` };
	const unlabeled = names.filter((n) => !proofPairs([n]).length);
	if (unlabeled.length) return { gap: `${s.key}: pictures: ${unlabeled.join(', ')} not named before-<label> or after-<label> (png, jpg, jpeg, webp); rename it in proof/ and here` };
	return { files: proofPairs(names).flatMap((p) => [p.before, p.after]).filter((n) => n !== undefined) };
}

// Pure: what goes up for a section, printed before anything does: the comment, the exact files, and
// the proof/ pictures that stay in the round.
export function previewOf(s: Section, files: string[], proofNames: string[]): string {
	const kept = proofNames.filter((n) => isProofImage(n) && !files.includes(n));
	return [
		`${s.key}: comment:`,
		...commentText(s).split('\n').map((l) => `  ${l}`),
		files.length ? `${s.key}: pictures (${files.length}): ${files.join(', ')}` : `${s.key}: pictures: none selected, the comment goes up with no picture`,
		...(kept.length ? [`${s.key}: not posted, kept as round evidence (${kept.length}): ${kept.join(', ')}`] : []),
	].join('\n');
}

// Pure: what the post attached, exactly. JX-1239 (2026-10-12): a post attached zero of a round's
// screenshots and said nothing about it.
export function pictureNotes(pictures: ReturnType<typeof picturesOf>): string {
	const attached = pictures.flatMap((p) => [p.before, p.after]).filter((p) => p !== undefined).map((p) => p.file);
	return `attached ${attached.length}${attached.length ? `: ${attached.join(', ')}` : ': none selected'}`;
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

export async function jira(auth: string, path: string, init: RequestInit = {}) {
	const r = await fetch(`${SITE}/rest/api/${path}`, { ...init, headers: { authorization: `Basic ${auth}`, accept: 'application/json', ...init.headers } });
	if (!r.ok) throw new Error(`Jira ${init.method ?? 'GET'} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
	return r.status === 204 ? null : r.json();
}

const JIRA_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

type Own = (key: string) => (body: string) => boolean;
const noOwn: Own = () => () => false;

// What changed on the round's tickets after it began. Throws when it cannot look (no credentials,
// Jira down, no start time): wf post must not post unchecked, and wf review's caller says so.
// `own` tells a section's own earlier post, so a session that died between the post and the mark
// is not refused for its comment.
async function ticketChangesOf(state: State | null, keys: string[], own: Own) {
	const { JIRA_EMAIL: email, JIRA_TOKEN: token } = process.env;
	if (!email || !token) throw new Error('this session has no JIRA_EMAIL or JIRA_TOKEN');
	const since = baselineOf(state);
	if (!since) throw new Error('the round recorded no first step, so there is no start time to compare the ticket against');
	const auth = Buffer.from(`${email}:${token}`).toString('base64');
	const checkedAt = new Date().toISOString();
	const found = [];
	for (const key of keys.filter((k) => JIRA_KEY.test(k))) found.push({ key, changes: await changesOf((path) => jira(auth, path), key, since, own(key)) });
	return { since, checkedAt, found };
}

// The refusal for a round whose tickets changed after it began, or null.
export async function ticketRefusal(state: State | null, keys: string[], then: string, own: Own = noOwn): Promise<string | null> {
	const { since, found } = await ticketChangesOf(state, keys, own);
	return refusalText(since, found, then);
}

const roundKeys = (state: State | null, sections: Section[]) => [...new Set([...(state?.ids ?? (state?.id ? [state.id] : [])), ...sections.map((s) => s.key)])];
const ownOf = (sections: Section[]): Own => (key) => {
	const s = sections.find((n) => n.key === key);
	return (body) => s !== undefined && isOwnPost(body, commentText(s), prNumberOf(s.text));
};

// wf post --ticket-reread: a person has read what changed on the ticket and the round's paperwork
// was updated. Recorded in state (`ticket_read`), only when TICKET.md was written after the last change;
// the time recorded is the one the check began, so a change made while it ran is still seen next time.
async function runTicketReread(): Promise<void> {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const sections = state?.note && existsSync(join(toplevel, state.note)) ? sectionsOf(readFileSync(join(toplevel, state.note), 'utf8')) : [];
	let seen;
	try {
		seen = await ticketChangesOf(state, roundKeys(state, sections), ownOf(sections));
	} catch (e) {
		console.error(`wf post --ticket-reread: could not read the ticket: ${(e as Error).message}`);
		process.exit(1);
	}
	const changes = seen.found.flatMap((f) => f.changes.map((c) => ({ key: f.key, ...c })));
	if (!changes.length) {
		console.log(`wf post --ticket-reread: nothing changed since ${seen.since}; nothing to record`);
		return;
	}
	const latest = Math.max(...changes.map((c) => jiraTime(c.at)));
	const ticketFile = roundFile(toplevel, 'TICKET.md');
	const written = existsSync(ticketFile) ? statSync(ticketFile).mtimeMs : 0;
	if (written <= latest) {
		console.error(`wf post --ticket-reread: ${ticketFile} was last written ${written ? new Date(written).toISOString() : '(it is missing)'}, before the last change (${new Date(latest).toISOString()}): re-fetch the ticket into it first; nothing recorded`);
		process.exit(1);
	}
	writeState(toplevel, () => ({ ticket_read: seen.checkedAt }));
	console.log(`wf post --ticket-reread: recorded ${seen.checkedAt}; changes before it are read:\n${changes.map((c) => `  - ${c.key}: ${c.who}, ${c.at}: ${c.what}`).join('\n')}`);
}

export async function runPost(argv: string[] = []): Promise<void> {
	if (argv.includes('--ticket-reread')) return runTicketReread();
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	const notePath = state?.note ? join(toplevel, state.note) : null;
	if (!notePath || !existsSync(notePath)) {
		console.error('wf post: no tracker note recorded for this round (wf deliver writes it)');
		process.exit(1);
	}
	let note = readFileSync(notePath, 'utf8');
	const sections = sectionsOf(note);
	const todo = sections.filter((s) => !s.posted);
	const proofDir = join(toplevel, state!.folder ?? '', 'proof');
	const names = existsSync(proofDir) ? readdirSync(proofDir) : [];
	const selections = new Map(todo.map((s) => [s.key, selectedPictures(s, names)]));
	const gaps = [...todo.map(unfilled), ...todo.map((s) => { const sel = selections.get(s.key)!; return 'gap' in sel ? sel.gap : null; })].filter((g) => g !== null);
	if (gaps.length) {
		console.error(`wf post: fill the note first (${state!.note}); nothing posted\n${gaps.join('\n')}`);
		process.exit(1);
	}
	const filesOf = (s: Section) => (selections.get(s.key) as { files: string[] }).files;
	// The exact comment and files, before anything leaves the machine; --preview stops here.
	for (const s of todo) console.log(previewOf(s, filesOf(s), names));
	if (argv.includes('--preview')) return;
	const { JIRA_EMAIL: email, JIRA_TOKEN: token } = process.env;
	if (!email || !token) {
		console.error('wf post: this session has no JIRA_EMAIL or JIRA_TOKEN (set them, then start a new session and "resume <id>"); nothing posted');
		process.exit(1);
	}
	const auth = Buffer.from(`${email}:${token}`).toString('base64');
	// Before anything goes up: a ticket that changed since the round began is not what the round built to.
	let refusal: string | null;
	try {
		refusal = await ticketRefusal(state, todo.map((s) => s.key), 'run wf post again', ownOf(sections));
	} catch (e) {
		console.error(`wf post: could not check the ticket for changes: ${(e as Error).message}; nothing posted`);
		process.exit(1);
	}
	if (refusal) {
		console.error(`wf post: ${refusal}\nNothing posted.`);
		process.exit(1);
	}
	for (const s of todo) {
		const pr = prNumberOf(s.text);
		if (!pr) {
			console.error(`wf post: ${s.key} has no PR url; nothing posted for it`);
			process.exit(1);
		}
		const issue = await jira(auth, `2/issue/${s.key}?fields=attachment,comment`);
		// A session can die between the post and the mark: a comment with this PR's url is that post.
		const already = issue.fields.comment.comments.some((c: { body: string }) => c.body.includes(`/pull/${pr}`));
		const pictures = picturesOf(pr, filesOf(s));
		// A session that died mid-upload left some attached: only the missing ones go up.
		if (!already) {
			const have = new Set(issue.fields.attachment.map((a: { filename: string }) => a.filename));
			for (const pic of pictures.flatMap((p) => [p.before, p.after]).filter((p) => p !== undefined)) {
				if (have.has(pic.as)) continue;
				const form = new FormData();
				form.append('file', new Blob([readFileSync(join(proofDir, pic.file))], { type: pictureType(pic.file) }), pic.as);
				await jira(auth, `3/issue/${s.key}/attachments`, { method: 'POST', body: form, headers: { 'X-Atlassian-Token': 'no-check' } });
			}
			await jira(auth, `2/issue/${s.key}/comment`, { method: 'POST', body: JSON.stringify({ body: commentBody(commentText(s), pictures) }), headers: { 'content-type': 'application/json' } });
		}
		// An open PR is awaiting merge, not fixed in the shared branch (Shay, 2026-10-20).
		if (state?.delivery && state.step === 'merged') {
			const { transitions } = await jira(auth, `3/issue/${s.key}/transitions`);
			const to = transitions.find((t: { to: { name: string } }) => t.to.name === DELIVERED);
			if (!to) throw new Error(`wf post: ${s.key} has no transition to ${DELIVERED}`);
			await jira(auth, `3/issue/${s.key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: to.id } }), headers: { 'content-type': 'application/json' } });
		}
		note = markPosted(note, s.key);
		writeFileSync(notePath, note);
		const count = pictures.flatMap((p) => [p.before, p.after]).filter(Boolean).length;
		console.log(`${s.key}: ${already ? 'already posted, pictures not re-attached' : `posted with ${count} picture(s) — ${pictureNotes(pictures)}`}, ${state?.delivery && state.step === 'merged' ? DELIVERED : 'in PR, awaiting merge'} — ${SITE}/browse/${s.key}`);
	}
}

if (process.argv[1]?.endsWith('post.ts')) await runPost(process.argv.slice(2));
