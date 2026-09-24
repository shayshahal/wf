# Human touchpoints

Two commands need Shay, and both run from the hub session — they resolve the round's
worktree themselves, so there is no folder switch. The Plannotator adapter is optional:
with it the browser opens and the result folds itself into the file; without it the
command writes the skeleton and opens `$VISUAL` / `$EDITOR` / `code`, and Shay writes
the `path:line — text` lines by hand. Either way the same files land.

**T1 — `wf design <round>`** writes `<round folder>/SPEC-REVIEW.md`. It requires SPEC.md,
marks `step design --waiting-on shay`, opens the spec for annotation (Plannotator
`annotate --gate`), and folds the result into the REVIEW-FORMAT.md shape: one comment
line each plus a final `verdict:` line.

**T2 — `wf review <round> [--base <ref>]`** writes `<round folder>/REVIEW.md`, then commits and pushes it to the PR branch so the
merge carries it. It marks
`step review --waiting-on shay`, writes the skeleton first (server URLs, files changed
vs base, class, spec sha), opens the branch-vs-base diff (Plannotator `review
--diff-type branch`), then appends the folded comments and verdict.
`wf review <round> --done` reads the verdict line: approved → `step pr`,
changes-requested → `step implement`; a missing or dismissed verdict exits 2.

**Each checkpoint file is checked by the next step, so nobody can route around Shay**
(measured on BJEW-586, 2026-09-22 — all three happened in one round):

- `wf step implement` on a B/C round refuses unless `SPEC-REVIEW.md` approves the
  **current** `SPEC.md` sha. A re-spec is a re-T1; a chat question is not a T1.
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

**Slices, opt-in.** A SPEC may carry a `## Slices` section — vertical cuts in the
order Shay wants to touch them (contract with mock data → screen in the browser →
wire → store), never stack order. When present, the worker runs `wf step review`
after each slice and Shay reviews 100–200 lines at a time. Absent, one T2 at the end.

**Asking.** Every question an agent might put to Shay or the product owner is sorted first:
INFER what the code or the ticket already reveals — never ask it; ASK only what
the human alone knows (a requirement, a business rule); RECOMMEND what expertise
settles — state the pick, one line why, and the runner-up. Never a neutral menu,
never a silent decision.

Agent duties: read `SPEC-REVIEW.md` before revising a SPEC, and read `REVIEW.md`
before continuing after a review. Review files are append-only — a new run adds a
dated section, never silently replaces the old one.
