# The design session — T1

Shay and one agent, one pane, ~15 minutes, before any code on a Class B or C round
(`CLASSES.md`). It produces one file, `SPEC.md`, and the round freezes on its sha256. Five
moves, in order. `SPEC-TEMPLATE.md` is the skeleton, `CALL-STACK-FORMAT.md` the notation,
`REVIEW-FORMAT.md` what comes back.

**Where the files live.** `SPEC.md`, `SPEC-REVIEW.md` and `REVIEW.md` live in the **round folder**
(`bug-reports/<round>/`, the `folder` in `.wf/state.json`) with the rest of the round, and ship with
the PR. Until 2026-09-23 they sat at the worktree root and were moved by hand (BJEW-586: PR #175).

## 1 · prime

Restate the round in ≤ 10 lines: the symptom or the request, the surface it touches, the class
and what set it. **Ask nothing here** — a question asked before the ground is measured is nearly
always answered by the code. Questions come at move 4, sorted.

## 2a · ground → `## As-is`

The current call stack of every touched path: real `file:line`, real function names, the types
on each hop. Written **first and read first** — a wrong line here costs thousands of lines of
code, a wrong line of code costs one.

Ground means measured, not read:

- **Run the live stack and record what it does today**, with a **control row** — the same
  measurement on a path that works, or on the pre-fix body. BJEW-585's three delete routes read
  zero stones; only the control, which still reproduces the symptom, makes those zeros mean
  anything. BJEW-586's two channels disproved the reporter's own sentence.
- **Name where the truth dies.** One `file:line`, not "somewhere in the service". Error arms in
  `## As-is` carry their `→ lands:` exactly as a candidate's do (`CALL-STACK-FORMAT.md`) — an
  unlanded `✗` here is how a design misses the screen it never reaches.
- **Name every other path that reaches it** — sibling routes, bulk endpoints, jobs — with the
  grep, and its result, that proves the list is complete.
- **Birth check.** `git log -S<symbol> --follow` on that line: was it ever right? A defect
  that was never built is not a regression, and saying so stops the next round hunting a
  commit that does not exist.
- **Constraints that decide the design** belong here, not in each candidate. BJEW-586 found the
  naive fix breaks every dev stack and the verification suite; stated once, up front, every
  candidate then carried the same carve-out.

**`NOT MEASURED — <why>` is always acceptable. Silence is not** (`PRACTICES.md`).

## 2b · ground → `## Input coverage`

One row per **value the change produces, computes, decides or puts on a screen**, with a named
source: a ticket line, a document §, a decision record, a model field, a measurement you ran. A
value with no source is an **owed decision** — and that, not the pathspec, classifies the round:

- the source is an engineering choice ⇒ **B**, and it is an ASK for Shay;
- only Einat can name it (a sentence a user reads, a flow) ⇒ **C**. Post the question, ship the
  decided remainder, and record what you built anyway as `status: assumed`
  (`verification/decisions/_about.md`);
- **a question you decided not to ask gets its own row too**, marked as such with the ruling
  that closes it. A round that silently leaves one out looks exactly like a round that never
  saw it.

Corpus silence is a measurement too: BJEW-586 swept 18 documents for eight terms and pasted the
hit count. BJEW-585 stayed B with three owed values — none was a product requirement.

## 3 · sketch → `## Candidates`

**At least two structurally different** candidates — different *where the guarantee lives*, not
the same fix with different names. Per candidate, in this order:

    usage → types → signatures (bodies may throw) → call stack in diff syntax
          → tests to write → one-line tradeoff

The call-stack block is the point of the whole section: `CALL-STACK-FORMAT.md`. Every `✗` arm
says where it **lands**. Every new function gets a signature block. "No diff" is a legitimate
call stack — BJEW-585's operational candidate changed zero lines of application code and said so.

**Falsifiers**, named out loud and counted against the candidate that carries them: an `Any` or
a cast · a swallowed exception · a repeated workaround (a guard where a previous round already
added one) · an escape-hatch parameter or a field for a decision nobody has made yet. BJEW-586
rejected its own candidate B on the last of these.

## 4 · iterate → `## Questions`, then `## Recommendation`

Every question is sorted, with an addressee, and it is never a menu and never silent:

| | |
|---|---|
| **INFER** | you decided — state the named source you decided from. Never ask what the code already answers |
| **ASK** | only the human knows it. Say which human: Shay (engineering) · Einat (product, ⇒ Class C) |
| **RECOMMEND** | expertise settles it: your pick, one line why, and the runner-up |

An ASK for Einat is written **verbatim in her language**, and it reaches the board that way.

An ASK chooses between answers the ticket, the docx or the code already forces. **A feature the
round was not asked to build is never an ASK** — BJEW-454 rev 1 offered a nightly overdue sweep
nobody had named, and T1 answered «were you instructed to offer ideas for features that you
weren't told to build?». Name it as a twin, one line, under `## Recommendation`.

`## Recommendation` is one candidate and one paragraph, naming what it costs and what still
gates the merge.

**T1 may send you back.** `wf design` folds Shay's annotations into `SPEC-REVIEW.md`; read it
before revising, and say what changed. BJEW-586 rev 2 came from one six-word question —
*«are we sure this needs to be an effect?»* — which removed a defect class, deleted a previous
round's workaround and rewrote the recommendation. **A revised SPEC has a new sha, and a new sha
is a new T1**: `wf step implement` refuses a B/C round whose `SPEC-REVIEW.md` approves an older
sha or carries no `approved` verdict (`step.mjs` `t1Gap`). A chat question is not a T1.

## 5 · freeze

Before the freeze, write `## For T1` at the top (`SPEC-TEMPLATE.md`): ≤ 30 lines — the as-is
stacks, the chosen candidate's diff-syntax stack, the ASKs. That section is all `wf design`
puts in front of Shay; the rest of the file is the worker's evidence. Two rounds (BJEW-586,
591 lines; BJEW-454, 312) proved he reads the ASKs and the pick and skips the rest — so
hand him exactly those.

When Shay says **"shared"**: write `SPEC.md`, take its sha256, `wf step design` (it parks the
round on shay), and **stop**. The worker implements exactly the frozen SPEC; a needed signature
change is stop-and-report, not a decision.

Optional `## Slices` — vertical cuts in the order Shay wants to look at them (contract with mock
data → screen → wire → store), never stack order; the worker runs `wf step review` after each.

The worker's side is `proof/CALL-STACK-AS-BUILT.md`: the as-built stack diffed row by row against
the chosen candidate, every addition and deviation named with its reason (BJEW-586's is the model
— three additions, no deviations). `wf review` refuses a B/C round without it.

## Frontend rounds

Same five moves, different vocabulary — `CALL-STACK-FORMAT.md` § frontend. State is a union,
not a set of booleans; the chain is `<Page>` → handler → `*.remote.ts` → invalidate; props and
events are typed per child. **A presentation-only change has no call stack and is Class A** —
it does not come here.

---

*Credits: pstack's `/architect`; HumanLayer, "Why Software Factories Fail" § program design;
jsmastery-pro/skills `architect` / `develop` (the input-coverage test). Worked examples: BJEW-585's
SPEC (B, in its bug folder) and BJEW-586's rev-2 SPEC (C).*
