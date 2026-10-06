# Human touchpoints

Two commands need the user, and both run from the hub session — they resolve the round's
worktree themselves, so there is no folder switch. The Plannotator adapter is optional:
with it the browser opens and the result folds itself into the file; without it the
command writes the skeleton and opens `$VISUAL` / `$EDITOR` / `code`, and the user writes
the `path:line — text` lines by hand. Either way the same files land.

**T1 — `wf design <round>`** writes `<round folder>/SPEC-REVIEW.md`. It requires SPEC.md,
marks `step design --waiting-on user`, renders the SPEC's `## For T1` as `.wf/SPEC-T1.html` — its
SHOW-ME.md views drawn (diffs coloured, mermaid drawn, Asks copyable), the round folder's own HTML
artifacts embedded — and annotates that page (Plannotator `annotate --gate`), folding the result into
the REVIEW-FORMAT.md shape: one comment line each plus a final `verdict:` line, each addressed to the
SPEC.md line of the block it was made on. Without a review UI it writes `.wf/SPEC-T1.md` (the same
section as text), opens that in an editor and the page in a browser, printing `page: <file>`.
`## For T1` is what T1 approves and what binds the build;
a T1 given in chat records what the user was shown (DESIGN-SESSION.md § 5).

**T2 — `wf review <round> [--base <ref>]`** writes `<round folder>/REVIEW.md`, then commits and pushes it to the PR branch so the
merge carries it. It marks
`step review --waiting-on user`, writes the skeleton first (server URLs, files changed
vs base, class, spec sha), opens the branch-vs-base diff (Plannotator `review
--diff-type branch`), then appends the folded comments and verdict.
When the round folder's `proof/` has `before-<n>.png` (research, on the base) or `after-<n>.png`
(validate, the same view on the fix), it writes `.wf/before-after.html` with each pair side by side,
opens it (outside Claude Code) and lists it under `look at:`.
It also writes `.wf/PLAN.html` — PLAN.md rendered, its Build views drawn — and opens it the same way,
printing `plan: <file>`: the plan is what the diff is judged against.
Each repository rule that covered the diff gets a `standards:` line: `pass`, or its issues by
severity and the report to read beside the diff (STANDARDS.md).
A row whose PLAN.md `check` cell is `manual: …` (a proof only a person can make) reaches the header
as `manual: row N — …`: T2 makes that check, since `wf check` cannot.
When validate and its critic still disagree after the last exchange, a `critique:` line names
CRITIQUE.md to read beside VALIDATION.md (`src/gates/critique.ts`); when they settled, there is none.
`wf review <round> --done` reads the verdict line: approved → `step pr`,
changes-requested → `step implement`; a missing or dismissed verdict exits 2.

**Each checkpoint file is checked by the next step, so nobody can route around the user**
(measured on BJEW-586, 2026-09-22 — all three happened in one round):

- `wf step implement` on a B/C round refuses unless `SPEC-REVIEW.md` approves the
  **current** `SPEC.md` sha. A re-spec is a re-T1; a chat question is not a T1, and a chat verdict
  is one only once `SPEC-REVIEW.md` records it.
- `wf review` on a B/C round refuses without `proof/CALL-STACK-AS-BUILT.md` in the diff,
  and lists it first under `look at:` — the contract change is what T2 reads first.
- `wf review --done` refuses when the reviewed base (header, and what Plannotator
  actually showed) is not the round's base — a verdict on another diff is not a verdict.
  The verdict line is written by `wf`; with the adapter present it is never edited by hand.

**Why two, and why these two.** A wrong line in the as-is or the design costs
thousands of lines of code; a wrong line of code costs one. So T1 reads the
`## As-is` and the types before anything is built, and T2 reads the diff because
nothing else catches design rot — models are rewarded for passing tests, never
penalised for a lazy cast or a try/catch around everything. (HumanLayer, *Why
Software Factories Fail*.)

**Slices do not exist.** A round has no mid-round review: it is built and machine-checked commit
by commit (`wf check`, one `check` per row) and the person looks once, at T2. A `## Slices` section
was documented here and in `SPEC-TEMPLATE.md` until 2026-10-06; nothing read it, and an implementer that
followed it would run `wf step review` mid-round, where an approved verdict sets `step pr` and the
round delivers unfinished. The capability, if it is wanted, is a feature (a slice boundary in git, a
review scoped to it, a step machine that returns to implement) — not a paragraph.

**Asking.** Every question an agent might put to the user or the product owner is sorted first:
INFER what the code or the ticket already reveals — never ask it; ASK only what
the human alone knows (a requirement, a business rule); RECOMMEND what expertise
settles — state the pick, one line why, and the runner-up. Never a neutral menu,
never a silent decision.

Agent duties: read `SPEC-REVIEW.md` before revising a SPEC, and read `REVIEW.md`
before continuing after a review. Review files are append-only — a new run adds a
dated section, never silently replaces the old one.
