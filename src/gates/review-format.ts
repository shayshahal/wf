// review-format.ts — the REVIEW-FORMAT.md contract in code, shared by T1 (SPEC-REVIEW.md)
// and T2 (REVIEW.md): foldFeedbackLine(jsonLine) + renderHeader/renderSkeleton (pure),
// plus worktree IO helpers (devUrlsFor, appendDatedSection).
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
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
// annotate surface reports when its document is a raw-rendered page (agreementPage): no file and no blockId,
// but the element the comment landed on and the selector/path back to it.
export type Annotation = { text?: string; file?: string; lineStart?: number; lineEnd?: number; blockId?: string; originalText?: string; elementSelector?: string; elementPath?: string };
// The line a review UI returns (seams.reviewUI), or the JSON text of one. `target` is the file on
// Plannotator's annotate surface, and what was diffed on its review surface.
export type ReviewFeedback = { decision?: string; feedback?: string; message?: string; annotations?: Annotation[]; target?: string | { review?: { base?: string; changedFiles?: number } } };

// Pure: the source line a comment on a rendered page points at. agreementBody tags every block `wf-src-<line>`;
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
export type ReviewHeader = { round: string; klass?: string; base?: string | null; agreementSha?: string | null; contentSha?: string | null; headSha?: string | null; date?: string; urls?: string | null; files?: string[]; beforeAfter?: string | null; assessment?: string[]; manual?: string[] };
export function renderHeader({ round, klass = '—', base = null, agreementSha = null, contentSha = null, headSha = null, date = today(), urls = null, files = [], beforeAfter = null, assessment = [], manual = [] }: ReviewHeader) {
  return [
    `# Review — ${round}`,
    ``,
    `round: ${round}`,
    `class: ${klass}`,
    `base: ${base ?? 'n/a (agreement review)'}`,
    ...(agreementSha ? [`agreement-sha: ${agreementSha}`] : []),
    ...(contentSha ? [`content-sha: ${contentSha}`] : []),
    ...(headSha ? [`head-sha: ${headSha}`] : []),
    `date: ${date}`,
    urls ?? `urls: n/a — port not derivable without wt (see REVIEW-FORMAT.md)`,
    ...(asBuiltFile(files) ? [`look at: ${asBuiltFile(files)}  ← the call stack as built, diffed against the agreement — read first`] : []),
    ...(beforeAfter ? [`look at: ${beforeAfter}  ← screenshots: before (the base) and after (this round)`] : []),
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

// Pure: the round's before/after screenshots, paired by number: research takes `proof/before-<n>.png` on
// the base, validate `proof/after-<n>.png` of the same view on the fix. T2 sees the change, not only the
// diff (Factory's /demo shoots both branches with the same steps; taken into wf 2026-09-28). A number
// with one side only is still shown: a new screen has no before.
export type ProofPair = { n: number; before?: string; after?: string };
export function proofPairs(names: string[]): ProofPair[] {
  const pairs = new Map<number, ProofPair>();
  for (const name of names) {
    const m = /^(before|after)-(\d+)\.png$/.exec(name);
    if (!m) continue;
    const n = Number(m[2]);
    pairs.set(n, { ...(pairs.get(n) ?? { n }), [m[1]]: name });
  }
  return [...pairs.values()].sort((a, b) => a.n - b.n);
}

// Pure: a picture's caption, from the first line of RESEARCH.md or VALIDATION.md that names it
// (`proof/before-1.png — admin on /admin/listings: …`), without the name and its dashes.
export function captionFor(name: string, texts: (string | null | undefined)[]) {
  const line = texts.flatMap((t) => (t ?? '').split('\n')).find((l) => l.includes(`proof/${name}`));
  return line ? line.replace(/`/g, '').replace(`proof/${name}`, '').replace(/^[\s\-—:|]+|[\s\-—:|]+$/g, '').trim() : '';
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pure: the page `wf review` writes to .wf/before-after.html. `src` is the proof folder as seen from it.
export function beforeAfterPage({ round, pairs, captions, src }: { round: string; pairs: ProofPair[]; captions: Record<string, string>; src: string }) {
  const cell = (name: string | undefined) => (name
    ? `<figure><img src="${escapeHtml(`${src}/${name}`)}"><figcaption dir="auto">${escapeHtml(captions[name] ?? '')}</figcaption></figure>`
    : '<figure class="none">none</figure>');
  const rows = pairs.map((p) => `<tr><th>${p.n}</th><td>${cell(p.before)}</td><td>${cell(p.after)}</td></tr>`).join('\n');
  return `<!doctype html>
<meta charset="utf-8"><title>${escapeHtml(round)}: before / after</title>
<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;vertical-align:top}td{width:50%}img{max-width:100%;display:block}figure{margin:0}figcaption{color:#555;margin-top:6px}.none{color:#999}</style>
<h1>${escapeHtml(round)}: before / after</h1>
<table><tr><th></th><th>before (the base)</th><th>after (this round)</th></tr>
${rows}
</table>
`;
}

// ── the plan page ────────────────────────────────────────────────────────────
// The same design, rendered: SPEC.md § For T1 at T1 (.wf/SPEC-T1.html, design.ts) and PLAN.md at T2
// (.wf/PLAN.html, review.ts). The markdown stays the file of record. At T1 the page is what the person
// annotates, so the page has to say which SPEC.md line each block is: agreementBody tags them `wf-src-<line>`
// and pageLine reads the tag back out of what Plannotator reports. The page is also where SHOW-ME.md's
// views read as views — diff blocks coloured, a mermaid block drawn, the Asks copyable, the round's own
// HTML artifacts embedded. Mermaid comes from a CDN and its source stays readable when there is none:
// the page is opened on the person's machine, never fetched by wf (and under Claude Code the screen that
// shows it is the review UI, editor.ts).
export type PlanArtifact = { title: string; src: string };

// Pure: the round folder's own HTML files (SHOW-ME.md artifacts), as the page embeds them. `from` is
// the folder the page is written in (.wf), so each src is relative to it.
export function roundArtifacts(roundDir: string, from: string): PlanArtifact[] {
	if (!existsSync(roundDir)) return [];
	const base = relative(from, roundDir).replace(/\\/g, '/');
	return readdirSync(roundDir).filter((f) => f.endsWith('.html')).sort()
		.map((f) => ({ title: f, src: `${base === '.' ? '' : `${base}/`}${f}` }));
}

// Pure: one diff line as a coloured span. The markers are the call stack's own (`CALL-STACK-FORMAT.md`):
// `+` added, `-` removed, `~` changed, no marker unchanged — and a hop is indented, so the marker is
// the first non-space character, not the first (a `+` under two spaces of indent is still an addition).
const MARKERS = { '+': 'add', '-': 'del', '~': 'chg' } as const;
const diffRow = (line: string) => {
	const marker = /^\s*([+\-~])/.exec(line)?.[1] as keyof typeof MARKERS | undefined;
	return `<span class="${marker ? MARKERS[marker] : 'ctx'}">${escapeHtml(line) || ' '}</span>`;
};

// Pure: a plan document's markdown → the small part of it wf writes. Fenced blocks keep their shape:
// a `diff` block and a bare one (where the call stacks live) are coloured by marker, `mermaid` is left
// for the script `agreementPage` adds, and a table is shown as it is because a plan's tables are read as text.
export function agreementBody(md: string, base = 0): string {
	const out: string[] = [];
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	const inline = (s: string) => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
	// Each block opens tagged with its markdown line: `wf-src-<line>`, `base` lines into the document the
	// section was cut from. The tag goes in as the first class *and* as the id: the two fields Plannotator
	// reports it in serialize differently (measured 2026-10-06, 0.28.5 — a click on the ASK's `<strong>`
	// came back `#wf-src-50 > strong`, `body > blockquote#wf-src-50 > strong`), and picking one rule of a
	// third-party's string builder is how a fold silently stops finding lines. The styling class follows.
	const openTag = (name: string, i: number, cls = '') => `<${name} class="${[`wf-src-${base + i + 1}`, cls].filter(Boolean).join(' ')}" id="wf-src-${base + i + 1}">`;
	let list = false;
	let table = false;
	const close = () => { if (list) { out.push('</ul>'); list = false; } if (table) { out.push('</pre>'); table = false; } };
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const fence = /^```(\w*)\s*$/.exec(line);
		if (fence) {
			close();
			const start = i;
			const body: string[] = [];
			for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
			out.push(fence[1] === 'mermaid' ? `${openTag('pre', start, 'mermaid')}${escapeHtml(body.join('\n'))}</pre>`
				: fence[1] === 'diff' || fence[1] === '' ? `${openTag('pre', start, 'diff')}${body.map(diffRow).join('\n')}</pre>`
					: `${openTag('pre', start, 'lang')}${escapeHtml(body.join('\n'))}</pre>`);
			continue;
		}
		if (/^\|/.test(line)) {
			if (!table) { close(); out.push(openTag('pre', i, 'table')); table = true; }
			out.push(escapeHtml(line));
			continue;
		}
		if (table) close();
		const head = /^(#{1,3})\s+(.*)$/.exec(line);
		if (head) { close(); out.push(`${openTag(`h${head[1].length}`, i)}${inline(head[2])}</h${head[1].length}>`); continue; }
		const item = /^[-*]\s+(.*)$/.exec(line);
		if (item) { if (!list) { out.push('<ul>'); list = true; } out.push(`${openTag('li', i)}${inline(item[1])}</li>`); continue; }
		if (/^>/.test(line)) {
			close();
			const start = i;
			const quote = [line.replace(/^>\s?/, '')];
			while (i + 1 < lines.length && /^>/.test(lines[i + 1])) quote.push(lines[++i].replace(/^>\s?/, ''));
			out.push(`${openTag('blockquote', start, 'ask')}${quote.map(inline).join('<br>')}<button class="copy" type="button">copy</button></blockquote>`);
			continue;
		}
		if (!line.trim()) continue;
		close();
		out.push(`${openTag('p', i)}${inline(line)}</p>`);
	}
	close();
	return out.join('\n');
}

// `theme` follows the page's own scheme: mermaid's default theme writes dark text, which is
// unreadable on the dark page the browser paints for `color-scheme: light dark` (seen in the demo,
// 2026-10-06 — the sequence diagram came out dark-on-dark). Offline the block keeps its source.
const MERMAID = '<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";mermaid.initialize({startOnLoad:false,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"});await mermaid.run({querySelector:".mermaid"});</script>';
// The copy button on an ASK. Plannotator hosts this page in an `<iframe sandbox="allow-scripts">` with no
// allow-same-origin (its 0.28.5 binary, 2026-10-06): the script runs, but the frame's origin is opaque and
// the clipboard API can refuse there, where a plain browser tab does not. The textarea path is the old
// fallback, so the button does something rather than nothing when the API says no.
const COPY_ASK = '<script>const wfCopy=(t)=>{const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){ok=false /* no clipboard in this frame: the person copies by hand */}a.remove();return ok};document.addEventListener("click",(e)=>{const b=e.target.closest("button.copy");if(!b)return;const t=b.parentElement.innerText.replace(/copy$/,"").trim();const done=()=>{b.textContent="copied"};if(navigator.clipboard)navigator.clipboard.writeText(t).then(done,()=>{wfCopy(t);done()});else{wfCopy(t);done()}});</script>';

// Pure: the standalone page for a section of a plan document. `base` is the line the section starts at in
// the document it was cut from: with it each block's tag is a line of that document (design.ts).
export function agreementPage({ title, meta, section, artifacts = [], base = 0 }: { title: string; meta: string[]; section: string; artifacts?: PlanArtifact[]; base?: number }) {
	const body = agreementBody(section, base);
	const hasClass = (cls: string) => new RegExp(`class="[^"]*\\b${cls}\\b`).test(body);
	return `<!doctype html>
<meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{font:15px/1.55 system-ui,sans-serif;margin:0 auto;padding:24px;max-width:1100px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #8884;padding-bottom:4px}
h3{font-size:15px;margin:20px 0 6px}
.meta{color:#777;font-size:13px;margin-bottom:20px}
pre{background:#8881;border:1px solid #8883;border-radius:6px;padding:10px 12px;overflow:auto;font:13px/1.45 ui-monospace,Consolas,monospace}
pre.diff span{display:block;white-space:pre}
pre.diff .add{color:#187a3c;background:#2e7d3218}
pre.diff .del{color:#a32323;background:#c6282818}
pre.diff .chg{color:#8a6d00;background:#f9a82518}
@media (prefers-color-scheme:dark){pre.diff .add{color:#4ade80}pre.diff .del{color:#f87171}pre.diff .chg{color:#fbbf24}.meta,figcaption{color:#aaa}footer{color:#999}}
code{background:#8882;border-radius:3px;padding:1px 4px;font-size:.92em}
blockquote.ask{margin:10px 0;padding:8px 12px;border-left:3px solid #4a7;background:#4a71}
button.copy{float:right;font:11px system-ui;cursor:pointer;border:1px solid #8886;background:transparent;border-radius:4px;padding:2px 8px;color:inherit}
figure{margin:16px 0}
figcaption{color:#777;font-size:12px;margin-bottom:4px}
iframe{width:100%;height:520px;border:1px solid #8884;border-radius:6px;background:#fff}
footer{color:#888;font-size:12px;margin-top:40px;border-top:1px solid #8883;padding-top:8px}
</style>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${meta.map((m) => `<div>${escapeHtml(m)}</div>`).join('')}</div>
${body}
${artifacts.length ? `<h2>Views</h2>\n${artifacts.map((a) => `<figure><figcaption><a href="${escapeHtml(a.src)}">${escapeHtml(a.title)}</a></figcaption><iframe src="${escapeHtml(a.src)}" loading="lazy"></iframe></figure>`).join('\n')}` : ''}
<footer>The markdown is the file of record; this page is it rendered, with the views drawn. Generated by wf.</footer>
${hasClass('mermaid') ? MERMAID : ''}
${hasClass('copy') ? COPY_ASK : ''}
`;
}

// Last `verdict: <v>` line wins; anything but a real verdict (e.g. pending) → null.
export function readVerdict(text: string) {
  let found: string | null = null;
  for (const m of text.matchAll(/^verdict:\s*(\S+)\s*$/gm)) found = m[1];
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
export function approvalBinding(text: string): { verdict: string | null; contentSha: string | null; headSha: string | null } {
  for (const section of reviewSections(text).reverse()) {
    const verdicts = [...section.matchAll(/^verdict:\s*(\S+)\s*$/gm)].map((m) => m[1]).filter((v) => (VERDICTS as string[]).includes(v));
    if (!verdicts.length) continue;
    const field = (key: string) => [...section.matchAll(new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'gm'))].at(-1)?.[1] ?? null;
    return { verdict: verdicts.at(-1)!, contentSha: field('content-sha'), headSha: field('head-sha') };
  }
  return { verdict: null, contentSha: null, headSha: null };
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

