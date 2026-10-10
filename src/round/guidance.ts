// guidance.ts — the project's notes for the files a commit touches, put in that commit's brief. A
// project's notes on an area (its backend's conventions, its components') live in its repo, beside
// the notes the phase prompts name by path (project.ts `guidance`). One that says which files it is
// about, in its frontmatter, reaches `wf brief build` when the case's files match it, inline,
// so the agent spends none of its calls finding it, and a build that touches none of them carries
// none of it. Amp's AGENTS.md globs, the same frontmatter (ampcode.com/news/globs-in-AGENTS.md,
// 2026-10-03):
//   ---
//   globs:
//     - 'packages/backend/**/*.py'
//   ---
// A glob is from the repository root. A note with no `globs:` is never put in a brief by this.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export type Note = { path: string; globs: string[]; body: string };

const unquote = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2').trim();

// Pure: a note's globs and its text after the frontmatter, or null when it names no globs. Takes
// the list form (`globs:` then `- <glob>` lines), the flow form (`globs: [a, b]`) and one glob.
export function parseNote(path: string, text: string): Note | null {
	const body = text.replace(/\r\n/g, '\n');
	const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body);
	if (!fm) return null;
	const lines = fm[1].split('\n');
	const at = lines.findIndex((l) => /^globs:/.test(l));
	if (at === -1) return null;
	const inline = lines[at].replace(/^globs:/, '').trim();
	const globs = inline ? inline.replace(/^\[|\]$/g, '').split(',').map(unquote).filter(Boolean) : [];
	// The list form ends at the first line that is not an item.
	for (const l of inline ? [] : lines.slice(at + 1)) {
		if (!l.trim()) continue;
		const item = /^\s*-\s+(.+)$/.exec(l);
		if (!item) break;
		globs.push(unquote(item[1]));
	}
	return globs.length ? { path, globs, body: body.slice(fm[0].length).trim() } : null;
}

// Pure: the notes whose globs match any of `files`, each with the files it matched, in path order.
export function notesFor(notes: Note[], files: string[]): (Note & { files: string[] })[] {
	const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
	return notes
		.map((n) => ({ ...n, files: files.map(norm).filter((f) => n.globs.some((g) => posix.matchesGlob(f, norm(g)))) }))
		.filter((n) => n.files.length)
		.sort((a, b) => a.path.localeCompare(b.path));
}

// Pure: the brief's section for them, or '' when there are none.
export function guidanceSection(notes: (Note & { files: string[] })[]): string {
	if (!notes.length) return '';
	const parts = notes.map((n) => `### \`${n.path}\` (for ${n.files.map((f) => `\`${f}\``).join(', ')})\n\n${n.body}`);
	return `\n## This project's notes for these files\n\nFrom its repository, for the files in this row. They rank below the agreement and the fence above.\n\n${parts.join('\n\n')}\n`;
}

// The notes under `dir` (the worktree's, recursively) that name globs.
export function readNotes(toplevel: string, dir: string | null): Note[] {
	if (!dir || !existsSync(join(toplevel, dir))) return [];
	const files = (readdirSync(join(toplevel, dir), { recursive: true }) as string[]).filter((f) => f.endsWith('.md'));
	return files.flatMap((f) => {
		const path = posix.join(dir, f.replace(/\\/g, '/'));
		return parseNote(path, readFileSync(join(toplevel, path), 'utf8')) ?? [];
	});
}
