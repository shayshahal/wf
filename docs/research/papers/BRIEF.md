# Brief for each paper reader

Read ONE arXiv paper in full and write notes a second agent will build a report from. That agent will
not open the paper, so the notes must carry everything that matters.

## Reading
- Full text: https://arxiv.org/html/<id> (try the latest version, e.g. <id>v2, if the plain one fails).
  If there is no HTML, download https://arxiv.org/pdf/<id> and extract the text (`pdftotext` if
  present, else python `pypdf` if installed, else read the PDF another way). Read every section,
  appendices included. Do not work from the abstract.
- Use WebFetch or curl. Wait for every fetch; do not guess content you did not read.

## Write `docs/research/papers/<id>.md` (in wf) with these sections
1. **Citation**: title, authors, date, version, venue if any, link.
2. **Question**: what they set out to learn, in two or three sentences.
3. **Method**: setup, datasets, models/agents and versions, tasks, metrics and how each is computed,
   baselines, sample sizes. Enough that someone could judge the evidence.
4. **Results**: every result that matters, with the exact numbers and where they are (section, table,
   figure). Include the surprising and the negative ones.
5. **Mechanisms**: what the authors say causes the effects, with their evidence for it.
6. **Recommendations**: what the authors themselves recommend or call for.
7. **Limits**: threats to validity, stated by them and your own (sample, benchmark artificiality,
   model generations, Python-only, etc.).
8. **Quotes**: 4–8 short verbatim sentences carrying the key claims, each with its section.
9. **For wf** (clearly marked as your inference, not the paper's): what this means for the workflow
   below. Be concrete: which phase, gate or check it supports, contradicts, or suggests adding or
   removing. Also say where the paper does NOT apply to it.

## The workflow the "For wf" section is about
wf is Shay's agent workflow (one developer, a small team later). A ticket becomes a merged PR through
fresh-context agents per phase: research (reproduces the bug: a repro red at one place on 3 runs) →
plan → one agent per commit → validate (before/after measurements) and one agent per repository rule
(`wf standards`), a critic over validation, then two human gates: T1 (Shay approves the plan) and T2
(Shay reads the diff, sees before/after screenshots). Deterministic checks between phases (`wf check`:
lint, typecheck, tests, the repro going red→green). The app is JewelryX: SvelteKit frontends,
FastAPI/Python backend, MongoDB; most rounds are small bug fixes and change requests on an existing
codebase, many rounds per week, each built on top of earlier agent-written code.

Shay's first principles for it: human attention is scarce; agents are probabilistic so make the
environment deterministic; the codebase teaches the next change (merged code is what the next agent
copies); verification beats instruction; feedback given twice becomes infrastructure; don't automate
away owning the code (Shay reads diffs, owns the shape). A worry: the harness growing more complex
than the app.

## Hand back
A 5-line summary: the paper's single most important finding with its number, and the one thing it
most implies for wf.
