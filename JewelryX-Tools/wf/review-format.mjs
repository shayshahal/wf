// review-format.mjs — the REVIEW-FORMAT.md contract in code, shared by T1 (SPEC-REVIEW.md)
// and T2 (REVIEW.md): foldFeedbackLine(jsonLine) + renderHeader/renderSkeleton (pure),
// plus worktree IO helpers (specShaFor, devUrlsFor, appendDatedSection).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePortForBranch, slugForBranch } from '../../scripts/worktree-ports.mjs';
import { roundFile } from './state.mjs';

export const VERDICTS = ['approved', 'changes-requested', 'dismissed'];
// Plannotator's annotate surface says `approved`; its review surface says `lgtm` (measured 0.27.16,
// BJEW-586 T2: Shay's approval folded as changes-requested and --done sent the round back to implement).
// An approval that carries a comment is logged `approved-with-notes` on both surfaces (0.27.16 binary);
// it folded as changes-requested and sent an approved T1 back to revise (TJEW-700).
export const verdictOf = (d) => (d === 'approved' || d === 'lgtm' || d === 'approved-with-notes' ? 'approved' : d === 'dismissed' ? 'dismissed' : 'changes-requested');

export function commentLine(a = {}) {
  const text = (a.text ?? '').trim();
  if (a.file) {
    const range = a.lineStart ? `:${a.lineStart}${a.lineEnd && a.lineEnd !== a.lineStart ? `-${a.lineEnd}` : ''}` : '';
    return `${a.file}${range} — ${text}`;
  }
  return `SPEC.md:${a.blockId ?? a.lineStart ?? '?'} — ${text}`;
}

// Pure: one `path:line[-end] — text` line per annotation, then the verdict line.
export function foldFeedbackLine(input) {
  const line = typeof input === 'string' ? JSON.parse(input) : input;
  const out = [];
  const fb = (line.feedback ?? line.message ?? '').trim();
  if (fb) out.push(`note — ${fb}`);
  for (const a of line.annotations ?? []) out.push(commentLine(a));
  // What the adapter actually showed: --done compares it with the round's base (BJEW-586 T2
  // approved 124 files against dev when the round's 8 were against tools/wf-runtime).
  const target = line.target?.review;
  if (target?.base) out.push(`reviewed: ${target.base} (${target.changedFiles ?? '?'} files)`);
  out.push(`verdict: ${verdictOf(line.decision)}`);
  return out.join('\n');
}

const today = () => new Date().toISOString().slice(0, 10);

// Pure: header block both review files share. `base` null = SPEC review (no diff).
// "look at:" — every changed SvelteKit page, as a URL on this worktree's server, so the
// reviewer opens the screen and not only the diff (Shay, BJEW-600 pilot, 2026-09-19).
// Route groups `(store)` drop out of the path; params stay as `[id]` for the reviewer to fill.
const PAGE_RE = /^packages\/frontend\/(b2b|admin)\/src\/routes\/(.*?)\/?\+(?:page|layout)(?:\.server)?\.(?:svelte|ts)$/;
export function lookAtLines(urls, files) {
  if (!urls) return [];
  const origin = (app) => urls.match(new RegExp(`^${app === 'b2b' ? 'B2B' : 'Admin'}:\\s*(\\S+)`, 'm'))?.[1];
  const seen = new Set();
  const out = [];
  for (const f of files) {
    const m = PAGE_RE.exec(f);
    if (!m) continue;
    const base = origin(m[1]);
    if (!base) continue;
    const path = m[2].split('/').filter((seg) => seg && !/^\(.*\)$/.test(seg)).join('/');
    const url = `${base}/${m[1]}${path ? `/${path}` : ''}`;
    if (!seen.has(url)) { seen.add(url); out.push(`look at: ${url}`); }
  }
  return out;
}
export function renderHeader({ round, klass = '—', base = null, specSha = null, date = today(), urls = null, files = [] }) {
  return [
    `# Review — ${round}`,
    ``,
    `round: ${round}`,
    `class: ${klass}`,
    `base: ${base ?? 'n/a (SPEC review)'}`,
    `spec-sha: ${specSha ?? 'n/a'}`,
    `date: ${date}`,
    urls ?? `urls: n/a — port not derivable without wt (see REVIEW-FORMAT.md)`,
    ...(asBuiltFile(files) ? [`look at: ${asBuiltFile(files)}  ← the call stack as built, diffed against SPEC — read first`] : []),
    ...lookAtLines(urls, files),
    ``,
    `files changed (${files.length}):`,
    ...(files.length ? files.map((f) => `- ${f}`) : [`(none)`]),
    ``,
  ].join('\n');
}

// Pure: a fresh file = header + empty comments + a pending verdict `--done` refuses.
export function renderSkeleton(opts) {
  return `${renderHeader(opts)}comments:\n(none yet — one \`path:line[-end] — text\` line per comment)\n\nverdict: pending (set one of: ${VERDICTS.join(' | ')})\n`;
}

// Last `<key>: <value>` line wins (review files are append-only dated sections).
export const lastField = (text, key) => [...text.matchAll(new RegExp(`^${key}:[ \\t]*(\\S+)[ \\t]*$`, 'gm'))].at(-1)?.[1] ?? null;

// The as-built call stack a B/C worker delivers (plan Task 6). T2 must see it: the one
// contract change of BJEW-586 (a new error_code on a 400) was in this file and nowhere on
// the reviewer's screen. It lives in the round's diff, wherever the bug folder is.
export const asBuiltFile = (files) => files.find((f) => /(^|\/)proof\/CALL-STACK-AS-BUILT\.md$/.test(f)) ?? null;

// Last `verdict: <v>` line wins; anything but a real verdict (e.g. pending) → null.
export function readVerdict(text) {
  let found = null;
  for (const m of text.matchAll(/^verdict:\s*(\S+)\s*$/gm)) found = m[1];
  return VERDICTS.includes(found) ? found : null;
}

export function specShaFor(worktree) {
  const f = roundFile(worktree, 'SPEC.md');
  if (!existsSync(f)) return null;
  return `sha256:${createHash('sha256').update(readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex')}`;
}

// Branch → slug → `dev-worktree.mjs --urls <port> --slug`: prints the portless
// .localhost names. Without wt there is no branch, so return null and the
// header says so.
export function devUrlsFor(worktree) {
  try {
    const wt = JSON.parse(execFileSync('wt', ['list', '--format', 'json'], { encoding: 'utf8' }));
    const item = (wt.items ?? []).find((i) => i.worktree?.path?.replace(/\\/g, '/') === worktree.replace(/\\/g, '/'));
    const branch = item?.branch;
    if (!branch) return null;
    const root = execFileSync('git', ['-C', worktree, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    return execFileSync('node', [join(root, 'scripts', 'dev-worktree.mjs'), '--urls', String(basePortForBranch(branch)), '--slug', slugForBranch(branch)], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Never overwrite silently: first write wins, later runs append a dated section.
export function appendDatedSection(file, body, date = today()) {
  if (!existsSync(file)) writeFileSync(file, `${body.replace(/\n+$/, '')}\n`);
  else appendFileSync(file, `\n## ${date}\n\n${body.replace(/\n+$/, '')}\n`);
}

export const wfDir = dirname(fileURLToPath(import.meta.url));
