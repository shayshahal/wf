#!/usr/bin/env node
// standards.ts — wf standards: the repository's own review rules that cover a round's diff, and what
// their reports say. PRACTICES.md asked for a reviewer on two axes kept apart, spec and standards;
// validate is the spec one, and the standards one was a line in a doc (2026-10-03). Amp's review
// runs one agent per rule file rather than the rules in one context file, "a stronger guarantee that
// each check will actually be checked" (ampcode.com/news/liberating-code-review), and its files are
// the format here, so one set of rules serves both:
//   <dir>/.agents/checks/<name>.md, frontmatter `name`, `description`, `severity-default`
//   (low | medium | high | critical), the rule below it; it covers the files under <dir>.
// The rules are the project's facts, so they live in its repo and wf reads them from the worktree.
// One `standards <id>` agent per rule (prompts/standards.md) writes `standards/<id>.md` in the round
// folder; T2 shows each report beside VALIDATION.md, never merged into it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseBranch } from '../project.ts';
import { readState, toplevelOf } from '../round/state.ts';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export type Check = { id: string; path: string; scope: string; name: string; description: string; severity: string; rule: string };
export type Issue = { severity: string; file: string; line: number; text: string };

// Pure: a check file's id: its scope and its file name, `perf` for `.agents/checks/perf.md`,
// `api/perf` for `api/.agents/checks/perf.md`. Ids name briefs and report files, so they are paths,
// and a brief's key is split on its space: a path with whitespace in it is not a rule.
export function checkScope(path: string): string | null {
	const m = /^(?:(\S*)\/)?\.agents\/checks\/([^/\s]+)\.md$/.exec(path.replace(/\\/g, '/'));
	return m ? (m[1] ?? '') : null;
}
export function checkId(path: string): string {
	const scope = checkScope(path) ?? '';
	const name = path.replace(/\\/g, '/').split('/').at(-1)!.replace(/\.md$/, '');
	return scope ? `${scope}/${name}` : name;
}

// Pure: a check file's frontmatter and rule. A missing name is the file's; a severity outside the
// four is medium, so a typo never drops a rule.
export function parseCheck(path: string, text: string): Check {
	const body = text.replace(/\r\n/g, '\n');
	const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body);
	const field = (key: string) => new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm?.[1] ?? '')?.[1].trim().replace(/^(['"])(.*)\1$/, '$2') ?? '';
	const severity = field('severity-default').toLowerCase();
	return {
		id: checkId(path),
		path,
		scope: checkScope(path) ?? '',
		name: field('name') || checkId(path),
		description: field('description'),
		severity: SEVERITIES.includes(severity) ? severity : 'medium',
		rule: (fm ? body.slice(fm[0].length) : body).trim(),
	};
}

// Pure: the check files among a tree's paths, and for each the changed files it covers (those under
// its scope), the round's own folder left out: it is the round's notes, not the product.
export function applicable(paths: string[], changed: string[], folder: string | null = null): { path: string; files: string[] }[] {
	const product = changed.filter((f) => !folder || !(f === folder || f.startsWith(`${folder}/`)));
	return paths.filter((p) => checkScope(p) !== null).sort().map((path) => {
		const scope = checkScope(path)!;
		return { path, files: product.filter((f) => !scope || f.startsWith(`${scope}/`)) };
	}).filter((c) => c.files.length);
}

// The handoff file a standards agent writes, in the round folder.
export const reportFile = (id: string) => `standards/${id}.md`;

const RESULT = /^Result:[ \t]*(pass|issues)\b/m;
const ISSUE = /^[-*][ \t]+(critical|high|medium|low)[ \t]+·[ \t]+(\S+?):(\d+)(?:-\d+)?[ \t]+—[ \t]+(.+)$/;

// Pure: a report's `## Issues` lines that are not `none`.
const issueLines = (text: string) => (/^## Issues[ \t]*\n([\s\S]*?)(?=^## |<!--|(?![\s\S]))/m.exec(text)?.[1] ?? '')
	.split('\n').map((l) => l.trim()).filter((l) => l && !/^[-*]?\s*\(?none\)?\.?$/i.test(l));

// Pure: what a report says: its result and its issues, worst first.
export function readReport(text: string | null | undefined): { result: string | null; issues: Issue[] } {
	const body = (text ?? '').replace(/\r\n/g, '\n');
	const issues = issueLines(body).flatMap((l) => {
		const m = ISSUE.exec(l);
		return m ? [{ severity: m[1], file: m[2], line: Number(m[3]), text: m[4].trim() }] : [];
	});
	issues.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
	return { result: RESULT.exec(body)?.[1] ?? null, issues };
}

// Pure: null when a report's sections are whole, else why not (handoff.ts handoffGap).
export function reportGap(text: string, file: string): string | null {
	const body = text.replace(/\r\n/g, '\n');
	const result = RESULT.exec(body)?.[1];
	if (!result) return `${file} has no \`Result: pass | issues\` line`;
	const lines = issueLines(body);
	const bad = lines.find((l) => !ISSUE.exec(l));
	if (bad) return `${file} ## Issues: "${bad.slice(0, 80)}" is not \`- <critical | high | medium | low> · <path>:<line> — <what> · fix: <one line>\``;
	if (result === 'issues' && !lines.length) return `${file} says issues and lists none under ## Issues`;
	if (result === 'pass' && lines.length) return `${file} says pass and lists ${lines.length} issue(s)`;
	return null;
}

// Pure: the lines T2's header carries, one per report, worst first within a report.
export function summaryLines(reports: { id: string; file: string; text: string | null }[]): string[] {
	return reports.map(({ id, file, text }) => {
		const { result, issues } = readReport(text);
		if (text == null) return `standards: ${id} — no report (${file})`;
		if (result === 'pass') return `standards: ${id} — pass`;
		const counts = SEVERITIES.map((s) => [s, issues.filter((i) => i.severity === s).length] as const).filter(([, n]) => n).map(([s, n]) => `${n} ${s}`);
		return `standards: ${id} — ${counts.join(', ') || 'issues'}: ${file}  ← read beside the diff`;
	});
}

// ── the shell ────────────────────────────────────────────────────────────────

// The checks that cover the round's diff, each with its files, from the tree at HEAD. `base` is the
// merge base; null asks git for it from the round's base.
export function roundChecks(toplevel: string, base: string | null = null): (Check & { files: string[] })[] {
	const git = (...args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' });
	const state = readState(toplevel);
	const from = base ?? git('merge-base', state?.base ?? `origin/${baseBranch}`, 'HEAD').trim();
	const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
	const paths = lines(git('ls-files', '--', ':(glob)**/.agents/checks/*.md'));
	const changed = lines(git('diff', '--name-only', `${from}...HEAD`));
	return applicable(paths, changed, state?.folder ?? null).flatMap(({ path, files }) => {
		const file = join(toplevel, path);
		return existsSync(file) ? [{ ...parseCheck(path, readFileSync(file, 'utf8')), files }] : [];
	});
}

// wf standards: the rules that cover this round's diff, one line each.
export function runStandards() {
	let checks;
	try {
		checks = roundChecks(toplevelOf());
	} catch (e) {
		console.error(`wf standards: ${(e as Error).message.split('\n')[0]}`);
		process.exit(2);
	}
	if (!checks.length) return console.log('no .agents/checks/*.md covers this diff');
	for (const c of checks) console.log(`${c.id} · ${c.name} · ${c.severity} · ${c.files.length} file(s): ${c.files.join(', ')}`);
}

if (process.argv[1]?.endsWith('standards.ts')) runStandards();
