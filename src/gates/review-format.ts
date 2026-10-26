// review-format.ts — the REVIEW-FORMAT.md contract in code, shared by T1 (SPEC-REVIEW.md)
// and T2 (REVIEW.md): foldFeedbackLine(jsonLine) + renderHeader/renderSkeleton (pure),
// plus worktree IO helpers (devUrlsFor, appendDatedSection).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pageOf, stackUrls } from '../project.ts';
import type { ContentIdentity } from './content-identity.ts';
import { basePortForBranch, listWorktrees, slugForBranch, urlLines } from '../worktrees/worktree.ts';

export const VERDICTS = ['approved', 'changes-requested', 'dismissed'];
// Plannotator's annotate surface says `approved`; its review surface says `lgtm` (measured 0.27.16,
// BJEW-586 T2: Shay's approval folded as changes-requested and --done sent the round back to implement).
// An approval that carries a comment is logged `approved-with-notes` on both surfaces (0.27.16 binary);
// it folded as changes-requested and sent an approved T1 back to revise (TJEW-700).
export const verdictOf = (d: string | undefined) => (d === 'approved' || d === 'lgtm' || d === 'approved-with-notes' ? 'approved' : d === 'dismissed' ? 'dismissed' : 'changes-requested');

// One annotation, as Plannotator logs it on submit. The `element*` fields and `originalText` are what the
// annotate surface reports when its document is a raw-rendered page (an older page): no file and no blockId,
// but the element the comment landed on and the selector/path back to it.
export type Annotation = { text?: string; file?: string; lineStart?: number; lineEnd?: number; blockId?: string; originalText?: string; elementSelector?: string; elementPath?: string };
// The line a review UI returns (seams.reviewUI), or the JSON text of one. `target` is the file on
// Plannotator's annotate surface, and what was diffed on its review surface.
export type ReviewFeedback = { decision?: string; feedback?: string; message?: string; annotations?: Annotation[]; target?: string | { review?: { base?: string; changedFiles?: number } } };

// Pure: the source line a comment on a rendered page points at. an older agreement page tagged every block `wf-src-<line>`;
// Plannotator hands that tag back in elementSelector and elementPath (measured on 0.28.5, 2026-10-06: an
// element's first class is dropped from elementPath when it has more than one — the selector keeps them
// all — and an id survives both, while the attributes never arrive at all). The last match is the block
// that was clicked: a comment on a `<b>` inside an ASK reports the ASK's tag too (`… > blockquote… > b`).
export function pageLine(a: Annotation) {
  const ref = `${a.elementSelector ?? ''} > ${a.elementPath ?? ''}`;
  return [...ref.matchAll(/wf-src-(\d+)/g)].map((m) => Number(m[1])).at(-1) ?? null;
}

// Pure: what the comment was made on, for whoever reads the review file. Plannotator's `originalText` is
// the clicked element's own text, so a `<b>` gives the few bolded words and the block is not always in it.
// One line — a newline would break REVIEW-FORMAT.md's one-line-per-comment — and clipped.
const clip = (s: string, n = 96) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function commentLine(a: Annotation = {}) {
  const text = (a.text ?? '').trim();
  const on = a.originalText ? ` (on: ${clip(a.originalText)})` : '';
  if (a.file) {
    const range = a.lineStart ? `:${a.lineStart}${a.lineEnd && a.lineEnd !== a.lineStart ? `-${a.lineEnd}` : ''}` : '';
    return `${a.file}${range} — ${text}${on}`;
  }
  // A comment with no file is an agreement comment (T1) or a T2 note: the page's own line when it
  // came from the rendered page, Plannotator's blockId on the markdown surface, `?` when neither says
  // where it was. `AGREEMENT.md` is where T1's agreed material lives; T2 folds the same shape.
  return `AGREEMENT.md:${pageLine(a) ?? a.blockId ?? a.lineStart ?? '?'} — ${text}${on}`;
}

// Pure: one `path:line[-end] — text` line per annotation, then the verdict line.
export function foldFeedbackLine(input: ReviewFeedback | string) {
  const line: ReviewFeedback = typeof input === 'string' ? JSON.parse(input) : input;
  const out = [];
  // `message` is the review UI's own line (the adapter: stdout carries only {decision,message}). `feedback`
  // is not the same thing and is deliberately not folded: Plannotator generates it as a digest, one section
  // per annotation, quoting the element's HTML and its box coordinates — folding it put a 20-line restatement
  // of every comment into the review file (a real round's SPEC-REVIEW.md, measured 2026-10-06; the same on
  // 0.27.16, the 2026-09-27 wf record, so not a 0.28.5 change). Every line the person is quoted on in it is
  // already an annotation: over the 7 records on this machine, 31 quoted lines, none missing from
  // annotations[]. Their overall words arrive as an annotation with no block, so they fold as `SPEC.md:? — …`.
  const msg = (line.message ?? '').trim();
  if (msg) out.push(`note — ${msg}`);
  for (const a of line.annotations ?? []) out.push(commentLine(a));
  // What the adapter actually showed: --done compares it with the round's base (BJEW-586 T2
  // approved 124 files against dev when the round's 8 were against tools/wf-runtime).
  const target = typeof line.target === 'object' ? line.target.review : undefined;
  if (target?.base) out.push(`reviewed: ${target.base} (${target.changedFiles ?? '?'} files)`);
  out.push(`verdict: ${verdictOf(line.decision)}`);
  return out.join('\n');
}

const today = () => new Date().toISOString().slice(0, 10);

// Pure: header block both review files share. `base` null = agreement review (no diff).
// "look at:" — every changed page, as a URL on this worktree's server, so the reviewer opens the
// screen and not only the diff (Shay, BJEW-600 pilot, 2026-09-19). The project says which files are
// pages (project.ts pageOf); `urls` is the header's `<app>: <url>` lines.
export function lookAtLines(urls: string | null, files: string[], pageFor: (file: string) => { app: string; path: string } | null = pageOf): string[] {
  if (!urls) return [];
  const origin = (app: string) => urls.match(new RegExp(`^${app}:\\s*(\\S+)`, 'm'))?.[1];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of files) {
    const page = pageFor(f);
    const base = page && origin(page.app);
    if (!base) continue;
    const url = `${base}/${page.path}`;
    if (!seen.has(url)) { seen.add(url); out.push(`look at: ${url}`); }
  }
  return out;
}
// `agreementSha` binds T1's agreed material. `contentSha`/`headSha` bind T2's worktree and HEAD
// (content-identity.ts): deliver pushes HEAD, so both must match. `assessment` is the one final
// assessment's summary, not the former per-rule standards reports. SPEC has no producer in the
// replacement and must not remain another rendered document contract (#111/#113 audit, 2026-10-10).
// `scope` names what a review judges — `checkpoint` for a person-chosen checkpoint review;
// the final review is unscoped — and binds the verdict written under it (reviewScopeBinding). The
// `chunk` field is retained for older headers and is no longer written.
export type ReviewHeader = { round: string; klass?: string; base?: string | null; agreementSha?: string | null; contentSha?: string | null; headSha?: string | null; scope?: string | null; chunk?: string[]; date?: string; urls?: string | null; files?: string[]; beforeAfter?: string[]; assessment?: string[]; manual?: string[] };
export function renderHeader({ round, klass = '—', base = null, agreementSha = null, contentSha = null, headSha = null, scope = null, chunk = [], date = today(), urls = null, files = [], beforeAfter = [], assessment = [], manual = [] }: ReviewHeader) {
  return [
    `# Review — ${round}`,
    ``,
    `round: ${round}`,
    `class: ${klass}`,
    `base: ${base ?? 'n/a (agreement review)'}`,
    ...(agreementSha ? [`agreement-sha: ${agreementSha}`] : []),
    ...(contentSha ? [`content-sha: ${contentSha}`] : []),
    ...(headSha ? [`head-sha: ${headSha}`] : []),
    ...(scope ? [`scope: ${scope}`] : []),
    ...chunk,
    `date: ${date}`,
    urls ?? `urls: n/a — port not derivable without wt (see REVIEW-FORMAT.md)`,
    ...(asBuiltFile(files) ? [`look at: ${asBuiltFile(files)}  ← the call stack as built, diffed against the agreement — read first`] : []),
    ...beforeAfter,
    ...lookAtLines(urls, files),
    ...assessment,
    ...manual,
    ``,
    `files changed (${files.length}):`,
    ...(files.length ? files.map((f) => `- ${f}`) : [`(none)`]),
    ``,
  ].join('\n');
}

// Pure: a fresh file = header + empty comments + a pending verdict `--done` refuses.
export function renderSkeleton(opts: ReviewHeader) {
  return `${renderHeader(opts)}comments:\n(none yet — one \`path:line[-end] — text\` line per comment)\n\nverdict: pending (set one of: ${VERDICTS.join(' | ')})\n`;
}

// Last `<key>: <value>` line wins (review files are append-only dated sections).
export const lastField = (text: string, key: string) => [...text.matchAll(new RegExp(`^${key}:[ \\t]*(\\S+)[ \\t]*$`, 'gm'))].at(-1)?.[1] ?? null;

// An optional as-built call stack accompanying consequential work. T2 must see it: the one
// contract change of BJEW-586 (a new error_code on a 400) was in this file and nowhere on
// the reviewer's screen. It lives in the round's diff, wherever the bug folder is.
export const asBuiltFile = (files: string[]) => files.find((f) => /(^|\/)proof\/CALL-STACK-AS-BUILT\.md$/.test(f)) ?? null;

// Pure: the round's before/after screenshots, paired by label: research takes `proof/before-<label>.png` on
// the base, validate `proof/after-<label>.png` of the same view on the fix. T2 sees the change, not only the
// diff (Factory's /demo shoots both branches with the same steps; taken into wf 2026-09-28). A label with
// one side only is still shown: a new screen has no before, and wf never invents one.
// The label is whatever follows the prefix: a number (`before-1.png`) or a name (`after-he-1280-assess.png`).
// JX-1239: a round shot `after-he-1280-assess.png` and friends, T2 and `wf post` took numbered names only, and
// the post attached zero. T2 (review.ts), `wf post` and `wf reap` all read pictures through this one function.
// A numbered label is `{ n }` (sorted by value, first); a named one is `{ label }` (sorted by name).
export type ProofPair = ({ n: number } | { label: string }) & { before?: string; after?: string };
const PROOF_IMAGE = /\.(png|jpe?g|webp)$/i;
const PROOF_SIDE = /^(before|after)-(.+)\.(png|jpe?g|webp)$/i;
export const isProofImage = (name: string) => PROOF_IMAGE.test(name);
export function proofPairs(names: string[]): ProofPair[] {
  const rows = new Map<string, ProofPair[]>();
  for (const name of names) {
    const m = PROOF_SIDE.exec(name);
    if (!m) continue;
    const side = m[1].toLowerCase() as 'before' | 'after';
    const label = m[2];
    const same = rows.get(label) ?? [];
    // The same label on the same side twice (`after-1.png` and `after-1.jpg`) gets a second row, so no
    // picture is dropped for resembling another.
    const row = same.find((p) => p[side] === undefined);
    if (row) row[side] = name;
    else same.push({ ...(/^\d+$/.test(label) ? { n: Number(label) } : { label }), [side]: name } as ProofPair);
    rows.set(label, same);
  }
  const key = (p: ProofPair) => ('n' in p ? [0, p.n, ''] as const : [1, 0, p.label] as const);
  return [...rows.entries()].sort(([la, [a]], [lb, [b]]) => {
    const [ga, na] = key(a);
    const [gb, nb] = key(b);
    return ga - gb || na - nb || (la < lb ? -1 : la > lb ? 1 : 0);
  }).flatMap(([, same]) => same);
}

// Pure: the picture files in proof/ that no pair takes (a name that does not start with `before-` or
// `after-`), so a caller can say it left them out instead of leaving them out unsaid.
export const unpairedProofImages = (names: string[]) => names.filter((n) => isProofImage(n) && !PROOF_SIDE.test(n));

// Pure: a picture's caption, from the first line of RESEARCH.md or VALIDATION.md that names it
// (`proof/before-1.png — admin on /admin/listings: …`), without the name and its dashes.
export function captionFor(name: string, texts: (string | null | undefined)[]) {
  const line = texts.flatMap((t) => (t ?? '').split('\n')).find((l) => l.includes(`proof/${name}`));
  return line ? line.replace(/`/g, '').replace(`proof/${name}`, '').replace(/^[\s\-—:|]+|[\s\-—:|]+$/g, '').trim() : '';
}

// Pure: the T2 header lines for the round's before/after pictures, one line per pair: both file paths
// (absolute, from `dir`, the proof folder) and the caption. No page is written (2026-10): the pictures are
// shown in the review file, in chat and in the PR (`wf post`), and a missing side says `none`.
export function beforeAfterLines({ pairs, captions, dir }: { pairs: ProofPair[]; captions: Record<string, string>; dir: string }): string[] {
  const path = (name: string | undefined) => (name ? `${dir.split('\\').join('/')}/${name}` : 'none');
  return pairs.map((p) => {
    const caption = [...new Set([p.before, p.after].map((n) => (n ? captions[n] ?? '' : '')).filter(Boolean))].join(' / ');
    return `look at ${'n' in p ? p.n : p.label}: before ${path(p.before)} · after ${path(p.after)}${caption ? ` — ${caption}` : ''}`;
  });
}

// Last `verdict: <v>` line wins; anything but a real verdict (e.g. pending) → null.
export function readVerdict(text: string) {
  const found = [...text.matchAll(/^verdict:[ \t]*(.*)$/gm)].at(-1)?.[1].trim() ?? null;
  return (VERDICTS as (string | null)[]).includes(found) ? found : null;
}

// Pure: the last real `verdict:` and the `content-sha`/`head-sha` of the section it is written in. A
// verdict cannot borrow a later header's sha across a `## <date>` boundary: a re-open that appended
// a header without a verdict leaves the pair on the earlier section, and a verdict with no sha in its
// own section is unbound and refused (#106 review, 2026-10-09).
const SECTION_HEAD = /^## \d{4}-\d{2}-\d{2}[ \t]*$/gm;
function reviewSections(text: string): string[] {
  const body = text.replace(/\r\n/g, '\n');
  const starts = [...body.matchAll(SECTION_HEAD)].map((m) => m.index!);
  if (!starts.length) return [body];
  const out = [body.slice(0, starts[0])];
  for (let i = 0; i < starts.length; i++) out.push(body.slice(starts[i], starts[i + 1] ?? body.length));
  return out;
}
function verdictSection(text: string): { verdict: string; field: (key: string) => string | null } | null {
  for (const section of reviewSections(text).reverse()) {
    const verdicts = [...section.matchAll(/^verdict:\s*(\S+)\s*$/gm)].map((m) => m[1]).filter((v) => (VERDICTS as string[]).includes(v));
    if (!verdicts.length) continue;
    const field = (key: string) => [...section.matchAll(new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'gm'))].at(-1)?.[1] ?? null;
    return { verdict: verdicts.at(-1)!, field };
  }
  return null;
}
/** The latest T1 verdict (including pending) binds only the sha in its own dated section. */
export function agreementApprovalBinding(text: string): { verdict: string | null; agreementSha: string | null } {
  const found = reviewSections(text).reverse().find((section) => /^verdict:/m.test(section));
  return { verdict: found ? readVerdict(found) : null, agreementSha: found ? lastField(found, 'agreement-sha') : null };
}

export function approvalBinding(text: string): { verdict: string | null; contentSha: string | null; headSha: string | null } {
  const found = verdictSection(text);
  return found ? { verdict: found.verdict, contentSha: found.field('content-sha'), headSha: found.field('head-sha') } : { verdict: null, contentSha: null, headSha: null };
}

// Pure: approvalBinding plus the `scope:` of the same section. A checkpoint's approval (`checkpoint`,
// CHECKPOINT-REVIEW.md) and the final one (unscoped, REVIEW.md) are bound to their scope in the
// verdict's own section, so a checkpoint cannot stand for the final review.
export function reviewScopeBinding(text: string): { verdict: string | null; contentSha: string | null; headSha: string | null; scope: string | null } {
  return { ...approvalBinding(text), scope: verdictSection(text)?.field('scope') ?? null };
}

// Pure: approvalContentGap for a checkpoint review, which must also be of `scope`.
export function scopedApprovalGap(reviewText: string, current: ContentIdentity, scope: string): string | null {
  const bound = reviewScopeBinding(reviewText).scope;
  if (bound !== scope) return `the verdict's section is ${bound ? `scoped ${bound}` : 'unscoped'}, not ${scope} — an approval of one review (a checkpoint, or the whole round) cannot stand for another; re-run \`wf review <round>\` and set the verdict under its header`;
  return approvalContentGap(reviewText, current);
}

// Pure: whether `wf review` must append a fresh dated header: the first open, or a re-open (no review
// screen) whose recorded worktree OR HEAD identity moved. Both, because a commit that changed only
// HEAD (with the worktree restored) must still force a new review (#106 final review).
export function needsFreshReviewHeader(previous: { contentSha: string | null; headSha: string | null } | null, contentSha: string, headSha: string): boolean {
  if (previous === null) return true;
  return previous.contentSha !== contentSha || previous.headSha !== headSha;
}

// Pure: null when `reviewText` approved the implementation whose current worktree and HEAD identities
// are `current`, else why not. The verdict is bound to the two shas its own section recorded when
// review opened (review.ts, content-identity.ts). The worktree must still be the approved bytes; HEAD
// must be the approved HEAD or the approved worktree itself — deliver commits the round folder after
// T2, so a retry's HEAD is the approved content and not yet the reviewed HEAD (#106/#108). A review
// with no sha in the verdict's section was written before wf recorded it (or by hand), and the
// identity cannot be reconstructed after the fact, so it is refused rather than trusted.
export function approvalContentGap(reviewText: string, current: ContentIdentity): string | null {
  const { contentSha, headSha } = approvalBinding(reviewText);
  if (!contentSha || !headSha) return 'REVIEW.md has no content-sha/head-sha in the verdict\'s section, so nothing binds it to the implementation it approved; re-run `wf review <round>` (it records the content T2 is approving), then set the verdict again';
  if (contentSha !== current.worktree) return `the working tree changed after T2 approved it (REVIEW.md: ${contentSha}, this tree: ${current.worktree}) — a product, test or repro change invalidates the approval; re-run \`wf review <round>\` and T2`;
  if (headSha !== current.head && contentSha !== current.head) return `the committed implementation changed after T2 approved it (REVIEW.md: ${headSha}, HEAD: ${current.head}) — deliver pushes HEAD, so a change it carries is not the approved code; re-run \`wf review <round>\` and T2`;
  return null;
}

// The worktree's stack names for the header. A detached worktree has no branch, so return null
// and the header says so.
export function devUrlsFor(worktree: string): string | null {
  try {
    const branch = listWorktrees(worktree).find((t: { path: string; branch: string | null }) => t.path.replace(/\\/g, '/') === worktree.replace(/\\/g, '/'))?.branch;
    if (!branch) return null;
    return urlLines(stackUrls({ slug: slugForBranch(branch), port: basePortForBranch(branch) }));
  } catch {
    // No worktree list or no stack for this branch: the header goes out without URLs.
    return null;
  }
}

// Never overwrite silently: first write wins, later runs append a dated section.
export function appendDatedSection(file: string, body: string, date = today()) {
  if (!existsSync(file)) writeFileSync(file, `${body.replace(/\n+$/, '')}\n`);
  else appendFileSync(file, `\n## ${date}\n\n${body.replace(/\n+$/, '')}\n`);
}

